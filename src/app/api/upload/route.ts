import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { createHash, createPublicKey, randomUUID, verify } from "crypto";
import sharp from "sharp";
import { Connection, PublicKey } from "@solana/web3.js";
import { getBucketName, getPublicObjectUrl, getS3Client } from "@/utils/s3";
import {
    BLOCK_OWNER_OFFSET_BYTES,
    GRID_SIZE,
    PROGRAM_ID
} from "@/utils/constants";
import { buildUploadAuthMessage, UPLOAD_AUTH_MAX_AGE_MS } from "@/utils/uploadAuth";
import { resolveSolanaRpcEndpoint } from "@/utils/rpc";
import { buildClientRateLimitKey } from "@/utils/requestIdentity";
import { normalizeSolanaPublicKey } from "@/utils/publicKey";
import { consumeReplayTokenFromStore } from "@/utils/replayProtection";
import { parseGridBlockId, parseNonNegativeIntegerString } from "@/utils/numberParsing";
import { probePublicObjectUrl } from "@/utils/publicUrlProbe";
import {
    doesMimeMatchDetectedFormat,
    isAllowedDetectedImageFormat,
    isAllowedUploadMimeType,
} from "@/utils/uploadValidation";

export const runtime = "nodejs";

declare global {
    var __blocsUploadRateLimitStore: Map<string, { count: number; resetAt: number }> | undefined;
    var __blocsUploadReplayStore: Map<string, number> | undefined;
}

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_BY_IP = 30;
const RATE_LIMIT_MAX_BY_WALLET = 12;
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_MULTIPART_BODY_BYTES = MAX_SIZE_BYTES + 512 * 1024; // Allow multipart/form-data overhead.
const MAX_INPUT_PIXELS = 16_777_216; // 4096x4096 upper bound
// Prefer the public RPC endpoint first so server-side upload ownership checks
// use the same cluster as wallet-driven client transactions.
const SOLANA_RPC_URL = resolveSolanaRpcEndpoint(process.env.NEXT_PUBLIC_SOLANA_RPC_URL, process.env.SOLANA_RPC_URL);
const solanaConnection = new Connection(SOLANA_RPC_URL, "confirmed");
const EXPECTED_REQUEST_ORIGIN = (() => {
    const raw = process.env.NEXT_PUBLIC_SITE_URL;
    if (!raw) return null;
    try {
        return new URL(raw).origin;
    } catch {
        return null;
    }
})();
const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/+$/, "");
const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const hasSharedUploadGuards = Boolean(UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN);
const requireSharedUploadGuardsInProduction =
    process.env.NODE_ENV === "production" && process.env.ALLOW_IN_MEMORY_UPLOAD_GUARDS !== "true";

const rateLimitStore = globalThis.__blocsUploadRateLimitStore ?? new Map<string, { count: number; resetAt: number }>();
globalThis.__blocsUploadRateLimitStore = rateLimitStore;
const replayStore = globalThis.__blocsUploadReplayStore ?? new Map<string, number>();
globalThis.__blocsUploadReplayStore = replayStore;

const applyRateLimitInMemory = (key: string, maxRequests: number, now = Date.now()): { allowed: boolean; retryAfterSec: number } => {
    if (rateLimitStore.size > 5_000) {
        for (const [entryKey, entry] of rateLimitStore.entries()) {
            if (entry.resetAt <= now) {
                rateLimitStore.delete(entryKey);
            }
        }
    }

    const current = rateLimitStore.get(key);

    if (!current || current.resetAt <= now) {
        rateLimitStore.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
        return { allowed: true, retryAfterSec: 0 };
    }

    if (current.count >= maxRequests) {
        const retryAfterSec = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
        return { allowed: false, retryAfterSec };
    }

    current.count += 1;
    rateLimitStore.set(key, current);
    return { allowed: true, retryAfterSec: 0 };
};

