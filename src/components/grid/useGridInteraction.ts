import { useState, useCallback, useRef, useMemo } from 'react';
import { BlockData } from '@/types';
import { GRID_WIDTH, CANVAS_RES, BLOCK_SIZE } from '@/utils/constants';
import { trackPlausibleEvent } from '@/utils/analytics';

interface UseGridInteractionProps {
    canvasRef: React.RefObject<HTMLCanvasElement | null>;
    blocks: BlockData[];
    onBlockSelect?: (blockId: number) => void;
}

export const useGridInteraction = ({ canvasRef, blocks, onBlockSelect }: UseGridInteractionProps) => {
    const [selectedBlockId, setSelectedBlockId] = useState<number | null>(null);
    const [hoveredBlockId, setHoveredBlockId] = useState<number | null>(null);
    const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
    const [sidebarMode, setSidebarMode] = useState<'view' | 'edit'>('view');
    const dragStart = useRef({ x: 0, y: 0 });

    const selectedBlock = useMemo(() => {
        if (selectedBlockId === null) return null;
        return blocks[selectedBlockId] ?? null;
    }, [blocks, selectedBlockId]);

    const hoveredBlock = useMemo(() => {
        if (hoveredBlockId === null) return null;
        return blocks[hoveredBlockId] ?? null;
    }, [blocks, hoveredBlockId]);

    const setSelectedBlock = useCallback((block: BlockData | null) => {
        setSelectedBlockId(block ? block.id : null);
    }, []);

    const getBlockFromEvent = useCallback((e: React.MouseEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return null;

        const rect = canvas.getBoundingClientRect();

        const scaleX = rect.width / CANVAS_RES;
        const scaleY = rect.height / CANVAS_RES;

        const canvasX = (e.clientX - rect.left) / scaleX;
        const canvasY = (e.clientY - rect.top) / scaleY;

        const col = Math.floor(canvasX / BLOCK_SIZE);
        const row = Math.floor(canvasY / BLOCK_SIZE);

        if (col < 0 || col >= GRID_WIDTH || row < 0 || row >= GRID_WIDTH) return null;

        const index = row * GRID_WIDTH + col;
        return blocks[index];
    }, [blocks, canvasRef]);

    const handleCanvasClick = useCallback((e: React.MouseEvent) => {
        const dx = e.clientX - dragStart.current.x;
        const dy = e.clientY - dragStart.current.y;
        if (Math.sqrt(dx * dx + dy * dy) > 5) return; // Drag ignored

        const block = getBlockFromEvent(e);
        if (block) {
            trackPlausibleEvent("grid_block_selected", {
                block_id: block.id,
                ui_source: "canvas_click",
                is_for_sale: block.isForSale,
                has_owner: Boolean(block.owner),
            });
            setSelectedBlockId(block.id);
            setSidebarMode('view');
            setHoveredBlockId(null);
        }
    }, [getBlockFromEvent]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        const block = getBlockFromEvent(e);
        if (block) {
            setHoveredBlockId(block.id);
            setCursorPos({ x: e.clientX, y: e.clientY });
        } else {
            setHoveredBlockId(null);
        }
    }, [getBlockFromEvent]);

    const handleMouseLeave = useCallback(() => {
        setHoveredBlockId(null);
    }, []);

    const handleCloseSidebar = useCallback(() => {
        setSelectedBlockId(null);
    }, []);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        dragStart.current = { x: e.clientX, y: e.clientY };
    }, []);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;

        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();

            if (selectedBlockId === null && blocks.length > 0) {
                setSelectedBlockId(blocks[0].id);
                return;
            }

            if (selectedBlockId !== null) {
                let newId = selectedBlockId;

                if (e.key === 'ArrowRight') {
                    if ((selectedBlockId + 1) % GRID_WIDTH !== 0) newId += 1;
                } else if (e.key === 'ArrowLeft') {
                    if (selectedBlockId % GRID_WIDTH !== 0) newId -= 1;
                } else if (e.key === 'ArrowDown') {
                    if (selectedBlockId + GRID_WIDTH < blocks.length) newId += GRID_WIDTH;
                } else if (e.key === 'ArrowUp') {
                    if (selectedBlockId - GRID_WIDTH >= 0) newId -= GRID_WIDTH;
                }

                if (newId !== selectedBlockId && newId >= 0 && newId < blocks.length) {
                    const selected = blocks[newId];
                    if (selected) {
                        trackPlausibleEvent("grid_block_selected", {
                            block_id: selected.id,
                            ui_source: "keyboard_nav",
                            is_for_sale: selected.isForSale,
                            has_owner: Boolean(selected.owner),
                        });
                    }
                    setSelectedBlockId(newId);
                    setSidebarMode('view');
                    onBlockSelect?.(newId);
                }
            }
        }
    }, [selectedBlockId, blocks, onBlockSelect]);

    return {
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
        handleCloseSidebar
    };
};
