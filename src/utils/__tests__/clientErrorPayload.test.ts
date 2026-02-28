import { describe, expect, it } from "vitest";
import { parseClientErrorPayload } from "@/utils/clientErrorPayload";

const validPayload = {
    name: "TypeError",
    message: "Cannot read properties of undefined",
    stack: "TypeError: ...",
    href: "https://example.com/block/12",
    userAgent: "Mozilla/5.0",
    timestamp: "2026-02-28T12:00:00.000Z",
};

describe("parseClientErrorPayload", () => {
    it("accepts valid payloads", () => {
        const parsed = parseClientErrorPayload(validPayload);
        expect(parsed.success).toBe(true);
    });

    it("rejects invalid payloads", () => {
        const parsed = parseClientErrorPayload({
            ...validPayload,
            href: "javascript:alert(1)",
        });
        expect(parsed.success).toBe(false);
    });

    it("rejects missing required fields", () => {
        const parsed = parseClientErrorPayload({
            name: "Error",
            timestamp: "2026-02-28T12:00:00.000Z",
        });
        expect(parsed.success).toBe(false);
    });
});
