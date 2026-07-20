import { describe, expect, it } from 'vitest';
import { isSafeRemoteUrl } from '../imageProxySafety';

describe('isSafeRemoteUrl', () => {
    it('allows a plain https URL with a public-looking hostname', () => {
        const result = isSafeRemoteUrl('https://nbg1.your-objectstorage.com/10000-blocks/foo.webp');
        expect(result).not.toBeNull();
        expect(result?.hostname).toBe('nbg1.your-objectstorage.com');
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
        expect(isSafeRemoteUrl('https://user:pass@example.com/a.jpg')).toBeNull();
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

    it('rejects private/link-local IP ranges', () => {
        expect(isSafeRemoteUrl('https://10.0.0.5/a.jpg')).toBeNull();
        expect(isSafeRemoteUrl('https://192.168.1.1/a.jpg')).toBeNull();
        expect(isSafeRemoteUrl('https://172.16.0.1/a.jpg')).toBeNull();
        expect(isSafeRemoteUrl('https://172.31.255.255/a.jpg')).toBeNull();
        expect(isSafeRemoteUrl('https://169.254.169.254/latest/meta-data')).toBeNull();
    });

    it('does not reject public IP ranges that only resemble private ones', () => {
        // 172.32.x is outside the 172.16-31 private block
        expect(isSafeRemoteUrl('https://172.32.0.1/a.jpg')).not.toBeNull();
    });

    it('rejects .local mDNS hostnames', () => {
        expect(isSafeRemoteUrl('https://printer.local/a.jpg')).toBeNull();
    });

    it('preserves the path and query on an allowed URL', () => {
        const result = isSafeRemoteUrl('https://cdn.example.com/path/to/img.png?v=2');
        expect(result?.pathname).toBe('/path/to/img.png');
        expect(result?.search).toBe('?v=2');
    });
});
