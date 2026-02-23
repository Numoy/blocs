type PlausiblePrimitive = string | number | boolean;

export type AnalyticsProps = Record<string, PlausiblePrimitive | null | undefined>;

const MAX_PROP_STRING_LENGTH = 120;

declare global {
    interface Window {
        plausible?: (eventName: string, options?: { props?: Record<string, PlausiblePrimitive> }) => void;
    }
}

const normalizePropValue = (value: PlausiblePrimitive | null | undefined): PlausiblePrimitive | undefined => {
    if (value === null || value === undefined) {
        return undefined;
    }

    if (typeof value === "number") {
        return Number.isFinite(value) ? value : undefined;
    }

    if (typeof value === "string") {
        return value.slice(0, MAX_PROP_STRING_LENGTH);
    }

    return value;
};

const normalizeProps = (props: AnalyticsProps | undefined): Record<string, PlausiblePrimitive> | undefined => {
    if (!props) {
        return undefined;
    }

    const normalizedProps: Record<string, PlausiblePrimitive> = {};
    for (const [key, value] of Object.entries(props)) {
        const normalizedValue = normalizePropValue(value);
        if (normalizedValue !== undefined) {
            normalizedProps[key] = normalizedValue;
        }
    }

    if (Object.keys(normalizedProps).length === 0) {
        return undefined;
    }

    return normalizedProps;
};

export const trackPlausibleEvent = (eventName: string, props?: AnalyticsProps): void => {
    if (typeof window === "undefined" || typeof window.plausible !== "function") {
        return;
    }

    try {
        const normalizedProps = normalizeProps(props);
        window.plausible(eventName, normalizedProps ? { props: normalizedProps } : undefined);
    } catch {
        // Ignore analytics failures to avoid impacting core UX.
    }
};

export const toErrorCategory = (error: unknown): string => {
    const message = (error instanceof Error ? error.message : String(error || "")).toLowerCase();

    if (!message) return "unknown";
    if (message.includes("user rejected") || message.includes("rejected the request") || message.includes("cancelled")) {
        return "user_rejected";
    }
    if (message.includes("wallet not connected")) return "wallet_not_connected";
    if (message.includes("insufficient")) return "insufficient_funds";
    if (message.includes("blockhash")) return "blockhash_expired";
    if (message.includes("timeout") || message.includes("network") || message.includes("fetch")) {
        return "network_or_rpc";
    }

    return "other";
};
