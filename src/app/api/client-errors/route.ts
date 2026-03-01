import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { parseClientErrorPayload } from "@/utils/clientErrorPayload";
import { parseNonNegativeIntegerString } from "@/utils/numberParsing";
import { buildClientRateLimitKey } from "@/utils/requestIdentity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

declare global {
    var __blocsClientErrorRateLimitStore: Map<string, { count: number; resetAt: number }> | undefined;
}

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 25;
const MAX_REQUEST_BODY_BYTES = 64 * 1024;
const WEBHOOK_TIMEOUT_MS = 3_000;
const EXPECTED_REQUEST_ORIGIN = (() => {
    const raw = process.env.NEXT_PUBLIC_SITE_URL;
    if (!raw) return null;
    try {
        return new URL(raw).origin;
    } catch {
        return null;
    }
})();
const rateLimitStore = globalThis.__blocsClientErrorRateLimitStore ?? new Map<string, { count: number; resetAt: number }>();
globalThis.__blocsClientErrorRateLimitStore = rateLimitStore;

const getContentLength = (request: Request): number | null => {
    const header = request.headers.get("content-length");
    if (!header) {
        return null;
    }

    return parseNonNegativeIntegerString(header);
};

const forwardClientErrorReport = async (webhookUrl: string, report: Record<string, unknown>): Promise<void> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

    try {
        const response = await fetch(webhookUrl, {
            method: "POST",
            cache: "no-store",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(report),
            signal: controller.signal,
        });

        if (!response.ok) {
            console.error(`Client error forwarding failed with status ${response.status}.`);
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error("Failed to forward client error report:", message);
    } finally {
        clearTimeout(timeoutId);
    }
};

const applyRateLimit = (key: string, now = Date.now()): { allowed: boolean; retryAfterSec: number } => {
    if (rateLimitStore.size > 2_000) {
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

    if (current.count >= RATE_LIMIT_MAX_REQUESTS) {
        return {
            allowed: false,
            retryAfterSec: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
        };
    }

    current.count += 1;
    rateLimitStore.set(key, current);
    return { allowed: true, retryAfterSec: 0 };
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

export async function POST(request: Request) {
    if (!isAllowedRequestOrigin(request)) {
        return NextResponse.json({ ok: false, error: "Invalid request origin." }, { status: 403 });
    }

    const reporterKey = buildClientRateLimitKey(request);
    const rate = applyRateLimit(reporterKey);
    if (!rate.allowed) {
        return NextResponse.json({ ok: false }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } });
    }

    const declaredLength = getContentLength(request);
    if (declaredLength !== null && declaredLength > MAX_REQUEST_BODY_BYTES) {
        return NextResponse.json({ ok: false, error: "Request body too large." }, { status: 413 });
    }

    let rawBody: string;
    try {
        rawBody = await request.text();
    } catch {
        return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
    }

    if (Buffer.byteLength(rawBody, "utf-8") > MAX_REQUEST_BODY_BYTES) {
        return NextResponse.json({ ok: false, error: "Request body too large." }, { status: 413 });
    }

    let rawPayload: unknown;
    try {
        rawPayload = JSON.parse(rawBody);
    } catch {
        return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
    }

    const parsed = parseClientErrorPayload(rawPayload);
    if (!parsed.success) {
        return NextResponse.json({ ok: false, error: "Invalid error payload." }, { status: 400 });
    }

    const reportId = createHash("sha256")
        .update(`${parsed.data.name}|${parsed.data.message}|${Date.now()}|${Math.random()}`)
        .digest("hex")
        .slice(0, 16);

    const report = {
        id: reportId,
        source: "client",
        receivedAt: new Date().toISOString(),
        ...parsed.data,
    };

    console.error("[Client Error Report]", {
        id: reportId,
        source: "client",
        receivedAt: report.receivedAt,
        name: parsed.data.name,
        message: parsed.data.message,
    });

    const webhookUrl = process.env.ERROR_REPORT_WEBHOOK_URL;
    if (webhookUrl) {
        await forwardClientErrorReport(webhookUrl, report);
    }

    return NextResponse.json({ ok: true, id: reportId }, { status: 202 });
}
