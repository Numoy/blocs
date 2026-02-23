export const utf8ByteLength = (value: string): number => {
    return new TextEncoder().encode(value).length;
};

export const fitsUtf8Bytes = (value: string, maxBytes: number): boolean => {
    return utf8ByteLength(value) <= maxBytes;
};
