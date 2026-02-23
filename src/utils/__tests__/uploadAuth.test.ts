import { describe, expect, it } from "vitest";
import { buildUploadAuthMessage } from "@/utils/uploadAuth";

describe("buildUploadAuthMessage", () => {
    it("builds deterministic message payload", () => {
        const message = buildUploadAuthMessage({
            blockId: 42,
            owner: "9xQeWvG816bUx9EPfLQfY2yXq8Yj8v7FpC18mU6Hf5Dg",
            timestamp: 1_700_000_000_000,
        });

        expect(message).toBe(
            "blocs-upload-v1:42:9xQeWvG816bUx9EPfLQfY2yXq8Yj8v7FpC18mU6Hf5Dg:1700000000000"
        );
    });
});
