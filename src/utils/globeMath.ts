import { GRID_WIDTH } from '@/utils/constants';
import { BlockData } from '@/types';
import { parseMosaicImageUrl, MosaicImageMetadata } from '@/utils/mosaicImage';
import { toSafeExternalUrl } from '@/utils/url';

export interface Vec3 {
    x: number;
    y: number;
    z: number;
}

// Direction from globe center for texture coordinates (u across, v from top).
// Derived from THREE.SphereGeometry's vertex formula so it inverts the same
// UV mapping the raycast click handling reads (col = floor(uv.x * 100)):
//   x = -cos(2π·u)·sin(π·v), y = cos(π·v), z = sin(2π·u)·sin(π·v)
// Pure/framework-free (no THREE dependency) so it's testable without WebGL;
// callers wrap the result in `new THREE.Vector3(v.x, v.y, v.z)`.
export const directionFromUV = (u: number, v: number): Vec3 => {
    const azimuth = 2 * Math.PI * u;
    const polar = Math.PI * v;
    return {
        x: -Math.cos(azimuth) * Math.sin(polar),
        y: Math.cos(polar),
        z: Math.sin(azimuth) * Math.sin(polar),
    };
};

export const blockDirection = (blockId: number): Vec3 =>
    directionFromUV(
        ((blockId % GRID_WIDTH) + 0.5) / GRID_WIDTH,
        (Math.floor(blockId / GRID_WIDTH) + 0.5) / GRID_WIDTH
    );

export interface BillboardGroup {
    /** Top-left block of the group (the mosaic's startId, or the block itself). */
    anchorId: number;
    cols: number;
    rows: number;
    centerU: number;
    centerV: number;
    mosaic: MosaicImageMetadata | null;
    /** The image URL used to look up a loaded tile (single-image parcels only). */
    safeUrl: string;
}

// Groups owned, imaged blocks into billboard-worthy units: mosaics collapse
// to one group per groupId (first occurrence wins ordering), single images
// are their own group. Capped at `max` groups so the globe never accumulates
// unbounded 3D sprites as colonization grows.
export const groupBillboards = (blocks: BlockData[], max: number): BillboardGroup[] => {
    const groups: BillboardGroup[] = [];
    const seenGroups = new Set<string>();

    for (const block of blocks) {
        if (groups.length >= max) break;
        if (!block.owner || !block.imageUrl) continue;
        const safeUrl = toSafeExternalUrl(block.imageUrl);
        if (!safeUrl) continue;

        const mosaic = parseMosaicImageUrl(safeUrl);
        if (mosaic) {
            if (seenGroups.has(mosaic.groupId)) continue;
            seenGroups.add(mosaic.groupId);
            const startCol = mosaic.startId % GRID_WIDTH;
            const startRow = Math.floor(mosaic.startId / GRID_WIDTH);
            groups.push({
                anchorId: mosaic.startId,
                cols: mosaic.width,
                rows: mosaic.height,
                centerU: (startCol + mosaic.width / 2) / GRID_WIDTH,
                centerV: (startRow + mosaic.height / 2) / GRID_WIDTH,
                mosaic,
                safeUrl,
            });
        } else {
            groups.push({
                anchorId: block.id,
                cols: 1,
                rows: 1,
                centerU: ((block.id % GRID_WIDTH) + 0.5) / GRID_WIDTH,
                centerV: (Math.floor(block.id / GRID_WIDTH) + 0.5) / GRID_WIDTH,
                mosaic: null,
                safeUrl,
            });
        }
    }

    return groups;
};

// Whether a block falls within a billboard group's footprint (used to decide
// if the group's card should render with the selected-parcel border).
export const isBlockInGroup = (group: BillboardGroup, blockId: number | null): boolean => {
    if (blockId === null) return false;
    if (!group.mosaic) return group.anchorId === blockId;
    const startCol = group.anchorId % GRID_WIDTH;
    const startRow = Math.floor(group.anchorId / GRID_WIDTH);
    const col = blockId % GRID_WIDTH;
    const row = Math.floor(blockId / GRID_WIDTH);
    return col >= startCol && col < startCol + group.cols && row >= startRow && row < startRow + group.rows;
};

export interface CardSize {
    width: number;
    height: number;
}

// Billboard card pixel dimensions for a group's aspect ratio, capped to `base`
// on the long edge so single-tile and wide/tall mosaics all render crisply.
export const billboardCardSize = (cols: number, rows: number, base = 256): CardSize => {
    const aspect = cols / rows;
    return aspect >= 1
        ? { width: base, height: Math.round(base / aspect) }
        : { width: Math.round(base * aspect), height: base };
};
