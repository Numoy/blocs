import { web3 } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import type { BlockData } from "@/types";
import { GRID_SIZE, getPrimaryBlockPriceSol } from "@/utils/constants";
import { parseColor } from "@/utils/colors";
import { toSafeExternalUrl } from "@/utils/url";
import type { BlockAccountEntry, RawBlockAccount } from "@/utils/programTypes";

const blockSeedPrefix = new TextEncoder().encode("block");
const textDecoder = new TextDecoder("utf-8");

const parseProgramString = (value: number[] | undefined): string => {
    return textDecoder.decode(new Uint8Array(value ?? [])).replace(/\0/g, "");
};

const toIdSeed = (id: number): Uint8Array => {
    const seed = new Uint8Array(4);
    new DataView(seed.buffer).setUint32(0, id, true);
    return seed;
};

export const mapRawBlockAccountToBlockData = (data: RawBlockAccount): BlockData => {
    const parsedImageUrl = toSafeExternalUrl(parseProgramString(data.imageUrl ?? []));

    return {
        id: data.id,
        owner: data.owner.toBase58(),
        price: data.price.toNumber() / web3.LAMPORTS_PER_SOL,
        isForSale: data.isForSale,
        color: parseColor(data.color ?? []),
        text: parseProgramString(data.text ?? []),
        imageUrl: parsedImageUrl || "",
        url: parseProgramString(data.url ?? []),
        image: null,
    };
};

const mapBlockAccountToBlockData = (entry: BlockAccountEntry): BlockData => {
    return mapRawBlockAccountToBlockData(entry.account);
};

export const createDefaultBlockData = (id: number): BlockData => ({
    id,
    owner: null,
    price: getPrimaryBlockPriceSol(id),
    isForSale: true,
    color: "#222222",
    text: "",
    imageUrl: "",
    url: "",
    image: null,
});

export const buildFullGrid = (allBlocks: BlockAccountEntry[]): BlockData[] => {
    const blockMap = new Map<number, BlockData>();

    for (const entry of allBlocks) {
        const mapped = mapBlockAccountToBlockData(entry);
        blockMap.set(mapped.id, mapped);
    }

    const fullGrid: BlockData[] = [];
    for (let id = 0; id < GRID_SIZE; id += 1) {
        fullGrid.push(blockMap.get(id) ?? createDefaultBlockData(id));
    }
    return fullGrid;
};

export const deriveBlockPda = (id: number, programId: PublicKey): PublicKey => {
    const [blockPda] = PublicKey.findProgramAddressSync(
        [blockSeedPrefix, toIdSeed(id)],
        programId,
    );
    return blockPda;
};

export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    });

    try {
        return await Promise.race([promise, timeoutPromise]);
    } finally {
        if (timeoutId !== null) {
            clearTimeout(timeoutId);
        }
    }
}
