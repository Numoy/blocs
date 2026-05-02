export interface UploadAuthPayload {
    blockId: number;
    owner: string;
    timestamp: number;
}

export interface MosaicUploadAuthPayload {
    blockIds: number[];
    height: number;
    owner: string;
    timestamp: number;
    width: number;
}

export const UPLOAD_AUTH_MAX_AGE_MS = 5 * 60 * 1000;

export const buildUploadAuthMessage = ({ blockId, owner, timestamp }: UploadAuthPayload): string => {
    return `blocs-upload-v1:${blockId}:${owner}:${timestamp}`;
};

export const buildMosaicUploadAuthMessage = ({
    blockIds,
    height,
    owner,
    timestamp,
    width,
}: MosaicUploadAuthPayload): string => {
    return `blocs-mosaic-upload-v1:${blockIds.join(",")}:${width}x${height}:${owner}:${timestamp}`;
};
