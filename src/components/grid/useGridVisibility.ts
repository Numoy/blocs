import { useState, useCallback, useMemo } from 'react';
import debounce from 'lodash/debounce';

export interface VisibleBounds {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
}

interface UseGridVisibilityProps {
    canvasRes: number;
    margin: number;
}

export const useGridVisibility = ({ canvasRes, margin }: UseGridVisibilityProps) => {
    // Default to a reasonable initial viewport (e.g. 1920x1080 at scale 1)
    // to avoid loading EVERYTHING if the hook runs before layout.
    // Ideally, we start with 0 and let onInit set it, but that might cause a flash.
    const [visibleBounds, setVisibleBounds] = useState<VisibleBounds>({
        minX: 0,
        maxX: 1920,
        minY: 0,
        maxY: 1080
    });

    const updateVisibility = useCallback((scale: number, positionX: number, positionY: number) => {
        // Viewport dimensions (browser window)
        // Check availability of window
        if (typeof window === 'undefined') return;

        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        // Transform formula:
        // ScreenCoord = (CanvasCoord + Margin) * Scale + Position
        // CanvasCoord = (ScreenCoord - Position) / Scale - Margin

        const minScreenX = 0;
        const maxScreenX = viewportWidth;
        const minScreenY = 0;
        const maxScreenY = viewportHeight;

        const minCanvasX = (minScreenX - positionX) / scale - margin;
        const maxCanvasX = (maxScreenX - positionX) / scale - margin;
        const minCanvasY = (minScreenY - positionY) / scale - margin;
        const maxCanvasY = (maxScreenY - positionY) / scale - margin;

        const newBounds = {
            minX: Math.max(0, Math.floor(minCanvasX)),
            maxX: Math.min(canvasRes, Math.ceil(maxCanvasX)),
            minY: Math.max(0, Math.floor(minCanvasY)),
            maxY: Math.min(canvasRes, Math.ceil(maxCanvasY)),
        };

        setVisibleBounds(newBounds);
    }, [canvasRes, margin]);

    // Re-create debounced function only if updateVisibility changes (which depends on props)
    // This is safe.
    const debouncedUpdate = useMemo(() => debounce(updateVisibility, 100), [updateVisibility]);

    return {
        visibleBounds,
        updateVisibility: debouncedUpdate
    };
};
