const ALLOWED_EXTERNAL_PROTOCOLS = new Set(["http:", "https:"]);

export const toSafeExternalUrl = (rawUrl: string | null | undefined): string | null => {
    if (!rawUrl) return null;

    const trimmed = rawUrl.trim();
    if (!trimmed) return null;

    const withProtocol = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed)
        ? trimmed
        : `https://${trimmed}`;

    try {
        const parsed = new URL(withProtocol);
        if (!ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol)) {
            return null;
        }
        return parsed.toString();
    } catch {
        return null;
    }
};
