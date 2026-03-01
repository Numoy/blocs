const DEFAULT_SITE_URL = "https://10000-blocks.com";
const LOCAL_FALLBACK_URL = "http://localhost:3000";

export const getSiteUrl = (): URL => {
  const rawUrl = process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL;

  try {
    return new URL(rawUrl);
  } catch {
    return new URL(
      process.env.NODE_ENV === "production" ? DEFAULT_SITE_URL : LOCAL_FALLBACK_URL
    );
  }
};

export const getSiteOrigin = (): string => getSiteUrl().toString().replace(/\/$/, "");