const getContentLength = (request: Request): number | null => {
    const raw = request.headers.get("content-length");
    if (!raw) {
        return null;
    }

    return parseNonNegativeIntegerString(raw);
};

const isAllowedRequestOrigin = (request: Request): boolean => {
    const origin = request.headers.get("origin");
    if (!origin || !EXPECTED_REQUEST_ORIGIN) {
        return true;
    }

    try {
        return new URL(origin).origin === EXPECTED_REQUEST_ORIGIN;
    } catch {
        return false;
    }
};

const isRequestBodyTooLarge = async (request: Request, maxBytes: number): Promise<boolean> => {
    const declaredLength = getContentLength(request);
    if (declaredLength !== null) {
        return declaredLength > maxBytes;
    }

    const body = request.clone().body;
    if (!body) {
        return false;
    }

    const reader = body.getReader();
    let totalBytes = 0;

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }

            totalBytes += value?.byteLength ?? 0;
            if (totalBytes > maxBytes) {
                try {
                    await reader.cancel("request body too large");
                } catch {
                    // Best effort.
                }
                return true;
            }
        }
    } catch {
        return true;
    } finally {
        reader.releaseLock();
    }

    return false;
};

const consumeReplayTokenInMemory = (token: string, now = Date.now()): boolean => {
    return consumeReplayTokenFromStore(replayStore, token, UPLOAD_AUTH_MAX_AGE_MS, now);
};

