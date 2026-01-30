"use client";

import { useState, useCallback, useRef } from 'react';
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

export const Grid = () => {
    const { blocks, buyBlock, isLoading } = useProgram();
    const { publicKey } = useWallet();
    const [successBlock, setSuccessBlock] = useState<BlockData | null>(null);

    const canvasRef = useRef<HTMLCanvasElement>(null);

    const CANVAS_RES = 3000;
    const CANVAS_MARGIN = 200;

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
        >
            {isLoading && (
                <div className={styles.loadingOverlay}>
                    <div className={styles.spinner}></div>
                    <div className={styles.loadingText}>Loading Grid...</div>
                </div>
            )}
            <TransformWrapper
                initialScale={0.6}
                minScale={0.1}
                maxScale={10}
                centerOnInit
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
                        aria-label="Grid of blocks. Use arrow keys to navigate."
                        onKeyDown={handleKeyDown}
                        // Ensure it shows focus outline or manage it via CSS
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
