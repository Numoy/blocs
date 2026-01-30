export const parseColor = (arr: number[]): string => {
    if (arr.length < 3) return "#ffffff";
    const r = arr[0].toString(16).padStart(2, '0');
    const g = arr[1].toString(16).padStart(2, '0');
    const b = arr[2].toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
};

export const hexToRgb = (hex: string): [number, number, number] => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16)
    ] : [255, 255, 255];
};
