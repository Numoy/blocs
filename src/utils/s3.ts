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

const INVALID_LITERAL_VALUES = new Set([
    "undefined",
    "null",
    "false",
    "true",
    "nan",
    "none",
]);

const stripWrappingQuotes = (value: string): string => {
    const trimmed = value.trim();
    if (trimmed.length < 2) {
        return trimmed;
    }

    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === "'" && last === "'") || (first === "\"" && last === "\"") || (first === "`" && last === "`")) {
        return trimmed.slice(1, -1).trim();
    }
    return trimmed;
};

const getNormalizedEnv = (name: string): string | null => {
    const rawValue = process.env[name];
    if (!rawValue) {
        return null;
    }

    const value = stripWrappingQuotes(rawValue);
    if (!value) {
        return null;
    }

    const lowerValue = value.toLowerCase();
    if (INVALID_LITERAL_VALUES.has(lowerValue) || value.includes("${{")) {
        return null;
    }

    return value;
};

const getRequiredEnv = (name: string): string => {
    const value = getNormalizedEnv(name);
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
};

const normalizeHttpUrl = (rawValue: string, envName: string): string => {
    let candidate = rawValue.trim();

    if (candidate.startsWith("//")) {
        candidate = `https:${candidate}`;
    } else if (!/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(candidate)) {
        candidate = `https://${candidate}`;
    }

    try {
        const parsed = new URL(candidate);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            throw new Error(`Invalid protocol for ${envName}.`);
        }
        return parsed.toString();
    } catch {
        throw new Error(`Invalid URL in environment variable: ${envName}`);
    }
};

const resolveS3Config = (): S3RuntimeConfig => {
    const region = getNormalizedEnv("HETZNER_REGION") || "fsn1";
    const endpoint = normalizeHttpUrl(
        getNormalizedEnv("HETZNER_ENDPOINT") || `https://${region}.your-objectstorage.com`,
        "HETZNER_ENDPOINT",
    );
    const bucketName = getRequiredEnv("HETZNER_BUCKET_NAME");
    const publicBaseUrl = normalizeHttpUrl(
        getNormalizedEnv("HETZNER_PUBLIC_BASE_URL") || `${endpoint.replace(/\/+$/, "")}/${bucketName}`,
        "HETZNER_PUBLIC_BASE_URL",
    ).replace(/\/+$/, "");

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
