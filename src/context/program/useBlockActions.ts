"use client";

import { useCallback } from "react";
import { BN, web3 } from "@coral-xyz/anchor";
import { Connection, PublicKey, SystemProgram, Transaction, VersionedTransaction } from "@solana/web3.js";
import { SendTransactionOptions } from "@solana/wallet-adapter-base";
import { isContentAllowed } from "@/utils/moderation";
import { toast } from "sonner";
import { GRID_PUBKEY } from "@/utils/constants";
import { hexToRgb } from "@/utils/colors";
import { parseSolToLamports } from "@/utils/sol";
import { toSafeExternalUrl } from "@/utils/url";
import { toErrorCategory, trackPlausibleEvent } from "@/utils/analytics";
import { deriveBlockPda } from "@/context/program/helpers";
import {
    EVENTUAL_GRID_SYNC_DELAY_MS,
    PRICE_EPSILON_SOL,
    type BuySource,
} from "@/context/program/shared";
import { asBlocsProgram } from "@/utils/programTypes";
import type { BlockData } from "@/types";

type SendTransactionFn = (
    transaction: Transaction | VersionedTransaction,
    connection: Connection,
    options?: SendTransactionOptions,
) => Promise<string>;

type AnchorWalletLike = {
    publicKey: PublicKey;
} | null;

type UpdateBlockInState = (id: number, updater: (existing: BlockData) => BlockData) => void;

type UseBlockActionsOptions = {
    connected: boolean;
    publicKey: PublicKey | null;
    wallet: AnchorWalletLike;
    sendTransaction: SendTransactionFn;
    connection: Connection;
    program: ReturnType<typeof asBlocsProgram>;
    blocks: BlockData[];
    gridAdmin: PublicKey | null;
    fetchGrid: () => Promise<void>;
    refreshBlockById: (id: number) => Promise<void>;
    queueGridSync: (delayMs?: number) => void;
    updateBlockInState: UpdateBlockInState;
    onFundWallet: () => void;
};

type UseBlockActionsResult = {
    buyBlock: (id: number, price: number, color?: string, source?: BuySource) => Promise<void>;
    updateBlock: (id: number, text: string, imageUrl: string, url: string) => Promise<void>;
    sellBlock: (id: number, priceInput: string) => Promise<void>;
};

