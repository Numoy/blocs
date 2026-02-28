/**
 * Centralized error reporting utility.
 * Reports to console locally and sends production client crashes to /api/client-errors.
 */
const REMOTE_REPORT_PATH = "/api/client-errors";
const REMOTE_REPORT_DEDUP_WINDOW_MS = 10_000;
const recentClientReports = new Map<string, number>();

type ErrorReportPayload = {
    name: string;
    message: string;
    stack?: string;
    componentStack?: string;
    href?: string;
    userAgent?: string;
    timestamp: string;
};

const toErrorInstance = (error: unknown): Error => {
    if (error instanceof Error) {
        return error;
    }
    return new Error(typeof error === "string" ? error : JSON.stringify(error));
};

const trimTo = (value: string | undefined, maxLength: number): string | undefined => {
    if (!value) return undefined;
    return value.length <= maxLength ? value : value.slice(0, maxLength);
};

const buildPayload = (error: Error, info?: { componentStack: string }): ErrorReportPayload => {
    return {
        name: trimTo(error.name || "Error", 200) || "Error",
        message: trimTo(error.message || "Unknown error", 2000) || "Unknown error",
        stack: trimTo(error.stack, 16_000),
        componentStack: trimTo(info?.componentStack, 16_000),
        href: typeof window !== "undefined" ? window.location.href : undefined,
        userAgent: typeof window !== "undefined" ? window.navigator.userAgent : undefined,
        timestamp: new Date().toISOString(),
    };
};

const shouldSkipDuplicateClientReport = (payload: ErrorReportPayload): boolean => {
    const key = `${payload.name}|${payload.message}|${payload.componentStack || ""}`;
    const now = Date.now();
    const lastSentAt = recentClientReports.get(key);
    if (lastSentAt && now - lastSentAt < REMOTE_REPORT_DEDUP_WINDOW_MS) {
        return true;
    }

    recentClientReports.set(key, now);
    if (recentClientReports.size > 100) {
        for (const [entryKey, sentAt] of recentClientReports.entries()) {
            if (now - sentAt > REMOTE_REPORT_DEDUP_WINDOW_MS) {
                recentClientReports.delete(entryKey);
            }
        }
    }
    return false;
};

const sendToErrorIngest = (payload: ErrorReportPayload): void => {
    if (typeof window === "undefined" || process.env.NODE_ENV !== "production") {
        return;
    }

    if (shouldSkipDuplicateClientReport(payload)) {
        return;
    }

    try {
        const body = JSON.stringify(payload);
        if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
            const blob = new Blob([body], { type: "application/json" });
            navigator.sendBeacon(REMOTE_REPORT_PATH, blob);
            return;
        }

        void fetch(REMOTE_REPORT_PATH, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
            keepalive: true,
        });
    } catch {
        // Ignore remote-reporting failures to avoid cascading errors.
    }
};

export const reportError = (error: unknown, info?: { componentStack: string }) => {
    const normalizedError = toErrorInstance(error);

    // Log to console in development (and production for now)
    console.error("[Error Reported]:", normalizedError);

    if (info) {
        console.error("[Error Info]:", info);
    }

    sendToErrorIngest(buildPayload(normalizedError, info));
};
