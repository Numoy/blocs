import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { createHash, createPublicKey, randomUUID, verify } from "crypto";
import sharp from "sharp";
import { Connection, PublicKey } from "@solana/web3.js";
import { getBucketName, getPublicObjectUrl, getS3Client } from "@/utils/s3";
import {
    BLOCK_OWNER_OFFSET_BYTES,
    GRID_SIZE,
    PROGRAM_ID,
} from "@/utils/constants";
import { buildMosaicUploadAuthMessage, UPLOAD_AUTH_MAX_AGE_MS } from "@/utils/uploadAuth";
import { resolveSolanaRpcEndpoint } from "@/utils/rpc";
import { normalizeSolanaPublicKey } from "@/utils/publicKey";
import { parseNonNegativeIntegerString } from "@/utils/numberParsing";
import { probePublicObjectUrl } from "@/utils/publicUrlProbe";
import {
    doesMimeMatchDetectedFormat,
    isAllowedDetectedImageFormat,
    isAllowedUploadMimeType,
} from "@/utils/uploadValidation";
import { buildMosaicSelection, MOSAIC_MAX_BLOCKS } from "@/utils/mosaic";

export const runtime = "nodejs";

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const MAX_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_MULTIPART_BODY_BYTES = MAX_SIZE_BYTES + 512 * 1024;
const MAX_INPUT_PIXELS = 16_777_216;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_BY_WALLET = 8;
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

declare global {
    var __blocsMosaicUploadRateLimitStore: Map<string, { count: number; resetAt: number }> | undefined;
    var __blocsMosaicUploadReplayStore: Map<string, number> | undefined;
}

const rateLimitStore = globalThis.__blocsMosaicUploadRateLimitStore ?? new Map<string, { count: number; resetAt: number }>();
globalThis.__blocsMosaicUploadRateLimitStore = rateLimitStore;
const replayStore = globalThis.__blocsMosaicUploadReplayStore ?? new Map<string, number>();
globalThis.__blocsMosaicUploadReplayStore = replayStore;

const getContentLength = (request: Request): number | null => {
    const raw = request.headers.get("content-length");
    return raw ? parseNonNegativeIntegerString(raw) : null;
};

const isAllowedRequestOrigin = (request: Request): boolean => {
    const origin = request.headers.get("origin");
    if (!origin || !EXPECTED_REQUEST_ORIGIN) return true;
    try {
        return new URL(origin).origin === EXPECTED_REQUEST_ORIGIN;
    } catch {
        return false;
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

const applyRateLimit = (owner: string, now = Date.now()): { allowed: boolean; retryAfterSec: number } => {
    if (rateLimitStore.size > 5_000) {
        for (const [entryKey, entry] of rateLimitStore.entries()) {
            if (entry.resetAt <= now) rateLimitStore.delete(entryKey);
        }
    }

    const current = rateLimitStore.get(owner);
    if (!current || current.resetAt <= now) {
        rateLimitStore.set(owner, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
        return { allowed: true, retryAfterSec: 0 };
    }

    if (current.count >= RATE_LIMIT_MAX_BY_WALLET) {
        return {
            allowed: false,
            retryAfterSec: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
        };
    }

    current.count += 1;
    rateLimitStore.set(owner, current);
    return { allowed: true, retryAfterSec: 0 };
};

const consumeReplayToken = (token: string, now = Date.now()): boolean => {
    if (replayStore.size > 10_000) {
        for (const [entryKey, expiresAt] of replayStore.entries()) {
            if (expiresAt <= now) replayStore.delete(entryKey);
        }
    }

    const tokenHash = createHash("sha256").update(token).digest("hex");
    const existingExpiresAt = replayStore.get(tokenHash);
    if (existingExpiresAt && existingExpiresAt > now) {
        return false;
    }

    replayStore.set(tokenHash, now + UPLOAD_AUTH_MAX_AGE_MS);
    return true;
};

const verifyWalletSignature = ({
    blockIds,
    height,
    owner,
    signatureBase64,
    timestamp,
    width,
}: {
    blockIds: number[];
    height: number;
    owner: string;
    signatureBase64: string;
    timestamp: number;
    width: number;
}): boolean => {
    try {
        const ownerPubkey = new PublicKey(owner);
        const signature = Buffer.from(signatureBase64, "base64");
        if (signature.length !== 64) return false;

        const message = buildMosaicUploadAuthMessage({ blockIds, height, owner, timestamp, width });
        const keyDer = Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(ownerPubkey.toBytes())]);
        const key = createPublicKey({ key: keyDer, format: "der", type: "spki" });

        return verify(null, Buffer.from(message, "utf-8"), key, signature);
    } catch {
        return false;
    }
};

const verifyBlockOwnership = async (blockId: number, owner: string): Promise<boolean> => {
    if (!Number.isInteger(blockId) || blockId < 0 || blockId >= GRID_SIZE) return false;

    const blockIdBuffer = Buffer.alloc(4);
    blockIdBuffer.writeUInt32LE(blockId, 0);
    const [blockPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("block"), blockIdBuffer],
        PROGRAM_ID,
    );
    const accountInfo = await solanaConnection.getAccountInfo(blockPda, "confirmed");
    if (!accountInfo || !accountInfo.owner.equals(PROGRAM_ID)) return false;
    if (accountInfo.data.length < BLOCK_OWNER_OFFSET_BYTES + 32) return false;

    const ownerBytes = accountInfo.data.subarray(BLOCK_OWNER_OFFSET_BYTES, BLOCK_OWNER_OFFSET_BYTES + 32);
    return new PublicKey(ownerBytes).toBase58() === owner;
};

