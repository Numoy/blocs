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
const connectSrc = ["'self'", ...rpcOrigins, "https://*.solana.com", "wss://*.solana.com", "https:", "wss:", analyticsOrigin];
const imgSrc = ["'self'", "data:", "blob:", ...assetOrigins, "https:"];
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
  `script-src ${scriptSrc.join(" ")}`,
  `style-src ${styleSrc.join(" ")}`,
  `font-src ${fontSrc.join(" ")}`,
  `img-src ${imgSrc.join(" ")}`,
  `connect-src ${[...connectSrc, ...(isDev ? ["ws://localhost:*"] : [])].join(" ")}`,
  "form-action 'self'",
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
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
        ],
      },
    ];
  },
};

export default nextConfig;
