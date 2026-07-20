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
import { MarsGlobe } from './MarsGlobe';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { MosaicEditorModal } from '@/components/mosaic/MosaicEditorModal';
import { MosaicPreview } from '@/components/mosaic/MosaicPreview';
import { PurchaseSuccessModal } from "@/components/modals/PurchaseSuccessModal";
import { OnboardingModal } from "@/components/modals/OnboardingModal";
import { GRID_WIDTH, GRID_SIZE, CANVAS_RES, CANVAS_MARGIN, BLOCK_SIZE } from '@/utils/constants';
import { toSafeExternalUrl } from '@/utils/url';
import { toErrorCategory, trackPlausibleEvent } from '@/utils/analytics';
import { shareBlock } from '@/utils/shareBlock';
import { parseGridBlockId } from '@/utils/numberParsing';
import { computeBlockTransform } from '@/utils/gridTransform';
import { buildMosaicSelection, validateMosaicSelection } from '@/utils/mosaic';
import { parseMosaicImageUrl } from '@/utils/mosaicImage';

// High-res <img> overlays and pixelated rendering toggle with hysteresis so
// hovering around a single threshold doesn't pop layers in and out.
const HIGH_RES_ON = 1.6;
const HIGH_RES_OFF = 1.4;

// Zooming the flat map out this far (gesture end) returns to the globe.
const GLOBE_SWITCH_SCALE = 0.35;

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

    const searchParams = useSearchParams();
    const blockParam = searchParams.get('block');

    const [viewMode, setViewMode] = useState<'flat' | 'globe'>(() =>
        blockParam ? 'flat' : 'globe'
    );
    // Block the next flat-view mount should center on (set when leaving the globe).
    const [pendingFocus, setPendingFocus] = useState<{ blockId: number; scale: number } | null>(null);
    // Camera focus the globe should mount with, so leaving the flat map by zooming
    // out lands on the same spot at a matching apparent size.
    const [globeView, setGlobeView] = useState<{ blockId: number; apparentDiameterPx: number } | null>(null);
    const [isMosaicMode, setIsMosaicMode] = useState(false);
    const [mosaicStartId, setMosaicStartId] = useState<number | null>(null);
    const [mosaicEndId, setMosaicEndId] = useState<number | null>(null);
    const [mosaicHoverId, setMosaicHoverId] = useState<number | null>(null);
    const [isMosaicEditorOpen, setIsMosaicEditorOpen] = useState(false);
    const [showOnboarding, setShowOnboarding] = useState(() =>
        typeof window !== 'undefined' && !localStorage.getItem('blocs_has_visited')
    );

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
                return computeBlockTransform(id);
            }
        }

        return { scale: 0.6, positionX: 0, positionY: 0 };
    }, [blockParam]);

    // Transform the flat view mounts with: a pending focus block wins over the deep link.
    const flatMountTransform = pendingFocus !== null
        ? computeBlockTransform(pendingFocus.blockId, pendingFocus.scale)
        : initialTransform;

    const { visibleBounds, updateVisibility } = useGridVisibility();
    const scaleRef = useRef(initialTransform.scale);
    const [isHighRes, setIsHighRes] = useState(initialTransform.scale >= HIGH_RES_ON);

    // At high zoom, collect visible blocks with images so we can overlay native <img>
    // elements that render at the source image's full resolution instead of the canvas's
    // fixed 30×30px-per-block budget.
    const highResOverlays = useMemo(() => {
        if (!isHighRes) return [];
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
    }, [isHighRes, visibleBounds, blocks]);
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

    // Select a block and show it in the flat view. From the globe, the flat view
    // mounts already centered on the block (no reset-then-animate jump); when
    // already flat, it animates there.
    const focusBlockInFlat = useCallback((blockId: number, mode: 'view' | 'edit' = 'view') => {
        const block = blocks[blockId];
        if (!block) return;
        setSelectedBlock(block);
        setSidebarMode(mode);
        if (viewMode === 'globe') {
            setPendingFocus({ blockId, scale: 2.0 });
            setViewMode('flat');
        } else {
            zoomToBlock(blockId);
        }
    }, [blocks, setSelectedBlock, setSidebarMode, viewMode, zoomToBlock]);

    // Clicking a parcel on the globe selects it in place (highlight + sidebar);
    // the flat map is reached by zooming in or via the toolbar toggle.
    const handleGlobeSelect = useCallback((blockId: number) => {
        const block = blocks[blockId];
        if (!block) return;
        setSelectedBlock(block);
        setSidebarMode('view');
    }, [blocks, setSelectedBlock, setSidebarMode]);

    const handleZoomIntoSurface = useCallback((blockId: number, apparentDiameterPx: number) => {
        // Continue the zoom into the flat map at the matching scale
        const scale = Math.min(Math.max(apparentDiameterPx / CANVAS_RES, 0.4), 1.2);
        setPendingFocus({ blockId, scale });
        setViewMode('flat');
    }, []);

    // WebGL can be unavailable (old browser, disabled/blocklisted GPU) or the
    // globe can throw for an unrelated reason (caught by the ErrorBoundary
    // below) — either way, fall back to the flat map instead of losing the
    // whole app.
    const handleGlobeUnavailable = useCallback(() => {
        setGlobeView(null);
        setPendingFocus(null);
        setViewMode('flat');
    }, []);

    // Hand the globe the block under the viewport center and the map's current
    // on-screen width so it mounts scale- and position-matched.
    const handoverToGlobe = useCallback((state: { scale: number; positionX: number; positionY: number }) => {
        const { scale, positionX, positionY } = state;
        const centerX = (window.innerWidth / 2 - positionX) / scale - CANVAS_MARGIN;
        const centerY = (window.innerHeight / 2 - positionY) / scale - CANVAS_MARGIN;
        const col = Math.min(GRID_WIDTH - 1, Math.max(0, Math.floor(centerX / BLOCK_SIZE)));
        const row = Math.min(GRID_WIDTH - 1, Math.max(0, Math.floor(centerY / BLOCK_SIZE)));
        setGlobeView({
            blockId: row * GRID_WIDTH + col,
            apparentDiameterPx: CANVAS_RES * scale,
        });
        setPendingFocus(null);
        setViewMode('globe');
    }, []);

    // Handle initial deep-linked block selection. `blocks` gets a new array
    // reference on every background sync, so without this guard the effect
    // would re-fire on every refresh and keep forcing the user back to the
    // deep-linked block/view even after they've closed the sidebar or
    // navigated elsewhere. Applying it once per blockParam value fixes that
    // while still re-applying if the URL's ?block= actually changes.
    const appliedBlockParamRef = useRef<string | null>(null);
    useEffect(() => {
        if (!blockParam || blocks.length === 0) return;
        if (appliedBlockParamRef.current === blockParam) return;

        const id = parseGridBlockId(blockParam);
        if (id !== null && id >= 0 && id < blocks.length) {
            const block = blocks[id];
            if (block) {
                appliedBlockParamRef.current = blockParam;
                setTimeout(() => {
                    setSelectedBlock(block);
                    setSidebarMode('view');
                    setViewMode('flat');
                }, 0);
            }
        }
    }, [blockParam, blocks, setSelectedBlock, setSidebarMode, setViewMode]);

    const getBlockIdFromCanvasEvent = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
        const scaleX = rect.width / CANVAS_RES;
        const scaleY = rect.height / CANVAS_RES;
        const canvasX = (event.clientX - rect.left) / scaleX;
        const canvasY = (event.clientY - rect.top) / scaleY;
        const col = Math.floor(canvasX / BLOCK_SIZE);
        const row = Math.floor(canvasY / BLOCK_SIZE);
        if (col < 0 || col >= GRID_WIDTH || row < 0 || row >= GRID_WIDTH) return null;
        return row * GRID_WIDTH + col;
    }, []);

    const mosaicSelection = useMemo(() => {
        if (mosaicStartId === null) return null;
        return buildMosaicSelection(mosaicStartId, mosaicEndId ?? mosaicHoverId ?? mosaicStartId);
    }, [mosaicEndId, mosaicHoverId, mosaicStartId]);

    const mosaicValidation = useMemo(() => (
        validateMosaicSelection(mosaicSelection, blocks, publicKey?.toBase58())
    ), [blocks, mosaicSelection, publicKey]);

    const resetMosaicSelection = useCallback(() => {
        setMosaicStartId(null);
        setMosaicEndId(null);
        setMosaicHoverId(null);
    }, [setMosaicStartId, setMosaicEndId, setMosaicHoverId]);

    const closeMosaicMode = useCallback(() => {
        setIsMosaicMode(false);
        resetMosaicSelection();
    }, [setIsMosaicMode, resetMosaicSelection]);

    const handleMosaicCanvasClick = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
        event.preventDefault();
        event.stopPropagation();
        const blockId = getBlockIdFromCanvasEvent(event);
        if (blockId === null) return;

        if (mosaicStartId === null || mosaicEndId !== null) {
            setMosaicStartId(blockId);
            setMosaicEndId(null);
            setMosaicHoverId(blockId);
            trackPlausibleEvent("mosaic_selection_started", { block_id: blockId });
            return;
        }

        setMosaicEndId(blockId);
        trackPlausibleEvent("mosaic_selection_changed", {
            block_count: buildMosaicSelection(mosaicStartId, blockId)?.blockIds.length ?? 0,
        });
    }, [getBlockIdFromCanvasEvent, mosaicEndId, mosaicStartId, setMosaicStartId, setMosaicEndId, setMosaicHoverId]);

    const handleMosaicMouseMove = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isMosaicMode || mosaicStartId === null || mosaicEndId !== null) {
            return;
        }
        setMosaicHoverId(getBlockIdFromCanvasEvent(event));
    }, [getBlockIdFromCanvasEvent, isMosaicMode, mosaicEndId, mosaicStartId, setMosaicHoverId]);

    const handleJumpToBlock = useCallback((event?: FormEvent<HTMLFormElement>) => {
        event?.preventDefault();
        const id = parseGridBlockId(jumpBlockInput);
        if (id === null) {
            toast.error(`Enter a block number from 0 to ${GRID_SIZE - 1}.`);
            return;
        }
        const block = blocks[id];
        if (!block) return;
        focusBlockInFlat(id, 'view');
        trackPlausibleEvent("grid_jump_to_block", {
            block_id: id,
            ui_source: isMobileViewport ? "mobile_toolbar" : "grid_toolbar",
        });
    }, [blocks, focusBlockInFlat, isMobileViewport, jumpBlockInput]);

    useGridCanvas({
        canvasRef,
        blocks,
        visibleBounds,
        hoveredBlockId: isMobileViewport ? null : hoveredBlockId,
        mosaicBlockIds: isMosaicMode ? mosaicSelection?.blockIds : undefined,
        selectedBlockId: selectedBlock?.id ?? null,
    });

    const safeHoveredImageUrl = toSafeExternalUrl(hoveredBlock?.imageUrl);
    const hoveredMosaicMetadata = parseMosaicImageUrl(safeHoveredImageUrl);
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
            if (!authenticated || !adapterWallet) {
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
    }, [adapterWallet, authenticated, buyBlock, connected, openWalletModal, queuePendingBuy]);

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
    }, [setShowOnboarding]);

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
            aria-label="Mars Blocs 3D Globe and Map"
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
                    className={styles.toolbarButton}
                    onClick={() => {
                        if (viewMode === 'globe') {
                            setPendingFocus(null);
                            setGlobeView(null);
                            setViewMode('flat');
                        } else if (transformRef.current) {
                            // Mount the globe over the spot currently in view
                            handoverToGlobe(transformRef.current.state);
                        } else {
                            setGlobeView(null);
                            setViewMode('globe');
                        }
                    }}
                >
                    {viewMode === 'globe' ? "2D Map" : "3D Globe"}
                </button>
                {viewMode === 'flat' && (
                    <>
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
                            onClick={() => {
                                // Programmatic zoom never fires onZoomStop, so the
                                // zoomed-all-the-way-out state hands over here instead
                                const ref = transformRef.current;
                                if (!ref) return;
                                if (ref.state.scale <= 0.45) {
                                    handoverToGlobe(ref.state);
                                } else {
                                    ref.zoomOut?.(0.4);
                                }
                            }}
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
                    </>
                )}
            </form>

            {isMosaicMode && (
                <div className={styles.mosaicPanel}>
                    <div>
                        <strong>Mosaic mode</strong>
                        <span>
                            {mosaicSelection
                                ? `${mosaicSelection.width} x ${mosaicSelection.height}, ${mosaicSelection.blockIds.length} blocks`
                                : "Click a start block, then an end block."}
                        </span>
                        {mosaicValidation.invalidReason && mosaicSelection && (
                            <small>{mosaicValidation.invalidReason}</small>
                        )}
                    </div>
                    <div className={styles.mosaicActions}>
                        <button
                            type="button"
                            className={styles.toolbarButton}
                            disabled={!mosaicSelection || !mosaicValidation.isValid}
                            onClick={() => setIsMosaicEditorOpen(true)}
                        >
                            Edit
                        </button>
                        <button type="button" className={styles.toolbarButton} onClick={resetMosaicSelection}>
                            Clear
                        </button>
                        <button type="button" className={styles.toolbarButton} onClick={closeMosaicMode}>
                            Done
                        </button>
                    </div>
                </div>
            )}

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

            {viewMode === 'globe' ? (
                <div key="globe" className={styles.viewFade}>
                    <ErrorBoundary
                        fallback={
                            <div className={styles.globeFallback}>
                                <p>3D view isn&apos;t available in this browser.</p>
                                <button
                                    type="button"
                                    className={`${styles.toolbarButton} ${styles.globeFallbackButton}`}
                                    onClick={handleGlobeUnavailable}
                                >
                                    Use 2D Map
                                </button>
                            </div>
                        }
                    >
                        <MarsGlobe
                            blocks={blocks}
                            selectedBlockId={selectedBlock?.id ?? null}
                            onSelectBlock={handleGlobeSelect}
                            initialView={globeView}
                            onZoomIntoSurface={handleZoomIntoSurface}
                            onWebGLUnavailable={handleGlobeUnavailable}
                        />
                    </ErrorBoundary>
                </div>
            ) : (
                <div key="flat" className={styles.viewFade}>
                <TransformWrapper
                    initialScale={flatMountTransform.scale}
                    initialPositionX={flatMountTransform.positionX}
                    initialPositionY={flatMountTransform.positionY}
                    minScale={0.15}
                    maxScale={10}
                    centerOnInit={!blockParam && pendingFocus === null}
                    limitToBounds={true}
                    wheel={{ step: 0.1 }}
                    panning={{ velocityDisabled: false }}
                    onTransform={(ref) => {
                        scaleRef.current = ref.state.scale;
                        setIsHighRes(prev => (prev ? ref.state.scale > HIGH_RES_OFF : ref.state.scale >= HIGH_RES_ON));
                        updateVisibility(ref.state.scale, ref.state.positionX, ref.state.positionY);
                    }}
                    onZoomStop={(ref) => {
                        // Switch to the globe only once the gesture settles, never mid-pinch
                        if (ref.state.scale < GLOBE_SWITCH_SCALE) {
                            handoverToGlobe(ref.state);
                        }
                    }}
                    onInit={(ref) => {
                        transformRef.current = ref;
                        scaleRef.current = ref.state.scale;
                        setIsHighRes(ref.state.scale >= HIGH_RES_ON);
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
                                    imageRendering: isHighRes ? 'pixelated' : 'auto',
                                }}
                                onClick={handleCanvasClick}
                                onMouseDown={isMosaicMode ? (event) => event.stopPropagation() : undefined}
                                onClickCapture={isMosaicMode ? handleMosaicCanvasClick : undefined}
                                onMouseMove={(event) => {
                                    if (isMosaicMode) {
                                        handleMosaicMouseMove(event);
                                        return;
                                    }
                                    handleMouseMove(event);
                                }}
                                onMouseLeave={handleMouseLeave}
                                tabIndex={0}
                                aria-label="Interactive block grid. Use mouse to pan/zoom, or click a block to view details."
                                onKeyDown={handleKeyDown}
                                className={styles.canvas}
                            />
                            {highResOverlays.map(({ block, col, row }) => (
                                // User-supplied external images; next/image optimization
                                // is not applicable to arbitrary hosts here.
                                // eslint-disable-next-line @next/next/no-img-element
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
                                        objectFit: parseMosaicImageUrl(block.imageUrl) ? 'fill' : 'cover',
                                        pointerEvents: 'none',
                                        userSelect: 'none',
                                    }}
                                />
                            ))}
                        </div>
                    </TransformComponent>
                </TransformWrapper>
                </div>
            )}

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
                    {hoveredMosaicMetadata ? (
                        <MosaicPreview
                            alt={`Mosaic containing block ${hoveredBlock.id}`}
                            metadata={hoveredMosaicMetadata}
                            variant="hover"
                        />
                    ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        safeHoveredImageUrl && <img src={safeHoveredImageUrl} alt="" className={styles.cardImage} />
                    )}
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
                            focusBlockInFlat(freshBlock.id, 'edit');
                        }
                        setSuccessBlock(null);
                    }
                }}
            />

            <MyBlocksList
                blocks={ownedBlocks}
                isWalletConnected={Boolean(publicKey)}
                onCreateMosaic={() => {
                    if (!publicKey) {
                        openWalletModal("unknown");
                        return;
                    }
                    setIsMosaicMode(true);
                    resetMosaicSelection();
                }}
                onSelectBlock={(block) => {
                    trackPlausibleEvent("owned_block_selected", {
                        block_id: block.id,
                        ui_source: "my_blocks_list",
                        is_for_sale: block.isForSale,
                    });
                    focusBlockInFlat(block.id, 'edit');
                }}
            />

            {viewingOwner && (
                <div className={styles.ownerViewerSlot}>
                    <MyBlocksList
                        blocks={viewingOwnerBlocks}
                        title={`Blocks by ${viewingOwner.slice(0, 4)}...${viewingOwner.slice(-4)}`}
                        onClear={() => setViewingOwner(null)}
                        onSelectBlock={(block) => focusBlockInFlat(block.id, 'view')}
                    />
                </div>
            )}

            <OnboardingModal isOpen={showOnboarding} onClose={handleCloseOnboarding} />
            <MosaicEditorModal
                isOpen={isMosaicEditorOpen}
                onClose={() => {
                    setIsMosaicEditorOpen(false);
                    closeMosaicMode();
                }}
                selection={mosaicValidation.isValid ? mosaicSelection : null}
            />
        </div>
    );
};
