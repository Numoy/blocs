import { describe, expect, it } from "vitest";
import {
    getFallbackRpcEndpoints,
    inferRpcCluster,
    normalizeRpcEndpoint,
    resolveSolanaRpcEndpoint,
} from "@/utils/rpc";

describe("normalizeRpcEndpoint", () => {
    it("normalizes scheme-less and quoted endpoints", () => {
        expect(normalizeRpcEndpoint("api.devnet.solana.com")).toBe("https://api.devnet.solana.com/");
        expect(normalizeRpcEndpoint("'https://api.devnet.solana.com'")).toBe("https://api.devnet.solana.com/");
    });

    it("rejects placeholders and non-http protocols", () => {
        expect(normalizeRpcEndpoint("${{ vars.NEXT_PUBLIC_SOLANA_RPC_URL }}")).toBeNull();
        expect(normalizeRpcEndpoint("ws://api.devnet.solana.com")).toBeNull();
        expect(normalizeRpcEndpoint("javascript:alert(1)")).toBeNull();
    });
});

describe("resolveSolanaRpcEndpoint", () => {
    it("uses the first valid candidate", () => {
        expect(resolveSolanaRpcEndpoint("not a valid url", "api.mainnet-beta.solana.com")).toBe(
            "https://api.mainnet-beta.solana.com/",
        );
    });

    it("falls back to devnet when none are valid", () => {
        expect(resolveSolanaRpcEndpoint("", "undefined", undefined)).toBe("https://api.devnet.solana.com");
    });
});

describe("inferRpcCluster", () => {
    it("infers common clusters", () => {
        expect(inferRpcCluster("https://api.devnet.solana.com")).toBe("devnet");
        expect(inferRpcCluster("https://api.mainnet-beta.solana.com")).toBe("mainnet");
        expect(inferRpcCluster("https://rpc.example.com")).toBe("unknown");
    });
});

describe("getFallbackRpcEndpoints", () => {
    it("does not auto-fallback across clusters for unknown/custom primary endpoints", () => {
        expect(getFallbackRpcEndpoints("https://rpc.example.com")).toEqual([]);
    });

    it("uses explicitly configured fallbacks for custom endpoints", () => {
        expect(getFallbackRpcEndpoints("https://rpc.example.com", ["https://backup.example.com"])).toEqual([
            "https://backup.example.com/",
        ]);
    });

    it("allows explicitly configured cross-cluster fallback", () => {
        expect(getFallbackRpcEndpoints("https://api.devnet.solana.com", ["https://api.mainnet-beta.solana.com"])).toEqual([
            "https://api.mainnet-beta.solana.com/",
            "https://api.devnet.solana.com",
        ]);
    });
});
