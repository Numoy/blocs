import { PublicKey } from "@solana/web3.js";

// The Program ID from the IDL (or hardcoded to match deployment)
export const PROGRAM_ID = new PublicKey("C4MgCjSCzHPnxaFHqTPFH7ur67rKHeunEQAzGRSMDKDM");

// The Keypair-initialized Grid Account (Big Data)
export const GRID_PUBKEY = new PublicKey("31Eqr9MZMJVcGJwTkd3bkvybV8HWJ6EADuSEPJCibNpk");

// Grid Configuration
// Grid Configuration
export const GRID_SIZE = 10000;
export const GRID_WIDTH = 100;
export const BLOCK_PRICE_NEW = 0.01; // SOL
