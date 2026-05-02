import { describe, expect, it } from "vitest";
import { buildMosaicSelection, validateMosaicSelection } from "@/utils/mosaic";
import type { BlockData } from "@/types";

const makeBlock = (id: number, owner: string | null): BlockData => ({
    id,
    owner,
    image: null,
    imageUrl: "",
    isForSale: false,
    price: null,
    text: "",
    url: "",
});

describe("mosaic utilities", () => {
    it("builds block ids in row-major order for a rectangle", () => {
        const selection = buildMosaicSelection(101, 303);
        expect(selection).toMatchObject({
            blockIds: [101, 102, 103, 201, 202, 203, 301, 302, 303],
            height: 3,
            width: 3,
        });
    });

    it("normalizes reversed rectangle corners", () => {
        expect(buildMosaicSelection(303, 101)?.blockIds).toEqual([
            101, 102, 103, 201, 202, 203, 301, 302, 303,
        ]);
    });

    it("rejects selections with blocks not owned by the wallet", () => {
        const owner = "owner";
        const blocks = Array.from({ length: 10_000 }, (_, id) => makeBlock(id, owner));
        blocks[102] = makeBlock(102, "someone-else");
        const validation = validateMosaicSelection(buildMosaicSelection(101, 102), blocks, owner);
        expect(validation.isValid).toBe(false);
        expect(validation.notOwnedBlockIds).toEqual([102]);
    });

    it("rejects selections over the v1 size cap", () => {
        const blocks = Array.from({ length: 10_000 }, (_, id) => makeBlock(id, "owner"));
        const validation = validateMosaicSelection(buildMosaicSelection(0, 25), blocks, "owner");
        expect(validation.isValid).toBe(false);
        expect(validation.tooLarge).toBe(true);
    });
});
