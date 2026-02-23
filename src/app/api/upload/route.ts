import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { createHash, createPublicKey, randomUUID, verify } from "crypto";
import sharp from "sharp";
import { Connection, PublicKey } from "@solana/web3.js";
import { BUCKET_NAME, getPublicObjectUrl, s3Client } from "@/utils/s3";
import {
    BLOCK_ACCOUNT_SIZE_BYTES,
    BLOCK_OWNER_OFFSET_BYTES,
    GRID_SIZE,
    PROGRAM_ID
} from "@/utils/constants";
import { buildUploadAuthMessage, UPLOAD_AUTH_MAX_AGE_MS } from "@/utils/uploadAuth";
import { env } from "@/env";

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
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const MAX_INPUT_PIXELS = 16_777_216; // 4096x4096 upper bound
const SOLANA_RPC_URL = env.SOLANA_RPC_URL || env.NEXT_PUBLIC_SOLANA_RPC_URL;
const solanaConnection = new Connection(SOLANA_RPC_URL, "confirmed");
const UPSTASH_REDIS_REST_URL = env.UPSTASH_REDIS_REST_URL?.replace(/\/+$/, "");
const UPSTASH_REDIS_REST_TOKEN = env.UPSTASH_REDIS_REST_TOKEN;
const hasSharedUploadGuards = Boolean(UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN);

const rateLimitStore = globalThis.__blocsUploadRateLimitStore ?? new Map<string, { count: number; resetAt: number }>();
globalThis.__blocsUploadRateLimitStore = rateLimitStore;
const replayStore = globalThis.__blocsUploadReplayStore ?? new Map<string, number>();
globalThis.__blocsUploadReplayStore = replayStore;

const getClientIp = (request: Request): string => {
    const xff = request.headers.get("x-forwarded-for");
    if (xff) return xff.split(",")[0].trim();
    return request.headers.get("x-real-ip") || "unknown";
};

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

const consumeReplayTokenInMemory = (token: string, now = Date.now()): boolean => {
    if (replayStore.size > 10_000) {
        for (const [entryKey, expiresAt] of replayStore.entries()) {
            if (expiresAt <= now) {
                replayStore.delete(entryKey);
            }
        }
    }

    const existing = replayStore.get(token);
    if (existing && existing > now) {
        return false;
    }

    replayStore.set(token, now + UPLOAD_AUTH_MAX_AGE_MS);
    return true;
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
        console.error("Falling back to in-memory replay protection:", error);
        return consumeReplayTokenInMemory(token, now);
    }
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

    if (
        accountInfo.data.length < BLOCK_ACCOUNT_SIZE_BYTES ||
        accountInfo.data.length < BLOCK_OWNER_OFFSET_BYTES + 32
    ) {
        return false;
    }

    const ownerBytes = accountInfo.data.subarray(BLOCK_OWNER_OFFSET_BYTES, BLOCK_OWNER_OFFSET_BYTES + 32);
    const ownerOnChain = new PublicKey(ownerBytes).toBase58();
    return ownerOnChain === owner;
};

export async function POST(request: Request) {
    const ip = getClientIp(request);
    const ipRate = await applyRateLimit(`ip:${ip}`, RATE_LIMIT_MAX_BY_IP);
    if (!ipRate.allowed) {
        return NextResponse.json(
            { error: "Too many upload attempts. Please retry shortly." },
            { status: 429, headers: { "Retry-After": String(ipRate.retryAfterSec) } }
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

        const walletRate = await applyRateLimit(`wallet:${owner}`, RATE_LIMIT_MAX_BY_WALLET);
        if (!walletRate.allowed) {
            return NextResponse.json(
                { error: "Wallet upload rate limit reached. Please retry shortly." },
                { status: 429, headers: { "Retry-After": String(walletRate.retryAfterSec) } }
            );
        }

        const blockId = Number.parseInt(blockIdRaw, 10);
        if (!Number.isInteger(blockId) || blockId < 0 || blockId >= GRID_SIZE) {
            return NextResponse.json(
                { error: "Invalid block ID." },
                { status: 400 }
            );
        }

        const timestamp = Number.parseInt(timestampRaw, 10);
        if (!Number.isFinite(timestamp)) {
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

        if (!verifyWalletSignature({ blockId, owner, timestamp, signatureBase64 })) {
            return NextResponse.json(
                { error: "Invalid upload signature." },
                { status: 401 }
            );
        }

        const replayToken = `${owner}:${blockId}:${timestamp}:${signatureBase64}`;
        if (!(await consumeReplayToken(replayToken))) {
            return NextResponse.json(
                { error: "Upload signature already used. Please sign a new request." },
                { status: 409 }
            );
        }

        if (!(await verifyBlockOwnership(blockId, owner))) {
            return NextResponse.json(
                { error: "You do not own this block." },
                { status: 403 }
            );
        }

        if (!ALLOWED_TYPES.has(file.type)) {
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

        // --- OPTIMIZATION (Sharp) ---
        const optimizedBuffer = await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS })
            .rotate()
            .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 80 })
            .toBuffer();

        // Sanitize filename & change extension to webp
        const originalName = file.name.replace(/\.[^/.]+$/, ""); // remove extension
        const sanitizedName = originalName.replace(/[^a-zA-Z0-9.-]/g, "_").slice(0, 64) || "image";
        const safeOwnerPrefix = owner.slice(0, 8);
        const filename = `${blockId}_${safeOwnerPrefix}_${Date.now()}_${randomUUID().slice(0, 8)}_${sanitizedName}.webp`;
        // -----------------------------

        const command = new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: filename,
            Body: optimizedBuffer,
            ContentType: "image/webp",
            CacheControl: "public, max-age=31536000, immutable",
            Metadata: {
                owner,
                blockId: String(blockId),
            },
        });

        await s3Client.send(command);

        const fileUrl = getPublicObjectUrl(filename);

        return NextResponse.json({ url: fileUrl, success: true });
    } catch (error) {
        console.error("Upload Error:", error);
        return NextResponse.json(
            { error: "Failed to upload file." },
            { status: 500 }
        );
    }
}
