import { BN, Program, AnchorProvider, Idl } from "@coral-xyz/anchor";
import { Connection, PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import BlockClient from "./BlockClient";
import idl from "@/utils/idl.json";
import { GRID_SIZE, PROGRAM_ID } from "@/utils/constants";
import { Metadata } from 'next';
import { toSafeExternalUrl } from "@/utils/url";
import { unstable_cache } from "next/cache";
import { resolveSolanaRpcEndpoint } from "@/utils/rpc";
import { asBlocsProgram } from "@/utils/programTypes";

// This is a Server Component

const rpcUrl = resolveSolanaRpcEndpoint(process.env.SOLANA_RPC_URL, process.env.NEXT_PUBLIC_SOLANA_RPC_URL);
const connection = new Connection(rpcUrl, "confirmed");
const readonlyWallet = {
    publicKey: PublicKey.default,
    signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T): Promise<T> => tx,
    signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> => txs,
};
const provider = new AnchorProvider(connection, readonlyWallet, {});
const program = asBlocsProgram(new Program(idl as Idl, provider));

const parseString = (arr: number[]) => {
    const uint8 = new Uint8Array(arr);
    const decoder = new TextDecoder("utf-8");
    return decoder.decode(uint8).replace(/\0/g, "");
};

const fetchBlockDataFromChain = async (id: number) => {
    if (!Number.isInteger(id) || id < 0 || id >= GRID_SIZE) {
        return null;
    }

    // 3. Derive PDA
    const [blockPda] = PublicKey.findProgramAddressSync(
        [
            new TextEncoder().encode("block"),
            new Uint8Array(new BN(id).toArray("le", 4))
        ],
        PROGRAM_ID
    );

    try {
        // 4. Fetch Account
        const account = await program.account.block.fetch(blockPda);

        return {
            id: account.id,
            text: parseString(account.text),
            imageUrl: parseString(account.imageUrl),
            owner: account.owner.toBase58(),
            // ... other fields if needed for SEO
        };
    } catch (e) {
        console.error("Error fetching block metadata:", e);
        return null; // Block likely doesn't exist or error
    }
};

const getBlockDataCached = unstable_cache(
    async (id: number) => fetchBlockDataFromChain(id),
    ["block-metadata-v1"],
    { revalidate: 20 }
);

const getBlockData = async (id: number) => {
    if (!Number.isInteger(id) || id < 0 || id >= GRID_SIZE) {
        return null;
    }
    return getBlockDataCached(id);
};

type Props = {
    params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { id: rawId } = await params;
    const id = parseInt(rawId, 10);
    if (!Number.isInteger(id) || id < 0 || id >= GRID_SIZE) {
        return {
            title: "Blocs",
            description: "Explore the 10,000 block grid on Solana.",
        };
    }

    const block = await getBlockData(id);

    if (!block) {
        return {
            title: `Block #${id} - Blocs`,
            description: "View this block on the grid.",
        };
    }

    const title = block.text ? `Block #${id}: "${block.text}"` : `Block #${id} - Blocs`;
    const description = block.imageUrl ? "Check out this image block on Blocs!" : `Owned by ${block.owner.slice(0, 4)}...${block.owner.slice(-4)}`;

    const safeImageUrl = toSafeExternalUrl(block.imageUrl);

    return {
        title: title,
        description: description,
        openGraph: {
            title: title,
            description: description,
            images: safeImageUrl ? [safeImageUrl] : ["/og-image.png"],
        },
        twitter: {
            card: "summary_large_image",
            title: title,
            description: description,
            images: safeImageUrl ? [safeImageUrl] : ["/og-image.png"],
        }
    };
}

export default function BlockPage() {
    return <BlockClient />;
}
