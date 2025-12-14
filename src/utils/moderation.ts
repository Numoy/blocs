export const BLOCKED_IDS: number[] = [
    // Add Block IDs here to hide their content
    // e.g. 42, 69
];

export const BLOCKED_WORDS: string[] = [
    "nsfw",
    // Add bad words here
];

export const BLOCKED_DOMAINS: string[] = [
    "malware.site",
    // Add bad image domains here
];

export const isContentAllowed = (text: string | null, imageUrl: string | null): boolean => {
    if (text) {
        const lowerText = text.toLowerCase();
        if (BLOCKED_WORDS.some(word => lowerText.includes(word))) return false;
    }
    if (imageUrl) {
        if (BLOCKED_DOMAINS.some(domain => imageUrl.includes(domain))) return false;
    }
    return true;
};
