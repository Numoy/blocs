import { GRID_SIZE } from "@/utils/constants";

export const parseNonNegativeIntegerString = (value: string): number | null => {
    if (!/^\d+$/.test(value)) {
        return null;
    }

    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) {
        return null;
    }

    return parsed;
};

export const parseGridBlockId = (value: string): number | null => {
    const parsed = parseNonNegativeIntegerString(value);
    if (parsed === null || parsed >= GRID_SIZE) {
        return null;
    }

    return parsed;
};
