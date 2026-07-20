// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { computeBlockTransform } from '../gridTransform';
import { GRID_WIDTH, BLOCK_SIZE, CANVAS_MARGIN } from '../constants';

describe('computeBlockTransform', () => {
    it('centers the block in the viewport at the default scale', () => {
        const blockId = 0;
        const { scale, positionX, positionY } = computeBlockTransform(blockId);

        expect(scale).toBe(2.0);

        const targetX = BLOCK_SIZE / 2 + CANVAS_MARGIN;
        const targetY = BLOCK_SIZE / 2 + CANVAS_MARGIN;
        expect(positionX).toBe(-targetX * scale + window.innerWidth / 2);
        expect(positionY).toBe(-targetY * scale + window.innerHeight / 2);
    });

    it('maps block id to its row and column', () => {
        const blockId = 3 * GRID_WIDTH + 7; // row 3, col 7
        const { positionX, positionY, scale } = computeBlockTransform(blockId);

        const targetX = 7 * BLOCK_SIZE + BLOCK_SIZE / 2 + CANVAS_MARGIN;
        const targetY = 3 * BLOCK_SIZE + BLOCK_SIZE / 2 + CANVAS_MARGIN;
        expect(positionX).toBe(-targetX * scale + window.innerWidth / 2);
        expect(positionY).toBe(-targetY * scale + window.innerHeight / 2);
    });

    it('respects a custom scale', () => {
        const { scale } = computeBlockTransform(0, 3.5);
        expect(scale).toBe(3.5);
    });
});
