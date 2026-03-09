import { describe, it, expect } from 'vitest';
import { isContentAllowed, BLOCKED_WORDS, BLOCKED_DOMAINS } from '@/utils/moderation';

describe('isContentAllowed', () => {
    it('allows clean text and no image', () => {
        expect(isContentAllowed('Hello world', null)).toBe(true);
    });

    it('allows null text and null imageUrl', () => {
        expect(isContentAllowed(null, null)).toBe(true);
    });

    it('allows empty strings', () => {
        expect(isContentAllowed('', '')).toBe(true);
    });

    it('blocks text containing a blocked word', () => {
        const blocked = BLOCKED_WORDS[0];
        if (!blocked) return; // skip if list is empty
        expect(isContentAllowed(`check out this ${blocked} content`, null)).toBe(false);
    });

    it('is case-insensitive for blocked words', () => {
        const blocked = BLOCKED_WORDS[0];
        if (!blocked) return;
        expect(isContentAllowed(blocked.toUpperCase(), null)).toBe(false);
        expect(isContentAllowed(blocked.toLowerCase(), null)).toBe(false);
    });

    it('blocks imageUrl from a blocked domain', () => {
        const domain = BLOCKED_DOMAINS[0];
        if (!domain) return;
        expect(isContentAllowed(null, `https://${domain}/image.png`)).toBe(false);
    });

    it('allows imageUrl from a safe domain', () => {
        expect(isContentAllowed(null, 'https://safe-cdn.example.com/image.png')).toBe(true);
    });

    it('allows text that merely contains a blocked domain name as a word', () => {
        // Text filtering only checks BLOCKED_WORDS, not BLOCKED_DOMAINS
        const domain = BLOCKED_DOMAINS[0];
        if (!domain) return;
        expect(isContentAllowed(`visit ${domain}`, null)).toBe(true);
    });

    it('blocks when both text and imageUrl violate rules', () => {
        const word = BLOCKED_WORDS[0];
        const domain = BLOCKED_DOMAINS[0];
        if (!word || !domain) return;
        expect(isContentAllowed(word, `https://${domain}/img.png`)).toBe(false);
    });
});
