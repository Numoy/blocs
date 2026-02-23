import { S3Client } from "@aws-sdk/client-s3";

type S3RuntimeConfig = {
    accessKeyId: string;
    bucketName: string;
    endpoint: string;
    publicBaseUrl: string;
    region: string;
    secretAccessKey: string;
};

let cachedConfig: S3RuntimeConfig | null = null;
let cachedClient: S3Client | null = null;

const getRequiredEnv = (name: string): string => {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
};

const resolveS3Config = (): S3RuntimeConfig => {
    const region = process.env.HETZNER_REGION || "fsn1";
    const endpoint = process.env.HETZNER_ENDPOINT || `https://${region}.your-objectstorage.com`;
    const bucketName = getRequiredEnv("HETZNER_BUCKET_NAME");
    const publicBaseUrl = (process.env.HETZNER_PUBLIC_BASE_URL || `${endpoint.replace(/\/+$/, "")}/${bucketName}`)
        .replace(/\/+$/, "");

    return {
        accessKeyId: getRequiredEnv("HETZNER_ACCESS_KEY_ID"),
        bucketName,
        endpoint,
        publicBaseUrl,
        region,
        secretAccessKey: getRequiredEnv("HETZNER_SECRET_ACCESS_KEY"),
    };
};

const getS3Config = (): S3RuntimeConfig => {
    if (!cachedConfig) {
        cachedConfig = resolveS3Config();
    }
    return cachedConfig;
};

export const getS3Client = (): S3Client => {
    if (!cachedClient) {
        const config = getS3Config();
        cachedClient = new S3Client({
            region: config.region,
            endpoint: config.endpoint,
            credentials: {
                accessKeyId: config.accessKeyId,
                secretAccessKey: config.secretAccessKey,
            },
            forcePathStyle: true, // Needed for many S3-compatible providers
        });
    }
    return cachedClient;
};

export const getBucketName = (): string => getS3Config().bucketName;

export const getPublicObjectUrl = (key: string): string => {
    const normalizedKey = encodeURIComponent(key).replace(/%2F/g, "/");
    return `${getS3Config().publicBaseUrl}/${normalizedKey}`;
};
