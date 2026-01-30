import { useState, useCallback, useRef } from 'react';
import { BlockData } from '@/types';

interface UseGridInteractionProps {
    canvasRef: React.RefObject<HTMLCanvasElement | null>;
    blocks: BlockData[];
    CANVAS_RES: number;
}

export const useGridInteraction = ({ canvasRef, blocks, CANVAS_RES }: UseGridInteractionProps) => {
    const [selectedBlock, setSelectedBlock] = useState<BlockData | null>(null);
    const [hoveredBlock, setHoveredBlock] = useState<BlockData | null>(null);
    const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
    const [sidebarMode, setSidebarMode] = useState<'view' | 'edit'>('view');
    const dragStart = useRef({ x: 0, y: 0 });

    const getBlockFromEvent = useCallback((e: React.MouseEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return null;

        const rect = canvas.getBoundingClientRect();

        const scaleX = rect.width / CANVAS_RES;
        const scaleY = rect.height / CANVAS_RES;

        const canvasX = (e.clientX - rect.left) / scaleX;
        const canvasY = (e.clientY - rect.top) / scaleY;

        const GRID_WIDTH = blocks.length <= 100 ? 5 : 100;
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
            setSelectedBlock(block);
            setSidebarMode('view');
            setHoveredBlock(null);
        }
    }, [getBlockFromEvent]);

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

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        dragStart.current = { x: e.clientX, y: e.clientY };
    }, []);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;

        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();

            if (!selectedBlock && blocks.length > 0) {
                setSelectedBlock(blocks[0]);
                return;
            }

            if (selectedBlock) {
                const GRID_WIDTH = blocks.length <= 100 ? 5 : 100;
                let newId = selectedBlock.id;
                const currentIndex = selectedBlock.id - 1;

                if (e.key === 'ArrowRight') {
                    if ((currentIndex + 1) % GRID_WIDTH !== 0) newId += 1;
                } else if (e.key === 'ArrowLeft') {
                    if (currentIndex % GRID_WIDTH !== 0) newId -= 1;
                } else if (e.key === 'ArrowDown') {
                    if (currentIndex + GRID_WIDTH < blocks.length) newId += GRID_WIDTH;
                } else if (e.key === 'ArrowUp') {
                    if (currentIndex - GRID_WIDTH >= 0) newId -= GRID_WIDTH;
                }

                if (newId !== selectedBlock.id && newId > 0 && newId <= blocks.length) {
                    setSelectedBlock(blocks[newId - 1]);
                    setSidebarMode('view');
                }
            }
        }
    }, [selectedBlock, blocks]);

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
