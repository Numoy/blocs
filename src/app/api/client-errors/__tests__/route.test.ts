// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

const importRoute = async () => {
    vi.resetModules();
    return import("@/app/api/client-errors/route");
};

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    process.env = { ...ORIGINAL_ENV };
});

describe("client-errors route", () => {
    it("rejects requests from unexpected origins", async () => {
        vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://app.example.com");

        const { POST } = await importRoute();
        const request = new Request("https://app.example.com/api/client-errors", {
            method: "POST",
            headers: {
                origin: "https://evil.example.com",
                "content-type": "application/json",
            },
            body: JSON.stringify({
                name: "Error",
                message: "boom",
                timestamp: new Date().toISOString(),
            }),
        });

        const response = await POST(request);
        expect(response.status).toBe(403);
        await expect(response.json()).resolves.toEqual({
            ok: false,
            error: "Invalid request origin.",
        });
    });

    it("logs a redacted server payload for accepted reports", async () => {
        vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://app.example.com");

        const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
        const { POST } = await importRoute();
        const request = new Request("https://app.example.com/api/client-errors", {
            method: "POST",
            headers: {
                origin: "https://app.example.com",
                "content-type": "application/json",
            },
            body: JSON.stringify({
                name: "TypeError",
                message: "Cannot read properties of undefined",
                stack: "stack trace content",
                componentStack: "component stack content",
                href: "https://app.example.com/block/1",
                userAgent: "test-agent",
                timestamp: new Date().toISOString(),
            }),
        });

        const response = await POST(request);
        expect(response.status).toBe(202);

        const reportLogCall = consoleSpy.mock.calls.find((call) => call[0] === "[Client Error Report]");
        expect(reportLogCall).toBeDefined();
        const loggedPayload = reportLogCall?.[1] as Record<string, unknown>;
        expect(loggedPayload).toBeTruthy();
        expect(loggedPayload.stack).toBeUndefined();
        expect(loggedPayload.componentStack).toBeUndefined();
        expect(loggedPayload.href).toBeUndefined();
        expect(loggedPayload.userAgent).toBeUndefined();
        expect(loggedPayload.name).toBe("TypeError");
    });
});
