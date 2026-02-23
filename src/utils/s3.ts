import { S3Client } from "@aws-sdk/client-s3";
import { env } from "@/env";

const REGION = env.HETZNER_REGION;
const ENDPOINT = env.HETZNER_ENDPOINT || `https://${REGION}.your-objectstorage.com`;
const BUCKET_NAME = env.HETZNER_BUCKET_NAME;
const PUBLIC_BASE_URL = (env.HETZNER_PUBLIC_BASE_URL || `${ENDPOINT.replace(/\/+$/, "")}/${BUCKET_NAME}`)
    .replace(/\/+$/, "");

export const s3Client = new S3Client({
    region: REGION,
    endpoint: ENDPOINT,
    credentials: {
        accessKeyId: env.HETZNER_ACCESS_KEY_ID,
        secretAccessKey: env.HETZNER_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true, // Needed for many S3-compatible providers
});

export { BUCKET_NAME };

export const getPublicObjectUrl = (key: string): string => {
    const normalizedKey = encodeURIComponent(key).replace(/%2F/g, "/");
    return `${PUBLIC_BASE_URL}/${normalizedKey}`;
};
