"use client";

import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { toast } from 'sonner';
import { useWallet } from '@solana/wallet-adapter-react';
import { usePrivy } from '@privy-io/react-auth';
import { useSearchParams } from 'next/navigation';
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import type { ReactZoomPanPinchRef } from "react-zoom-pan-pinch";
import styles from './Grid.module.css';
import type { BlockData } from '@/types';
import type { BuySource } from '@/context/ProgramContext';
import { Sidebar } from '@/components/sidebar/Sidebar';
import { useProgram } from '@/context/ProgramContext';
import { useGridVisibility } from './useGridVisibility';
import { useGridCanvas } from './useGridCanvas';
import { useGridInteraction } from './useGridInteraction';
import { MyBlocksList } from './MyBlocksList';
import { MobileBlockSheet } from './MobileBlockSheet';
import { PurchaseSuccessModal } from "@/components/modals/PurchaseSuccessModal";
import { OnboardingModal } from "@/components/modals/OnboardingModal";
import { GRID_WIDTH, GRID_SIZE } from '@/utils/constants';
import { toSafeExternalUrl } from '@/utils/url';
import { toErrorCategory, trackPlausibleEvent } from '@/utils/analytics';
import { parseGridBlockId } from '@/utils/numberParsing';

export const Grid = () => {
    const { blocks, buyBlock, isLoading, isSyncing, openWalletModal } = useProgram();
    const { publicKey, connected } = useWallet();
    const { authenticated } = usePrivy();
    const pendingBuyRef = useRef<{ block: BlockData; source: BuySource } | null>(null);
    const [successBlock, setSuccessBlock] = useState<BlockData | null>(null);
    const [isMobileViewport, setIsMobileViewport] = useState(false);
    const [isMobileBuying, setIsMobileBuying] = useState(false);
    const [viewingOwner, setViewingOwner] = useState<string | null>(null);
    const [showOnboarding, setShowOnboarding] = useState(() =>
        typeof window !== 'undefined' && !localStorage.getItem('blocs_has_visited')
    );

    const searchParams = useSearchParams();
    const blockParam = searchParams.get('block');

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const transformRef = useRef<ReactZoomPanPinchRef | null>(null);

    const CANVAS_RES = 3000;
    const CANVAS_MARGIN = 200;

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        const mediaQuery = window.matchMedia("(max-width: 900px), (pointer: coarse)");
        const updateViewportType = () => setIsMobileViewport(mediaQuery.matches);

        updateViewportType();
        mediaQuery.addEventListener('change', updateViewportType);

        return () => {
            mediaQuery.removeEventListener('change', updateViewportType);
        };
    }, []);

    // Deep Linking Logic
    const initialTransform = useMemo(() => {
        if (blockParam) {
            const id = parseGridBlockId(blockParam);
            if (id !== null) {
                const BLOCK_SIZE = CANVAS_RES / GRID_WIDTH;
                const col = id % GRID_WIDTH;
                const row = Math.floor(id / GRID_WIDTH);

                const targetX = col * BLOCK_SIZE + BLOCK_SIZE / 2 + CANVAS_MARGIN;
                const targetY = row * BLOCK_SIZE + BLOCK_SIZE / 2 + CANVAS_MARGIN;
                const scale = 2.0;

                const winW = typeof window !== 'undefined' ? window.innerWidth : 1000;
                const winH = typeof window !== 'undefined' ? window.innerHeight : 800;

                return {
                    scale,
                    positionX: -targetX * scale + winW / 2,
                    positionY: -targetY * scale + winH / 2,
                };
            }
        }

        return { scale: 0.6, positionX: 0, positionY: 0 };
    }, [blockParam]);

    const { visibleBounds, updateVisibility } = useGridVisibility({
        canvasRes: CANVAS_RES,
        margin: CANVAS_MARGIN,
    });
    const zoomToBlock = useCallback((blockId: number) => {
        const ref = transformRef.current;
        if (!ref) return;

        const BLOCK_SIZE = CANVAS_RES / GRID_WIDTH;
        const col = blockId % GRID_WIDTH;
        const row = Math.floor(blockId / GRID_WIDTH);

        const targetX = col * BLOCK_SIZE + BLOCK_SIZE / 2 + CANVAS_MARGIN;
        const targetY = row * BLOCK_SIZE + BLOCK_SIZE / 2 + CANVAS_MARGIN;
        const scale = Math.max(ref.state.scale, 2.0);

        const winW = window.innerWidth;
        const winH = window.innerHeight;

        const posX = -targetX * scale + winW / 2;
        const posY = -targetY * scale + winH / 2;

        ref.setTransform(posX, posY, scale, 300, 'easeOut');
    }, [CANVAS_RES]);

    const {
        selectedBlock,
        setSelectedBlock,
        hoveredBlock,
        hoveredBlockId,
        cursorPos,
        sidebarMode,
        setSidebarMode,
        handleCanvasClick,
        handleMouseMove,
        handleMouseLeave,
        handleMouseDown,
        handleKeyDown,
        handleCloseSidebar,
    } = useGridInteraction({
        canvasRef,
        blocks,
        CANVAS_RES,
        onBlockSelect: zoomToBlock,
    });

    useGridCanvas({
        canvasRef,
        blocks,
        visibleBounds,
        CANVAS_RES,
        hoveredBlockId: isMobileViewport ? null : hoveredBlockId,
        selectedBlockId: selectedBlock?.id ?? null,
    });

    const safeHoveredImageUrl = toSafeExternalUrl(hoveredBlock?.imageUrl);
    const selectedIsOwner = Boolean(publicKey && selectedBlock && selectedBlock.owner === publicKey.toBase58());
    const showDesktopSidebar = Boolean(selectedBlock) && (!isMobileViewport || sidebarMode === 'edit');
    const showMobileSheet = Boolean(selectedBlock) && isMobileViewport && sidebarMode === 'view';

    const handleBuyBlock = useCallback(async (block: BlockData, source: BuySource = "grid_sidebar") => {
        if (!connected) {
            if (!authenticated) {
                openWalletModal();
                return;
            }
            // Authenticated but wallet-adapter not yet connected — queue and auto-proceed
            pendingBuyRef.current = { block, source };
            toast.info("Connecting wallet, your purchase will proceed automatically...");
            return;
        }

        trackPlausibleEvent("buy_flow_requested", {
            block_id: block.id,
            ui_source: source,
            price_sol: block.price,
        });

        try {
            await buyBlock(block.id, block.price ?? 0, undefined, source);
            setSuccessBlock(block);
        } catch (error) {
            trackPlausibleEvent("buy_flow_failed", {
                block_id: block.id,
                ui_source: source,
                error_category: toErrorCategory(error),
            });
            console.error("Failed to buy block:", error);
        }
    }, [buyBlock, connected, authenticated, openWalletModal]);

    // Auto-trigger queued buy once wallet finishes connecting
    useEffect(() => {
        if (connected && pendingBuyRef.current) {
            const pending = pendingBuyRef.current;
            pendingBuyRef.current = null;
            handleBuyBlock(pending.block, pending.source);
        }
    }, [connected, handleBuyBlock]);

    const handleMobileBuy = useCallback(async () => {
        if (!selectedBlock) {
            return;
        }

        setIsMobileBuying(true);
        try {
            await handleBuyBlock(selectedBlock, "mobile_sheet");
        } finally {
            setIsMobileBuying(false);
        }
    }, [handleBuyBlock, selectedBlock]);

    const handleShareSelectedBlock = useCallback(async () => {
        if (!selectedBlock || typeof window === "undefined") {
            return;
        }

        const shareUrl = `${window.location.origin}/block/${selectedBlock.id}`;
        const shareTitle = `Block #${selectedBlock.id} on Blocs`;

        try {
            if (navigator.share && isMobileViewport) {
                await navigator.share({
                    title: shareTitle,
                    text: "Check out this block on the Blocs grid.",
                    url: shareUrl,
                });
                trackPlausibleEvent("share_block_link_clicked", {
                    block_id: selectedBlock.id,
                    ui_source: "mobile_sheet",
                    method: "native_share",
                });
                return;
            }

            await navigator.clipboard.writeText(shareUrl);
            trackPlausibleEvent("share_block_link_clicked", {
                block_id: selectedBlock.id,
                ui_source: isMobileViewport ? "mobile_sheet" : "sidebar",
                method: "clipboard",
            });
            toast.success("Link copied to clipboard!");
        } catch (error) {
            const abortError = error as DOMException;
            if (abortError?.name === "AbortError") {
                return;
            }
            toast.error("Could not share this block right now.");
        }
    }, [isMobileViewport, selectedBlock]);

    const handleSidebarPrev = useCallback(() => {
        if (!selectedBlock || selectedBlock.id <= 0) return;
        const prevBlock = blocks[selectedBlock.id - 1];
        setSelectedBlock(prevBlock);
        if (prevBlock) zoomToBlock(prevBlock.id);
    }, [selectedBlock, blocks, setSelectedBlock, zoomToBlock]);

    const handleSidebarNext = useCallback(() => {
        if (!selectedBlock || selectedBlock.id >= GRID_SIZE - 1) return;
        const nextBlock = blocks[selectedBlock.id + 1];
        setSelectedBlock(nextBlock);
        if (nextBlock) zoomToBlock(nextBlock.id);
    }, [selectedBlock, blocks, setSelectedBlock, zoomToBlock]);

    const handleCloseOnboarding = useCallback(() => {
        localStorage.setItem('blocs_has_visited', '1');
        setShowOnboarding(false);
    }, []);

    // Filter owned blocks
    const ownedBlocks = useMemo(() => {
        const owner = publicKey?.toBase58();
        if (!owner) return [];
        return blocks.filter((block) => block.owner === owner);
    }, [blocks, publicKey]);

    const viewingOwnerBlocks = useMemo(() =>
        viewingOwner ? blocks.filter(b => b.owner === viewingOwner) : [],
        [blocks, viewingOwner]);

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
                <div className={styles.syncBadge}>
                    Syncing…
                </div>
            )}

            <TransformWrapper
                initialScale={initialTransform.scale}
                initialPositionX={initialTransform.positionX}
                initialPositionY={initialTransform.positionY}
                minScale={0.1}
                maxScale={10}
                centerOnInit={!blockParam}
                limitToBounds={true}
                wheel={{ step: 0.1 }}
                panning={{ velocityDisabled: false }}
                alignmentAnimation={{ animationTime: 200 }}
                onTransformed={(ref) => updateVisibility(ref.state.scale, ref.state.positionX, ref.state.positionY)}
                onInit={(ref) => {
                    transformRef.current = ref;
                    updateVisibility(ref.state.scale, ref.state.positionX, ref.state.positionY);
                }}
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

            {hoveredBlock && !isMobileViewport && (
                <div
                    className={styles.hoverCard}
                    style={{
                        ...((cursorPos.y > (typeof window !== 'undefined' ? window.innerHeight * 0.7 : 600))
                            ? { top: 'auto', bottom: (typeof window !== 'undefined' ? window.innerHeight - cursorPos.y + 20 : 20) }
                            : { top: cursorPos.y + 20, bottom: 'auto' }),

                        ...((cursorPos.x > (typeof window !== 'undefined' ? window.innerWidth * 0.7 : 800))
                            ? { left: 'auto', right: (typeof window !== 'undefined' ? window.innerWidth - cursorPos.x + 20 : 20) }
                            : { left: cursorPos.x + 20, right: 'auto' }),
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

            {showDesktopSidebar && (
                <Sidebar
                    block={selectedBlock}
                    onClose={handleCloseSidebar}
                    onBuy={(block) => handleBuyBlock(block, "grid_sidebar")}
                    initialMode={sidebarMode}
                    onPrev={selectedBlock && selectedBlock.id > 0 ? handleSidebarPrev : undefined}
                    onNext={selectedBlock && selectedBlock.id < GRID_SIZE - 1 ? handleSidebarNext : undefined}
                    onViewOwnerBlocks={(owner) => setViewingOwner(owner)}
                />
            )}

            {showMobileSheet && (
                <MobileBlockSheet
                    block={selectedBlock}
                    isOwner={selectedIsOwner}
                    isBuying={isMobileBuying}
                    onBuy={handleMobileBuy}
                    onEdit={() => {
                        trackPlausibleEvent("mobile_sheet_edit_clicked", {
                            block_id: selectedBlock?.id,
                            ui_source: "mobile_sheet",
                        });
                        setSidebarMode('edit');
                    }}
                    onShare={handleShareSelectedBlock}
                    onClose={handleCloseSidebar}
                />
            )}

            <PurchaseSuccessModal
                block={successBlock}
                isOpen={!!successBlock}
                onClose={() => setSuccessBlock(null)}
                onEdit={() => {
                    if (successBlock) {
                        const freshBlock = blocks.find((block) => block.id === successBlock.id);
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
                isWalletConnected={Boolean(publicKey)}
                onSelectBlock={(block) => {
                    trackPlausibleEvent("owned_block_selected", {
                        block_id: block.id,
                        ui_source: "my_blocks_list",
                        is_for_sale: block.isForSale,
                    });
                    setSelectedBlock(block);
                    setSidebarMode('edit');
                    zoomToBlock(block.id);
                }}
            />

            {viewingOwner && (
                <div className={styles.ownerViewerSlot}>
                    <MyBlocksList
                        blocks={viewingOwnerBlocks}
                        title={`Blocks by ${viewingOwner.slice(0, 4)}...${viewingOwner.slice(-4)}`}
                        onClear={() => setViewingOwner(null)}
                        onSelectBlock={(block) => {
                            setSelectedBlock(block);
                            setSidebarMode('view');
                            zoomToBlock(block.id);
                        }}
                    />
                </div>
            )}

            <OnboardingModal isOpen={showOnboarding} onClose={handleCloseOnboarding} />
        </div>
    );
};
