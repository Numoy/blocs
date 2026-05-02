import { useEffect, useRef } from 'react';
import { BlockData } from '@/types';
import { VisibleBounds } from './useGridVisibility';
import { GRID_WIDTH, CANVAS_RES, BLOCK_SIZE, BLOCK_EMPTY_COLOR } from '@/utils/constants';
import { toSafeExternalUrl } from '@/utils/url';
import { parseMosaicImageUrl } from '@/utils/mosaicImage';


interface UseGridCanvasProps {
    canvasRef: React.RefObject<HTMLCanvasElement | null>;
    blocks: BlockData[];
    visibleBounds: VisibleBounds;
    hoveredBlockId: number | null;
    mosaicBlockIds?: number[];
    selectedBlockId: number | null;
}

export const useGridCanvas = ({
    canvasRef,
    blocks,
    visibleBounds,
    hoveredBlockId,
    mosaicBlockIds = [],
    selectedBlockId,
}: UseGridCanvasProps) => {
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

            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.fillStyle = '#1e1e1e';
            ctx.fillRect(0, 0, CANVAS_RES, CANVAS_RES);

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

                    ctx.fillStyle = BLOCK_EMPTY_COLOR;

                    ctx.fillRect(x + 1, y + 1, BLOCK_SIZE - 2, BLOCK_SIZE - 2);

                    if (block.imageUrl) {
                        const safeImageUrl = toSafeExternalUrl(block.imageUrl);
                        if (safeImageUrl) {
                            const cached = imageCache.current.get(safeImageUrl);
                            if (cached && cached.complete) {
                                if (cached.naturalWidth > 0) {
                                    if (parseMosaicImageUrl(safeImageUrl)) {
                                        // Mosaic tile: stretch to fill block for seamless tiling
                                        ctx.drawImage(cached, x, y, BLOCK_SIZE, BLOCK_SIZE);
                                    } else {
                                        // Single image: contain (full image visible, centred)
                                        const scale = Math.min(BLOCK_SIZE / cached.naturalWidth, BLOCK_SIZE / cached.naturalHeight);
                                        const dw = cached.naturalWidth * scale;
                                        const dh = cached.naturalHeight * scale;
                                        ctx.drawImage(cached, x + (BLOCK_SIZE - dw) / 2, y + (BLOCK_SIZE - dh) / 2, dw, dh);
                                    }
                                }
                            } else if (!cached) {
                                const img = new Image();
                                img.onload = () => {
                                    const liveCanvas = canvasRef.current;
                                    const liveCtx = liveCanvas?.getContext('2d', { alpha: false });
                                    if (!liveCtx || img.naturalWidth === 0) return;
                                    requestAnimationFrame(() => {
                                        if (parseMosaicImageUrl(safeImageUrl)) {
                                            liveCtx.drawImage(img, x, y, BLOCK_SIZE, BLOCK_SIZE);
                                        } else {
                                            const scale = Math.min(BLOCK_SIZE / img.naturalWidth, BLOCK_SIZE / img.naturalHeight);
                                            const dw = img.naturalWidth * scale;
                                            const dh = img.naturalHeight * scale;
                                            liveCtx.drawImage(img, x + (BLOCK_SIZE - dw) / 2, y + (BLOCK_SIZE - dh) / 2, dw, dh);
                                        }
                                    });
                                };
                                img.onerror = () => {
                                    img.dataset.broken = "true";
                                };
                                if (imageCache.current.size >= MAX_IMAGE_CACHE_SIZE) {
                                    const oldestKey = imageCache.current.keys().next().value;
                                    if (oldestKey) imageCache.current.delete(oldestKey);
                                }
                                imageCache.current.set(safeImageUrl, img);
                                img.src = safeImageUrl;
                            }
                        }
                    }
                }
            }

            // --- Hover highlight ---
            if (hoveredBlockId !== null && hoveredBlockId !== selectedBlockId) {
                const hCol = hoveredBlockId % GRID_WIDTH;
                const hRow = Math.floor(hoveredBlockId / GRID_WIDTH);
                const hx = hCol * BLOCK_SIZE;
                const hy = hRow * BLOCK_SIZE;
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
                ctx.lineWidth = 3;
                ctx.strokeRect(hx + 1.5, hy + 1.5, BLOCK_SIZE - 3, BLOCK_SIZE - 3);
            }

            // --- Selection highlight ---
            if (mosaicBlockIds.length > 0) {
                ctx.fillStyle = 'rgba(20, 241, 149, 0.18)';
                ctx.strokeStyle = 'rgba(20, 241, 149, 0.8)';
                ctx.lineWidth = 2;
                for (const blockId of mosaicBlockIds) {
                    const col = blockId % GRID_WIDTH;
                    const row = Math.floor(blockId / GRID_WIDTH);
                    const x = col * BLOCK_SIZE;
                    const y = row * BLOCK_SIZE;
                    ctx.fillRect(x + 2, y + 2, BLOCK_SIZE - 4, BLOCK_SIZE - 4);
                    ctx.strokeRect(x + 2, y + 2, BLOCK_SIZE - 4, BLOCK_SIZE - 4);
                }
            }

            if (selectedBlockId !== null) {
                const sCol = selectedBlockId % GRID_WIDTH;
                const sRow = Math.floor(selectedBlockId / GRID_WIDTH);
                const sx = sCol * BLOCK_SIZE;
                const sy = sRow * BLOCK_SIZE;
                ctx.strokeStyle = '#14F195';
                ctx.lineWidth = 4;
                ctx.strokeRect(sx + 2, sy + 2, BLOCK_SIZE - 4, BLOCK_SIZE - 4);
            }
        });

        return () => {
            if (animationFrameRef.current !== null) {
                cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
            }
        };
    }, [blocks, visibleBounds, CANVAS_RES, canvasRef, hoveredBlockId, mosaicBlockIds, selectedBlockId]);

    useEffect(() => {
        const cache = imageCache.current;
        return () => {
            cache.clear();
        };
    }, []);
};
