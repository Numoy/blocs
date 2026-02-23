import { describe, expect, it } from "vitest";
import { toSafeExternalUrl } from "@/utils/url";

describe("toSafeExternalUrl", () => {
    it("allows http and https URLs", () => {
        expect(toSafeExternalUrl("https://example.com")).toBe("https://example.com/");
        expect(toSafeExternalUrl("http://example.com/path")).toBe("http://example.com/path");
    });

    it("normalizes scheme-less URLs to https", () => {
        expect(toSafeExternalUrl("example.com")).toBe("https://example.com/");
        expect(toSafeExternalUrl("example.com/path?a=1")).toBe("https://example.com/path?a=1");
    });

    it("rejects dangerous or invalid URLs", () => {
        expect(toSafeExternalUrl("javascript:alert(1)")).toBeNull();
        expect(toSafeExternalUrl("data:text/html;base64,PHNjcmlwdA==")).toBeNull();
        expect(toSafeExternalUrl("")).toBeNull();
        expect(toSafeExternalUrl("not a valid url")).toBeNull();
    });
});
