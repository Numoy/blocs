import { describe, expect, it } from "vitest";
import { fitsUtf8Bytes, utf8ByteLength } from "@/utils/text";

describe("text utils", () => {
    it("computes utf8 byte lengths", () => {
        expect(utf8ByteLength("hello")).toBe(5);
        expect(utf8ByteLength("é")).toBe(2);
        expect(utf8ByteLength("🚀")).toBe(4);
    });

    it("validates byte budget correctly", () => {
        expect(fitsUtf8Bytes("hello", 5)).toBe(true);
        expect(fitsUtf8Bytes("hello", 4)).toBe(false);
        expect(fitsUtf8Bytes("🚀", 4)).toBe(true);
        expect(fitsUtf8Bytes("🚀", 3)).toBe(false);
    });
});
