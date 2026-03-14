import { describe, it, expect, afterEach } from 'vitest';
import { isMobile, isWalletBrowser } from '@/utils/mobile';

const setUserAgent = (ua: string) => {
    Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
};

const setWindowProp = (prop: string, value: unknown) => {
    Object.defineProperty(window, prop, { value, configurable: true, writable: true });
};

const deleteWindowProp = (prop: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any)[prop];
};

afterEach(() => {
    setUserAgent('');
    ['solana', 'phantom', 'backpack', 'ethereum'].forEach(deleteWindowProp);
});

describe('isMobile', () => {
    it('returns false for desktop user agents', () => {
        setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0');
        expect(isMobile()).toBe(false);
    });

    it('returns true for iPhone user agent', () => {
        setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15');
        expect(isMobile()).toBe(true);
    });

    it('returns true for Android user agent', () => {
        setUserAgent('Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile');
        expect(isMobile()).toBe(true);
    });

    it('returns true for iPad user agent', () => {
        setUserAgent('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15');
        expect(isMobile()).toBe(true);
    });

    it('returns true for Opera Mini', () => {
        setUserAgent('Opera/9.80 (J2ME/MIDP; Opera Mini/9.80; U; en)');
        expect(isMobile()).toBe(true);
    });

    it('returns false for empty user agent', () => {
        setUserAgent('');
        expect(isMobile()).toBe(false);
    });
});

describe('isWalletBrowser', () => {
    it('returns false when no wallet is injected', () => {
        expect(isWalletBrowser()).toBe(false);
    });

    it('returns true when window.phantom is present', () => {
        setWindowProp('phantom', { solana: {} });
        expect(isWalletBrowser()).toBe(true);
    });

    it('returns true when window.solana is present', () => {
        setWindowProp('solana', { isPhantom: true });
        expect(isWalletBrowser()).toBe(true);
    });

    it('returns true when window.backpack is present', () => {
        setWindowProp('backpack', {});
        expect(isWalletBrowser()).toBe(true);
    });

    it('returns true when window.ethereum is present', () => {
        setWindowProp('ethereum', {});
        expect(isWalletBrowser()).toBe(true);
    });

    it('returns false when wallet props are undefined', () => {
        setWindowProp('solana', undefined);
        setWindowProp('phantom', undefined);
        expect(isWalletBrowser()).toBe(false);
    });
});
