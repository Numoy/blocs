import { createHash } from "crypto";
import { isIP } from "net";

type RequestLike = {
    headers: Headers;
};

type ProxySource = {
    signalHeader: string;
    ipHeaders: readonly string[];
};

const TRUSTED_PROXY_SOURCES: readonly ProxySource[] = [
    { signalHeader: "cf-ray", ipHeaders: ["cf-connecting-ip"] },
    { signalHeader: "x-vercel-id", ipHeaders: ["x-forwarded-for", "x-real-ip"] },
    { signalHeader: "fly-request-id", ipHeaders: ["fly-client-ip"] },
];

const stripQuotes = (value: string): string => {
    return value.replace(/^["']+|["']+$/g, "");
};

export const normalizeIpCandidate = (value: string | null): string | null => {
    if (!value) return null;

    let candidate = stripQuotes(value.trim());
    if (!candidate) return null;

    if (candidate.toLowerCase().startsWith("for=")) {
        candidate = stripQuotes(candidate.slice(4).trim());
    }

    if (candidate.startsWith("[") && candidate.includes("]")) {
        candidate = candidate.slice(1, candidate.indexOf("]"));
    }

    if (candidate.startsWith("::ffff:")) {
        candidate = candidate.slice("::ffff:".length);
    }

    if (isIP(candidate)) {
        return candidate;
    }

    const ipv4WithPort = candidate.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
    if (ipv4WithPort?.[1] && isIP(ipv4WithPort[1])) {
        return ipv4WithPort[1];
    }

    return null;
};

export const getFirstForwardedForIp = (value: string | null): string | null => {
    if (!value) return null;
    const [first] = value.split(",");
    return normalizeIpCandidate(first ?? null);
};

const getIpFromHeader = (headers: Headers, header: string): string | null => {
    if (header === "x-forwarded-for") {
        return getFirstForwardedForIp(headers.get(header));
    }
    return normalizeIpCandidate(headers.get(header));
};

export const getTrustedClientIp = (request: RequestLike): string | null => {
    for (const source of TRUSTED_PROXY_SOURCES) {
        if (!request.headers.get(source.signalHeader)) {
            continue;
        }

        for (const header of source.ipHeaders) {
            const ip = getIpFromHeader(request.headers, header);
            if (ip) {
                return ip;
            }
        }
    }

    return null;
};

export const buildAnonymousRequestKey = (request: RequestLike): string => {
    const userAgent = request.headers.get("user-agent") || "unknown";
    const acceptLanguage = request.headers.get("accept-language") || "unknown";
    const secChUa = request.headers.get("sec-ch-ua") || "unknown";
    const fingerprint = createHash("sha256")
        .update(`${userAgent}|${acceptLanguage}|${secChUa}`)
        .digest("hex")
        .slice(0, 24);
    return `anon:${fingerprint}`;
};

export const buildClientRateLimitKey = (request: RequestLike): string => {
    const trustedIp = getTrustedClientIp(request);
    if (trustedIp) {
        return `ip:${trustedIp}`;
    }
    return buildAnonymousRequestKey(request);
};
