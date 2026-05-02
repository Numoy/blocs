import { describe, expect, it } from "vitest";
import { getMosaicTileBlockId, getMosaicTileUrl, parseMosaicImageUrl } from "@/utils/mosaicImage";

describe("mosaic image metadata", () => {
    it("parses self-describing mosaic slice URLs", () => {
        const metadata = parseMosaicImageUrl("https://cdn.example.com/mosaic_group-1_3x3_4_202.webp");
        expect(metadata).toMatchObject({
            blockId: 202,
            groupId: "group-1",
            height: 3,
            index: 4,
            startId: 101,
            width: 3,
        });
    });

    it("reconstructs sibling tile URLs and block ids", () => {
        const metadata = parseMosaicImageUrl("https://cdn.example.com/mosaic_group-1_3x3_4_202.webp");
        expect(metadata).not.toBeNull();
        expect(getMosaicTileBlockId(metadata!, 0)).toBe(101);
        expect(getMosaicTileUrl(metadata!, 8)).toBe("https://cdn.example.com/mosaic_group-1_3x3_8_303.webp");
    });

    it("ignores old slice URLs without mosaic dimensions", () => {
        expect(parseMosaicImageUrl("https://cdn.example.com/mosaic_101_owner_123_abcd.webp")).toBeNull();
    });
});
