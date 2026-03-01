import { describe, expect, it, vi } from "vitest";
import { probePublicObjectUrl } from "@/utils/publicUrlProbe";

describe("probePublicObjectUrl", () => {
    it("returns immediately when HEAD succeeds", async () => {
        const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, { status: 200 }));

        const result = await probePublicObjectUrl("https://cdn.example.com/image.webp", {
            attempts: 1,
            retryDelayMs: 0,
            fetchFn: fetchMock as unknown as typeof fetch,
        });

        expect(result).toEqual({ ok: true, status: 200, method: "HEAD" });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(
            "https://cdn.example.com/image.webp",
            expect.objectContaining({ method: "HEAD" }),
        );
    });

    it("falls back to GET when HEAD is blocked", async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response(null, { status: 403 }))
            .mockResolvedValueOnce(new Response(null, { status: 206 }));

        const result = await probePublicObjectUrl("https://cdn.example.com/image.webp", {
            attempts: 1,
            retryDelayMs: 0,
            fetchFn: fetchMock as unknown as typeof fetch,
        });

        expect(result).toEqual({ ok: true, status: 206, method: "GET" });
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            "https://cdn.example.com/image.webp",
            expect.objectContaining({
                method: "GET",
                headers: { Range: "bytes=0-0" },
            }),
        );
    });

    it("retries failed probes and can recover on a later attempt", async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response(null, { status: 404 }))
            .mockResolvedValueOnce(new Response(null, { status: 404 }))
            .mockResolvedValueOnce(new Response(null, { status: 200 }));
        const sleepMock = vi.fn().mockResolvedValue(undefined);

        const result = await probePublicObjectUrl("https://cdn.example.com/image.webp", {
            attempts: 2,
            retryDelayMs: 0,
            fetchFn: fetchMock as unknown as typeof fetch,
            sleepFn: sleepMock,
        });

        expect(result).toEqual({ ok: true, status: 200, method: "HEAD" });
        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(sleepMock).toHaveBeenCalledTimes(1);
        expect(sleepMock).toHaveBeenCalledWith(0);
    });

    it("returns the last probe result when all attempts fail", async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response(null, { status: 404 }))
            .mockResolvedValueOnce(new Response(null, { status: 404 }))
            .mockResolvedValueOnce(new Response(null, { status: 500 }))
            .mockResolvedValueOnce(new Response(null, { status: 500 }));

        const result = await probePublicObjectUrl("https://cdn.example.com/image.webp", {
            attempts: 2,
            retryDelayMs: 0,
            fetchFn: fetchMock as unknown as typeof fetch,
        });

        expect(result).toEqual({ ok: false, status: 500, method: "GET" });
    });
});
