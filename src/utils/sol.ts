const LAMPORTS_PER_SOL = BigInt("1000000000");
const MAX_U64 = BigInt("18446744073709551615");
const SOL_INPUT_REGEX = /^\d+(?:\.\d{0,9})?$/;

export const parseSolToLamports = (input: string): bigint => {
    const trimmed = input.trim();
    if (!trimmed) return BigInt(0);

    if (!SOL_INPUT_REGEX.test(trimmed)) {
        throw new Error("Invalid SOL amount format.");
    }

    const [wholePart, fractionalPart = ""] = trimmed.split(".");
    const wholeLamports = BigInt(wholePart) * LAMPORTS_PER_SOL;
    const fractionalLamports = BigInt(fractionalPart.padEnd(9, "0").slice(0, 9));
    const lamports = wholeLamports + fractionalLamports;

    if (lamports > MAX_U64) {
        throw new Error("SOL amount exceeds on-chain u64 limit.");
    }

    return lamports;
};