const runRedisCommand = async <T = unknown>(...args: string[]): Promise<T> => {
    if (!UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN) {
        throw new Error("Upstash Redis is not configured.");
    }

    const encodedArgs = args.map(part => encodeURIComponent(part));
    const response = await fetch(`${UPSTASH_REDIS_REST_URL}/${encodedArgs.join("/")}`, {
        method: "POST",
        cache: "no-store",
        headers: {
            Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}`,
        },
    });

    if (!response.ok) {
        throw new Error(`Upstash request failed with status ${response.status}.`);
    }

    const payload = await response.json() as { result?: T; error?: string };
    if (payload.error) {
        throw new Error(payload.error);
    }
    return payload.result as T;
};

const applyRateLimitShared = async (
    key: string,
    maxRequests: number,
    now = Date.now()
): Promise<{ allowed: boolean; retryAfterSec: number }> => {
    const windowBucket = Math.floor(now / RATE_LIMIT_WINDOW_MS);
    const windowStart = windowBucket * RATE_LIMIT_WINDOW_MS;
    const windowEnd = windowStart + RATE_LIMIT_WINDOW_MS;
    const redisKey = `blocs:upload:rate:${key}:${windowBucket}`;

    const countRaw = await runRedisCommand<number | string>("INCR", redisKey);
    const count = typeof countRaw === "number" ? countRaw : Number(countRaw || 0);

    if (count === 1) {
        await runRedisCommand("PEXPIRE", redisKey, String(RATE_LIMIT_WINDOW_MS + 5_000));
    }

    if (count > maxRequests) {
        const retryAfterSec = Math.max(1, Math.ceil((windowEnd - now) / 1000));
        return { allowed: false, retryAfterSec };
    }

    return { allowed: true, retryAfterSec: 0 };
};

const consumeReplayTokenShared = async (token: string): Promise<boolean> => {
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const redisKey = `blocs:upload:replay:${tokenHash}`;
    const result = await runRedisCommand<string | null>(
        "SET",
        redisKey,
        "1",
        "NX",
        "PX",
        String(UPLOAD_AUTH_MAX_AGE_MS),
    );

    return result === "OK";
};

const applyRateLimit = async (
    key: string,
    maxRequests: number,
    now = Date.now()
): Promise<{ allowed: boolean; retryAfterSec: number }> => {
    if (!hasSharedUploadGuards) {
        return applyRateLimitInMemory(key, maxRequests, now);
    }

    try {
        return await applyRateLimitShared(key, maxRequests, now);
    } catch (error) {
        if (requireSharedUploadGuardsInProduction) {
            console.error("Shared upload guard unavailable for rate limit; failing closed:", error);
            throw error;
        }
        console.error("Falling back to in-memory rate limit:", error);
        return applyRateLimitInMemory(key, maxRequests, now);
    }
};

const consumeReplayToken = async (token: string, now = Date.now()): Promise<boolean> => {
    if (!hasSharedUploadGuards) {
        return consumeReplayTokenInMemory(token, now);
    }

    try {
        return await consumeReplayTokenShared(token);
    } catch (error) {
        if (requireSharedUploadGuardsInProduction) {
            console.error("Shared upload guard unavailable for replay protection; failing closed:", error);
            throw error;
        }
        console.error("Falling back to in-memory replay protection:", error);
        return consumeReplayTokenInMemory(token, now);
    }
};

const isAclUnsupportedError = (error: unknown): boolean => {
    const candidate = error as { name?: string; code?: string; Code?: string; message?: string } | null;
    const code = String(candidate?.code || candidate?.Code || candidate?.name || "").toLowerCase();
    const message = String(candidate?.message || "").toLowerCase();

    return (
        code.includes("accesscontrollistnotsupported") ||
        (code.includes("invalidrequest") && message.includes("acl")) ||
        message.includes("accesscontrollistnotsupported")
    );
};

const verifyWalletSignature = ({
    blockId,
    owner,
    timestamp,
    signatureBase64,
}: {
    blockId: number;
    owner: string;
    timestamp: number;
    signatureBase64: string;
}): boolean => {
    try {
        const ownerPubkey = new PublicKey(owner);
        const signature = Buffer.from(signatureBase64, "base64");
        if (signature.length !== 64) return false;

        const message = buildUploadAuthMessage({ blockId, owner, timestamp });
        const keyDer = Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(ownerPubkey.toBytes())]);
        const key = createPublicKey({ key: keyDer, format: "der", type: "spki" });

        return verify(null, Buffer.from(message, "utf-8"), key, signature);
    } catch {
        return false;
    }
};

const verifyBlockOwnership = async (blockId: number, owner: string): Promise<boolean> => {
    if (!Number.isInteger(blockId) || blockId < 0 || blockId >= GRID_SIZE) {
        return false;
    }

    const blockIdBuffer = Buffer.alloc(4);
    blockIdBuffer.writeUInt32LE(blockId, 0);

    const [blockPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("block"), blockIdBuffer],
        PROGRAM_ID
    );

    const accountInfo = await solanaConnection.getAccountInfo(blockPda, "confirmed");
    if (!accountInfo || !accountInfo.owner.equals(PROGRAM_ID)) {
        return false;
    }

    // We only need the owner field (32 bytes) after the fixed owner offset.
    // Avoid coupling ownership checks to a single full account-size constant,
    // because deployed account layouts can vary across program versions.
    if (accountInfo.data.length < BLOCK_OWNER_OFFSET_BYTES + 32) {
        return false;
    }

    const ownerBytes = accountInfo.data.subarray(BLOCK_OWNER_OFFSET_BYTES, BLOCK_OWNER_OFFSET_BYTES + 32);
    const ownerOnChain = new PublicKey(ownerBytes).toBase58();
    return ownerOnChain === owner;
};

export async function POST(request: Request) {
    if (!isAllowedRequestOrigin(request)) {
        return NextResponse.json(
            { error: "Invalid request origin." },
            { status: 403 }
        );
    }

    if (requireSharedUploadGuardsInProduction && !hasSharedUploadGuards) {
        return NextResponse.json(
            { error: "Upload shared guards must be configured in production." },
            { status: 503 }
        );
    }

    const clientRateKey = buildClientRateLimitKey(request);
    let ipRate: { allowed: boolean; retryAfterSec: number };
    try {
        ipRate = await applyRateLimit(clientRateKey, RATE_LIMIT_MAX_BY_IP);
    } catch (error) {
        console.error("Upload guard service unavailable for IP rate limit:", error);
        return NextResponse.json(
            { error: "Upload guard service is temporarily unavailable. Please retry shortly." },
            { status: 503 }
        );
    }
    if (!ipRate.allowed) {
        return NextResponse.json(
            { error: "Too many upload attempts. Please retry shortly." },
            { status: 429, headers: { "Retry-After": String(ipRate.retryAfterSec) } }
        );
    }

    if (await isRequestBodyTooLarge(request, MAX_MULTIPART_BODY_BYTES)) {
        return NextResponse.json(
            { error: "Request body too large." },
            { status: 413 }
        );
    }

    try {
        getBucketName();
        getS3Client();
    } catch (error) {
        console.error("Upload configuration error:", error);
        return NextResponse.json(
            { error: "Upload service is not configured." },
            { status: 503 }
        );
    }

    try {
        const formData = await request.formData();
        const file = formData.get("file");
        const owner = formData.get("owner");
        const blockIdRaw = formData.get("blockId");
        const timestampRaw = formData.get("timestamp");
        const signatureBase64 = formData.get("signature");

        if (!(file instanceof File)) {
            return NextResponse.json(
                { error: "No file received." },
                { status: 400 }
            );
        }

        if (
            typeof owner !== "string" ||
            typeof blockIdRaw !== "string" ||
            typeof timestampRaw !== "string" ||
            typeof signatureBase64 !== "string"
        ) {
            return NextResponse.json(
                { error: "Missing upload authentication payload." },
                { status: 400 }
            );
        }

        const normalizedOwner = normalizeSolanaPublicKey(owner);
        if (!normalizedOwner) {
            return NextResponse.json(
                { error: "Invalid owner public key." },
                { status: 400 }
            );
        }

        let walletRate: { allowed: boolean; retryAfterSec: number };
        try {
            walletRate = await applyRateLimit(`wallet:${normalizedOwner}`, RATE_LIMIT_MAX_BY_WALLET);
        } catch (error) {
            console.error("Upload guard service unavailable for wallet rate limit:", error);
            return NextResponse.json(
                { error: "Upload guard service is temporarily unavailable. Please retry shortly." },
                { status: 503 }
            );
        }
        if (!walletRate.allowed) {
            return NextResponse.json(
                { error: "Wallet upload rate limit reached. Please retry shortly." },
                { status: 429, headers: { "Retry-After": String(walletRate.retryAfterSec) } }
            );
        }

        const blockId = parseGridBlockId(blockIdRaw);
        if (blockId === null) {
            return NextResponse.json(
                { error: "Invalid block ID." },
                { status: 400 }
            );
        }

        const timestamp = parseNonNegativeIntegerString(timestampRaw);
        if (timestamp === null) {
            return NextResponse.json(
                { error: "Invalid upload timestamp." },
                { status: 400 }
            );
        }

        if (Math.abs(Date.now() - timestamp) > UPLOAD_AUTH_MAX_AGE_MS) {
            return NextResponse.json(
                { error: "Upload authentication has expired. Please retry." },
                { status: 401 }
            );
        }

        if (!verifyWalletSignature({ blockId, owner: normalizedOwner, timestamp, signatureBase64 })) {
            return NextResponse.json(
                { error: "Invalid upload signature." },
                { status: 401 }
            );
        }

        const replayToken = `${normalizedOwner}:${blockId}:${timestamp}:${signatureBase64}`;
        let replayAccepted: boolean;
        try {
            replayAccepted = await consumeReplayToken(replayToken);
        } catch (error) {
            console.error("Upload guard service unavailable for replay protection:", error);
            return NextResponse.json(
                { error: "Upload guard service is temporarily unavailable. Please retry shortly." },
                { status: 503 }
            );
        }

        if (!replayAccepted) {
            return NextResponse.json(
                { error: "Upload signature already used. Please sign a new request." },
                { status: 409 }
            );
        }

        if (!(await verifyBlockOwnership(blockId, normalizedOwner))) {
            return NextResponse.json(
                { error: "You do not own this block." },
                { status: 403 }
            );
        }

        if (!isAllowedUploadMimeType(file.type)) {
            return NextResponse.json(
                { error: "Invalid file type. Only PNG, JPEG, GIF, and WEBP are allowed." },
                { status: 400 }
            );
        }

        if (file.size > MAX_SIZE_BYTES) {
            return NextResponse.json(
                { error: "File too large. Maximum size is 5MB." },
                { status: 400 }
            );
        }
        // ------------------

        const buffer = Buffer.from(await file.arrayBuffer());
        const imageTransformer = sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS, failOnError: true });

        let detectedFormat: string | undefined;
        try {
            const metadata = await imageTransformer.metadata();
            detectedFormat = metadata.format?.toLowerCase();
            if (!detectedFormat || !isAllowedDetectedImageFormat(detectedFormat)) {
                return NextResponse.json(
                    { error: "Unsupported or invalid image payload." },
                    { status: 400 }
                );
            }

            if (!metadata.width || !metadata.height) {
                return NextResponse.json(
                    { error: "Could not determine image dimensions." },
                    { status: 400 }
                );
            }
        } catch {
            return NextResponse.json(
                { error: "Uploaded file is not a valid image." },
                { status: 400 }
            );
        }

        if (!doesMimeMatchDetectedFormat(file.type, detectedFormat)) {
            return NextResponse.json(
                { error: "File MIME type does not match its actual content." },
                { status: 400 }
            );
        }

        const optimizedBuffer = await imageTransformer
            .rotate()
            .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
            .webp({ quality: 80 })
            .toBuffer();

        // Sanitize filename & change extension to webp
        const originalName = file.name.replace(/\.[^/.]+$/, ""); // remove extension
        const sanitizedName = originalName.replace(/[^a-zA-Z0-9.-]/g, "_").slice(0, 64) || "image";
        const safeOwnerPrefix = normalizedOwner.slice(0, 8);
        const filename = `${blockId}_${safeOwnerPrefix}_${Date.now()}_${randomUUID().slice(0, 8)}_${sanitizedName}.webp`;
        // -----------------------------

        const basePutObjectParams = {
            Bucket: getBucketName(),
            Key: filename,
            Body: optimizedBuffer,
            ContentType: "image/webp",
            CacheControl: "public, max-age=31536000, immutable",
            Metadata: {
                owner: normalizedOwner,
                blockId: String(blockId),
            },
        };

        try {
            await getS3Client().send(
                new PutObjectCommand({
                    ...basePutObjectParams,
                    ACL: "public-read",
                })
            );
        } catch (error) {
            if (!isAclUnsupportedError(error)) {
                throw error;
            }

            console.warn("Object storage rejected ACL header; retrying upload without ACL:", error);
            await getS3Client().send(new PutObjectCommand(basePutObjectParams));
        }

        const fileUrl = getPublicObjectUrl(filename);

        const publicUrlProbe = await probePublicObjectUrl(fileUrl);
        if (!publicUrlProbe.ok) {
            console.error("Upload completed but public URL probe failed:", {
                blockId,
                owner: normalizedOwner,
                fileUrl,
                status: publicUrlProbe.status,
                method: publicUrlProbe.method,
            });
            return NextResponse.json(
                {
                    error: "Upload succeeded, but the image URL is not publicly reachable. Check object storage public-read settings.",
                    code: "UPLOAD_URL_NOT_PUBLIC",
                    url: fileUrl,
                    status: publicUrlProbe.status,
                },
                { status: 502 }
            );
        }

        return NextResponse.json({ url: fileUrl, success: true });
    } catch (error) {
        console.error("Upload Error:", error);
        return NextResponse.json(
            { error: "Failed to upload file." },
            { status: 500 }
        );
    }
}
