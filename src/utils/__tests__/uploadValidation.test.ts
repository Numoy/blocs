import { describe, expect, it } from "vitest";
import {
    doesMimeMatchDetectedFormat,
    isAllowedDetectedImageFormat,
    isAllowedUploadMimeType,
} from "@/utils/uploadValidation";

describe("uploadValidation", () => {
    it("allows only configured upload MIME types", () => {
        expect(isAllowedUploadMimeType("image/png")).toBe(true);
        expect(isAllowedUploadMimeType("image/jpeg")).toBe(true);
        expect(isAllowedUploadMimeType("text/plain")).toBe(false);
    });

    it("validates detected image formats", () => {
        expect(isAllowedDetectedImageFormat("png")).toBe(true);
        expect(isAllowedDetectedImageFormat("jpeg")).toBe(true);
        expect(isAllowedDetectedImageFormat("svg")).toBe(false);
        expect(isAllowedDetectedImageFormat(undefined)).toBe(false);
    });

    it("detects MIME/content mismatches", () => {
        expect(doesMimeMatchDetectedFormat("image/png", "png")).toBe(true);
        expect(doesMimeMatchDetectedFormat("image/png", "jpeg")).toBe(false);
        expect(doesMimeMatchDetectedFormat("text/plain", "png")).toBe(false);
    });
});
