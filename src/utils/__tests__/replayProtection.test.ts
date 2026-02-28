import { describe, expect, it } from "vitest";
import { consumeReplayTokenFromStore } from "@/utils/replayProtection";

describe("consumeReplayTokenFromStore", () => {
    it("rejects replay attempts within TTL and accepts after expiration", () => {
        const store = new Map<string, number>();
        const now = 1_700_000_000_000;

        expect(consumeReplayTokenFromStore(store, "token-1", 10_000, now)).toBe(true);
        expect(consumeReplayTokenFromStore(store, "token-1", 10_000, now + 1_000)).toBe(false);
        expect(consumeReplayTokenFromStore(store, "token-1", 10_000, now + 10_001)).toBe(true);
    });

    it("cleans expired entries when the store grows", () => {
        const store = new Map<string, number>([
            ["expired", 50],
            ["active", 1_000],
        ]);

        expect(consumeReplayTokenFromStore(store, "new", 100, 200, 1)).toBe(true);
        expect(store.has("expired")).toBe(false);
        expect(store.has("active")).toBe(true);
    });
});
