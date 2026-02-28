import { PublicKey } from "@solana/web3.js";

export const normalizeSolanaPublicKey = (value: string): string | null => {
    const candidate = value.trim();
    if (!candidate) {
        return null;
    }

    try {
        return new PublicKey(candidate).toBase58();
    } catch {
        return null;
    }
};
