import { S3Client } from "@aws-sdk/client-s3";

const REGION = process.env.HETZNER_REGION || "fsn1";
const ENDPOINT = process.env.HETZNER_ENDPOINT || `https://${REGION}.your-objectstorage.com`;

export const s3Client = new S3Client({
    region: REGION,
    endpoint: ENDPOINT,
    credentials: {
        accessKeyId: process.env.HETZNER_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.HETZNER_SECRET_ACCESS_KEY || "",
    },
    forcePathStyle: true, // Needed for many S3-compatible providers
});

export const BUCKET_NAME = process.env.HETZNER_BUCKET_NAME || "blocs-storage";
