export const consumeReplayTokenFromStore = (
    store: Map<string, number>,
    token: string,
    ttlMs: number,
    now = Date.now(),
    maxEntries = 10_000,
): boolean => {
    if (store.size > maxEntries) {
        for (const [entryKey, expiresAt] of store.entries()) {
            if (expiresAt <= now) {
                store.delete(entryKey);
            }
        }
    }

    const existing = store.get(token);
    if (existing && existing > now) {
        return false;
    }

    store.set(token, now + ttlMs);
    return true;
};