const parseBlockIds = (value: FormDataEntryValue | null): number[] | null => {
    if (typeof value !== "string") return null;
    const blockIds = value.split(",").map((part) => Number(part.trim()));
    if (blockIds.length === 0 || blockIds.length > MOSAIC_MAX_BLOCKS) return null;
    if (!blockIds.every((id) => Number.isInteger(id) && id >= 0 && id < GRID_SIZE)) return null;
    return blockIds;
};

const formString = (value: FormDataEntryValue | null): string | null => (
    typeof value === "string" ? value : null
);

const putPublicImage = async ({
    blockId,
    buffer,
    owner,
}: {
    blockId: number;
    buffer: Buffer;
    owner: string;
}): Promise<string> => {
    const filename = `mosaic_${blockId}_${owner.slice(0, 8)}_${Date.now()}_${randomUUID().slice(0, 8)}.webp`;
    const basePutObjectParams = {
        Bucket: getBucketName(),
        Key: filename,
        Body: buffer,
        ContentType: "image/webp",
        CacheControl: "public, max-age=31536000, immutable",
        Metadata: {
            blockId: String(blockId),
            mosaic: "true",
            owner,
        },
    };

    try {
        await getS3Client().send(new PutObjectCommand({
            ...basePutObjectParams,
            ACL: "public-read",
        }));
    } catch (error) {
        if (!isAclUnsupportedError(error)) throw error;
        await getS3Client().send(new PutObjectCommand(basePutObjectParams));
    }

    const fileUrl = getPublicObjectUrl(filename);
    const publicUrlProbe = await probePublicObjectUrl(fileUrl);
    if (!publicUrlProbe.ok) {
        throw new Error("Uploaded slice is not publicly reachable.");
    }
    return fileUrl;
};

