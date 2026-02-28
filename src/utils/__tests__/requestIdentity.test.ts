import { describe, expect, it } from "vitest";
import {
    buildAnonymousRequestKey,
    buildClientRateLimitKey,
    getFirstForwardedForIp,
    normalizeIpCandidate,
} from "@/utils/requestIdentity";

const createRequest = (headers: Record<string, string>): Request => {
    return new Request("https://example.com/api", { headers });
};

describe("normalizeIpCandidate", () => {
    it("normalizes IPv4/IPv6 and strips wrappers", () => {
        expect(normalizeIpCandidate("203.0.113.7")).toBe("203.0.113.7");
        expect(normalizeIpCandidate("::ffff:203.0.113.7")).toBe("203.0.113.7");
        expect(normalizeIpCandidate("[2001:db8::1]")).toBe("2001:db8::1");
        expect(normalizeIpCandidate("203.0.113.7:443")).toBe("203.0.113.7");
    });

    it("rejects invalid candidates", () => {
        expect(normalizeIpCandidate("not-an-ip")).toBeNull();
        expect(normalizeIpCandidate("")).toBeNull();
        expect(normalizeIpCandidate(null)).toBeNull();
    });
});

describe("getFirstForwardedForIp", () => {
    it("reads the first forwarded-for entry", () => {
        expect(getFirstForwardedForIp("198.51.100.9, 203.0.113.10")).toBe("198.51.100.9");
    });
});

describe("buildClientRateLimitKey", () => {
    it("uses trusted Cloudflare header combinations", () => {
        const request = createRequest({
            "cf-ray": "1234",
            "cf-connecting-ip": "203.0.113.9",
            "x-forwarded-for": "198.51.100.3",
        });

        expect(buildClientRateLimitKey(request)).toBe("ip:203.0.113.9");
    });

    it("uses trusted Vercel header combinations", () => {
        const request = createRequest({
            "x-vercel-id": "fra1::abc",
            "x-forwarded-for": "198.51.100.2, 198.51.100.3",
        });

        expect(buildClientRateLimitKey(request)).toBe("ip:198.51.100.2");
    });

    it("falls back to anonymous fingerprint when trusted proxy signals are absent", () => {
        const request = createRequest({
            "x-forwarded-for": "198.51.100.2",
            "x-real-ip": "198.51.100.9",
            "user-agent": "Mozilla/5.0",
            "accept-language": "en-US",
            "sec-ch-ua": "\"Chromium\";v=\"124\"",
        });

        const key = buildClientRateLimitKey(request);
        expect(key.startsWith("anon:")).toBe(true);
        expect(key).toBe(buildAnonymousRequestKey(request));
    });
});
