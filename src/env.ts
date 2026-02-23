import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_SOLANA_RPC_URL: z.string().url(),
  HETZNER_ACCESS_KEY_ID: z.string().min(1),
  HETZNER_SECRET_ACCESS_KEY: z.string().min(1),
  HETZNER_BUCKET_NAME: z.string().min(1),
  HETZNER_REGION: z.string().min(1).default("fsn1"),
  HETZNER_ENDPOINT: z.string().url().optional(),
  HETZNER_PUBLIC_BASE_URL: z.string().url().optional(),
  SOLANA_RPC_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
});

export const env = envSchema.parse({
  NEXT_PUBLIC_SOLANA_RPC_URL: process.env.NEXT_PUBLIC_SOLANA_RPC_URL,
  HETZNER_ACCESS_KEY_ID: process.env.HETZNER_ACCESS_KEY_ID,
  HETZNER_SECRET_ACCESS_KEY: process.env.HETZNER_SECRET_ACCESS_KEY,
  HETZNER_BUCKET_NAME: process.env.HETZNER_BUCKET_NAME,
  HETZNER_REGION: process.env.HETZNER_REGION,
  HETZNER_ENDPOINT: process.env.HETZNER_ENDPOINT,
  HETZNER_PUBLIC_BASE_URL: process.env.HETZNER_PUBLIC_BASE_URL,
  SOLANA_RPC_URL: process.env.SOLANA_RPC_URL,
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
});
