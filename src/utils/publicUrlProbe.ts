export type PublicUrlProbeMethod = "HEAD" | "GET";

export type PublicUrlProbeResult = {
    ok: boolean;
    status: number | null;
    method: PublicUrlProbeMethod;
};

type ProbePublicObjectUrlOptions = {
    timeoutMs?: number;
    attempts?: number;
    retryDelayMs?: number;
    fetchFn?: typeof fetch;
    sleepFn?: (ms: number) => Promise<void>;
};

const DEFAULT_TIMEOUT_MS = 4_000;
const DEFAULT_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 250;

const sleep = (ms: number): Promise<void> => {
    return new Promise((resolve) => setTimeout(resolve, ms));
};

const fetchWithTimeout = async (
    fetchFn: typeof fetch,
    input: string,
    init: RequestInit,
    timeoutMs: number
): Promise<Response> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetchFn(input, {
            ...init,
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timeout);
    }
};

const buildRequestInit = (method: PublicUrlProbeMethod): RequestInit => {
    return {
        method,
        cache: "no-store",
        redirect: "follow",
        headers: method === "GET" ? { Range: "bytes=0-0" } : undefined,
    };
};

export const probePublicObjectUrl = async (
    url: string,
    options: ProbePublicObjectUrlOptions = {}
): Promise<PublicUrlProbeResult> => {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const attempts = options.attempts ?? DEFAULT_ATTEMPTS;
    const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
    const fetchFn = options.fetchFn ?? fetch;
    const sleepFn = options.sleepFn ?? sleep;

    let lastResult: PublicUrlProbeResult = {
        ok: false,
        status: null,
        method: "HEAD",
    };

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        for (const method of ["HEAD", "GET"] as const) {
            try {
                const response = await fetchWithTimeout(fetchFn, url, buildRequestInit(method), timeoutMs);
                const result: PublicUrlProbeResult = {
                    ok: response.ok,
                    status: response.status,
                    method,
                };

                if (result.ok) {
                    return result;
                }

                lastResult = result;
            } catch {
                lastResult = {
                    ok: false,
                    status: null,
                    method,
                };
            }
        }

        if (attempt < attempts) {
            await sleepFn(retryDelayMs);
        }
    }

    return lastResult;
};
