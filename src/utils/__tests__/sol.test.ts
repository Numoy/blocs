import { describe, expect, it } from "vitest";
import { parseSolToLamports } from "@/utils/sol";

describe("parseSolToLamports", () => {
    it("parses empty input as zero", () => {
        expect(parseSolToLamports("")).toBe(BigInt(0));
        expect(parseSolToLamports("   ")).toBe(BigInt(0));
    });

    it("parses integer SOL values", () => {
        expect(parseSolToLamports("1")).toBe(BigInt("1000000000"));
        expect(parseSolToLamports("42")).toBe(BigInt("42000000000"));
    });

    it("parses fractional SOL values exactly up to 9 decimals", () => {
        expect(parseSolToLamports("0.000000001")).toBe(BigInt(1));
        expect(parseSolToLamports("0.1")).toBe(BigInt("100000000"));
        expect(parseSolToLamports("1.234567891")).toBe(BigInt("1234567891"));
        expect(parseSolToLamports("2.")).toBe(BigInt("2000000000"));
    });

    it("rejects invalid values", () => {
        expect(() => parseSolToLamports("-1")).toThrow();
        expect(() => parseSolToLamports("abc")).toThrow();
        expect(() => parseSolToLamports("1.2345678912")).toThrow();
    });
});
