import { z } from "zod";

const optionalTrimmedString = z
  .string()
  .transform((value) => value.trim())
  .optional()
  .transform((value) => (value ? value : undefined));

const optionalUrl = z
  .string()
  .transform((value) => value.trim())
  .optional()
  .transform((value) => (value ? value : undefined))
  .pipe(z.string().url().optional());

const envSchema = z
  .object({
    NEXT_PUBLIC_SOLANA_RPC_URL: z.string().trim().url(),
    NEXT_PUBLIC_SITE_URL: optionalUrl,
    SOLANA_RPC_URL: optionalUrl,
    HETZNER_ACCESS_KEY_ID: optionalTrimmedString,
    HETZNER_SECRET_ACCESS_KEY: optionalTrimmedString,
    HETZNER_BUCKET_NAME: optionalTrimmedString,
    HETZNER_REGION: z.string().trim().min(1).default("fsn1"),
    HETZNER_ENDPOINT: optionalUrl,
    HETZNER_PUBLIC_BASE_URL: optionalUrl,
    UPSTASH_REDIS_REST_URL: optionalUrl,
    UPSTASH_REDIS_REST_TOKEN: optionalTrimmedString,
    ERROR_REPORT_WEBHOOK_URL: optionalUrl,
  })
  .superRefine((value, ctx) => {
    const hasHetznerConfig = Boolean(
      value.HETZNER_ACCESS_KEY_ID ||
        value.HETZNER_SECRET_ACCESS_KEY ||
        value.HETZNER_BUCKET_NAME ||
        value.HETZNER_ENDPOINT ||
        value.HETZNER_PUBLIC_BASE_URL,
    );

    if (hasHetznerConfig) {
      if (!value.HETZNER_ACCESS_KEY_ID) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["HETZNER_ACCESS_KEY_ID"],
          message: "Required when any HETZNER_* value is configured.",
        });
      }
      if (!value.HETZNER_SECRET_ACCESS_KEY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["HETZNER_SECRET_ACCESS_KEY"],
          message: "Required when any HETZNER_* value is configured.",
        });
      }
      if (!value.HETZNER_BUCKET_NAME) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["HETZNER_BUCKET_NAME"],
          message: "Required when any HETZNER_* value is configured.",
        });
      }
    }

    const hasUpstashUrl = Boolean(value.UPSTASH_REDIS_REST_URL);
    const hasUpstashToken = Boolean(value.UPSTASH_REDIS_REST_TOKEN);
    if (hasUpstashUrl !== hasUpstashToken) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["UPSTASH_REDIS_REST_URL"],
        message: "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must both be set together.",
      });
    }
  });

export const env = envSchema.parse({
  NEXT_PUBLIC_SOLANA_RPC_URL: process.env.NEXT_PUBLIC_SOLANA_RPC_URL,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  SOLANA_RPC_URL: process.env.SOLANA_RPC_URL,
  HETZNER_ACCESS_KEY_ID: process.env.HETZNER_ACCESS_KEY_ID,
  HETZNER_SECRET_ACCESS_KEY: process.env.HETZNER_SECRET_ACCESS_KEY,
  HETZNER_BUCKET_NAME: process.env.HETZNER_BUCKET_NAME,
  HETZNER_REGION: process.env.HETZNER_REGION,
  HETZNER_ENDPOINT: process.env.HETZNER_ENDPOINT,
  HETZNER_PUBLIC_BASE_URL: process.env.HETZNER_PUBLIC_BASE_URL,
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
  ERROR_REPORT_WEBHOOK_URL: process.env.ERROR_REPORT_WEBHOOK_URL,
});
