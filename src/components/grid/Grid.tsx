"use client";

import { useState, useCallback, useRef, useMemo } from 'react';
import styles from './Grid.module.css';
import { BlockData } from '@/types';
import { Sidebar } from '@/components/sidebar/Sidebar';
import { useProgram } from '@/context/ProgramContext';
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { useGridVisibility } from './useGridVisibility';
import { useGridCanvas } from './useGridCanvas';
import { useGridInteraction } from './useGridInteraction';
import { MyBlocksList } from './MyBlocksList';
import { PurchaseSuccessModal } from "@/components/modals/PurchaseSuccessModal";

import { useWallet } from '@solana/wallet-adapter-react';

import { useSearchParams } from 'next/navigation';
import { GRID_SIZE, GRID_WIDTH } from '@/utils/constants';
import { toSafeExternalUrl } from '@/utils/url';
import { toErrorCategory, trackPlausibleEvent } from '@/utils/analytics';

export const Grid = () => {
    const { blocks, buyBlock, isLoading, isSyncing } = useProgram();
    const { publicKey } = useWallet();
    const [successBlock, setSuccessBlock] = useState<BlockData | null>(null);
    const searchParams = useSearchParams();
    const blockParam = searchParams.get('block');

    const canvasRef = useRef<HTMLCanvasElement>(null);

    const CANVAS_RES = 3000;
    const CANVAS_MARGIN = 200;

    // Deep Linking Logic
    const initialTransform = useMemo(() => {
        if (blockParam) {
            const id = parseInt(blockParam, 10);
            if (!isNaN(id) && id >= 0 && id < GRID_SIZE) {
                const BLOCK_SIZE = CANVAS_RES / GRID_WIDTH; // 30
                const col = id % GRID_WIDTH;
                const row = Math.floor(id / GRID_WIDTH);
                
                // Target Center (in canvas coords)
                const targetX = col * BLOCK_SIZE + BLOCK_SIZE / 2 + CANVAS_MARGIN;
                const targetY = row * BLOCK_SIZE + BLOCK_SIZE / 2 + CANVAS_MARGIN;

                // Viewport Center (approx, assuming 100vw/100vh)
                // Since we don't know exact window size on server/init, we estimate or just position relative.
                // A scale of 2.0 is good for focus.
                const scale = 2.0;
                
                // Transform: -Target * Scale + ViewportCenter
                // We'll trust react-zoom-pan-pinch to clamp if needed, but we pass these as initial.
                // Note: The library applies these directly.
                // To center perfectly we need window dimensions, but a rough offset works for deep linking.
                // Let's assume a typical 1920x1080 screen, center is 960x540.
                const winW = typeof window !== 'undefined' ? window.innerWidth : 1000;
                const winH = typeof window !== 'undefined' ? window.innerHeight : 800;

                return {
                    scale,
                    positionX: -targetX * scale + winW / 2,
                    positionY: -targetY * scale + winH / 2
                };
            }
        }
        return { scale: 0.6, positionX: 0, positionY: 0 }; // Default
    }, [blockParam]);

    const { visibleBounds, updateVisibility } = useGridVisibility({
        canvasRes: CANVAS_RES,
        margin: CANVAS_MARGIN
    });

    useGridCanvas({
        canvasRef,
        blocks,
        visibleBounds,
        CANVAS_RES
    });

    const {
        selectedBlock,
        setSelectedBlock,
        hoveredBlock,
        cursorPos,
        sidebarMode,
        setSidebarMode,
        handleCanvasClick,
        handleMouseMove,
        handleMouseLeave,
        handleMouseDown,
        handleKeyDown,
        handleCloseSidebar
    } = useGridInteraction({
        canvasRef,
        blocks,
        CANVAS_RES
    });
    const safeHoveredImageUrl = toSafeExternalUrl(hoveredBlock?.imageUrl);

    const handleBuyBlock = useCallback(async (block: BlockData) => {
        if (!block.price) return;
        trackPlausibleEvent("buy_flow_requested", {
            block_id: block.id,
            ui_source: "grid_sidebar",
            price_sol: block.price,
        });
        try {
            await buyBlock(block.id, block.price, undefined, "grid_sidebar");
            setSuccessBlock(block);
        } catch (error) {
            trackPlausibleEvent("buy_flow_failed", {
                block_id: block.id,
                ui_source: "grid_sidebar",
                error_category: toErrorCategory(error),
            });
            console.error("Failed to buy block:", error);
        }
    }, [buyBlock]);

    // Filter owned blocks
    const ownedBlocks = useMemo(() => {
        const owner = publicKey?.toBase58();
        if (!owner) return [];
        return blocks.filter(b => b.owner === owner);
    }, [blocks, publicKey]);

    return (
        <div
            className={styles.container}
            onMouseDownCapture={handleMouseDown}
            role="main"
            aria-label="10,000 Blocs Grid"
        >
            {isLoading && (
                <div className={styles.loadingOverlay} role="alert" aria-busy="true">
                    <div className={styles.spinner}></div>
                    <div className={styles.loadingText}>Synchronizing with Solana...</div>
                </div>
            )}
            {!isLoading && isSyncing && (
                <div
                    style={{
                        position: "absolute",
                        top: 16,
                        right: 16,
                        zIndex: 20,
                        background: "rgba(0,0,0,0.65)",
                        color: "#bbb",
                        border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: 999,
                        padding: "6px 10px",
                        fontSize: "0.75rem",
                        letterSpacing: "0.02em",
                    }}
                >
                    Syncing…
                </div>
            )}
            <TransformWrapper
                initialScale={initialTransform.scale}
                initialPositionX={initialTransform.positionX}
                initialPositionY={initialTransform.positionY}
                minScale={0.1}
                maxScale={10}
                centerOnInit={!blockParam} // Only center if no block param
                limitToBounds={true}
                wheel={{ step: 0.1 }}
                panning={{ velocityDisabled: false }}
                alignmentAnimation={{ animationTime: 200 }}
                onTransformed={(ref) => updateVisibility(ref.state.scale, ref.state.positionX, ref.state.positionY)}
                onInit={(ref) => updateVisibility(ref.state.scale, ref.state.positionX, ref.state.positionY)}
            >
                <TransformComponent wrapperStyle={{ width: "100%", height: "100%" }}>
                    <canvas
                        ref={canvasRef}
                        width={CANVAS_RES}
                        height={CANVAS_RES}
                        style={{ margin: `${CANVAS_MARGIN}px` }}
                        onClick={handleCanvasClick}
                        onMouseMove={handleMouseMove}
                        onMouseLeave={handleMouseLeave}
                        tabIndex={0}
                        aria-label="Interactive block grid. Use mouse to pan/zoom, or click a block to view details."
                        onKeyDown={handleKeyDown}
                        className={styles.canvas}
                    />
                </TransformComponent>
            </TransformWrapper>


            {hoveredBlock && (
                <div
                    className={styles.hoverCard}
                    style={{
                        ...((cursorPos.y > (typeof window !== 'undefined' ? window.innerHeight * 0.7 : 600))
                            ? { top: 'auto', bottom: (typeof window !== 'undefined' ? window.innerHeight - cursorPos.y + 20 : 20) }
                            : { top: cursorPos.y + 20, bottom: 'auto' }),

                        ...((cursorPos.x > (typeof window !== 'undefined' ? window.innerWidth * 0.7 : 800))
                            ? { left: 'auto', right: (typeof window !== 'undefined' ? window.innerWidth - cursorPos.x + 20 : 20) }
                            : { left: cursorPos.x + 20, right: 'auto' })
                    }}
                >
                    <div className={styles.cardTitle}>Block #{hoveredBlock.id}</div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {safeHoveredImageUrl && <img src={safeHoveredImageUrl} alt="" className={styles.cardImage} />}
                    {hoveredBlock.text && <div className={styles.cardText}>{hoveredBlock.text}</div>}
                    {hoveredBlock.url && <div className={styles.cardUrl}>{hoveredBlock.url}</div>}
                    {hoveredBlock.isForSale && <div className={styles.cardPrice}>For Sale: {hoveredBlock.price} SOL</div>}
                </div>
            )}

            <Sidebar
                block={selectedBlock}
                onClose={handleCloseSidebar}
                onBuy={handleBuyBlock}
                initialMode={sidebarMode}
            />

            <PurchaseSuccessModal
                block={successBlock}
                isOpen={!!successBlock}
                onClose={() => setSuccessBlock(null)}
                onEdit={() => {
                    if (successBlock) {
                        const freshBlock = blocks.find(b => b.id === successBlock.id);
                        if (freshBlock) {
                            setSelectedBlock(freshBlock);
                            setSidebarMode('edit');
                        }
                        setSuccessBlock(null);
                    }
                }}
            />

            <MyBlocksList
                blocks={ownedBlocks}
                onSelectBlock={(block) => {
                    trackPlausibleEvent("owned_block_selected", {
                        block_id: block.id,
                        ui_source: "my_blocks_list",
                        is_for_sale: block.isForSale,
                    });
                    setSelectedBlock(block);
                    setSidebarMode('edit');
                }}
            />
        </div>
    );
};
