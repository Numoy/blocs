import type { BlockData } from "@/types";

export interface ProgramContextState {
    blocks: BlockData[];
    buyBlock: (id: number, price: number, source?: BuySource) => Promise<void>;
    updateBlock: (id: number, text: string, imageUrl: string, url: string) => Promise<void>;
    updateBlocks: (updates: BatchBlockUpdate[], options?: BatchBlockUpdateOptions) => Promise<BatchBlockUpdateResult>;
    sellBlock: (id: number, priceInput: string) => Promise<void>;
    refreshBlock: () => Promise<void>;
    isLoading: boolean;
    isSyncing: boolean;
    openWalletModal: (source?: WalletModalSource) => void;
    walletBalance: number | null;
    onFundWallet: (amount?: string) => void;
}

export type BatchBlockUpdate = {
    id: number;
    imageUrl: string;
    url: string;
};

export type BatchBlockUpdateProgress = {
    blockId: number;
    completed: number;
    failed: number;
    total: number;
};

export type BatchBlockUpdateOptions = {
    onProgress?: (progress: BatchBlockUpdateProgress) => void;
};

export type BatchBlockUpdateResult = {
    failed: Array<{ blockId: number; message: string }>;
    succeeded: number[];
};

export type BuySource = "grid_sidebar" | "block_detail" | "mobile_sheet" | "unknown";
export type WalletModalSource = "sidebar_buy" | "block_detail_buy" | "header_connect" | "unknown";

export const PRICE_EPSILON_SOL = 1e-9;
export const GRID_READ_TIMEOUT_MS = 18_000;
export const GRID_LOAD_TIMEOUT_MS = 40_000;
export const EVENTUAL_GRID_SYNC_DELAY_MS = 2_500;
export const GRID_MIN_SYNC_INTERVAL_MS = 4_000;
export const GRID_BACKGROUND_SYNC_INTERVAL_MS = 30_000;
export const TRANSACTION_CONFIRM_POLL_INTERVAL_MS = 1_000;
export const TRANSACTION_CONFIRM_TIMEOUT_MS = 60_000;
