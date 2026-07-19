// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

type ImportPageOptions = {
    blockFetchResult?: {
        id: number;
        text: number[];
        imageUrl: number[];
        owner: { toBase58: () => string };
    } | null;
};

const toFixedBytes = (value: string, size: number): number[] => {
    const output = new Array<number>(size).fill(0);
    const source = Buffer.from(value, "utf-8");
    const copyLength = Math.min(size, source.length);
    for (let index = 0; index < copyLength; index += 1) {
        output[index] = source[index];
    }
    return output;
};

const importPage = async ({ blockFetchResult = null }: ImportPageOptions = {}) => {
    vi.resetModules();

    const fetchBlockMock = vi.fn();
    if (blockFetchResult) {
        fetchBlockMock.mockResolvedValue(blockFetchResult);
    } else {
        fetchBlockMock.mockRejectedValue(new Error("account does not exist"));
    }

    vi.doMock("@coral-xyz/anchor", () => {
        class BN {
            private readonly value: number;

            constructor(value: number) {
                this.value = Number(value);
            }

            toArray(_endian: "le" | "be", length: number): number[] {
                const bytes = new Array<number>(length).fill(0);
                let remaining = this.value;
                for (let index = 0; index < length; index += 1) {
                    bytes[index] = remaining & 255;
                    remaining = Math.floor(remaining / 256);
                }
                return bytes;
            }
        }

        class Program {
            account = {
                block: {
                    fetch: fetchBlockMock,
                },
            };
        }

        class AnchorProvider {}

        return { BN, Program, AnchorProvider };
    });

    vi.doMock("@solana/web3.js", () => {
        class PublicKey {
            static default = new PublicKey("11111111111111111111111111111111");
            private readonly value: string;

            constructor(value: string | Uint8Array) {
                this.value = typeof value === "string" ? value : Buffer.from(value).toString("hex");
            }

            toBase58(): string {
                return this.value;
            }

            static findProgramAddressSync(): [PublicKey, number] {
                return [new PublicKey("mockPda11111111111111111111111111111111"), 255];
            }
        }

        class Connection {}
        class Transaction {}
        class VersionedTransaction {}

        return { PublicKey, Connection, Transaction, VersionedTransaction };
    });

    vi.doMock("@/utils/programTypes", () => ({
        asBlocsProgram: (program: unknown) => program,
    }));

    vi.doMock("@/utils/constants", () => ({
        GRID_SIZE: 10000,
        PROGRAM_ID: { toBase58: () => "mockProgram11111111111111111111111111111111" },
    }));

    vi.doMock("@/utils/rpc", () => ({
        resolveSolanaRpcEndpoint: () => "https://api.devnet.solana.com",
    }));

    vi.doMock("next/cache", () => ({
        unstable_cache: <TArgs extends unknown[], TResult>(fn: (...args: TArgs) => TResult) => fn,
    }));

    vi.doMock("../BlockClient", () => ({
        default: () => null,
    }));

    const pageModule = await import("../page");
    return {
        ...pageModule,
        fetchBlockMock,
    };
};

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

describe("block detail page metadata", () => {
    it("returns noindex metadata for invalid block ids", async () => {
        const { generateMetadata, fetchBlockMock } = await importPage();
        const metadata = await generateMetadata({
            params: Promise.resolve({ id: "10000" }),
        });

        expect(fetchBlockMock).not.toHaveBeenCalled();
        expect(metadata).toMatchObject({
            title: "Invalid Plot",
            description: "Explore the live 10,000 plot Mars map on Solana.",
            alternates: {
                canonical: "/",
            },
            robots: {
                index: false,
                follow: false,
            },
        });
        expect(metadata.openGraph).toBeUndefined();
    });

    it("treats malformed ids as invalid block routes", async () => {
        const { generateMetadata, fetchBlockMock } = await importPage();
        const metadata = await generateMetadata({
            params: Promise.resolve({ id: "1659abc" }),
        });

        expect(fetchBlockMock).not.toHaveBeenCalled();
        expect(metadata).toMatchObject({
            title: "Invalid Plot",
            description: "Explore the live 10,000 plot Mars map on Solana.",
            alternates: {
                canonical: "/",
            },
            robots: {
                index: false,
                follow: false,
            },
        });
    });

    it("returns fallback metadata when chain fetch fails", async () => {
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        const { generateMetadata } = await importPage();
        const metadata = await generateMetadata({
            params: Promise.resolve({ id: "1659" }),
        });

        expect(metadata).toMatchObject({
            title: "Plot #1659",
            description: "View land plot #1659 on Mars Blocs, the decentralized 100x100 grid on Planet Mars.",
            alternates: {
                canonical: "/block/1659",
            },
            openGraph: {
                images: [
                    {
                        url: "/og-image.png",
                        width: 1200,
                        height: 630,
                        alt: "Mars Blocs plot #1659",
                    },
                ],
            },
        });
        expect(metadata.robots).toBeUndefined();
    });

    it("returns block-specific metadata when chain data exists", async () => {
        const { generateMetadata } = await importPage({
            blockFetchResult: {
                id: 1659,
                text: toFixedBytes("hello blocs", 64),
                imageUrl: toFixedBytes("cdn.example.com/image.webp", 128),
                owner: {
                    toBase58: () => "8XKFEbyGj9tM6N7xY8v2Lxg3M9q4cdW5k7ZqF5Y4n111",
                },
            },
        });

        const metadata = await generateMetadata({
            params: Promise.resolve({ id: "1659" }),
        });

        expect(metadata.title).toBe('Plot #1659: "hello blocs"');
        expect(metadata.alternates).toMatchObject({
            canonical: "/block/1659",
        });
        expect(metadata.openGraph).toMatchObject({
            images: [
                {
                    url: "https://cdn.example.com/image.webp",
                    alt: "Image for plot #1659 on Mars Blocs",
                },
            ],
        });
        expect(metadata.twitter).toMatchObject({
            images: ["https://cdn.example.com/image.webp"],
        });
    });
});
