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

export const Grid = () => {
    const { blocks, buyBlock, isLoading } = useProgram();
    const { publicKey } = useWallet();
    const [successBlock, setSuccessBlock] = useState<BlockData | null>(null);
    const searchParams = useSearchParams();

    const canvasRef = useRef<HTMLCanvasElement>(null);

    const CANVAS_RES = 3000;
    const CANVAS_MARGIN = 200;

    // Deep Linking Logic
    const initialTransform = useMemo(() => {
        const blockIdParam = searchParams.get('block');
        if (blockIdParam) {
            const id = parseInt(blockIdParam, 10);
            if (!isNaN(id) && id >= 0 && id < 10000) {
                const GRID_WIDTH = 100;
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
    }, [searchParams]);

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

    const handleBuyBlock = useCallback(async (block: BlockData) => {
        if (!block.price) return;
        try {
            await buyBlock(block.id, block.price);
            setSuccessBlock(block);
        } catch (error) {
            console.error("Failed to buy block:", error);
        }
    }, [buyBlock]);

    // Filter owned blocks
    const ownedBlocks = blocks.filter(b => publicKey && b.owner === publicKey.toBase58());

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
            <TransformWrapper
                initialScale={initialTransform.scale}
                initialPositionX={initialTransform.positionX}
                initialPositionY={initialTransform.positionY}
                minScale={0.1}
                maxScale={10}
                centerOnInit={!searchParams.get('block')} // Only center if no block param
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
                        width={3000}
                        height={3000}
                        style={{ margin: '200px' }}
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
                    {hoveredBlock.imageUrl && <img src={hoveredBlock.imageUrl} alt="" className={styles.cardImage} />}
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
                    setSelectedBlock(block);
                    setSidebarMode('edit');
                }}
            />
        </div>
    );
};