export async function POST(request: Request) {
    if (!isAllowedRequestOrigin(request)) {
        return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
    }

    const declaredLength = getContentLength(request);
    if (declaredLength !== null && declaredLength > MAX_MULTIPART_BODY_BYTES) {
        return NextResponse.json({ error: "Request body too large." }, { status: 413 });
    }

    let formData: FormData;
    try {
        formData = await request.formData();
    } catch {
        return NextResponse.json({ error: "Invalid multipart form data." }, { status: 400 });
    }

    const file = formData.get("file");
    if (!(file instanceof File)) {
        return NextResponse.json({ error: "Missing image file." }, { status: 400 });
    }

    const owner = normalizeSolanaPublicKey(formString(formData.get("owner")) ?? "");
    const signature = formString(formData.get("signature"));
    const timestamp = parseNonNegativeIntegerString(formString(formData.get("timestamp")) ?? "");
    const width = parseNonNegativeIntegerString(formString(formData.get("width")) ?? "");
    const height = parseNonNegativeIntegerString(formString(formData.get("height")) ?? "");
    const blockIds = parseBlockIds(formData.get("blockIds"));

    if (!owner || typeof signature !== "string" || timestamp === null || width === null || height === null || !blockIds) {
        return NextResponse.json({ error: "Missing or invalid upload fields." }, { status: 400 });
    }

    if (width < 1 || height < 1 || width * height !== blockIds.length || blockIds.length > MOSAIC_MAX_BLOCKS) {
        return NextResponse.json({ error: "Invalid mosaic dimensions." }, { status: 400 });
    }

    const expectedSelection = buildMosaicSelection(blockIds[0], blockIds[blockIds.length - 1]);
    if (!expectedSelection || expectedSelection.width !== width || expectedSelection.height !== height) {
        return NextResponse.json({ error: "Block IDs must describe one rectangle." }, { status: 400 });
    }
    if (expectedSelection.blockIds.join(",") !== blockIds.join(",")) {
        return NextResponse.json({ error: "Block IDs must be in row-major rectangle order." }, { status: 400 });
    }

    if (Math.abs(Date.now() - timestamp) > UPLOAD_AUTH_MAX_AGE_MS) {
        return NextResponse.json({ error: "Upload signature expired. Please retry." }, { status: 401 });
    }

    const rateLimit = applyRateLimit(owner);
    if (!rateLimit.allowed) {
        return NextResponse.json(
            { error: "Too many mosaic uploads. Please retry shortly." },
            {
                status: 429,
                headers: { "Retry-After": String(rateLimit.retryAfterSec) },
            },
        );
    }

    const replayToken = `${blockIds.join(",")}:${width}x${height}:${owner}:${timestamp}:${signature}`;
    if (!consumeReplayToken(replayToken)) {
        return NextResponse.json({ error: "Upload signature already used. Please sign a new request." }, { status: 409 });
    }

    if (!verifyWalletSignature({
        blockIds,
        height,
        owner,
        signatureBase64: signature,
        timestamp,
        width,
    })) {
        return NextResponse.json({ error: "Invalid upload signature." }, { status: 401 });
    }

    if (!isAllowedUploadMimeType(file.type)) {
        return NextResponse.json({ error: "Invalid file type. Only PNG, JPEG, GIF, and WEBP are allowed." }, { status: 400 });
    }

    if (file.size > MAX_SIZE_BYTES) {
        return NextResponse.json({ error: "File too large. Maximum size is 5MB." }, { status: 400 });
    }

    const ownershipChecks = await Promise.all(blockIds.map((blockId) => verifyBlockOwnership(blockId, owner)));
    if (ownershipChecks.some((owned) => !owned)) {
        return NextResponse.json({ error: "You must own every selected block." }, { status: 403 });
    }

    const inputBuffer = Buffer.from(await file.arrayBuffer());
    const image = sharp(inputBuffer, { limitInputPixels: MAX_INPUT_PIXELS, failOnError: true });
    let metadata: sharp.Metadata;
    try {
        metadata = await image.metadata();
    } catch {
        return NextResponse.json({ error: "Uploaded file is not a valid image." }, { status: 400 });
    }

    const detectedFormat = metadata.format?.toLowerCase();
    if (!detectedFormat || !isAllowedDetectedImageFormat(detectedFormat)) {
        return NextResponse.json({ error: "Unsupported or invalid image payload." }, { status: 400 });
    }

    if (!metadata.width || !metadata.height) {
        return NextResponse.json({ error: "Could not determine image dimensions." }, { status: 400 });
    }

    if (!doesMimeMatchDetectedFormat(file.type, detectedFormat)) {
        return NextResponse.json({ error: "File MIME type does not match its actual content." }, { status: 400 });
    }

    const tileSize = 512;
    const targetWidth = width * tileSize;
    const targetHeight = height * tileSize;
    const normalized = await sharp(inputBuffer, { limitInputPixels: MAX_INPUT_PIXELS, failOnError: true })
        .rotate()
        .resize({ width: targetWidth, height: targetHeight, fit: "cover", position: "centre" })
        .webp({ quality: 84 })
        .toBuffer();

    const slices: Array<{ blockId: number; url: string }> = [];
    for (let index = 0; index < blockIds.length; index += 1) {
        const col = index % width;
        const row = Math.floor(index / width);
        const sliceBuffer = await sharp(normalized)
            .extract({
                left: col * tileSize,
                top: row * tileSize,
                width: tileSize,
                height: tileSize,
            })
            .webp({ quality: 84 })
            .toBuffer();
        const url = await putPublicImage({ blockId: blockIds[index], buffer: sliceBuffer, owner });
        slices.push({ blockId: blockIds[index], url });
    }

    return NextResponse.json({ slices });
}
