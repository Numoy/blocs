import { useEffect, useRef } from 'react';
import { BlockData } from '@/types';
import { VisibleBounds } from './useGridVisibility';

interface UseGridCanvasProps {
    canvasRef: React.RefObject<HTMLCanvasElement | null>;
    blocks: BlockData[];
    visibleBounds: VisibleBounds;
    CANVAS_RES: number;
}

export const useGridCanvas = ({ canvasRef, blocks, visibleBounds, CANVAS_RES }: UseGridCanvasProps) => {
    const imageCache = useRef<Map<string, HTMLImageElement>>(new Map());

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) return;

        ctx.fillStyle = '#1e1e1e';
        ctx.fillRect(0, 0, CANVAS_RES, CANVAS_RES);

        const GRID_WIDTH = blocks.length <= 100 ? 5 : 100;
        const BLOCK_SIZE = CANVAS_RES / GRID_WIDTH;

        blocks.forEach(block => {
            const col = block.id % GRID_WIDTH;
            const row = Math.floor(block.id / GRID_WIDTH);
            const x = col * BLOCK_SIZE;
            const y = row * BLOCK_SIZE;

            // Visibility Check
            const isVisible = (
                x + BLOCK_SIZE >= visibleBounds.minX &&
                x <= visibleBounds.maxX &&
                y + BLOCK_SIZE >= visibleBounds.minY &&
                y <= visibleBounds.maxY
            );

            const displayColor = block.color === '#000000' ? '#2d2d2d' : (block.color || '#2d2d2d');
            ctx.fillStyle = displayColor;

            ctx.fillRect(x + 1, y + 1, BLOCK_SIZE - 2, BLOCK_SIZE - 2);

            if (block.imageUrl && isVisible) {
                const cached = imageCache.current.get(block.imageUrl);
                if (cached && cached.complete) {
                    if (cached.naturalWidth > 0) {
                        ctx.drawImage(cached, x, y, BLOCK_SIZE, BLOCK_SIZE);
                    }
                } else if (!cached && !imageCache.current.has(block.imageUrl)) { // Prevent duplicate loading attempts
                    const img = new Image();
                    img.src = block.imageUrl;
                    img.onload = () => {
                        ctx.drawImage(img, x, y, BLOCK_SIZE, BLOCK_SIZE);
                    };
                    img.onerror = () => {
                        img.dataset.broken = "true";
                        ctx.fillStyle = "#ff0000";
                        ctx.fillRect(x, y, BLOCK_SIZE, BLOCK_SIZE);
                    };
                    imageCache.current.set(block.imageUrl, img);
                } else if (cached && !cached.complete) {
                    // Loading in progress, do nothing
                }
            } else if (block.imageUrl && !isVisible) {
                // If not visible, we can draw the cached image if we have it!
                const cached = imageCache.current.get(block.imageUrl);
                if (cached && cached.complete && cached.naturalWidth > 0) {
                    ctx.drawImage(cached, x, y, BLOCK_SIZE, BLOCK_SIZE);
                }
            }
        });

    }, [blocks, visibleBounds, CANVAS_RES, canvasRef]);
};
