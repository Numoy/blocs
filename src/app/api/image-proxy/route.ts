import { NextRequest, NextResponse } from "next/server";
import { isSafeRemoteUrl } from "@/utils/imageProxySafety";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Same-origin proxy for block images so the 3D globe can use them as WebGL
// textures. Cross-origin images without CORS headers cannot be uploaded to a
// WebGL canvas texture; routing them through our origin sidesteps that.

const FETCH_TIMEOUT_MS = 8_000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

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
        void upstream.body?.cancel();
        return NextResponse.json({ error: "Upstream error" }, { status: 502 });
    }

    const contentType = upstream.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) {
        void upstream.body?.cancel();
        return NextResponse.json({ error: "Not an image" }, { status: 415 });
    }

    const declaredLength = Number(upstream.headers.get("content-length") ?? "0");
    if (declaredLength > MAX_IMAGE_BYTES) {
        void upstream.body?.cancel();
        return NextResponse.json({ error: "Image too large" }, { status: 413 });
    }

    if (!upstream.body) {
        return NextResponse.json({ error: "Empty response" }, { status: 502 });
    }

    // Enforce the size cap while streaming, not after buffering — an upstream
    // host that omits or understates Content-Length could otherwise be used
    // to exhaust process memory by streaming an unbounded body before the
    // length was ever checked.
    const reader = upstream.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;

    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.byteLength;
            if (total > MAX_IMAGE_BYTES) {
                await reader.cancel("Image too large").catch(() => {});
                return NextResponse.json({ error: "Image too large" }, { status: 413 });
            }
            chunks.push(value);
        }
    } catch {
        return NextResponse.json({ error: "Upstream read failed" }, { status: 502 });
    }

    const body = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
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
