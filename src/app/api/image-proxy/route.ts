import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Same-origin proxy for block images so the 3D globe can use them as WebGL
// textures. Cross-origin images without CORS headers cannot be uploaded to a
// WebGL canvas texture; routing them through our origin sidesteps that.

const FETCH_TIMEOUT_MS = 8_000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const PRIVATE_HOST_PATTERNS = [
    /^localhost$/i,
    /\.local$/i,
    /^127\./,
    /^10\./,
    /^192\.168\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^169\.254\./,
    /^0\./,
    /^\[?::1\]?$/,
    /^\[?f[cd][0-9a-f]{2}:/i,
    /^\[?fe80:/i,
];

const isSafeRemoteUrl = (raw: string): URL | null => {
    let parsed: URL;
    try {
        parsed = new URL(raw);
    } catch {
        return null;
    }
    if (parsed.protocol !== "https:") return null;
    if (parsed.username || parsed.password) return null;
    const host = parsed.hostname;
    // Bare hostnames (no dot) are typically internal service names
    if (!host.includes(".")) return null;
    if (PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(host))) return null;
    return parsed;
};

export async function GET(request: NextRequest) {
    const rawUrl = request.nextUrl.searchParams.get("url");
    if (!rawUrl) {
        return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
    }

    const target = isSafeRemoteUrl(rawUrl);
    if (!target) {
        return NextResponse.json({ error: "URL not allowed" }, { status: 400 });
    }

    let upstream: Response;
    try {
        upstream = await fetch(target, {
            // A redirect could point somewhere the original URL validation never saw
            redirect: "error",
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
            headers: { Accept: "image/*" },
        });
    } catch {
        return NextResponse.json({ error: "Upstream fetch failed" }, { status: 502 });
    }

    if (!upstream.ok) {
        return NextResponse.json({ error: "Upstream error" }, { status: 502 });
    }

    const contentType = upstream.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) {
        return NextResponse.json({ error: "Not an image" }, { status: 415 });
    }

    const declaredLength = Number(upstream.headers.get("content-length") ?? "0");
    if (declaredLength > MAX_IMAGE_BYTES) {
        return NextResponse.json({ error: "Image too large" }, { status: 413 });
    }

    const body = await upstream.arrayBuffer();
    if (body.byteLength > MAX_IMAGE_BYTES) {
        return NextResponse.json({ error: "Image too large" }, { status: 413 });
    }

    return new NextResponse(body, {
        status: 200,
        headers: {
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
            "X-Content-Type-Options": "nosniff",
        },
    });
}
