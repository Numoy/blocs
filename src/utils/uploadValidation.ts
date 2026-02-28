const ALLOWED_MIME_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;
type UploadMimeType = (typeof ALLOWED_MIME_TYPES)[number];

const MIME_TO_FORMAT: Record<UploadMimeType, "png" | "jpeg" | "gif" | "webp"> = {
    "image/png": "png",
    "image/jpeg": "jpeg",
    "image/gif": "gif",
    "image/webp": "webp",
};

const ALLOWED_IMAGE_FORMATS = new Set(Object.values(MIME_TO_FORMAT));
const ALLOWED_MIME_TYPE_SET = new Set(ALLOWED_MIME_TYPES);

export const isAllowedUploadMimeType = (value: string): value is UploadMimeType => {
    return ALLOWED_MIME_TYPE_SET.has(value as UploadMimeType);
};

export const isAllowedDetectedImageFormat = (value: string | undefined): boolean => {
    if (!value) return false;
    return ALLOWED_IMAGE_FORMATS.has(value.toLowerCase() as "png" | "jpeg" | "gif" | "webp");
};

export const doesMimeMatchDetectedFormat = (mimeType: string, detectedFormat: string): boolean => {
    if (!isAllowedUploadMimeType(mimeType)) {
        return false;
    }
    return MIME_TO_FORMAT[mimeType] === detectedFormat.toLowerCase();
};
