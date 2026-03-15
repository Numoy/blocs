import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import {
    mapRawBlockAccountToBlockData,
    createDefaultBlockData,
    buildFullGrid,
    withTimeout,
} from '../helpers';
import { GRID_SIZE } from '@/utils/constants';
import type { BlockAccountEntry, RawBlockAccount } from '@/utils/programTypes';

// Minimal BN mock — only toNumber() is needed
const bn = (value: number) => ({ toNumber: () => value });

const OWNER = new PublicKey('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM');
const LAMPORTS_PER_SOL = 1_000_000_000;

const makeRaw = (overrides: Partial<RawBlockAccount> = {}): RawBlockAccount => ({
    id: 0,
    owner: OWNER,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    price: bn(0) as any,
    isForSale: false,
    text: [],
    imageUrl: [],
    url: [],
    ...overrides,
});

const toBytes = (str: string) => Array.from(new TextEncoder().encode(str));

const makeEntry = (raw: RawBlockAccount): BlockAccountEntry => ({ account: raw });

// ─── mapRawBlockAccountToBlockData ───────────────────────────────────────────

describe('mapRawBlockAccountToBlockData', () => {
    it('maps id and owner correctly', () => {
        const raw = makeRaw({ id: 42, owner: OWNER });
        const block = mapRawBlockAccountToBlockData(raw);
        expect(block.id).toBe(42);
        expect(block.owner).toBe(OWNER.toBase58());
    });

    it('converts price from lamports to SOL', () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw = makeRaw({ price: bn(LAMPORTS_PER_SOL) as any });
        const block = mapRawBlockAccountToBlockData(raw);
        expect(block.price).toBeCloseTo(1.0);
    });

    it('preserves isForSale flag', () => {
        const forSale = mapRawBlockAccountToBlockData(makeRaw({ isForSale: true }));
        const notForSale = mapRawBlockAccountToBlockData(makeRaw({ isForSale: false }));
        expect(forSale.isForSale).toBe(true);
        expect(notForSale.isForSale).toBe(false);
    });

    it('decodes text bytes to string and strips null bytes', () => {
        const raw = makeRaw({ text: [...toBytes('hello'), 0x00, 0x00] });
        const block = mapRawBlockAccountToBlockData(raw);
        expect(block.text).toBe('hello');
    });

    it('sets imageUrl to empty string when imageUrl bytes are empty', () => {
        const block = mapRawBlockAccountToBlockData(makeRaw({ imageUrl: [] }));
        expect(block.imageUrl).toBe('');
    });

    it('strips unsafe imageUrl (non-http/https)', () => {
        const raw = makeRaw({ imageUrl: toBytes('javascript:alert(1)') });
        const block = mapRawBlockAccountToBlockData(raw);
        expect(block.imageUrl).toBe('');
    });

    it('keeps valid https imageUrl', () => {
        const url = 'https://example.com/img.png';
        const raw = makeRaw({ imageUrl: toBytes(url) });
        const block = mapRawBlockAccountToBlockData(raw);
        expect(block.imageUrl).toBe(url);
    });

    it('decodes url field', () => {
        const raw = makeRaw({ url: toBytes('https://example.com') });
        const block = mapRawBlockAccountToBlockData(raw);
        expect(block.url).toBe('https://example.com');
    });

    it('sets image to null', () => {
        const block = mapRawBlockAccountToBlockData(makeRaw());
        expect(block.image).toBeNull();
    });
});

// ─── createDefaultBlockData ──────────────────────────────────────────────────

describe('createDefaultBlockData', () => {
    it('creates a block with the given id', () => {
        const block = createDefaultBlockData(7);
        expect(block.id).toBe(7);
    });

    it('has no owner', () => {
        expect(createDefaultBlockData(0).owner).toBeNull();
    });

    it('is for sale by default', () => {
        expect(createDefaultBlockData(0).isForSale).toBe(true);
    });

    it('has empty text, imageUrl, and url', () => {
        const block = createDefaultBlockData(0);
        expect(block.text).toBe('');
        expect(block.imageUrl).toBe('');
        expect(block.url).toBe('');
    });

    it('price increases with id (each block is unique)', () => {
        const price0 = createDefaultBlockData(0).price;
        const price1 = createDefaultBlockData(1).price;
        expect(price0).not.toBeNull();
        expect(price1).not.toBeNull();
        if (price0 === null || price1 === null) {
            throw new Error('default block prices should not be null');
        }
        expect(price1).toBeGreaterThan(price0);
    });
});

// ─── buildFullGrid ────────────────────────────────────────────────────────────

describe('buildFullGrid', () => {
    it('returns exactly GRID_SIZE blocks', () => {
        const grid = buildFullGrid([]);
        expect(grid).toHaveLength(GRID_SIZE);
    });

    it('fills missing slots with default blocks', () => {
        const grid = buildFullGrid([]);
        expect(grid[0].owner).toBeNull();
        expect(grid[99].id).toBe(99);
    });

    it('places known blocks at the correct index', () => {
        const raw = makeRaw({ id: 5, owner: OWNER, isForSale: true });
        const grid = buildFullGrid([makeEntry(raw)]);
        expect(grid[5].owner).toBe(OWNER.toBase58());
        expect(grid[5].id).toBe(5);
    });

    it('default-fills blocks not in the input', () => {
        const raw = makeRaw({ id: 5 });
        const grid = buildFullGrid([makeEntry(raw)]);
        // id 0 should be a default block
        expect(grid[0].owner).toBeNull();
    });

    it('handles multiple blocks correctly', () => {
        const entries = [
            makeEntry(makeRaw({ id: 0, isForSale: false })),
            makeEntry(makeRaw({ id: 9999, isForSale: false })),
        ];
        const grid = buildFullGrid(entries);
        expect(grid[0].isForSale).toBe(false);
        expect(grid[9999].isForSale).toBe(false);
        // Random middle block should be default
        expect(grid[500].owner).toBeNull();
    });
});

// ─── withTimeout ─────────────────────────────────────────────────────────────

describe('withTimeout', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    it('resolves with the promise value when it resolves before timeout', async () => {
        const promise = Promise.resolve(42);
        const result = await withTimeout(promise, 5000, 'test');
        expect(result).toBe(42);
    });

    it('rejects with a timeout error when the promise takes too long', async () => {
        const never = new Promise<never>(() => { /* never resolves */ });
        const racePromise = withTimeout(never, 1000, 'slow-op');
        vi.advanceTimersByTime(1001);
        await expect(racePromise).rejects.toThrow('slow-op timed out after 1000ms');
    });

    it('clears the timeout when the promise resolves', async () => {
        const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
        await withTimeout(Promise.resolve('done'), 5000, 'test');
        expect(clearTimeoutSpy).toHaveBeenCalled();
    });
});
