import type { NextConfig } from "next";

const toOrigin = (value: string | undefined): string | null => {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

const rpcOrigins = new Set<string>([
  toOrigin(process.env.NEXT_PUBLIC_SOLANA_RPC_URL) || "",
  toOrigin(process.env.SOLANA_RPC_URL) || "",
  "https://api.devnet.solana.com",
]);
rpcOrigins.delete("");

const assetOrigins = new Set<string>([
  toOrigin(process.env.HETZNER_PUBLIC_BASE_URL) || "",
  toOrigin(process.env.HETZNER_ENDPOINT) || "",
]);
assetOrigins.delete("");

const analyticsOrigin = "https://analytics.marvinmaerz.com";
// Allow secure RPC backends that may be injected at build/runtime without hardcoding every provider domain.
const connectSrc = ["'self'", ...rpcOrigins, "https://*.solana.com", "wss://*.solana.com", analyticsOrigin, "https://auth.privy.io", "https://*.privy.io"];
const imgSrc = ["'self'", "data:", "blob:", ...assetOrigins, "https:"];
const mediaSrc = ["'self'", "data:", "blob:"];
const workerSrc = ["'self'", "blob:"];
const styleSrc = ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"];
const fontSrc = ["'self'", "data:", "https://fonts.gstatic.com"];
const scriptSrc = [
  "'self'",
  "'unsafe-inline'",
  analyticsOrigin,
];
const isDev = process.env.NODE_ENV !== "production";
if (isDev) {
  scriptSrc.push("'unsafe-eval'");
}

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "frame-src https://auth.privy.io https://*.privy.io",
  `script-src ${scriptSrc.join(" ")}`,
  "script-src-attr 'none'",
  `style-src ${styleSrc.join(" ")}`,
  `font-src ${fontSrc.join(" ")}`,
  `img-src ${imgSrc.join(" ")}`,
  `media-src ${mediaSrc.join(" ")}`,
  `worker-src ${workerSrc.join(" ")}`,
  `connect-src ${[...connectSrc, ...(isDev ? ["ws://localhost:*"] : [])].join(" ")}`,
  "manifest-src 'self'",
  "form-action 'self'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
          { key: "Origin-Agent-Cluster", value: "?1" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
        ],
      },
    ];
  },
};

export default nextConfig;
