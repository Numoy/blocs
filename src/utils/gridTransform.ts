import { GRID_WIDTH, BLOCK_SIZE, CANVAS_MARGIN } from '@/utils/constants';

export interface GridTransform {
    scale: number;
    positionX: number;
    positionY: number;
}

// Transform that centers a block in the viewport at the given scale.
// Used for deep links and when leaving the globe toward a specific block,
// so the flat view mounts already focused instead of animating from center.
export const computeBlockTransform = (blockId: number, scale = 2.0): GridTransform => {
    const col = blockId % GRID_WIDTH;
    const row = Math.floor(blockId / GRID_WIDTH);

    const targetX = col * BLOCK_SIZE + BLOCK_SIZE / 2 + CANVAS_MARGIN;
    const targetY = row * BLOCK_SIZE + BLOCK_SIZE / 2 + CANVAS_MARGIN;

    const winW = typeof window !== 'undefined' ? window.innerWidth : 1000;
    const winH = typeof window !== 'undefined' ? window.innerHeight : 800;

    return {
        scale,
        positionX: -targetX * scale + winW / 2,
        positionY: -targetY * scale + winH / 2,
    };
};
