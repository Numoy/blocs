"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnchorProvider, Idl, Program } from "@coral-xyz/anchor";
import { Connection, PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import { toast } from "sonner";
import idl from "@/utils/idl.json";
import { GRID_PUBKEY } from "@/utils/constants";
import { toErrorCategory, trackPlausibleEvent } from "@/utils/analytics";
import { getFallbackRpcEndpoints, resolveSolanaRpcEndpoint } from "@/utils/rpc";
import {
    asBlocsProgram,
    type BlockAccountEntry,
    type GridStateAccount,
} from "@/utils/programTypes";
import {
    GRID_LOAD_TIMEOUT_MS,
    GRID_MIN_SYNC_INTERVAL_MS,
    GRID_READ_TIMEOUT_MS,
} from "@/context/program/shared";
import {
    buildFullGrid,
    createDefaultBlockData,
    deriveBlockPda,
    mapRawBlockAccountToBlockData,
    withTimeout,
} from "@/context/program/helpers";
import type { BlockData } from "@/types";

type ProviderWalletLike = {
    publicKey: PublicKey;
    signTransaction: <T extends Transaction | VersionedTransaction>(tx: T) => Promise<T>;
    signAllTransactions: <T extends Transaction | VersionedTransaction>(txs: T[]) => Promise<T[]>;
};

export type UpdateBlockInState = (id: number, updater: (existing: BlockData) => BlockData) => void;
export type QueueGridSync = (delayMs?: number) => void;
export type RefreshBlockById = (id: number) => Promise<void>;

type UseGridFetchOptions = {
    connection: Connection;
    providerWallet: ProviderWalletLike;
};

export type UseGridFetchResult = {
    blocks: BlockData[];
    isLoading: boolean;
    isSyncing: boolean;
    gridAdmin: PublicKey | null;
    fetchGrid: () => Promise<void>;
    refreshBlockById: RefreshBlockById;
    queueGridSync: QueueGridSync;
    updateBlockInState: UpdateBlockInState;
};

export const useGridFetch = ({ connection, providerWallet }: UseGridFetchOptions): UseGridFetchResult => {
    const [isLoading, setIsLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [blocks, setBlocks] = useState<BlockData[]>([]);
    const [gridAdmin, setGridAdmin] = useState<PublicKey | null>(null);

    const fetchGridInFlightRef = useRef<Promise<void> | null>(null);
    const scheduledSyncRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const scheduledSyncAtRef = useRef<number | null>(null);
    const lastSuccessfulGridFetchAtRef = useRef<number>(0);
    const isMountedRef = useRef(true);
    const hasLoadedOnceRef = useRef(false);
    const explicitFallbackRpcCandidates = useMemo(() => {
        return (process.env.NEXT_PUBLIC_SOLANA_RPC_FALLBACK_URLS || "")
            .split(",")
            .map((part) => part.trim())
            .filter(Boolean);
    }, []);

    const getRpcCandidates = useCallback(() => {
        const primaryEndpoint = resolveSolanaRpcEndpoint(connection.rpcEndpoint);
        return {
            primaryEndpoint,
            rpcCandidates: [
                primaryEndpoint,
                ...getFallbackRpcEndpoints(primaryEndpoint, explicitFallbackRpcCandidates),
            ],
        };
    }, [connection.rpcEndpoint, explicitFallbackRpcCandidates]);

    const updateBlockInState = useCallback<UpdateBlockInState>((id, updater) => {
        setBlocks((prev) => {
            if (id < 0 || id >= prev.length) {
                return prev;
            }

            const existing = prev[id];
            if (!existing) {
                return prev;
            }

            const next = [...prev];
            next[id] = updater(existing);
            return next;
        });
    }, []);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
            if (scheduledSyncRef.current !== null) {
                clearTimeout(scheduledSyncRef.current);
                scheduledSyncRef.current = null;
                scheduledSyncAtRef.current = null;
            }
        };
    }, []);

    const fetchGrid = useCallback(async () => {
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

                const { primaryEndpoint, rpcCandidates } = getRpcCandidates();
                let loadedGrid = false;
                let lastError: unknown = null;

                for (const endpoint of rpcCandidates) {
                    try {
                        const readConnection = endpoint === primaryEndpoint
                            ? connection
                            : new Connection(endpoint, "confirmed");
                        const readProvider = new AnchorProvider(readConnection, providerWallet, { preflightCommitment: "confirmed" });
                        const readProgram = asBlocsProgram(new Program(idl as Idl, readProvider));

                        const gridAccount = await withTimeout(
                            readProgram.account.gridState.fetchNullable(GRID_PUBKEY),
                            GRID_READ_TIMEOUT_MS,
                            `gridState fetch via ${endpoint}`,
                        ) as GridStateAccount | null;
                        if (gridAccount && isMountedRef.current) {
                            setGridAdmin(gridAccount.admin);
                        }

                        const allBlocks = await withTimeout(
                            readProgram.account.block.all(),
                            GRID_READ_TIMEOUT_MS,
                            `block.all via ${endpoint}`,
                        ) as BlockAccountEntry[];
                        const fullGrid = buildFullGrid(allBlocks);

                        if (isMountedRef.current) {
                            setBlocks(fullGrid);
                        }
                        lastSuccessfulGridFetchAtRef.current = Date.now();
                        hasLoadedOnceRef.current = true;
                        loadedGrid = true;

                        if (endpoint !== primaryEndpoint) {
                            trackPlausibleEvent("grid_fetch_fallback_endpoint_used", {
                                primary_rpc: primaryEndpoint,
                                fallback_rpc: endpoint,
                                blocks_loaded: fullGrid.length,
                            });
                        }
                        break;
                    } catch (error) {
                        lastError = error;
                        console.error(`Failed to fetch grid using RPC ${endpoint}:`, error);
                    }
                }

                if (!loadedGrid) {
                    throw lastError || new Error("All RPC endpoints failed.");
                }
            } catch (err) {
                console.error("Failed to fetch grid:", err);
                trackPlausibleEvent("grid_fetch_failed", {
                    rpc_endpoint: connection.rpcEndpoint,
                    error_category: toErrorCategory(err),
                });
                if (isMountedRef.current) {
                    toast.error("Failed to fetch grid: " + ((err as Error).message || "Unknown error"));
                }
                throw err;
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
    }, [connection, getRpcCandidates, providerWallet]);

    const refreshBlockById = useCallback<RefreshBlockById>(async (id) => {
        if (!Number.isInteger(id) || id < 0) {
            return;
        }

        const { primaryEndpoint, rpcCandidates } = getRpcCandidates();
        let loaded = false;
        let lastError: unknown = null;

        for (const endpoint of rpcCandidates) {
            try {
                const readConnection = endpoint === primaryEndpoint
                    ? connection
                    : new Connection(endpoint, "confirmed");
                const readProvider = new AnchorProvider(readConnection, providerWallet, { preflightCommitment: "confirmed" });
                const readProgram = asBlocsProgram(new Program(idl as Idl, readProvider));
                const blockPda = deriveBlockPda(id, readProgram.programId);

                const blockAccount = await withTimeout(
                    readProgram.account.block.fetch(blockPda),
                    GRID_READ_TIMEOUT_MS,
                    `block.fetch via ${endpoint}`,
                );

                const normalizedBlock = mapRawBlockAccountToBlockData(blockAccount);
                if (isMountedRef.current) {
                    setBlocks((prev) => {
                        if (id < 0 || id >= prev.length) {
                            return prev;
                        }
                        const next = [...prev];
                        next[id] = normalizedBlock;
                        return next;
                    });
                }
                lastSuccessfulGridFetchAtRef.current = Date.now();
                loaded = true;
                break;
            } catch (error) {
                lastError = error;
                const message = String((error as Error)?.message || "").toLowerCase();
                if (message.includes("account does not exist") || message.includes("could not find account")) {
                    if (isMountedRef.current) {
                        setBlocks((prev) => {
                            if (id < 0 || id >= prev.length) {
                                return prev;
                            }
                            const next = [...prev];
                            next[id] = createDefaultBlockData(id);
                            return next;
                        });
                    }
                    lastSuccessfulGridFetchAtRef.current = Date.now();
                    loaded = true;
                    break;
                }
                console.error(`Failed to refresh block #${id} using RPC ${endpoint}:`, error);
            }
        }

        if (!loaded) {
            throw lastError || new Error(`Unable to refresh block #${id}.`);
        }
    }, [connection, getRpcCandidates, providerWallet]);

    const queueGridSync = useCallback<QueueGridSync>((delayMs = 500) => {
        const boundedDelay = Math.max(delayMs, 0);
        const now = Date.now();
        const earliestAllowedAt = lastSuccessfulGridFetchAtRef.current + GRID_MIN_SYNC_INTERVAL_MS;
        const nextRunAt = Math.max(now + boundedDelay, earliestAllowedAt);
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
        }, Math.max(0, nextRunAt - now));
    }, [fetchGrid]);

    const fetchGridWithTimeoutRef = useRef<(() => Promise<void>) | null>(null);

    const fetchGridWithTimeout = useCallback(async () => {
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        const timeout = new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error("RPC Timeout")), GRID_LOAD_TIMEOUT_MS);
        });

        try {
            await Promise.race([fetchGrid(), timeout]);
        } catch (err) {
            trackPlausibleEvent("grid_load_timeout_or_error", {
                rpc_endpoint: connection.rpcEndpoint,
                error_category: toErrorCategory(err),
            });
            if (isMountedRef.current) {
                toast.error("Failed to load grid. Please check your network.", {
                    action: {
                        label: "Retry",
                        onClick: () => {
                            if (fetchGridWithTimeoutRef.current) {
                                void fetchGridWithTimeoutRef.current();
                            }
                        },
                    },
                });
                if (!hasLoadedOnceRef.current) {
                    setIsLoading(false);
                } else {
                    setIsSyncing(false);
                }
            }
        } finally {
            if (timeoutId !== null) {
                clearTimeout(timeoutId);
            }
        }
    }, [connection.rpcEndpoint, fetchGrid]);

    fetchGridWithTimeoutRef.current = fetchGridWithTimeout;

    useEffect(() => {
        void fetchGridWithTimeout();
    }, [fetchGridWithTimeout]);

    return {
        blocks,
        isLoading,
        isSyncing,
        gridAdmin,
        fetchGrid,
        refreshBlockById,
        queueGridSync,
        updateBlockInState,
    };
};
