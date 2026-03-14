import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";

// The Program ID from the IDL (or hardcoded to match deployment)
export const PROGRAM_ID = new PublicKey("C4MgCjSCzHPnxaFHqTPFH7ur67rKHeunEQAzGRSMDKDM");

// The Keypair-initialized Grid Account (Big Data)
export const GRID_PUBKEY = new PublicKey("31Eqr9MZMJVcGJwTkd3bkvybV8HWJ6EADuSEPJCibNpk");

// Grid Configuration
export const GRID_SIZE = 10000;
export const GRID_WIDTH = 100;
export const CANVAS_RES = 3000;
export const CANVAS_MARGIN = 200;
export const BLOCK_SIZE = CANVAS_RES / GRID_WIDTH;
export const BLOCK_EMPTY_COLOR = '#2d2d2d';
export const BLOCK_BASE_PRICE_LAMPORTS = 10_000_000;
export const BLOCK_BASE_PRICE_SOL = BLOCK_BASE_PRICE_LAMPORTS / LAMPORTS_PER_SOL;
export const BLOCK_TEXT_MAX_BYTES = 64;
export const BLOCK_IMAGE_URL_MAX_BYTES = 128;
export const BLOCK_LINK_URL_MAX_BYTES = 128;
export const BLOCK_ACCOUNT_SIZE_BYTES = 384;
export const BLOCK_OWNER_OFFSET_BYTES = 12; // 8 discriminator + 4 id

export const getPrimaryBlockPriceLamports = (id: number): number => BLOCK_BASE_PRICE_LAMPORTS + id;

export const getPrimaryBlockPriceSol = (id: number): number =>
    getPrimaryBlockPriceLamports(id) / LAMPORTS_PER_SOL;