export const useBlockActions = ({
    connected,
    publicKey,
    wallet,
    sendTransaction,
    connection,
    program,
    blocks,
    gridAdmin,
    fetchGrid,
    refreshBlockById,
    queueGridSync,
    updateBlockInState,
    onFundWallet,
}: UseBlockActionsOptions): UseBlockActionsResult => {
    const buyBlock = useCallback(async (
        id: number,
        price: number,
        color: string = "#9945FF",
        source: BuySource = "unknown",
    ) => {
        if (!connected || !publicKey) {
            trackPlausibleEvent("buy_block_wallet_missing", {
                block_id: id,
                ui_source: source,
            });
            toast.error("Connect wallet first");
            throw new Error("Wallet not connected");
        }

        const toastId = toast.loading("Buying block...");
        let saleType: "primary" | "resale" | "unknown" = "unknown";

        try {
            const rgb = hexToRgb(color);
            const targetBlock = blocks.find((b) => b.id === id);
            if (!targetBlock) {
                await fetchGrid();
                throw new Error("Block data unavailable. Please retry.");
            }

            const isResale = targetBlock.owner !== null;
            saleType = isResale ? "resale" : "primary";
            trackPlausibleEvent("buy_block_started", {
                block_id: id,
                sale_type: saleType,
                ui_source: source,
                price_sol: price,
            });

            if (isResale && (!targetBlock.isForSale || !targetBlock.price || targetBlock.price <= 0)) {
                toast.error("This block is no longer for sale.");
                await fetchGrid();
                throw new Error("Block is not for sale");
            }

            if (isResale && Math.abs((targetBlock.price || 0) - price) > PRICE_EPSILON_SOL) {
                toast.error("Price changed. Grid refreshed.");
                await fetchGrid();
                throw new Error("Price changed");
            }

            const blockPda = deriveBlockPda(id, program.programId);

            let ix;

            if (isResale) {
                const sellerPubkey = new PublicKey(targetBlock.owner!);
                let adminKey = gridAdmin;

                if (!adminKey) {
                    const gridAcc = await program.account.gridState.fetch(GRID_PUBKEY);
                    adminKey = gridAcc.admin;
                }

                if (!adminKey) throw new Error("Grid admin not found");

                ix = await program.methods.buyResale(id)
                    .accounts({
                        block: blockPda,
                        grid: GRID_PUBKEY,
                        buyer: publicKey,
                        seller: sellerPubkey,
                        admin: adminKey,
                        systemProgram: SystemProgram.programId,
                    })
                    .instruction();
            } else {
                let adminKey = gridAdmin;
                if (!adminKey) {
                    const gridAcc = await program.account.gridState.fetch(GRID_PUBKEY);
                    adminKey = gridAcc.admin;
                }

                if (!adminKey) throw new Error("Grid admin not found");

                ix = await program.methods.buyBlock(id, rgb)
                    .accounts({
                        block: blockPda,
                        grid: GRID_PUBKEY,
                        buyer: publicKey,
                        admin: adminKey,
                        systemProgram: SystemProgram.programId,
                    })
                    .instruction();
            }

            const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

            const transaction = new Transaction({
                feePayer: publicKey,
                blockhash,
                lastValidBlockHeight,
            }).add(ix);

            const signature = await sendTransaction(transaction, connection, {
                skipPreflight: false,
                maxRetries: 3,
            });

            trackPlausibleEvent("buy_block_submitted", {
                block_id: id,
                sale_type: saleType,
                ui_source: source,
                tx_signature: signature,
            });

            updateBlockInState(id, (existing) => ({
                ...existing,
                owner: publicKey.toBase58(),
                price: 0,
                isForSale: false,
                color,
            }));

            await connection.confirmTransaction({
                blockhash,
                lastValidBlockHeight,
                signature,
            }, "confirmed");

            trackPlausibleEvent("buy_block_succeeded", {
                block_id: id,
                sale_type: saleType,
                ui_source: source,
                price_sol: price,
            });
            try {
                await refreshBlockById(id);
            } catch (refreshError) {
                console.error(`Failed to refresh block #${id} after purchase:`, refreshError);
                queueGridSync(0);
            }
            toast.success("Block purchased!", { id: toastId });
            queueGridSync(EVENTUAL_GRID_SYNC_DELAY_MS);
        } catch (error) {
            console.error("Purchase Error:", error);
            queueGridSync(0);

            const err = error as { message?: string; name?: string; logs?: string[] };
            const msg = (err.message || JSON.stringify(error)).toLowerCase();
            if (
                msg.includes("user rejected") ||
                msg.includes("rejected the request") ||
                msg.includes("stopped") ||
                msg.includes("cancelled") ||
                err.name === "WalletSignTransactionError"
            ) {
                trackPlausibleEvent("buy_block_cancelled", {
                    block_id: id,
                    sale_type: saleType,
                    ui_source: source,
                });
                toast.info("Transaction cancelled", { id: toastId });
                throw new Error("User cancelled");
            }

            if (err.logs) {
                console.error("Sim Logs:", err.logs);
            }

            trackPlausibleEvent("buy_block_failed", {
                block_id: id,
                sale_type: saleType,
                ui_source: source,
                error_category: toErrorCategory(error),
            });

            const isInsufficientFunds =
                msg.includes("insufficient funds") ||
                msg.includes("insufficient lamports") ||
                msg.includes("not enough sol") ||
                msg.includes("attempt to debit an account but found no record");

            if (isInsufficientFunds) {
                toast.error("Not enough SOL to complete this purchase.", {
                    id: toastId,
                    action: { label: "Add SOL", onClick: onFundWallet },
                });
            } else {
                toast.error("Purchase failed: " + (err.message || "Unknown"), { id: toastId });
            }
            throw error;
        }
    }, [
        blocks,
        connected,
        connection,
        fetchGrid,
        gridAdmin,
        onFundWallet,
        program,
        publicKey,
        refreshBlockById,
        queueGridSync,
        sendTransaction,
        updateBlockInState,
    ]);

    const updateBlock = useCallback(async (id: number, text: string, imageUrl: string, url: string) => {
        if (!connected || !wallet) {
            trackPlausibleEvent("update_block_wallet_missing", { block_id: id });
            toast.error("Connect wallet first");
            throw new Error("Wallet not connected");
        }

        const safeImageUrl = imageUrl.trim() ? toSafeExternalUrl(imageUrl) : "";
        const safeUrl = url.trim() ? toSafeExternalUrl(url) : "";

        if (imageUrl.trim() && !safeImageUrl) {
            trackPlausibleEvent("update_block_failed", {
                block_id: id,
                error_category: "invalid_image_url",
            });
            toast.error("Invalid image URL.");
            throw new Error("Invalid image URL");
        }

        if (url.trim() && !safeUrl) {
            trackPlausibleEvent("update_block_failed", {
                block_id: id,
                error_category: "invalid_link_url",
            });
            toast.error("Invalid link URL.");
            throw new Error("Invalid link URL");
        }

        const normalizedImageUrl = safeImageUrl || "";
        const normalizedUrl = safeUrl || "";

        if (!isContentAllowed(text, normalizedImageUrl)) {
            trackPlausibleEvent("update_block_blocked", {
                block_id: id,
                reason: "content_not_allowed",
            });
            toast.error("Content not allowed.");
            return;
        }

        trackPlausibleEvent("update_block_started", {
            block_id: id,
            has_text: Boolean(text.trim()),
            has_image: Boolean(normalizedImageUrl),
            has_link: Boolean(normalizedUrl),
        });
        const toastId = toast.loading("Updating block...");

        try {
            const blockPda = deriveBlockPda(id, program.programId);

            const tx = await program.methods.updateBlock(id, text, normalizedImageUrl, normalizedUrl)
                .accounts({
                    block: blockPda,
                    owner: wallet.publicKey,
                })
                .rpc();

            updateBlockInState(id, (existing) => ({
                ...existing,
                text,
                imageUrl: normalizedImageUrl,
                url: normalizedUrl,
            }));

            await connection.confirmTransaction(tx, "confirmed");
            trackPlausibleEvent("update_block_succeeded", {
                block_id: id,
                has_text: Boolean(text.trim()),
                has_image: Boolean(normalizedImageUrl),
                has_link: Boolean(normalizedUrl),
            });
            try {
                await refreshBlockById(id);
            } catch (refreshError) {
                console.error(`Failed to refresh block #${id} after update:`, refreshError);
                queueGridSync(0);
            }
            toast.success("Block updated!", { id: toastId });
            queueGridSync(EVENTUAL_GRID_SYNC_DELAY_MS);
        } catch (error) {
            console.error(error);
            queueGridSync(0);
            trackPlausibleEvent("update_block_failed", {
                block_id: id,
                error_category: toErrorCategory(error),
            });
            toast.error("Update failed: " + ((error as Error).message || "Unknown error"), { id: toastId });
            throw error;
        }
    }, [connected, connection, program, queueGridSync, refreshBlockById, updateBlockInState, wallet]);

    const sellBlock = useCallback(async (id: number, priceInput: string) => {
        if (!connected || !wallet) {
            trackPlausibleEvent("set_sale_wallet_missing", { block_id: id });
            toast.error("Connect wallet first");
            throw new Error("Wallet not connected");
        }

        let normalizedPrice = 0;
        let saleAction: "list" | "delist" = "list";
        const toastId = toast.loading("Listing block...");

        try {
            const lamportsBigInt = parseSolToLamports(priceInput);
            const lamports = new BN(lamportsBigInt.toString());
            normalizedPrice = lamportsBigInt === BigInt(0)
                ? 0
                : Number(lamportsBigInt) / web3.LAMPORTS_PER_SOL;
            saleAction = normalizedPrice > 0 ? "list" : "delist";
            trackPlausibleEvent("set_sale_started", {
                block_id: id,
                action: saleAction,
                price_sol: normalizedPrice,
            });

            const blockPda = deriveBlockPda(id, program.programId);

            const tx = await program.methods.sellBlock(id, lamports)
                .accounts({
                    block: blockPda,
                    owner: wallet.publicKey,
                })
                .rpc();

            updateBlockInState(id, (existing) => ({
                ...existing,
                price: normalizedPrice,
                isForSale: normalizedPrice > 0,
            }));

            await connection.confirmTransaction(tx, "confirmed");
            trackPlausibleEvent("set_sale_succeeded", {
                block_id: id,
                action: saleAction,
                price_sol: normalizedPrice,
            });
            try {
                await refreshBlockById(id);
            } catch (refreshError) {
                console.error(`Failed to refresh block #${id} after sale update:`, refreshError);
                queueGridSync(0);
            }
            toast.success(saleAction === "list" ? "Block listed for sale!" : "Block removed from sale.", { id: toastId });
            queueGridSync(EVENTUAL_GRID_SYNC_DELAY_MS);
        } catch (error) {
            console.error(error);
            queueGridSync(0);
            trackPlausibleEvent("set_sale_failed", {
                block_id: id,
                action: saleAction,
                price_sol: normalizedPrice,
                error_category: toErrorCategory(error),
            });
            toast.error("Listing failed: " + ((error as Error).message || "Unknown error"), { id: toastId });
            throw error;
        }
    }, [connected, connection, program, queueGridSync, refreshBlockById, updateBlockInState, wallet]);

    return {
        buyBlock,
        updateBlock,
        sellBlock,
    };
};
