import { useEffect, useRef, useState } from 'react';
import { BlockData } from '@/types';
import { VisibleBounds } from './useGridVisibility';
import { GRID_WIDTH, CANVAS_RES, BLOCK_SIZE } from '@/utils/constants';
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

const blockPosition = (id: number) => ({
    bx: (id % GRID_WIDTH) * BLOCK_SIZE,
    by: Math.floor(id / GRID_WIDTH) * BLOCK_SIZE,
});

// Colonized parcel: Sol-green tint + border (matches the map legend).
// Also the placeholder while a block image loads and the fallback when it fails.
const drawColonized = (ctx: CanvasRenderingContext2D, bx: number, by: number) => {
    ctx.fillStyle = 'rgba(20, 241, 149, 0.16)';
    ctx.fillRect(bx + 1, by + 1, BLOCK_SIZE - 2, BLOCK_SIZE - 2);

    ctx.strokeStyle = 'rgba(20, 241, 149, 0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, BLOCK_SIZE - 1, BLOCK_SIZE - 1);
};

const drawBlockImage = (
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    safeImageUrl: string,
    bx: number,
    by: number,
) => {
    if (parseMosaicImageUrl(safeImageUrl)) {
        ctx.drawImage(img, bx, by, BLOCK_SIZE, BLOCK_SIZE);
    } else {
        // Cover-crop so the image fills the whole tile — letterboxing on a dark
        // base made non-square images read as black tiles.
        const s = Math.max(BLOCK_SIZE / img.naturalWidth, BLOCK_SIZE / img.naturalHeight);
        const sw = BLOCK_SIZE / s;
        const sh = BLOCK_SIZE / s;
        const sx = (img.naturalWidth - sw) / 2;
        const sy = (img.naturalHeight - sh) / 2;
        ctx.drawImage(img, sx, sy, sw, sh, bx, by, BLOCK_SIZE, BLOCK_SIZE);
    }
};

export const useGridCanvas = ({
    canvasRef,
    blocks,
    visibleBounds,
    hoveredBlockId,
    mosaicBlockIds = [],
    selectedBlockId,
}: UseGridCanvasProps) => {
    const imageCache = useRef<Map<string, HTMLImageElement>>(new Map());
    const MAX_IMAGE_CACHE_SIZE = 2000;

    const marsImageRef = useRef<HTMLImageElement | null>(null);
    const [, forceUpdate] = useState({});

    // Load Mars surface map once
    useEffect(() => {
        const img = new Image();
        img.src = '/mars_surface.jpg';
        img.onload = () => {
            marsImageRef.current = img;
            forceUpdate({});
        };
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) return;

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // ALWAYS clear the canvas first to prevent frame-smearing
        ctx.fillStyle = '#0b0a14';
        ctx.fillRect(0, 0, CANVAS_RES, CANVAS_RES);

        // 1. Draw flat Mars background
        if (marsImageRef.current && marsImageRef.current.complete) {
            ctx.drawImage(marsImageRef.current, 0, 0, CANVAS_RES, CANVAS_RES);
        }

        // 2. Render visible blocks only
        const startCol = Math.max(0, Math.floor(visibleBounds.minX / BLOCK_SIZE));
        const endCol = Math.min(GRID_WIDTH - 1, Math.ceil(visibleBounds.maxX / BLOCK_SIZE));
        const startRow = Math.max(0, Math.floor(visibleBounds.minY / BLOCK_SIZE));
        const endRow = Math.min(GRID_WIDTH - 1, Math.ceil(visibleBounds.maxY / BLOCK_SIZE));

        for (let row = startRow; row <= endRow; row++) {
            for (let col = startCol; col <= endCol; col++) {
                const index = row * GRID_WIDTH + col;
                const block = blocks[index];
                if (!block) continue;

                const bx = col * BLOCK_SIZE;
                const by = row * BLOCK_SIZE;

                const isOwned = !!block.owner;

                if (isOwned) {
                    const safeImageUrl = block.imageUrl ? toSafeExternalUrl(block.imageUrl) : null;

                    if (safeImageUrl) {
                        const cached = imageCache.current.get(safeImageUrl);
                        if (cached && cached.complete && cached.naturalWidth > 0) {
                            drawBlockImage(ctx, cached, safeImageUrl, bx, by);
                        } else if (cached) {
                            // Still loading or failed to load
                            drawColonized(ctx, bx, by);
                        } else {
                            drawColonized(ctx, bx, by);
                            const img = new Image();
                            img.onload = () => {
                                const liveCanvas = canvasRef.current;
                                const liveCtx = liveCanvas?.getContext('2d', { alpha: false });
                                if (!liveCtx || img.naturalWidth === 0) return;
                                requestAnimationFrame(() => {
                                    const { bx: liveBx, by: liveBy } = blockPosition(index);
                                    drawBlockImage(liveCtx, img, safeImageUrl, liveBx, liveBy);
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
                    } else {
                        // Claimed plot, but no custom image uploaded
                        drawColonized(ctx, bx, by);
                    }
                } else {
                    // Unowned Mars plot:
                    // Transparent background, but faint cyber-grid border showing the Mars surface
                    ctx.strokeStyle = 'rgba(247, 203, 160, 0.16)';
                    ctx.lineWidth = 0.5;
                    ctx.strokeRect(bx + 0.5, by + 0.5, BLOCK_SIZE - 1, BLOCK_SIZE - 1);
                }
            }
        }

        // --- Hover highlight ---
        if (hoveredBlockId !== null && hoveredBlockId !== selectedBlockId) {
            const { bx, by } = blockPosition(hoveredBlockId);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.lineWidth = 3;
            ctx.strokeRect(bx + 1.5, by + 1.5, BLOCK_SIZE - 3, BLOCK_SIZE - 3);
        }

        // --- Selection highlight ---
        if (mosaicBlockIds.length > 0) {
            ctx.fillStyle = 'rgba(153, 69, 255, 0.2)';
            ctx.strokeStyle = 'rgba(153, 69, 255, 0.85)';
            ctx.lineWidth = 2;
            for (const blockId of mosaicBlockIds) {
                const { bx, by } = blockPosition(blockId);
                ctx.fillRect(bx + 2, by + 2, BLOCK_SIZE - 4, BLOCK_SIZE - 4);
                ctx.strokeRect(bx + 2, by + 2, BLOCK_SIZE - 4, BLOCK_SIZE - 4);
            }
        }

        if (selectedBlockId !== null) {
            const { bx, by } = blockPosition(selectedBlockId);
            ctx.strokeStyle = '#14f195';
            ctx.lineWidth = 4;
            ctx.strokeRect(bx + 2, by + 2, BLOCK_SIZE - 4, BLOCK_SIZE - 4);
        }
    }, [blocks, visibleBounds, canvasRef, hoveredBlockId, mosaicBlockIds, selectedBlockId]);

    useEffect(() => {
        const cache = imageCache.current;
        return () => {
            cache.clear();
        };
    }, []);
};
