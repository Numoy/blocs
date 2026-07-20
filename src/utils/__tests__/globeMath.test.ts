import { describe, expect, it } from 'vitest';
import { directionFromUV, blockDirection, groupBillboards, isBlockInGroup, billboardCardSize } from '../globeMath';
import { GRID_WIDTH } from '../constants';
import type { BlockData } from '@/types';

const magnitude = (v: { x: number; y: number; z: number }) => Math.hypot(v.x, v.y, v.z);

const makeBlock = (overrides: Partial<BlockData> & { id: number }): BlockData => ({
    owner: null,
    image: null,
    text: null,
    imageUrl: null,
    url: null,
    isForSale: false,
    price: null,
    ...overrides,
});

describe('directionFromUV', () => {
    it('returns a unit vector', () => {
        expect(magnitude(directionFromUV(0.3, 0.7))).toBeCloseTo(1, 6);
    });

    it('maps v=0 to the north pole (+y)', () => {
        const d = directionFromUV(0.5, 0);
        expect(d.y).toBeCloseTo(1, 6);
        expect(d.x).toBeCloseTo(0, 6);
        expect(d.z).toBeCloseTo(0, 6);
    });

    it('maps v=1 to the south pole (-y)', () => {
        expect(directionFromUV(0.5, 1).y).toBeCloseTo(-1, 6);
    });

    it('maps (0, 0.5) to -x on the equator', () => {
        const d = directionFromUV(0, 0.5);
        expect(d.x).toBeCloseTo(-1, 6);
        expect(d.y).toBeCloseTo(0, 6);
        expect(d.z).toBeCloseTo(0, 6);
    });

    it('maps (0.25, 0.5) to +z on the equator', () => {
        const d = directionFromUV(0.25, 0.5);
        expect(d.x).toBeCloseTo(0, 6);
        expect(d.z).toBeCloseTo(1, 6);
    });
});

describe('blockDirection', () => {
    it('returns a unit vector for any block id', () => {
        for (const id of [0, 1, 50, 4999, 5050, 9999]) {
            expect(magnitude(blockDirection(id))).toBeCloseTo(1, 6);
        }
    });

    it('places row 0 near the north pole and the last row near the south pole', () => {
        const top = blockDirection(0); // row 0, col 0
        const bottom = blockDirection((GRID_WIDTH - 1) * GRID_WIDTH); // last row, col 0
        expect(top.y).toBeGreaterThan(0.9);
        expect(bottom.y).toBeLessThan(-0.9);
    });

    it('matches directionFromUV evaluated at the block center', () => {
        const expected = directionFromUV(0.5 / GRID_WIDTH, 0.5 / GRID_WIDTH);
        const actual = blockDirection(0);
        expect(actual.x).toBeCloseTo(expected.x, 10);
        expect(actual.y).toBeCloseTo(expected.y, 10);
        expect(actual.z).toBeCloseTo(expected.z, 10);
    });
});

describe('groupBillboards', () => {
    it('ignores unowned or imageless blocks', () => {
        const blocks = [
            makeBlock({ id: 1, owner: null, imageUrl: 'https://cdn.example.com/a.webp' }),
            makeBlock({ id: 2, owner: 'wallet-1', imageUrl: null }),
        ];
        expect(groupBillboards(blocks, 60)).toEqual([]);
    });

    it('drops blocks whose imageUrl fails safe-URL validation', () => {
        const blocks = [makeBlock({ id: 1, owner: 'wallet-1', imageUrl: 'javascript:alert(1)' })];
        expect(groupBillboards(blocks, 60)).toEqual([]);
    });

    it('creates one group per single-image owned block', () => {
        const blocks = [
            makeBlock({ id: 250, owner: 'wallet-1', imageUrl: 'https://cdn.example.com/a.webp' }),
        ];
        const groups = groupBillboards(blocks, 60);
        expect(groups).toHaveLength(1);
        expect(groups[0]).toMatchObject({
            anchorId: 250,
            cols: 1,
            rows: 1,
            mosaic: null,
        });
        // block 250 = row 2, col 50
        expect(groups[0].centerU).toBeCloseTo((50 + 0.5) / GRID_WIDTH, 10);
        expect(groups[0].centerV).toBeCloseTo((2 + 0.5) / GRID_WIDTH, 10);
    });

    it('collapses a mosaic to a single group anchored at startId', () => {
        // mosaic_group-1_3x3_4_202.webp -> startId 101, width/height 3
        const blocks = [
            makeBlock({ id: 202, owner: 'wallet-1', imageUrl: 'https://cdn.example.com/mosaic_group-1_3x3_4_202.webp' }),
        ];
        const groups = groupBillboards(blocks, 60);
        expect(groups).toHaveLength(1);
        expect(groups[0]).toMatchObject({ anchorId: 101, cols: 3, rows: 3 });
        expect(groups[0].mosaic).not.toBeNull();
    });

    it('deduplicates multiple tiles from the same mosaic into one group', () => {
        const blocks = [
            makeBlock({ id: 101, owner: 'wallet-1', imageUrl: 'https://cdn.example.com/mosaic_group-1_3x3_0_101.webp' }),
            makeBlock({ id: 202, owner: 'wallet-1', imageUrl: 'https://cdn.example.com/mosaic_group-1_3x3_4_202.webp' }),
            makeBlock({ id: 303, owner: 'wallet-1', imageUrl: 'https://cdn.example.com/mosaic_group-1_3x3_8_303.webp' }),
        ];
        expect(groupBillboards(blocks, 60)).toHaveLength(1);
    });

    it('respects the max cap', () => {
        const blocks = Array.from({ length: 5 }, (_, i) =>
            makeBlock({ id: i, owner: 'wallet-1', imageUrl: `https://cdn.example.com/${i}.webp` }));
        expect(groupBillboards(blocks, 2)).toHaveLength(2);
    });
});

describe('isBlockInGroup', () => {
    const single = groupBillboards(
        [makeBlock({ id: 250, owner: 'w', imageUrl: 'https://cdn.example.com/a.webp' })],
        60
    )[0];
    const mosaic = groupBillboards(
        [makeBlock({ id: 202, owner: 'w', imageUrl: 'https://cdn.example.com/mosaic_group-1_3x3_4_202.webp' })],
        60
    )[0];

    it('matches a single-image group only on its own block', () => {
        expect(isBlockInGroup(single, 250)).toBe(true);
        expect(isBlockInGroup(single, 251)).toBe(false);
    });

    it('returns false for a null selection', () => {
        expect(isBlockInGroup(single, null)).toBe(false);
    });

    it('matches any tile within a mosaic footprint (rows 1-3, cols 1-3)', () => {
        expect(isBlockInGroup(mosaic, 101)).toBe(true); // top-left
        expect(isBlockInGroup(mosaic, 303)).toBe(true); // bottom-right
        expect(isBlockInGroup(mosaic, 202)).toBe(true); // center
        expect(isBlockInGroup(mosaic, 100)).toBe(false); // one col left of the block
        expect(isBlockInGroup(mosaic, 404)).toBe(false); // one row below
    });
});

describe('billboardCardSize', () => {
    it('caps a square group at the base size', () => {
        expect(billboardCardSize(1, 1, 256)).toEqual({ width: 256, height: 256 });
    });

    it('shrinks the height for a wide group', () => {
        expect(billboardCardSize(2, 1, 256)).toEqual({ width: 256, height: 128 });
    });

    it('shrinks the width for a tall group', () => {
        expect(billboardCardSize(1, 2, 256)).toEqual({ width: 128, height: 256 });
    });
});
