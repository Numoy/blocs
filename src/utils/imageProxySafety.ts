// URL safety checks for the image proxy (src/app/api/image-proxy/route.ts).
// Extracted into its own module (rather than exported from route.ts, whose
// exports Next.js's App Router restricts to HTTP handlers + route config) so
// this security-relevant logic can be unit tested directly.

const PRIVATE_HOST_PATTERNS = [
    /^localhost$/i,
    /\.local$/i,
    /^127\./,
    /^10\./,
    /^192\.168\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^169\.254\./,
    /^0\./,
    /^\[?::1\]?$/,
    /^\[?f[cd][0-9a-f]{2}:/i,
    /^\[?fe80:/i,
];

// The proxy is only meant to fetch images from our own object storage bucket
// (used for CORS-safe WebGL texture loads on the 3D globe) — never arbitrary
// user-supplied hosts, which is what CodeQL's SSRF query requires: a fixed
// allow-list, not a private-IP blocklist. Derived from the same public-facing
// env vars as src/utils/s3.ts, but without requiring the S3 credentials that
// module needs for actual uploads.
const resolveAllowedHost = (): string | null => {
    const region = process.env.HETZNER_REGION?.trim() || "fsn1";
    const raw =
        process.env.HETZNER_PUBLIC_BASE_URL?.trim() ||
        process.env.HETZNER_ENDPOINT?.trim() ||
        `https://${region}.your-objectstorage.com`;
    const withProtocol = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(raw) ? raw : `https://${raw}`;
    try {
        return new URL(withProtocol).hostname.toLowerCase();
    } catch {
        return null;
    }
};

const isAllowedRemoteHost = (hostname: string): boolean => {
    const allowedHost = resolveAllowedHost();
    if (!allowedHost) return false;
    const host = hostname.toLowerCase();
    return host === allowedHost || host.endsWith(`.${allowedHost}`);
};

// Returns the parsed URL if it's safe to server-side fetch (https, no
// embedded credentials, not a bare/internal-looking hostname, not a private
// or link-local IP range, and matches our configured object storage host),
// or null if it should be rejected.
export const isSafeRemoteUrl = (raw: string): URL | null => {
    let parsed: URL;
    try {
        parsed = new URL(raw);
    } catch {
        return null;
    }
    if (parsed.protocol !== "https:") return null;
    if (parsed.username || parsed.password) return null;
    const host = parsed.hostname;
    // Bare hostnames (no dot) are typically internal service names
    if (!host.includes(".")) return null;
    if (PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(host))) return null;
    if (!isAllowedRemoteHost(host)) return null;
    return parsed;
};
