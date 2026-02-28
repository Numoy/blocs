// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

const importRoute = async ({ uploadConfigured = true }: { uploadConfigured?: boolean } = {}) => {
    vi.resetModules();

    vi.doMock("@/utils/s3", () => ({
        getBucketName: vi.fn(() => {
            if (!uploadConfigured) {
                throw new Error("missing bucket");
            }
            return "blocs-storage";
        }),
        getS3Client: vi.fn(() => {
            if (!uploadConfigured) {
                throw new Error("missing s3 client");
            }
            return {} as unknown;
        }),
    }));

    vi.doMock("@/utils/rpc", () => ({
        normalizeRpcEndpoint: (value?: string | null) => value ?? null,
        resolveSolanaRpcEndpoint: (serverRpc?: string | null, publicRpc?: string | null) => serverRpc ?? publicRpc ?? null,
        inferRpcCluster: () => "devnet",
    }));

    return import("@/app/api/health/route");
};

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    process.env = { ...ORIGINAL_ENV };
});

describe("health route build metadata", () => {
    it("returns deployment identity fields when provided", async () => {
        vi.stubEnv("BLOCS_BUILD_COMMIT_SHA", "abc123");
        vi.stubEnv("BLOCS_BUILD_TAG", "v1.2.3");
        vi.stubEnv("BLOCS_IMAGE_DIGEST", "sha256:deadbeef");
        vi.stubEnv("NEXT_PUBLIC_SOLANA_RPC_URL", "https://api.devnet.solana.com");

        const { GET } = await importRoute();
        const response = await GET();
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.build).toEqual({
            commitSha: "abc123",
            tag: "v1.2.3",
            imageDigest: "sha256:deadbeef",
            metadataPresent: true,
        });
    });

    it("returns null identity fields when deployment metadata is absent", async () => {
        vi.stubEnv("NEXT_PUBLIC_SOLANA_RPC_URL", "https://api.devnet.solana.com");

        const { GET } = await importRoute();
        const response = await GET();
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.build).toEqual({
            commitSha: null,
            tag: null,
            imageDigest: null,
            metadataPresent: false,
        });
    });
});
