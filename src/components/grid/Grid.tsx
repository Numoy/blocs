"use client";

import { useState, useCallback, useRef, useMemo, useEffect, type FormEvent } from 'react';
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
import { GRID_WIDTH, GRID_SIZE, CANVAS_RES, CANVAS_MARGIN, BLOCK_SIZE } from '@/utils/constants';
import { toSafeExternalUrl } from '@/utils/url';
import { toErrorCategory, trackPlausibleEvent } from '@/utils/analytics';
import { shareBlock } from '@/utils/shareBlock';
import { parseGridBlockId } from '@/utils/numberParsing';

export const Grid = () => {
    const { blocks, buyBlock, isLoading, isSyncing, openWalletModal } = useProgram();
    const { publicKey, connected, connect, wallet: adapterWallet } = useWallet();
    const { authenticated } = usePrivy();
    const pendingBuyRef = useRef<{ block: BlockData; source: BuySource } | null>(null);
    const pendingBuyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [successBlock, setSuccessBlock] = useState<BlockData | null>(null);
    const [isMobileViewport, setIsMobileViewport] = useState(false);
    const [isMobileBuying, setIsMobileBuying] = useState(false);
    const [viewingOwner, setViewingOwner] = useState<string | null>(null);
    const [jumpBlockInput, setJumpBlockInput] = useState("");
    const [showOnboarding, setShowOnboarding] = useState(() =>
        typeof window !== 'undefined' && !localStorage.getItem('blocs_has_visited')
    );

    const searchParams = useSearchParams();
    const blockParam = searchParams.get('block');

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const transformRef = useRef<ReactZoomPanPinchRef | null>(null);

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

    const { visibleBounds, updateVisibility } = useGridVisibility();
    const [currentScale, setCurrentScale] = useState(initialTransform.scale);
    const HIGH_RES_THRESHOLD = 3;

    // At high zoom, collect visible blocks with images so we can overlay native <img>
    // elements that render at the source image's full resolution instead of the canvas's
    // fixed 30×30px-per-block budget.
    const highResOverlays = useMemo(() => {
        if (currentScale < HIGH_RES_THRESHOLD) return [];
        const startCol = Math.max(0, Math.floor(visibleBounds.minX / BLOCK_SIZE));
        const endCol = Math.min(GRID_WIDTH - 1, Math.ceil(visibleBounds.maxX / BLOCK_SIZE));
        const startRow = Math.max(0, Math.floor(visibleBounds.minY / BLOCK_SIZE));
        const endRow = Math.min(GRID_WIDTH - 1, Math.ceil(visibleBounds.maxY / BLOCK_SIZE));
        const result: { block: BlockData; col: number; row: number }[] = [];
        for (let row = startRow; row <= endRow; row++) {
            for (let col = startCol; col <= endCol; col++) {
                const block = blocks[row * GRID_WIDTH + col];
                const safeUrl = block?.imageUrl ? toSafeExternalUrl(block.imageUrl) : null;
                if (safeUrl) result.push({ block, col, row });
            }
        }
        return result;
    }, [currentScale, visibleBounds, blocks]);
    const zoomToBlock = useCallback((blockId: number) => {
        const ref = transformRef.current;
        if (!ref) return;

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
    }, []);

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
        onBlockSelect: zoomToBlock,
    });

    const handleJumpToBlock = useCallback((event?: FormEvent<HTMLFormElement>) => {
        event?.preventDefault();
        const id = parseGridBlockId(jumpBlockInput);
        if (id === null) {
            toast.error(`Enter a block number from 0 to ${GRID_SIZE - 1}.`);
            return;
        }
        const block = blocks[id];
        if (!block) return;
        setSelectedBlock(block);
        setSidebarMode('view');
        zoomToBlock(id);
        trackPlausibleEvent("grid_jump_to_block", {
            block_id: id,
            ui_source: isMobileViewport ? "mobile_toolbar" : "grid_toolbar",
        });
    }, [blocks, isMobileViewport, jumpBlockInput, setSelectedBlock, setSidebarMode, zoomToBlock]);

    useGridCanvas({
        canvasRef,
        blocks,
        visibleBounds,
        hoveredBlockId: isMobileViewport ? null : hoveredBlockId,
        selectedBlockId: selectedBlock?.id ?? null,
    });

    const safeHoveredImageUrl = toSafeExternalUrl(hoveredBlock?.imageUrl);
    const selectedIsOwner = Boolean(publicKey && selectedBlock && selectedBlock.owner === publicKey.toBase58());
    const showDesktopSidebar = Boolean(selectedBlock) && (!isMobileViewport || sidebarMode === 'edit');
    const showMobileSheet = Boolean(selectedBlock) && isMobileViewport && sidebarMode === 'view';

    const queuePendingBuy = useCallback((block: BlockData, source: BuySource) => {
        pendingBuyRef.current = { block, source };
        toast.info("Connecting wallet, your purchase will proceed automatically...");

        // Explicitly connect if a wallet adapter is already selected (helps on mobile)
        if (adapterWallet) {
            connect().catch(() => { /* timeout below handles the failure UX */ });
        }

        // Safety timeout: if wallet never connects, clear the pending buy
        if (pendingBuyTimeoutRef.current) clearTimeout(pendingBuyTimeoutRef.current);
        pendingBuyTimeoutRef.current = setTimeout(() => {
            if (pendingBuyRef.current) {
                pendingBuyRef.current = null;
                toast.error("Wallet did not connect in time. Please try again.");
            }
        }, 15_000);
    }, [adapterWallet, connect]);

    const isBuyingRef = useRef(false);

    const handleBuyBlock = useCallback(async (block: BlockData, source: BuySource = "grid_sidebar") => {
        if (!connected) {
            // Queue the buy before opening the modal so it auto-fires once the wallet connects.
            // If authenticated, PrivyWalletBridge will connect the embedded wallet automatically —
            // don't open the modal, just wait for the pending buy to fire.
            queuePendingBuy(block, source);
            if (!authenticated) {
                openWalletModal(source === "block_detail" ? "block_detail_buy" : "sidebar_buy");
            }
            return;
        }

        if (isBuyingRef.current) return;
        isBuyingRef.current = true;

        trackPlausibleEvent("buy_flow_requested", {
            block_id: block.id,
            ui_source: source,
            price_sol: block.price,
        });

        try {
            await buyBlock(block.id, block.price ?? 0, source);
            setSuccessBlock(block);
        } catch (error) {
            trackPlausibleEvent("buy_flow_failed", {
                block_id: block.id,
                ui_source: source,
                error_category: toErrorCategory(error),
            });
            // buyBlock already shows the user-facing error toast; no additional toast here
        } finally {
            isBuyingRef.current = false;
        }
    }, [authenticated, buyBlock, connected, openWalletModal, queuePendingBuy]);

    // Auto-trigger queued buy once wallet finishes connecting
    useEffect(() => {
        if (connected && pendingBuyRef.current) {
            if (pendingBuyTimeoutRef.current) {
                clearTimeout(pendingBuyTimeoutRef.current);
                pendingBuyTimeoutRef.current = null;
            }
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
        if (!selectedBlock) return;
        await shareBlock(selectedBlock.id, "mobile_sheet");
    }, [selectedBlock]);

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

            <form className={styles.gridToolbar} onSubmit={handleJumpToBlock}>
                <input
                    value={jumpBlockInput}
                    onChange={(event) => setJumpBlockInput(event.target.value)}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="Block #"
                    aria-label="Go to block number"
                    className={styles.jumpInput}
                />
                <button type="submit" className={styles.toolbarButton}>
                    Go
                </button>
                <button
                    type="button"
                    className={styles.iconButton}
                    aria-label="Zoom in"
                    onClick={() => transformRef.current?.zoomIn?.(0.4)}
                >
                    +
                </button>
                <button
                    type="button"
                    className={styles.iconButton}
                    aria-label="Zoom out"
                    onClick={() => transformRef.current?.zoomOut?.(0.4)}
                >
                    -
                </button>
                <button
                    type="button"
                    className={styles.toolbarButton}
                    onClick={() => transformRef.current?.resetTransform?.(300, 'easeOut')}
                >
                    Reset
                </button>
            </form>

            {selectedBlock && isMobileViewport && (
                <div className={styles.mobileSelectionPill}>
                    <span>#{selectedBlock.id}</span>
                    <small>
                        {selectedBlock.isForSale && selectedBlock.price !== null
                            ? `${selectedBlock.price} SOL`
                            : selectedBlock.owner
                                ? "Owned"
                                : "Available"}
                    </small>
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
                onTransform={(ref) => {
                    setCurrentScale(ref.state.scale);
                    updateVisibility(ref.state.scale, ref.state.positionX, ref.state.positionY);
                }}
                onInit={(ref) => {
                    transformRef.current = ref;
                    setCurrentScale(ref.state.scale);
                    updateVisibility(ref.state.scale, ref.state.positionX, ref.state.positionY);
                }}
            >
                <TransformComponent wrapperStyle={{ width: "100%", height: "100%" }}>
                    <div style={{ position: 'relative' }}>
                        <canvas
                            ref={canvasRef}
                            width={CANVAS_RES}
                            height={CANVAS_RES}
                            style={{
                                margin: `${CANVAS_MARGIN}px`,
                                display: 'block',
                                // At high zoom the img overlays handle image quality.
                                // Pixelated rendering keeps empty block borders crisp.
                                imageRendering: currentScale >= HIGH_RES_THRESHOLD ? 'pixelated' : 'auto',
                            }}
                            onClick={handleCanvasClick}
                            onMouseMove={handleMouseMove}
                            onMouseLeave={handleMouseLeave}
                            tabIndex={0}
                            aria-label="Interactive block grid. Use mouse to pan/zoom, or click a block to view details."
                            onKeyDown={handleKeyDown}
                            className={styles.canvas}
                        />
                        {highResOverlays.map(({ block, col, row }) => (
                            <img
                                key={block.id}
                                src={toSafeExternalUrl(block.imageUrl)!}
                                alt=""
                                draggable={false}
                                style={{
                                    position: 'absolute',
                                    left: col * BLOCK_SIZE + CANVAS_MARGIN,
                                    top: row * BLOCK_SIZE + CANVAS_MARGIN,
                                    width: BLOCK_SIZE,
                                    height: BLOCK_SIZE,
                                    objectFit: 'cover',
                                    pointerEvents: 'none',
                                    userSelect: 'none',
                                }}
                            />
                        ))}
                    </div>
                </TransformComponent>
            </TransformWrapper>

            {hoveredBlock && !isMobileViewport && (
                <div
                    className={styles.hoverCard}
                    style={{
                        ...(cursorPos.y > window.innerHeight * 0.7
                            ? { top: 'auto', bottom: window.innerHeight - cursorPos.y + 20 }
                            : { top: cursorPos.y + 20, bottom: 'auto' }),

                        ...(cursorPos.x > window.innerWidth * 0.7
                            ? { left: 'auto', right: window.innerWidth - cursorPos.x + 20 }
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
