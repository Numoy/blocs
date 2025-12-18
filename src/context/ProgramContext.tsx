"use client";

import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from "react";
import { useConnection, useAnchorWallet, useWallet } from "@solana/wallet-adapter-react";
import { BlockData } from "@/types";
import { isContentAllowed } from "@/utils/moderation";
import { toast } from 'sonner';
import { Program, AnchorProvider, Idl, web3, BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Transaction, VersionedTransaction } from "@solana/web3.js";
import idl from "@/utils/idl.json";
import { GRID_PUBKEY, BLOCK_PRICE_NEW, GRID_SIZE } from "@/utils/constants";
import { isMobile, isWalletBrowser, generateWalletDeepLinks } from "@/utils/mobile";

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

export const ProgramProvider = ({ children }: { children: ReactNode }) => {
    const { connection } = useConnection();
    const wallet = useAnchorWallet();
    const { sendTransaction, publicKey, connected } = useWallet();

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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return new Program(idl as Idl, provider) as any;
    }, [connection, wallet]);

    const parseString = (arr: number[]): string => {
        // Use TextDecoder for browser compatibility (calls to Buffer will fail)
        const uint8 = new Uint8Array(arr);
        const decoder = new TextDecoder("utf-8");
        // Decode and strip null bytes
        return decoder.decode(uint8).replace(/\0/g, "");
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

            // Fetch Global Config (for Admin key)
            const gridAccount = await program.account.gridState.fetchNullable(GRID_PUBKEY);
            if (gridAccount) {
                setGridAdmin(gridAccount.admin);
            }

            // Fetch All Blocks (Lazy Init = Fetch Multiple Accounts)
            const allBlocks = await program.account.block.all();

            // Map existing blocks to a lookup map
            const blockMap = new Map();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            allBlocks.forEach((b: { account: RawBlockAccount }) => {
                const data = b.account;
                const id = data.id;

                const colorRaw = data.color ?? [];
                const textRaw = data.text ?? [];
                const imageUrlRaw = data.imageUrl ?? [];
                const urlRaw = data.url ?? [];

                blockMap.set(id, {
                    id: id,
                    owner: data.owner.toBase58(),
                    price: data.price.toNumber() / web3.LAMPORTS_PER_SOL,
                    isForSale: data.isForSale,
                    color: parseColor(colorRaw),
                    text: parseString(textRaw),
                    imageUrl: parseString(imageUrlRaw),
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
                        price: BLOCK_PRICE_NEW,
                        isForSale: true,
                        color: "#222222",
                        text: "",
                        imageUrl: "",
                        url: "",
                        image: null
                    });
                }
            }

            setBlocks(fullGrid);
        } catch (err) {
            console.error("Failed to fetch grid:", err);
            toast.error("Failed to fetch grid: " + ((err as Error).message || "Unknown error"));
            throw err; // Re-throw so fetchGridWithTimeout can catch it if needed, or just let it bubble
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

    const buyBlock = async (id: number, price: number, color: string = "#9945FF") => {

        if (!connected || !publicKey) {
            toast.error("Connect wallet first");
            return;
        }

        const toastId = toast.loading("Buying block...");
        try {
            const gridPubkey = GRID_PUBKEY;
            console.log("Buying from Grid:", gridPubkey.toBase58());

            const rgb = hexToRgb(color);

            // Determine if New or Resale
            const targetBlock = blocks.find(b => b.id === id);
            const isResale = targetBlock && targetBlock.owner !== null;

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
                const sellerPubkey = new PublicKey(targetBlock!.owner!);
                let adminKey = gridAdmin;

                // Fallback for admin key if not loaded
                if (!adminKey) {
                    // Try to fetch it on the fly or just fail
                    const gridAcc = await program.account.gridState.fetch(gridPubkey);
                    adminKey = gridAcc.admin;
                }

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
                    const gridAcc = await program.account.gridState.fetch(gridPubkey);
                    adminKey = gridAcc.admin;
                }

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

            console.log("Transaction sent:", signature);

            // Optimistic Update
            const previousBlocks = [...blocks];
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
            fetchGrid(); // Eventual consistency
        } catch (error) {
            console.error("Purchase Error:", error);
            // Revert Optimistic Update (if needed, but we used setBlocks callback, so we might need to restore)
            // Since we don't have the explicit previous state easily accessible in the catch block without capturing it before
            // We can just re-fetch grid to ensure correctness or rely on the previousBlocks capture if we used it.
            // Simplified: Just re-fetch grid on error to sync.
            fetchGrid();

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
                const urls = generateWalletDeepLinks(window.location.href);
                toast.error(
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <span>Transaction failed. Open in wallet app:</span>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '4px' }}>
                            <a href={urls.phantom} style={{ padding: '6px 8px', background: '#AB9FF2', color: 'black', borderRadius: '4px', textAlign: 'center', fontSize: '12px', fontWeight: 'bold', textDecoration: 'none' }}>Phantom</a>
                            <a href={urls.solflare} style={{ padding: '6px 8px', background: '#FC7225', color: 'white', borderRadius: '4px', textAlign: 'center', fontSize: '12px', fontWeight: 'bold', textDecoration: 'none' }}>Solflare</a>
                            <a href={urls.backpack} style={{ padding: '6px 8px', background: '#E33E3F', color: 'white', borderRadius: '4px', textAlign: 'center', fontSize: '12px', fontWeight: 'bold', textDecoration: 'none' }}>Backpack</a>
                            <a href={urls.metamask} style={{ padding: '6px 8px', background: '#F6851B', color: 'white', borderRadius: '4px', textAlign: 'center', fontSize: '12px', fontWeight: 'bold', textDecoration: 'none' }}>MetaMask</a>
                        </div>
                    </div>,
                    { id: toastId, duration: 8000 }
                );
                throw error;
            }

            toast.error("Purchase failed: " + (err.message || "Unknown"), { id: toastId });
            throw error;
        }
    };

    const updateBlock = async (id: number, text: string, imageUrl: string, url: string) => {
        if (!connected || !wallet) {
            toast.error("Connect wallet first");
            return;
        }

        // Content Moderation
        if (!isContentAllowed(text, imageUrl)) {
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

            const tx = await program.methods.updateBlock(id, text, imageUrl, url)
                .accounts({
                    block: blockPda,
                    owner: wallet.publicKey,
                })
                .rpc();

            // Optimistic Update
            setBlocks(prev => prev.map(b => b.id === id ? {
                ...b,
                text,
                imageUrl,
                url
            } : b));

            await connection.confirmTransaction(tx, "confirmed");
            toast.success("Block updated!", { id: toastId });
            fetchGrid();
        } catch (error) {
            console.error(error);
            fetchGrid(); // Revert/Sync on error
            toast.error("Update failed: " + ((error as Error).message || "Unknown error"), { id: toastId });
            throw error;
        }
    };

    const sellBlock = async (id: number, price: number) => {
        if (!connected || !wallet) {
            toast.error("Connect wallet first");
            return;
        }
        const toastId = toast.loading("Listing block...");
        try {
            const lamports = new BN(price * web3.LAMPORTS_PER_SOL);

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
                price: price,
                isForSale: price > 0
            } : b));

            await connection.confirmTransaction(tx, "confirmed");
            toast.success("Block listed for sale!", { id: toastId });
            fetchGrid();
        } catch (error) {
            console.error(error);
            fetchGrid(); // Revert/Sync on error
            toast.error("Listing failed: " + ((error as Error).message || "Unknown error"), { id: toastId });
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
