"use client";

import { useState, useCallback, useRef, useEffect } from 'react';
import styles from './Grid.module.css';
import { BlockData } from '@/types';
import { Sidebar } from '@/components/sidebar/Sidebar';
import { useProgram } from '@/context/ProgramContext';
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { MyBlocksList } from './MyBlocksList';
import { PurchaseSuccessModal } from "@/components/modals/PurchaseSuccessModal";

import { useWallet } from '@solana/wallet-adapter-react';

export const Grid = () => {
    const { blocks, buyBlock, isLoading } = useProgram();
    const { publicKey } = useWallet();
    const [selectedBlock, setSelectedBlock] = useState<BlockData | null>(null);

    const [successBlock, setSuccessBlock] = useState<BlockData | null>(null);

    const [hoveredBlock, setHoveredBlock] = useState<BlockData | null>(null);
    const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
    const [sidebarMode, setSidebarMode] = useState<'view' | 'edit'>('view');

    const dragStart = useRef({ x: 0, y: 0 });
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const imageCache = useRef<Map<string, HTMLImageElement>>(new Map());

    // Increased resolution for better zoom quality
    const CANVAS_RES = 3000;

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

            const displayColor = block.color === '#000000' ? '#2d2d2d' : (block.color || '#2d2d2d');
            ctx.fillStyle = displayColor;

            if (block.imageUrl) {
                const cached = imageCache.current.get(block.imageUrl);
                if (cached && cached.complete) {
                    if (cached.naturalWidth > 0) {
                        ctx.drawImage(cached, x, y, BLOCK_SIZE, BLOCK_SIZE);
                    } else {
                        // Image loaded but has 0 width (e.g. SVG without dimensions). 
                        // Do not draw to avoid 'broken state' error.
                        // allow background color to show.
                    }
                } else if (!cached) {
                    const img = new Image();
                    img.src = block.imageUrl;
                    img.onload = () => {
                        ctx.drawImage(img, x, y, BLOCK_SIZE, BLOCK_SIZE);
                    };
                    img.onerror = () => {
                        // Mark as broken in cache so we don't retry loop
                        // distinct from 'undefined' which means 'not tried yet'
                        img.dataset.broken = "true";
                        // Optional: Draw Error Placeholder (Red X?)
                        ctx.fillStyle = "#ff0000";
                        ctx.fillRect(x, y, BLOCK_SIZE, BLOCK_SIZE);
                    };
                    imageCache.current.set(block.imageUrl, img);
                }
            } else {
                ctx.fillRect(x + 1, y + 1, BLOCK_SIZE - 2, BLOCK_SIZE - 2); // +1 gap for grid line effect
            }
        });

        // Draw Grid Lines (Optional, expensive if drawing 200 lines every frame?)
        // Instead I used fillRect with gap above.

    }, [blocks, publicKey]);


    const getBlockFromEvent = useCallback((e: React.MouseEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return null;

        const rect = canvas.getBoundingClientRect();

        // Calculate coordinate in CANVAS space (0-CANVAS_RES)
        // This handles cases where the canvas is scaled via CSS or Zoom lib
        const scaleX = rect.width / CANVAS_RES;
        const scaleY = rect.height / CANVAS_RES;

        const canvasX = (e.clientX - rect.left) / scaleX;
        const canvasY = (e.clientY - rect.top) / scaleY;

        const GRID_WIDTH = blocks.length <= 100 ? 5 : 100;
        const BLOCK_SIZE = CANVAS_RES / GRID_WIDTH;

        const col = Math.floor(canvasX / BLOCK_SIZE);
        const row = Math.floor(canvasY / BLOCK_SIZE);

        if (col < 0 || col >= GRID_WIDTH || row < 0 || row >= GRID_WIDTH) return null;

        // Block IDs are 1-based, array is 0-based.
        // ID 1 is at index 0.
        // Index = row * GRID_WIDTH + col;
        const index = row * GRID_WIDTH + col;

        // Direct access is O(1)
        return blocks[index];
    }, [blocks]);


    const handleCanvasClick = useCallback((e: React.MouseEvent) => {
        // Distance check
        const dx = e.clientX - dragStart.current.x;
        const dy = e.clientY - dragStart.current.y;
        if (Math.sqrt(dx * dx + dy * dy) > 5) return; // Drag ignored

        const block = getBlockFromEvent(e);
        if (block) {
            setSelectedBlock(block);
            setSidebarMode('view');
            setHoveredBlock(null); // Clear hover card immediately on click/tap
        }
    }, [getBlockFromEvent]);

    const handleBuyBlock = useCallback(async (block: BlockData, color?: string) => {
        if (!block.price) return;
        try {
            await buyBlock(block.id, block.price, color);
            // Show Success Modal instead of auto-edit
            setSuccessBlock(block);
            // We do NOT setSidebarMode('edit') here anymore
        } catch (error) {
            console.error("Failed to buy block:", error);
        }
    }, [buyBlock]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        const block = getBlockFromEvent(e);
        if (block) {
            setHoveredBlock(block);
            setCursorPos({ x: e.clientX, y: e.clientY });
        } else {
            setHoveredBlock(null);
        }
    }, [getBlockFromEvent]);

    const handleMouseLeave = useCallback(() => {
        setHoveredBlock(null);
    }, []);

    const handleCloseSidebar = useCallback(() => {
        setSelectedBlock(null);
    }, []);

    // Filter owned blocks
    const ownedBlocks = blocks.filter(b => publicKey && b.owner === publicKey.toBase58());

    return (
        <div
            className={styles.container}
            // Events on local container if needed? No, events on Canvas.
            // But we capture dragStart on container to handle "down on canvas, up elsewhere".
            onMouseDownCapture={(e) => {
                dragStart.current = { x: e.clientX, y: e.clientY };
            }}
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
                maxScale={10} // More zoom for pixel art
                centerOnInit
                limitToBounds={true}
                wheel={{ step: 0.1 }}
                panning={{ velocityDisabled: false }}
                alignmentAnimation={{ animationTime: 200 }}
            >
                <TransformComponent wrapperStyle={{ width: "100%", height: "100%" }}>
                    <canvas
                        ref={canvasRef}
                        width={3000}
                        height={3000}
                        style={{ margin: '200px' }} // Smooth scaling for photos + detailed padding
                        onClick={handleCanvasClick}
                        onMouseMove={handleMouseMove}
                        onMouseLeave={handleMouseLeave}
                    />
                </TransformComponent>
            </TransformWrapper>

            {hoveredBlock && (
                <div
                    className={styles.hoverCard}
                    style={{
                        // Flexible positioning: spread properties based on cursor position
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
                        // Find the updated block (with new owner) from the fresh blocks list
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
