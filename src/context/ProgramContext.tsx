"use client";

import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from "react";
import { useConnection, useAnchorWallet, useWallet } from "@solana/wallet-adapter-react";
import { BlockData } from "@/types";
import { isContentAllowed } from "@/utils/moderation";
import { toast } from 'sonner';
import { Program, AnchorProvider, Idl, web3, BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Transaction, VersionedTransaction, ComputeBudgetProgram, TransactionMessage } from "@solana/web3.js";
import idl from "@/utils/idl.json";
import { GRID_PUBKEY, BLOCK_PRICE_NEW } from "@/utils/constants";

// Program ID used for IDL type matching, though we use the instance from constants mainly
// export const PROGRAM_ID = ... imported from constants

interface ProgramContextState {
    blocks: BlockData[];
    buyBlock: (id: number, price: number, color?: string) => Promise<void>;
    updateBlock: (id: number, text: string, imageUrl: string, url: string) => Promise<void>;
    sellBlock: (id: number, price: number) => Promise<void>;
    refreshBlock: () => Promise<void>;
    isLoading: boolean;
}

const ProgramContext = createContext<ProgramContextState | null>(null);

export const ProgramProvider = ({ children }: { children: ReactNode }) => {
    const { connection } = useConnection();
    const wallet = useAnchorWallet();
    const { sendTransaction, publicKey, signTransaction } = useWallet();

    const [isLoading, setIsLoading] = useState(true);
    const [blocks, setBlocks] = useState<BlockData[]>([]);
    const [gridAdmin, setGridAdmin] = useState<PublicKey | null>(null);

    const program = useMemo(() => {
        const providerWallet = wallet || {
            publicKey: new PublicKey("11111111111111111111111111111111"),
            signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T): Promise<T> => tx,
            signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> => txs,
        };

        const provider = new AnchorProvider(connection, providerWallet, { preflightCommitment: "confirmed" });
        return new Program(idl as Idl, provider);
    }, [connection, wallet]);

    const parseString = (arr: number[]): string => {
        const buffer = Buffer.from(arr);
        const str = buffer.toString("utf-8").replace(/\0/g, "");
        return str;
    };

    const parseColor = (arr: number[]): string => {
        if (arr.length < 3) return "#ffffff";
        const r = arr[0].toString(16).padStart(2, '0');
        const g = arr[1].toString(16).padStart(2, '0');
        const b = arr[2].toString(16).padStart(2, '0');
        return `#${r}${g}${b}`;
    };

    const hexToRgb = (hex: string): [number, number, number] => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? [
            parseInt(result[1], 16),
            parseInt(result[2], 16),
            parseInt(result[3], 16)
        ] : [255, 255, 255];
    };

    const fetchGrid = useCallback(async () => {
        if (!program) return;

        try {
            setIsLoading(true);

            // @ts-expect-error - Dynamic IDL types are hard for TS
            const account = await program.account.gridState.fetch(GRID_PUBKEY);

            if (account.admin) {
                setGridAdmin(account.admin);
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const parsedBlocks: BlockData[] = account.blocks.map((b: any, index: number) => {
                const colorRaw = b.color?.array ?? b.color ?? [];
                const textRaw = b.text?.array ?? b.text ?? [];
                const imageUrlRaw = b.imageUrl?.array ?? b.imageUrl ?? [];
                const urlRaw = b.url?.array ?? b.url ?? [];

                const isUnowned = b.owner.equals(PublicKey.default);

                return {
                    id: index,
                    owner: isUnowned ? null : b.owner.toBase58(),
                    price: isUnowned ? BLOCK_PRICE_NEW : (b.price.toNumber() / web3.LAMPORTS_PER_SOL), // Default price for new blocks
                    isForSale: isUnowned ? true : (b.isForSale === 1 && b.price.toNumber() > 0),
                    color: parseColor(colorRaw),
                    text: parseString(textRaw),
                    imageUrl: parseString(imageUrlRaw),
                    url: parseString(urlRaw),
                    image: null
                };
            });

            setBlocks(parsedBlocks);
        } catch (err) {
            console.error("Failed to fetch grid:", err);
        } finally {
            setIsLoading(false);
        }
    }, [program]);

    const fetchGridWithTimeout = useCallback(async () => {
        const timeout = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("RPC Timeout")), 15000)
        );

        try {
            await Promise.race([fetchGrid(), timeout]);
        } catch (err) {
            console.error("Grid Load Timeout/Error:", err);
            toast.error("Failed to load grid. Network congested.");
            setIsLoading(false); // Force stop loading
        }
    }, [fetchGrid]);

    useEffect(() => {
        if (program) {
            fetchGridWithTimeout();
        }
    }, [program, fetchGridWithTimeout]);

    const buyBlock = async (id: number, price: number, color: string = "#FF0000") => {

        if (!program || !publicKey) {
            toast.error("Connect wallet first");
            return;
        }

        const toastId = toast.loading("Buying block...");
        try {
            const gridPubkey = GRID_PUBKEY;
            console.log("Buying from Grid (Keypair):", gridPubkey.toBase58());

            const rgb = hexToRgb(color);

            // Determine Recipient
            // Find the block in current state to see if it has an owner
            const targetBlock = blocks.find(b => b.id === id);
            let recipientPubkey = gridAdmin; // Default to Admin

            if (targetBlock && targetBlock.owner) {
                // It's a resale
                recipientPubkey = new PublicKey(targetBlock.owner);
            }

            if (!gridAdmin) {
                throw new Error("Grid Admin key not loaded yet");
            }

            if (!recipientPubkey) {
                recipientPubkey = gridAdmin;
            }

            console.log("Payment Recipient:", recipientPubkey.toBase58());
            console.log("Admin for Fee:", gridAdmin.toBase58());

            // Call Smart Contract
            // IDL type matches: id: u32, color: [u8; 3]
            // Anchor 0.29+ usually expects the array directly, not wrapped.

            const ix = await program.methods.buyBlock(id, rgb)
                .accounts({
                    grid: gridPubkey,
                    buyer: publicKey,
                    paymentRecipient: recipientPubkey,
                    admin: gridAdmin,
                    systemProgram: SystemProgram.programId,
                })
                .instruction();

            // Revert to Legacy Transaction for maximum mobile compatibility
            const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

            const transaction = new Transaction({
                feePayer: publicKey,
                blockhash,
                lastValidBlockHeight,
            })
                .add(ix);

            // Clean, Standard, Official implementation
            // This relies on the Wallet Adapter to handle deep linking and signing correctly
            const signature = await sendTransaction(transaction, connection, {
                skipPreflight: false, // Strict mode: Fail if logic is wrong
                maxRetries: 3         // Retry on network jitter
            });

            console.log("Transaction sent:", signature);

            await connection.confirmTransaction({
                blockhash,
                lastValidBlockHeight,
                signature
            }, "confirmed");
            toast.success("Block purchased!", { id: toastId });
            fetchGrid(); // Refresh data
        } catch (error: unknown) {
            console.error("Purchase Error:", error);

            // Handle User Rejection (Phantom, Solflare, etc)
            const err = error as { message?: string, name?: string, logs?: string[] };
            const msg = (err.message || JSON.stringify(error)).toLowerCase();
            if (
                msg.includes("user rejected") ||
                msg.includes("rejected the request") ||
                msg.includes("stopped") ||
                msg.includes("cancelled") ||
                err.name === "WalletSignTransactionError"
            ) {
                // Debugging: Show the actual message to help diagnose "Immediate Failure"
                toast.error(`Cancelled: ${msg.substring(0, 50)}...`, { id: toastId });
                // We must throw here so the calling function knows it failed!
                throw new Error("User cancelled");
            }

            // detailed logs
            if (err.logs) {
                console.error("Sim Logs:", err.logs);
            }
            toast.error("Purchase failed: " + (err.message || "Unknown"), { id: toastId });
            throw error;
        }
    };

    const updateBlock = async (id: number, text: string, imageUrl: string, url: string) => {
        if (!program || !wallet) return;

        // Content Moderation
        if (!isContentAllowed(text, imageUrl)) {
            toast.error("Content not allowed.");
            return;
        }

        const toastId = toast.loading("Updating block...");
        try {
            const gridPubkey = GRID_PUBKEY;


            const tx = await program.methods.updateBlock(id, text, imageUrl, url)
                .accounts({
                    grid: gridPubkey,
                    signer: wallet.publicKey,
                })
                .rpc();

            await connection.confirmTransaction(tx, "confirmed");
            toast.success("Block updated!", { id: toastId });
            fetchGrid();
        } catch (error) {
            console.error(error);
            toast.error("Update failed", { id: toastId });
            throw error;
        }
    };

    const sellBlock = async (id: number, price: number) => {
        if (!program || !wallet) return;
        const toastId = toast.loading("Listing block...");
        try {
            const gridPubkey = GRID_PUBKEY;

            const lamports = new BN(price * web3.LAMPORTS_PER_SOL);


            const tx = await program.methods.sellBlock(id, lamports)
                .accounts({
                    grid: gridPubkey,
                    signer: wallet.publicKey,
                })
                .rpc();

            await connection.confirmTransaction(tx, "confirmed");
            toast.success("Block listed for sale!", { id: toastId });
            fetchGrid();
        } catch (error) {
            console.error(error);
            toast.error("Listing failed", { id: toastId });
            throw error;
        }
    };

    const refreshBlock = async () => {
        await fetchGrid();
    };

    return (
        <ProgramContext.Provider value={{ blocks, buyBlock, updateBlock, sellBlock, refreshBlock, isLoading }}>
            {children}
        </ProgramContext.Provider>
    );
};

export const useProgram = () => {
    const context = useContext(ProgramContext);
    if (!context) throw new Error("useProgram must be used within ProgramProvider");
    return context;
};
