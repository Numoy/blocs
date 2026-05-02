import type { BlockData } from "@/types";
import { GRID_SIZE, GRID_WIDTH } from "@/utils/constants";

export const MOSAIC_MAX_BLOCKS = 25;

export type MosaicSelection = {
    blockIds: number[];
    endId: number;
    height: number;
    startId: number;
    width: number;
};

export type MosaicSelectionValidation = {
    invalidReason: string | null;
    isValid: boolean;
    missingBlockIds: number[];
    notOwnedBlockIds: number[];
    tooLarge: boolean;
};

const getRow = (id: number): number => Math.floor(id / GRID_WIDTH);
const getCol = (id: number): number => id % GRID_WIDTH;

export const isValidGridBlockId = (id: number): boolean => (
    Number.isInteger(id) && id >= 0 && id < GRID_SIZE
);

export const buildMosaicSelection = (startId: number, endId: number): MosaicSelection | null => {
    if (!isValidGridBlockId(startId) || !isValidGridBlockId(endId)) {
        return null;
    }

    const startRow = getRow(startId);
    const endRow = getRow(endId);
    const startCol = getCol(startId);
    const endCol = getCol(endId);
    const minRow = Math.min(startRow, endRow);
    const maxRow = Math.max(startRow, endRow);
    const minCol = Math.min(startCol, endCol);
    const maxCol = Math.max(startCol, endCol);
    const width = maxCol - minCol + 1;
    const height = maxRow - minRow + 1;
    const blockIds: number[] = [];

    for (let row = minRow; row <= maxRow; row += 1) {
        for (let col = minCol; col <= maxCol; col += 1) {
            blockIds.push(row * GRID_WIDTH + col);
        }
    }

    return {
        blockIds,
        endId,
        height,
        startId,
        width,
    };
};

export const validateMosaicSelection = (
    selection: MosaicSelection | null,
    blocks: BlockData[],
    owner: string | null | undefined,
): MosaicSelectionValidation => {
    if (!selection) {
        return {
            invalidReason: "Select a rectangle on the grid.",
            isValid: false,
            missingBlockIds: [],
            notOwnedBlockIds: [],
            tooLarge: false,
        };
    }

    const tooLarge = selection.blockIds.length > MOSAIC_MAX_BLOCKS;
    const missingBlockIds = selection.blockIds.filter((id) => !blocks[id]);
    const notOwnedBlockIds = selection.blockIds.filter((id) => blocks[id]?.owner !== owner);
    let invalidReason: string | null = null;

    if (tooLarge) {
        invalidReason = `Select ${MOSAIC_MAX_BLOCKS} blocks or fewer.`;
    } else if (!owner) {
        invalidReason = "Connect a wallet to create a mosaic.";
    } else if (missingBlockIds.length > 0) {
        invalidReason = "Some selected blocks are not loaded yet.";
    } else if (notOwnedBlockIds.length > 0) {
        invalidReason = "Every selected block must be owned by your wallet.";
    }

    return {
        invalidReason,
        isValid: invalidReason === null,
        missingBlockIds,
        notOwnedBlockIds,
        tooLarge,
    };
};
