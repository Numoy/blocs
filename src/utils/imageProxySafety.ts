// Host/URL allowlist for the image proxy (src/app/api/image-proxy/route.ts).
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

// IMPORTANT: Restrict outbound proxy destinations to trusted image hosts only.
// Replace these entries with the domains your application actually needs.
const ALLOWED_REMOTE_HOSTS = [
    "images.example.com",
];

const isAllowedRemoteHost = (hostname: string): boolean => {
    const host = hostname.toLowerCase();
    return ALLOWED_REMOTE_HOSTS.some(
        (allowed) => host === allowed || host.endsWith(`.${allowed}`),
    );
};

// Returns the parsed URL if it's safe to server-side fetch (https, no
// embedded credentials, not a bare/internal-looking hostname, not a private
// or link-local IP range, and explicitly allowlisted host), or null if it
// should be rejected. This is a best-effort hostname allowlist, not a
// substitute for network-level egress controls against DNS rebinding.
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
