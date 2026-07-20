import { afterEach, describe, expect, it, vi } from 'vitest';
import { isSafeRemoteUrl } from '../imageProxySafety';

afterEach(() => {
    vi.unstubAllEnvs();
});

describe('isSafeRemoteUrl', () => {
    it('allows an https URL on the configured object storage host', () => {
        vi.stubEnv('HETZNER_ENDPOINT', 'https://nbg1.your-objectstorage.com');
        const result = isSafeRemoteUrl('https://nbg1.your-objectstorage.com/10000-blocks/foo.webp');
        expect(result).not.toBeNull();
        expect(result?.hostname).toBe('nbg1.your-objectstorage.com');
    });

    it('allows a subdomain of the configured public base URL host', () => {
        vi.stubEnv('HETZNER_PUBLIC_BASE_URL', 'https://cdn.blocs.app/blocs-storage');
        const result = isSafeRemoteUrl('https://assets.cdn.blocs.app/foo.webp');
        expect(result).not.toBeNull();
    });

    it('falls back to the default region host when no env vars are set', () => {
        const result = isSafeRemoteUrl('https://fsn1.your-objectstorage.com/a.jpg');
        expect(result).not.toBeNull();
    });

    it('rejects hosts outside the configured object storage host', () => {
        vi.stubEnv('HETZNER_ENDPOINT', 'https://nbg1.your-objectstorage.com');
        expect(isSafeRemoteUrl('https://cdn.example.com/a.jpg')).toBeNull();
        expect(isSafeRemoteUrl('https://images.example.com/a.jpg')).toBeNull();
        expect(isSafeRemoteUrl('https://evil.com/nbg1.your-objectstorage.com/a.jpg')).toBeNull();
    });

    it('rejects unparseable input', () => {
        expect(isSafeRemoteUrl('not a url')).toBeNull();
        expect(isSafeRemoteUrl('')).toBeNull();
    });

    it('rejects non-https protocols', () => {
        expect(isSafeRemoteUrl('http://example.com/a.jpg')).toBeNull();
        expect(isSafeRemoteUrl('ftp://example.com/a.jpg')).toBeNull();
        expect(isSafeRemoteUrl('file:///etc/passwd')).toBeNull();
        expect(isSafeRemoteUrl('javascript:alert(1)')).toBeNull();
    });

    it('rejects URLs with embedded credentials', () => {
        vi.stubEnv('HETZNER_ENDPOINT', 'https://nbg1.your-objectstorage.com');
        expect(isSafeRemoteUrl('https://user:pass@nbg1.your-objectstorage.com/a.jpg')).toBeNull();
    });

    it('rejects bare/internal-looking hostnames with no dot', () => {
        expect(isSafeRemoteUrl('https://internal-service/a.jpg')).toBeNull();
        expect(isSafeRemoteUrl('https://minio/a.jpg')).toBeNull();
    });

    it('rejects loopback and localhost', () => {
        expect(isSafeRemoteUrl('https://localhost/a.jpg')).toBeNull();
        expect(isSafeRemoteUrl('https://127.0.0.1/a.jpg')).toBeNull();
        expect(isSafeRemoteUrl('https://127.0.0.1:9000/a.jpg')).toBeNull();
        expect(isSafeRemoteUrl('https://[::1]/a.jpg')).toBeNull();
    });

    it('rejects private/link-local IP ranges even if somehow allow-listed', () => {
        expect(isSafeRemoteUrl('https://10.0.0.5/a.jpg')).toBeNull();
        expect(isSafeRemoteUrl('https://192.168.1.1/a.jpg')).toBeNull();
        expect(isSafeRemoteUrl('https://172.16.0.1/a.jpg')).toBeNull();
        expect(isSafeRemoteUrl('https://172.31.255.255/a.jpg')).toBeNull();
        expect(isSafeRemoteUrl('https://169.254.169.254/latest/meta-data')).toBeNull();
    });

    it('rejects .local mDNS hostnames', () => {
        expect(isSafeRemoteUrl('https://printer.local/a.jpg')).toBeNull();
    });

    it('preserves the path and query on an allowed URL', () => {
        vi.stubEnv('HETZNER_ENDPOINT', 'https://nbg1.your-objectstorage.com');
        const result = isSafeRemoteUrl('https://nbg1.your-objectstorage.com/path/to/img.png?v=2');
        expect(result?.pathname).toBe('/path/to/img.png');
        expect(result?.search).toBe('?v=2');
    });
});
