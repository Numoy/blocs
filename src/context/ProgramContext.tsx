"use client";

import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo, useRef } from "react";
import { useConnection, useAnchorWallet, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { BlockData } from "@/types";
import { isContentAllowed } from "@/utils/moderation";
import { toast } from 'sonner';
import { Program, AnchorProvider, Idl, web3, BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Transaction, VersionedTransaction } from "@solana/web3.js";
import idl from "@/utils/idl.json";
import { GRID_PUBKEY, GRID_SIZE, getPrimaryBlockPriceSol } from "@/utils/constants";
import { isMobile, isWalletBrowser } from "@/utils/mobile";
import { parseColor, hexToRgb } from "@/utils/colors";
import { WalletSelectorModal } from "@/components/modals";
import { parseSolToLamports } from "@/utils/sol";
import { toSafeExternalUrl } from "@/utils/url";

// Program ID used for IDL type matching, though we use the instance from constants mainly
// export const PROGRAM_ID = ... imported from constants

interface ProgramContextState {
    blocks: BlockData[];
    buyBlock: (id: number, price: number, color?: string) => Promise<void>;
    updateBlock: (id: number, text: string, imageUrl: string, url: string) => Promise<void>;
    sellBlock: (id: number, priceInput: string) => Promise<void>;
    refreshBlock: () => Promise<void>;
    isLoading: boolean;
    isSyncing: boolean;
    openWalletModal: () => void;
}

interface RawBlockAccount {
    id: number;
    owner: PublicKey;
    price: BN;
    isForSale: boolean;
    color: number[];
    text: number[];
    imageUrl: number[];
    url: number[];
}

const ProgramContext = createContext<ProgramContextState | null>(null);
const PRICE_EPSILON_SOL = 1e-9;

export const ProgramProvider = ({ children }: { children: ReactNode }) => {
    const { connection } = useConnection();
    const wallet = useAnchorWallet();
    const { sendTransaction, publicKey, connected } = useWallet();
    const { setVisible } = useWalletModal();

    const [isLoading, setIsLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [blocks, setBlocks] = useState<BlockData[]>([]);
    const [gridAdmin, setGridAdmin] = useState<PublicKey | null>(null);

    const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
    const [walletModalUrl, setWalletModalUrl] = useState("");
    const fetchGridInFlightRef = useRef<Promise<void> | null>(null);
    const scheduledSyncRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const scheduledSyncAtRef = useRef<number | null>(null);
    const isMountedRef = useRef(true);
    const hasLoadedOnceRef = useRef(false);

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
        // Use TextDecoder for browser compatibility (calls to Buffer will fail)
        const uint8 = new Uint8Array(arr);
        const decoder = new TextDecoder("utf-8");
        // Decode and strip null bytes
        return decoder.decode(uint8).replace(/\0/g, "");
    };

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);





    const fetchGrid = useCallback(async () => {
        if (!program) return;

        if (fetchGridInFlightRef.current) {
            await fetchGridInFlightRef.current;
            return;
        }

        const run = async () => {
            const isInitialLoad = !hasLoadedOnceRef.current;
            try {
                if (isMountedRef.current && isInitialLoad) {
                    setIsLoading(true);
                }
                if (isMountedRef.current && !isInitialLoad) {
                    setIsSyncing(true);
                }

                // Fetch Global Config (for Admin key)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const gridAccount = await (program.account as any).gridState.fetchNullable(GRID_PUBKEY);
                if (gridAccount && isMountedRef.current) {
                    setGridAdmin(gridAccount.admin);
                }

                // Fetch All Blocks (Lazy Init = Fetch Multiple Accounts)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const allBlocks = await (program.account as any).block.all();

                // Map existing blocks to a lookup map
                const blockMap = new Map();
                 
                allBlocks.forEach((b: { account: RawBlockAccount }) => {
                    const data = b.account;
                    const id = data.id;

                    const colorRaw = data.color ?? [];
                    const textRaw = data.text ?? [];
                    const imageUrlRaw = data.imageUrl ?? [];
                    const urlRaw = data.url ?? [];
                    const parsedImageUrl = toSafeExternalUrl(parseString(imageUrlRaw));

                    blockMap.set(id, {
                        id: id,
                        owner: data.owner.toBase58(),
                        price: data.price.toNumber() / web3.LAMPORTS_PER_SOL,
                        isForSale: data.isForSale,
                        color: parseColor(colorRaw),
                        text: parseString(textRaw),
                        imageUrl: parsedImageUrl || "",
                        url: parseString(urlRaw),
                        image: null
                    });
                });

                // Reconstruct full grid (0 to GRID_SIZE - 1)
                const fullGrid: BlockData[] = [];
                for (let i = 0; i < GRID_SIZE; i++) {
                    if (blockMap.has(i)) {
                        fullGrid.push(blockMap.get(i));
                    } else {
                        // Empty Block
                        fullGrid.push({
                            id: i,
                            owner: null, // Unowned
                            price: getPrimaryBlockPriceSol(i),
                            isForSale: true,
                            color: "#222222",
                            text: "",
                            imageUrl: "",
                            url: "",
                            image: null
                        });
                    }
                }

                if (isMountedRef.current) {
                    setBlocks(fullGrid);
                }
                hasLoadedOnceRef.current = true;
            } catch (err) {
                console.error("Failed to fetch grid:", err);
                if (isMountedRef.current) {
                    toast.error("Failed to fetch grid: " + ((err as Error).message || "Unknown error"));
                }
                throw err; // Re-throw so fetchGridWithTimeout can catch it if needed, or just let it bubble
            } finally {
                if (isMountedRef.current && isInitialLoad) {
                    setIsLoading(false);
                }
                if (isMountedRef.current && !isInitialLoad) {
                    setIsSyncing(false);
                }
            }
        };

        const runPromise = run();
        fetchGridInFlightRef.current = runPromise;

        try {
            await runPromise;
        } finally {
            fetchGridInFlightRef.current = null;
        }
    }, [program]);

    const queueGridSync = useCallback((delayMs = 500) => {
        const boundedDelay = Math.max(delayMs, 0);
        const now = Date.now();
        const nextRunAt = now + boundedDelay;
        const existingRunAt = scheduledSyncAtRef.current;

        if (
            scheduledSyncRef.current !== null &&
            existingRunAt !== null &&
            existingRunAt <= nextRunAt
        ) {
            return;
        }

        if (scheduledSyncRef.current !== null) {
            clearTimeout(scheduledSyncRef.current);
        }

        scheduledSyncAtRef.current = nextRunAt;
        scheduledSyncRef.current = setTimeout(() => {
            scheduledSyncRef.current = null;
            scheduledSyncAtRef.current = null;
            void fetchGrid();
        }, boundedDelay);
    }, [fetchGrid]);

    const fetchGridWithTimeout = useCallback(async () => {
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        const timeout = new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error("RPC Timeout")), 15000);
        });

        try {
            await Promise.race([fetchGrid(), timeout]);
        } catch (err) {
            console.error("Grid Load Timeout/Error:", err);
            if (isMountedRef.current) {
                toast.error("Failed to load grid. Network congested.");
                if (!hasLoadedOnceRef.current) {
                    setIsLoading(false); // Force stop loading on first load
                } else {
                    setIsSyncing(false);
                }
            }
        } finally {
            if (timeoutId !== null) {
                clearTimeout(timeoutId);
            }
        }
    }, [fetchGrid]);

    useEffect(() => {
        if (!program) return;

        void fetchGridWithTimeout();

        // --- REAL-TIME UPDATES ---
        let disposed = false;
        const listenerIds: number[] = [];

        const registerListener = async (
            eventName: "BlockBought" | "BlockSold" | "BlockResold",
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            handler: (event: any) => void
        ) => {
            try {
                const listenerId = await program.addEventListener(eventName, handler);
                if (disposed) {
                    await program.removeEventListener(listenerId);
                    return;
                }
                listenerIds.push(listenerId);
            } catch (error) {
                console.error(`Failed to subscribe to ${eventName}:`, error);
            }
        };

        const setupListener = async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await registerListener("BlockBought", (event: any) => {
                const id = event.id;
                const buyer = event.buyer.toBase58();

                setBlocks(prev => prev.map(b => b.id === id ? {
                    ...b,
                    owner: buyer,
                    price: 0,
                    isForSale: false,
                } : b));
                toast.info(`Block #${id} was just bought!`);
                queueGridSync(200);
            });

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await registerListener("BlockSold", (event: any) => {
                const id = event.id;
                const isForSale = Boolean(event.isForSale ?? event.is_for_sale);
                const priceLamports = typeof event.price?.toNumber === "function"
                    ? event.price.toNumber()
                    : Number(event.price || 0);
                const priceSol = isForSale ? priceLamports / web3.LAMPORTS_PER_SOL : 0;

                setBlocks(prev => prev.map(b => b.id === id ? {
                    ...b,
                    isForSale,
                    price: priceSol,
                } : b));
                queueGridSync(200);
            });

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await registerListener("BlockResold", (event: any) => {
                const id = event.id;
                const buyer = event.buyer.toBase58();

                setBlocks(prev => prev.map(b => b.id === id ? {
                    ...b,
                    owner: buyer,
                    price: 0,
                    isForSale: false,
                } : b));
                toast.info(`Block #${id} was resold.`);
                queueGridSync(200);
            });
        };

        void setupListener();

        return () => {
            disposed = true;
            for (const listenerId of listenerIds) {
                void program.removeEventListener(listenerId);
            }
            if (scheduledSyncRef.current !== null) {
                clearTimeout(scheduledSyncRef.current);
                scheduledSyncRef.current = null;
                scheduledSyncAtRef.current = null;
            }
        };
    }, [program, fetchGridWithTimeout, queueGridSync]);

    const buyBlock = useCallback(async (id: number, price: number, color: string = "#9945FF") => {

        if (!connected || !publicKey) {
            toast.error("Connect wallet first");
            throw new Error("Wallet not connected");
        }

        const toastId = toast.loading("Buying block...");
        try {
            const gridPubkey = GRID_PUBKEY;

            const rgb = hexToRgb(color);

            // Determine if New or Resale
            const targetBlock = blocks.find(b => b.id === id);
            if (!targetBlock) {
                await fetchGrid();
                throw new Error("Block data unavailable. Please retry.");
            }

            const isResale = targetBlock.owner !== null;
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

            // Derive Block PDA
            const [blockPda] = PublicKey.findProgramAddressSync(
                [
                    new TextEncoder().encode("block"),
                    new Uint8Array(new BN(id).toArray("le", 4))
                ],
                program.programId
            );

            let ix;

            if (isResale) {
                // SECONDARY SALE (buy_resale)
                const sellerPubkey = new PublicKey(targetBlock.owner!);
                let adminKey = gridAdmin;

                // Fallback for admin key if not loaded
                if (!adminKey) {
                    // Try to fetch it on the fly or just fail
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const gridAcc = await (program.account as any).gridState.fetch(gridPubkey);
                    adminKey = gridAcc.admin;
                }

                if (!adminKey) throw new Error("Grid admin not found");

                ix = await program.methods.buyResale(id)
                    .accounts({
                        block: blockPda,
                        grid: gridPubkey,
                        buyer: publicKey,
                        seller: sellerPubkey,
                        admin: adminKey,
                        systemProgram: SystemProgram.programId,
                    })
                    .instruction();
            } else {
                // PRIMARY SALE (buy_block)
                // Needs Admin key for payment
                let adminKey = gridAdmin;
                if (!adminKey) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const gridAcc = await (program.account as any).gridState.fetch(gridPubkey);
                    adminKey = gridAcc.admin;
                }

                if (!adminKey) throw new Error("Grid admin not found");

                ix = await program.methods.buyBlock(id, rgb)
                    .accounts({
                        block: blockPda,
                        grid: gridPubkey,
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
            })
                .add(ix);

            const signature = await sendTransaction(transaction, connection, {
                skipPreflight: false,
                maxRetries: 3
            });

            // Optimistic Update
            // const previousBlocks = [...blocks]; // (Unused)
            setBlocks(prev => prev.map(b => b.id === id ? {
                ...b,
                owner: publicKey!.toBase58(),
                price: 0,
                isForSale: false,
                color: color
            } : b));

            await connection.confirmTransaction({
                blockhash,
                lastValidBlockHeight,
                signature
            }, "confirmed");

            toast.success("Block purchased!", { id: toastId });
            queueGridSync(); // Eventual consistency
        } catch (error) {
            console.error("Purchase Error:", error);
            // Revert Optimistic Update (if needed, but we used setBlocks callback, so we might need to restore)
            // Since we don't have the explicit previous state easily accessible in the catch block without capturing it before
            // We can just re-fetch grid to ensure correctness or rely on the previousBlocks capture if we used it.
            // Simplified: Just re-fetch grid on error to sync.
            queueGridSync(0);

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
                toast.info("Transaction cancelled", { id: toastId });
                throw new Error("User cancelled");
            }


            // detailed logs
            if (err.logs) {
                console.error("Sim Logs:", err.logs);
            }

            if (isMobile() && !isWalletBrowser()) {
                toast.dismiss(toastId);
                setWalletModalUrl(window.location.href);
                setIsWalletModalOpen(true);
                throw error;
            }

            toast.error("Purchase failed: " + (err.message || "Unknown"), { id: toastId });
            throw error;
        }
    }, [connected, publicKey, blocks, gridAdmin, program, connection, sendTransaction, fetchGrid, queueGridSync]);

    const updateBlock = async (id: number, text: string, imageUrl: string, url: string) => {
        if (!connected || !wallet) {
            toast.error("Connect wallet first");
            throw new Error("Wallet not connected");
        }

        const safeImageUrl = imageUrl.trim() ? toSafeExternalUrl(imageUrl) : "";
        const safeUrl = url.trim() ? toSafeExternalUrl(url) : "";

        if (imageUrl.trim() && !safeImageUrl) {
            toast.error("Invalid image URL.");
            throw new Error("Invalid image URL");
        }

        if (url.trim() && !safeUrl) {
            toast.error("Invalid link URL.");
            throw new Error("Invalid link URL");
        }

        const normalizedImageUrl = safeImageUrl || "";
        const normalizedUrl = safeUrl || "";

        // Content Moderation
        if (!isContentAllowed(text, normalizedImageUrl)) {
            toast.error("Content not allowed.");
            return;
        }

        const toastId = toast.loading("Updating block...");
        try {
            // Derive Block PDA
            const [blockPda] = PublicKey.findProgramAddressSync(
                [
                    new TextEncoder().encode("block"),
                    new Uint8Array(new BN(id).toArray("le", 4))
                ],
                program.programId
            );

            const tx = await program.methods.updateBlock(id, text, normalizedImageUrl, normalizedUrl)
                .accounts({
                    block: blockPda,
                    owner: wallet.publicKey,
                })
                .rpc();

            // Optimistic Update
            setBlocks(prev => prev.map(b => b.id === id ? {
                ...b,
                text,
                imageUrl: normalizedImageUrl,
                url: normalizedUrl
            } : b));

            await connection.confirmTransaction(tx, "confirmed");
            toast.success("Block updated!", { id: toastId });
            queueGridSync();
        } catch (error) {
            console.error(error);
            queueGridSync(0); // Revert/Sync on error
            toast.error("Update failed: " + ((error as Error).message || "Unknown error"), { id: toastId });
            throw error;
        }
    };

    const sellBlock = async (id: number, priceInput: string) => {
        if (!connected || !wallet) {
            toast.error("Connect wallet first");
            throw new Error("Wallet not connected");
        }
        const toastId = toast.loading("Listing block...");
        try {
            const lamportsBigInt = parseSolToLamports(priceInput);
            const lamports = new BN(lamportsBigInt.toString());
            const normalizedPrice = lamportsBigInt === BigInt(0)
                ? 0
                : Number(lamportsBigInt) / web3.LAMPORTS_PER_SOL;

            // Derive Block PDA
            const [blockPda] = PublicKey.findProgramAddressSync(
                [
                    new TextEncoder().encode("block"),
                    new Uint8Array(new BN(id).toArray("le", 4))
                ],
                program.programId
            );

            const tx = await program.methods.sellBlock(id, lamports)
                .accounts({
                    block: blockPda,
                    owner: wallet.publicKey,
                })
                .rpc();

            // Optimistic Update
            setBlocks(prev => prev.map(b => b.id === id ? {
                ...b,
                price: normalizedPrice,
                isForSale: normalizedPrice > 0
            } : b));

            await connection.confirmTransaction(tx, "confirmed");
            toast.success("Block listed for sale!", { id: toastId });
            queueGridSync();
        } catch (error) {
            console.error(error);
            queueGridSync(0); // Revert/Sync on error
            toast.error("Listing failed: " + ((error as Error).message || "Unknown error"), { id: toastId });
            throw error;
        }
    };

    const refreshBlock = async () => {
        await fetchGrid();
    };

    const openWalletModal = () => {
        if (isMobile() && !isWalletBrowser()) {
            setWalletModalUrl(window.location.href);
            setIsWalletModalOpen(true);
        } else {
            setVisible(true);
        }
    };

    return (
        <ProgramContext.Provider value={{ blocks, buyBlock, updateBlock, sellBlock, refreshBlock, isLoading, isSyncing, openWalletModal }}>
            {children}
            <WalletSelectorModal
                isOpen={isWalletModalOpen}
                onClose={() => setIsWalletModalOpen(false)}
                currentUrl={walletModalUrl}
            />
        </ProgramContext.Provider>
    );
};

export const useProgram = () => {
    const context = useContext(ProgramContext);
    if (!context) throw new Error("useProgram must be used within ProgramProvider");
    return context;
};
