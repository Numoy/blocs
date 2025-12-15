import { PublicKey } from "@solana/web3.js";

// The Program ID from the IDL (or hardcoded to match deployment)
export const PROGRAM_ID = new PublicKey("C4MgCjSCzHPnxaFHqTPFH7ur67rKHeunEQAzGRSMDKDM");

// The Keypair-initialized Grid Account (Big Data)
export const GRID_PUBKEY = new PublicKey("CpAmS3x1GHkj5VWDhw6r6AuN9znThgDrLk2hX1aDhmPp");

// Grid Configuration
export const GRID_SIZE = 10000;
export const GRID_WIDTH = 100;
export const BLOCK_PRICE_NEW = 0.01; // SOL
