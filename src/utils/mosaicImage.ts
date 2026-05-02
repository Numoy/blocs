import { GRID_WIDTH } from "@/utils/constants";

export type MosaicImageMetadata = {
    blockId: number;
    groupId: string;
    height: number;
    index: number;
    startId: number;
    url: string;
    width: number;
};

const MOSAIC_FILENAME_PATTERN = /^mosaic_([a-zA-Z0-9-]+)_(\d+)x(\d+)_(\d+)_(\d+)\.webp$/;

export const parseMosaicImageUrl = (url: string | null | undefined): MosaicImageMetadata | null => {
    if (!url) return null;

    let filename = "";
    try {
        const parsed = new URL(url);
        filename = decodeURIComponent(parsed.pathname.split("/").pop() || "");
    } catch {
        filename = decodeURIComponent(url.split("/").pop() || "");
    }

    const match = filename.match(MOSAIC_FILENAME_PATTERN);
    if (!match) return null;

    const [, groupId, widthRaw, heightRaw, indexRaw, blockIdRaw] = match;
    const width = Number(widthRaw);
    const height = Number(heightRaw);
    const index = Number(indexRaw);
    const blockId = Number(blockIdRaw);

    if (
        !Number.isInteger(width) ||
        !Number.isInteger(height) ||
        !Number.isInteger(index) ||
        !Number.isInteger(blockId) ||
        width < 1 ||
        height < 1 ||
        index < 0 ||
        index >= width * height
    ) {
        return null;
    }

    const rowOffset = Math.floor(index / width);
    const colOffset = index % width;
    const startId = blockId - rowOffset * GRID_WIDTH - colOffset;
    if (startId < 0 || startId % GRID_WIDTH + width > GRID_WIDTH) {
        return null;
    }

    return {
        blockId,
        groupId,
        height,
        index,
        startId,
        url,
        width,
    };
};

export const getMosaicTileBlockId = (metadata: MosaicImageMetadata, index: number): number => {
    const row = Math.floor(index / metadata.width);
    const col = index % metadata.width;
    return metadata.startId + row * GRID_WIDTH + col;
};

export const getMosaicTileUrl = (metadata: MosaicImageMetadata, index: number): string => {
    const blockId = getMosaicTileBlockId(metadata, index);
    const currentSuffix = `_${metadata.index}_${metadata.blockId}.webp`;
    const nextSuffix = `_${index}_${blockId}.webp`;
    return metadata.url.replace(currentSuffix, nextSuffix);
};
