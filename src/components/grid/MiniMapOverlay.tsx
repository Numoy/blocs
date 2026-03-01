"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { BlockData } from "@/types";
import type { VisibleBounds } from "./useGridVisibility";
import { GRID_WIDTH, GRID_SIZE } from "@/utils/constants";
import styles from "./MiniMapOverlay.module.css";

interface MiniMapOverlayProps {
    blocks: BlockData[];
    visibleBounds: VisibleBounds;
    canvasRes: number;
    onResetView?: () => void;
    onJumpToBlock?: (id: number) => void;
}

const MAP_SIZE = 180;
const BIN_COUNT = 20;
const BLOCKS_PER_BIN = GRID_WIDTH / BIN_COUNT;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const MiniMapOverlay = ({ blocks, visibleBounds, canvasRes, onResetView, onJumpToBlock }: MiniMapOverlayProps) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [showHeatmap, setShowHeatmap] = useState(true);
    const [jumpInput, setJumpInput] = useState("");

    const forSaleCount = useMemo(() => blocks.reduce((count, block) => count + (block?.isForSale ? 1 : 0), 0), [blocks]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d", { alpha: false });
        if (!ctx) return;

        ctx.clearRect(0, 0, MAP_SIZE, MAP_SIZE);
        ctx.fillStyle = "#090909";
        ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);

        const binPixelSize = MAP_SIZE / BIN_COUNT;

        for (let row = 0; row < BIN_COUNT; row++) {
            for (let col = 0; col < BIN_COUNT; col++) {
                let saleCount = 0;
                let ownerCount = 0;
                let total = 0;

                for (let localRow = 0; localRow < BLOCKS_PER_BIN; localRow++) {
                    for (let localCol = 0; localCol < BLOCKS_PER_BIN; localCol++) {
                        const gridRow = row * BLOCKS_PER_BIN + localRow;
                        const gridCol = col * BLOCKS_PER_BIN + localCol;
                        const index = gridRow * GRID_WIDTH + gridCol;
                        const block = blocks[index];
                        if (!block) continue;

                        total += 1;
                        if (block.owner) ownerCount += 1;
                        if (block.isForSale) saleCount += 1;
                    }
                }

                const x = col * binPixelSize;
                const y = row * binPixelSize;

                if (total === 0) {
                    ctx.fillStyle = "#111";
                    ctx.fillRect(x, y, binPixelSize, binPixelSize);
                    continue;
                }

                const saleDensity = saleCount / total;
                const ownedDensity = ownerCount / total;

                if (showHeatmap) {
                    if (saleDensity > 0) {
                        const hue = 200 - saleDensity * 150;
                        const alpha = 0.18 + saleDensity * 0.72;
                        ctx.fillStyle = `hsla(${hue}, 95%, 50%, ${alpha})`;
                    } else {
                        const ownedAlpha = 0.08 + ownedDensity * 0.15;
                        ctx.fillStyle = `rgba(255,255,255,${ownedAlpha})`;
                    }
                } else {
                    const tone = 22 + ownedDensity * 52;
                    ctx.fillStyle = `rgb(${tone}, ${tone}, ${tone})`;
                }

                ctx.fillRect(x, y, binPixelSize, binPixelSize);
            }
        }

        ctx.strokeStyle = "rgba(255,255,255,0.16)";
        ctx.lineWidth = 1;
        for (let i = 0; i <= BIN_COUNT; i++) {
            const offset = i * binPixelSize;
            ctx.beginPath();
            ctx.moveTo(offset, 0);
            ctx.lineTo(offset, MAP_SIZE);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, offset);
            ctx.lineTo(MAP_SIZE, offset);
            ctx.stroke();
        }

        const blockPixelSize = canvasRes / GRID_WIDTH;
        const minCol = clamp(visibleBounds.minX / blockPixelSize, 0, GRID_WIDTH);
        const maxCol = clamp(visibleBounds.maxX / blockPixelSize, 0, GRID_WIDTH);
        const minRow = clamp(visibleBounds.minY / blockPixelSize, 0, GRID_WIDTH);
        const maxRow = clamp(visibleBounds.maxY / blockPixelSize, 0, GRID_WIDTH);

        const viewX = (minCol / GRID_WIDTH) * MAP_SIZE;
        const viewY = (minRow / GRID_WIDTH) * MAP_SIZE;
        const viewW = Math.max(4, ((maxCol - minCol) / GRID_WIDTH) * MAP_SIZE);
        const viewH = Math.max(4, ((maxRow - minRow) / GRID_WIDTH) * MAP_SIZE);

        ctx.fillStyle = "rgba(20, 241, 149, 0.16)";
        ctx.fillRect(viewX, viewY, viewW, viewH);
        ctx.strokeStyle = "rgba(20, 241, 149, 0.95)";
        ctx.lineWidth = 2;
        ctx.strokeRect(viewX, viewY, viewW, viewH);
    }, [blocks, canvasRes, showHeatmap, visibleBounds]);

    const handleJump = () => {
        const id = parseInt(jumpInput, 10);
        if (isNaN(id) || !Number.isInteger(id) || id < 0 || id > GRID_SIZE - 1) return;
        onJumpToBlock?.(id);
        setJumpInput("");
    };

    return (
        <aside className={styles.container} aria-label="Grid overview mini-map">
            <div className={styles.headerRow}>
                <div>
                    <div className={styles.title}>Market Map</div>
                    <div className={styles.subtitle}>{forSaleCount.toLocaleString()} listed</div>
                </div>
                <div className={styles.headerActions}>
                    {onResetView && (
                        <button
                            type="button"
                            className="uiButton uiButtonGhost"
                            onClick={onResetView}
                            aria-label="Reset view"
                            title="Reset view"
                        >
                            ↺
                        </button>
                    )}
                    <button
                        type="button"
                        className="uiButton uiButtonGhost"
                        onClick={() => setShowHeatmap((value) => !value)}
                    >
                        {showHeatmap ? "Heat" : "Owned"}
                    </button>
                </div>
            </div>

            <canvas
                ref={canvasRef}
                width={MAP_SIZE}
                height={MAP_SIZE}
                className={styles.mapCanvas}
                aria-label="Mini-map with current viewport"
            />

            <div className={styles.legendRow}>
                <span className={styles.legendItem}><i className={styles.low} /> Low sale density</span>
                <span className={styles.legendItem}><i className={styles.high} /> High sale density</span>
            </div>

            {onJumpToBlock && (
                <div className={styles.jumpRow}>
                    <input
                        type="number"
                        className={styles.jumpInput}
                        placeholder="Block #"
                        value={jumpInput}
                        onChange={(e) => setJumpInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleJump()}
                        min="0"
                        max="9999"
                        aria-label="Jump to block number"
                    />
                    <button type="button" className="uiButton uiButtonGhost" onClick={handleJump}>
                        Go
                    </button>
                </div>
            )}
        </aside>
    );
};
