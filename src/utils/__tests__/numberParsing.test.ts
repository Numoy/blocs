import { describe, expect, it } from "vitest";
import { GRID_SIZE } from "@/utils/constants";
import { parseGridBlockId, parseNonNegativeIntegerString } from "@/utils/numberParsing";

describe("parseNonNegativeIntegerString", () => {
    it("parses non-negative integer strings", () => {
        expect(parseNonNegativeIntegerString("0")).toBe(0);
        expect(parseNonNegativeIntegerString("42")).toBe(42);
        expect(parseNonNegativeIntegerString("0007")).toBe(7);
    });

    it("rejects malformed or unsafe integer strings", () => {
        expect(parseNonNegativeIntegerString("")).toBeNull();
        expect(parseNonNegativeIntegerString("-1")).toBeNull();
        expect(parseNonNegativeIntegerString("12abc")).toBeNull();
        expect(parseNonNegativeIntegerString("1.5")).toBeNull();
        expect(parseNonNegativeIntegerString(" 12 ")).toBeNull();
        expect(parseNonNegativeIntegerString("9007199254740992")).toBeNull();
    });
});

describe("parseGridBlockId", () => {
    it("accepts valid grid block IDs", () => {
        expect(parseGridBlockId("0")).toBe(0);
        expect(parseGridBlockId(String(GRID_SIZE - 1))).toBe(GRID_SIZE - 1);
    });

    it("rejects invalid or out-of-range grid block IDs", () => {
        expect(parseGridBlockId(String(GRID_SIZE))).toBeNull();
        expect(parseGridBlockId("12abc")).toBeNull();
        expect(parseGridBlockId("-5")).toBeNull();
    });
});
