const INVALID_LITERAL_VALUES = new Set([
    "undefined",
    "null",
    "false",
    "true",
    "nan",
    "none",
]);

const stripWrappingQuotes = (value: string): string => {
    const trimmed = value.trim();
    if (trimmed.length < 2) {
        return trimmed;
    }

    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === "'" && last === "'") || (first === "\"" && last === "\"") || (first === "`" && last === "`")) {
        return trimmed.slice(1, -1).trim();
    }
    return trimmed;
};

export const normalizeRpcEndpoint = (value?: string | null): string | null => {
    if (!value) {
        return null;
    }

    let candidate = stripWrappingQuotes(value);
    if (!candidate) {
        return null;
    }

    const lowerCandidate = candidate.toLowerCase();
    if (
        INVALID_LITERAL_VALUES.has(lowerCandidate) ||
        candidate.includes("${{")
    ) {
        return null;
    }

    if (candidate.startsWith("//")) {
        candidate = `https:${candidate}`;
    } else if (!/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(candidate)) {
        candidate = `https://${candidate}`;
    }

    try {
        const parsed = new URL(candidate);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            return null;
        }
        return parsed.toString();
    } catch {
        return null;
    }
};

export const resolveSolanaRpcEndpoint = (
    ...candidates: Array<string | null | undefined>
): string => {
    for (const candidate of candidates) {
        const normalized = normalizeRpcEndpoint(candidate);
        if (normalized) {
            return normalized;
        }
    }

    return "https://api.devnet.solana.com";
};
