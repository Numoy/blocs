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

// Returns the parsed URL if it's safe to server-side fetch (https, no
// embedded credentials, not a bare/internal-looking hostname, not a private
// or link-local IP range), or null if it should be rejected. Block imageUrl
// values are arbitrary user-supplied public hosts (not just our own object
// storage), so this intentionally has no fixed host allowlist — it's a
// best-effort private/internal-range blocklist, not a substitute for
// network-level egress controls against DNS rebinding.
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
    return parsed;
};
