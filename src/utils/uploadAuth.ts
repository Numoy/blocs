export interface UploadAuthPayload {
    blockId: number;
    owner: string;
    timestamp: number;
}

export const UPLOAD_AUTH_MAX_AGE_MS = 5 * 60 * 1000;

export const buildUploadAuthMessage = ({ blockId, owner, timestamp }: UploadAuthPayload): string => {
    return `blocs-upload-v1:${blockId}:${owner}:${timestamp}`;
};
