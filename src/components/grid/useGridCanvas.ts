import { useEffect, useRef } from 'react';
import { BlockData } from '@/types';
import { VisibleBounds } from './useGridVisibility';
import { GRID_WIDTH } from '@/utils/constants';

interface UseGridCanvasProps {
    canvasRef: React.RefObject<HTMLCanvasElement | null>;
    blocks: BlockData[];
    visibleBounds: VisibleBounds;
    CANVAS_RES: number;
}

export const useGridCanvas = ({ canvasRef, blocks, visibleBounds, CANVAS_RES }: UseGridCanvasProps) => {
    const imageCache = useRef<Map<string, HTMLImageElement>>(new Map());
    const animationFrameRef = useRef<number | null>(null);
    const MAX_IMAGE_CACHE_SIZE = 2000;

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        if (animationFrameRef.current !== null) {
            cancelAnimationFrame(animationFrameRef.current);
        }

        animationFrameRef.current = requestAnimationFrame(() => {
            const ctx = canvas.getContext('2d', { alpha: false });
            if (!ctx) return;

            ctx.fillStyle = '#1e1e1e';
            ctx.fillRect(0, 0, CANVAS_RES, CANVAS_RES);

            const BLOCK_SIZE = CANVAS_RES / GRID_WIDTH;

            // --- OPTIMIZATION: Render only visible area ---
            const startCol = Math.max(0, Math.floor(visibleBounds.minX / BLOCK_SIZE));
            const endCol = Math.min(GRID_WIDTH - 1, Math.ceil(visibleBounds.maxX / BLOCK_SIZE));
            const startRow = Math.max(0, Math.floor(visibleBounds.minY / BLOCK_SIZE));
            const endRow = Math.min(GRID_WIDTH - 1, Math.ceil(visibleBounds.maxY / BLOCK_SIZE));

            for (let row = startRow; row <= endRow; row++) {
                for (let col = startCol; col <= endCol; col++) {
                    const index = row * GRID_WIDTH + col;
                    const block = blocks[index];
                    if (!block) continue;

                    const x = col * BLOCK_SIZE;
                    const y = row * BLOCK_SIZE;

                    const displayColor = block.color === '#000000' ? '#2d2d2d' : (block.color || '#2d2d2d');
                    ctx.fillStyle = displayColor;

                    ctx.fillRect(x + 1, y + 1, BLOCK_SIZE - 2, BLOCK_SIZE - 2);

                    if (block.imageUrl) {
                        const cached = imageCache.current.get(block.imageUrl);
                        if (cached && cached.complete) {
                            if (cached.naturalWidth > 0) {
                                ctx.drawImage(cached, x, y, BLOCK_SIZE, BLOCK_SIZE);
                            }
                        } else if (!cached) {
                            const img = new Image();
                            img.onload = () => {
                                const liveCanvas = canvasRef.current;
                                const liveCtx = liveCanvas?.getContext('2d', { alpha: false });
                                if (!liveCtx || img.naturalWidth === 0) return;
                                requestAnimationFrame(() => {
                                    liveCtx.drawImage(img, x, y, BLOCK_SIZE, BLOCK_SIZE);
                                });
                            };
                            img.onerror = () => {
                                img.dataset.broken = "true";
                            };
                            if (imageCache.current.size >= MAX_IMAGE_CACHE_SIZE) {
                                const oldestKey = imageCache.current.keys().next().value;
                                if (oldestKey) imageCache.current.delete(oldestKey);
                            }
                            imageCache.current.set(block.imageUrl, img);
                            img.src = block.imageUrl;
                        }
                    }
                }
            }
        });

        return () => {
            if (animationFrameRef.current !== null) {
                cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
            }
        };
    }, [blocks, visibleBounds, CANVAS_RES, canvasRef]);

    useEffect(() => {
        const cache = imageCache.current;
        return () => {
            cache.clear();
        };
    }, []);
};
