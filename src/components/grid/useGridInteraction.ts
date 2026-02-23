import { useState, useCallback, useRef, useMemo } from 'react';
import { BlockData } from '@/types';
import { GRID_WIDTH } from '@/utils/constants';

interface UseGridInteractionProps {
    canvasRef: React.RefObject<HTMLCanvasElement | null>;
    blocks: BlockData[];
    CANVAS_RES: number;
}

export const useGridInteraction = ({ canvasRef, blocks, CANVAS_RES }: UseGridInteractionProps) => {
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

        const BLOCK_SIZE = CANVAS_RES / GRID_WIDTH;

        const col = Math.floor(canvasX / BLOCK_SIZE);
        const row = Math.floor(canvasY / BLOCK_SIZE);

        if (col < 0 || col >= GRID_WIDTH || row < 0 || row >= GRID_WIDTH) return null;

        const index = row * GRID_WIDTH + col;
        return blocks[index];
    }, [blocks, CANVAS_RES, canvasRef]);

    const handleCanvasClick = useCallback((e: React.MouseEvent) => {
        const dx = e.clientX - dragStart.current.x;
        const dy = e.clientY - dragStart.current.y;
        if (Math.sqrt(dx * dx + dy * dy) > 5) return; // Drag ignored

        const block = getBlockFromEvent(e);
        if (block) {
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
                    setSelectedBlockId(newId);
                    setSidebarMode('view');
                }
            }
        }
    }, [selectedBlockId, blocks]);

    return {
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
    };
};
