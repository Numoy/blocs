// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

const importRoute = async () => {
    vi.resetModules();
    return import("@/app/api/upload/route");
};

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    process.env = { ...ORIGINAL_ENV };
});

describe("upload route guards", () => {
    it("rejects requests from unexpected origins", async () => {
        vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://app.example.com");
        vi.stubEnv("NEXT_PUBLIC_SOLANA_RPC_URL", "https://api.devnet.solana.com");

        const { POST } = await importRoute();
        const request = new Request("https://app.example.com/api/upload", {
            method: "POST",
            headers: {
                origin: "https://evil.example.com",
            },
        });

        const response = await POST(request);
        expect(response.status).toBe(403);
        await expect(response.json()).resolves.toEqual({
            error: "Invalid request origin.",
        });
    });

    it("fails closed in production when shared upload guards are unavailable", async () => {
        vi.stubEnv("NODE_ENV", "production");
        vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://app.example.com");
        vi.stubEnv("NEXT_PUBLIC_SOLANA_RPC_URL", "https://api.devnet.solana.com");
        vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example.com");
        vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-token");
        vi.stubEnv("ALLOW_IN_MEMORY_UPLOAD_GUARDS", "");

        vi.spyOn(console, "error").mockImplementation(() => undefined);
        const fetchMock = vi.fn().mockRejectedValue(new Error("upstash unavailable"));
        vi.stubGlobal("fetch", fetchMock);

        const { POST } = await importRoute();
        const request = new Request("https://app.example.com/api/upload", {
            method: "POST",
            headers: {
                origin: "https://app.example.com",
                "content-length": "0",
            },
            body: "",
        });

        const response = await POST(request);
        expect(response.status).toBe(503);
        const payload = await response.json();
        expect(payload.error).toBe("Upload guard service is temporarily unavailable. Please retry shortly.");
        expect(fetchMock).toHaveBeenCalled();
    });
});
