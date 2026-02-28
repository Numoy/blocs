"use client";

import { Connection, PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import { asBlocsProgram } from "@/utils/programTypes";
import type { BlockData } from "@/types";
import { useGridFetch } from "@/context/program/useGridFetch";
import { useGridRealtime } from "@/context/program/useGridRealtime";

type ProviderWalletLike = {
    publicKey: PublicKey;
    signTransaction: <T extends Transaction | VersionedTransaction>(tx: T) => Promise<T>;
    signAllTransactions: <T extends Transaction | VersionedTransaction>(txs: T[]) => Promise<T[]>;
};

type UpdateBlockInState = (id: number, updater: (existing: BlockData) => BlockData) => void;

type UseGridSyncOptions = {
    connection: Connection;
    providerWallet: ProviderWalletLike;
    program: ReturnType<typeof asBlocsProgram>;
};

type UseGridSyncResult = {
    blocks: BlockData[];
    isLoading: boolean;
    isSyncing: boolean;
    gridAdmin: PublicKey | null;
    fetchGrid: () => Promise<void>;
    queueGridSync: (delayMs?: number) => void;
    updateBlockInState: UpdateBlockInState;
};

export const useGridSync = ({ connection, providerWallet, program }: UseGridSyncOptions): UseGridSyncResult => {
    const {
        blocks,
        isLoading,
        isSyncing,
        gridAdmin,
        fetchGrid,
        queueGridSync,
        updateBlockInState,
    } = useGridFetch({
        connection,
        providerWallet,
    });

    useGridRealtime({
        program,
        queueGridSync,
        updateBlockInState,
    });

    return {
        blocks,
        isLoading,
        isSyncing,
        gridAdmin,
        fetchGrid,
        queueGridSync,
        updateBlockInState,
    };
};
