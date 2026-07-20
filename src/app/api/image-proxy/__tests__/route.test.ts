// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/image-proxy/route";

const request = (url: string) =>
    new NextRequest(`https://app.example.com/api/image-proxy?url=${encodeURIComponent(url)}`);

const ALLOWED_HOST = "cdn.example.com";

beforeEach(() => {
    vi.stubEnv("HETZNER_ENDPOINT", `https://${ALLOWED_HOST}`);
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

describe("image-proxy route", () => {
    it("rejects a missing url parameter", async () => {
        const response = await GET(new NextRequest("https://app.example.com/api/image-proxy"));
        expect(response.status).toBe(400);
    });

    it("rejects a URL that fails the safety allowlist without calling fetch", async () => {
        const fetchSpy = vi.fn();
        vi.stubGlobal("fetch", fetchSpy);

        const response = await GET(request("http://10.0.0.5/a.jpg"));

        expect(response.status).toBe(400);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("rejects a public host outside the configured object storage allow-list", async () => {
        const fetchSpy = vi.fn();
        vi.stubGlobal("fetch", fetchSpy);

        const response = await GET(request("https://not-our-bucket.example.com/a.jpg"));

        expect(response.status).toBe(400);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("streams through a small image with the right headers", async () => {
        const bytes = new Uint8Array([1, 2, 3, 4]);
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(bytes, {
            status: 200,
            headers: { "content-type": "image/png", "content-length": String(bytes.length) },
        })));

        const response = await GET(request("https://cdn.example.com/a.png"));

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("image/png");
        expect(response.headers.get("cache-control")).toContain("max-age=86400");
        expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    });

    it("rejects a declared content-length over the cap without draining the body", async () => {
        const bodySpy = vi.fn();
        const upstream = new Response(new ReadableStream({
            pull(controller) {
                bodySpy();
                controller.enqueue(new Uint8Array(1024));
            },
        }), {
            status: 200,
            headers: { "content-type": "image/png", "content-length": String(50 * 1024 * 1024) },
        });
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(upstream));

        const response = await GET(request("https://cdn.example.com/huge.png"));

        expect(response.status).toBe(413);
        // ReadableStream auto-primes with one `pull()` right after
        // construction regardless of consumers, so 1 call is expected —
        // what matters is the route never calls reader.read() to drain it.
        expect(bodySpy.mock.calls.length).toBeLessThanOrEqual(1);
    });

    it("caps a stream that under-reports its Content-Length instead of buffering it fully", async () => {
        // Upstream lies (or omits Content-Length) but actually streams well
        // past the cap; the proxy must stop reading and reject, not buffer
        // the whole thing into memory before checking size.
        const CHUNK = 512 * 1024; // 0.5MB per chunk
        let emitted = 0;
        let cancelled = false;
        const upstream = new Response(new ReadableStream({
            pull(controller) {
                if (cancelled) return;
                emitted += CHUNK;
                controller.enqueue(new Uint8Array(CHUNK));
                // Keep offering data far past the 8MB cap if asked to
                if (emitted > 64 * 1024 * 1024) controller.close();
            },
            cancel() {
                cancelled = true;
            },
        }), {
            status: 200,
            headers: { "content-type": "image/png" }, // no content-length at all
        });
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(upstream));

        const response = await GET(request("https://cdn.example.com/unbounded.png"));

        expect(response.status).toBe(413);
        // Reading should have stopped well short of the full 64MB the stream offered
        expect(emitted).toBeLessThan(16 * 1024 * 1024);
    });

    it("rejects a non-image content-type", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html></html>", {
            status: 200,
            headers: { "content-type": "text/html" },
        })));

        const response = await GET(request("https://cdn.example.com/a.html"));
        expect(response.status).toBe(415);
    });

    it("returns 502 when the upstream fetch throws", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

        const response = await GET(request("https://cdn.example.com/a.png"));
        expect(response.status).toBe(502);
    });
});
