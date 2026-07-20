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
import { parseGridBlockId } from "@/utils/numberParsing";
import { getSiteOrigin } from "@/utils/siteUrl";

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
const siteUrl = getSiteOrigin();

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

const truncate = (value: string, maxLength: number) => {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (normalized.length <= maxLength) {
        return normalized;
    }

    return `${normalized.slice(0, maxLength - 1)}…`;
};

type Props = {
    params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { id: rawId } = await params;
    const id = parseGridBlockId(rawId);
    if (id === null) {
        return {
            title: "Invalid Plot",
            description: "Explore the live 10,000 plot Mars map on Solana.",
            alternates: {
                canonical: "/",
            },
            robots: {
                index: false,
                follow: false,
            },
        };
    }

    const blockPath = `/block/${id}`;
    const blockUrl = `${siteUrl}${blockPath}`;
    const block = await getBlockData(id);

    if (!block) {
        return {
            title: `Plot #${id}`,
            description: `View land plot #${id} on Mars Blocs, the decentralized 100x100 grid on Planet Mars.`,
            alternates: {
                canonical: blockPath,
            },
            openGraph: {
                title: `Plot #${id}`,
                description: `View land plot #${id} on Mars Blocs, the decentralized 100x100 grid on Planet Mars.`,
                url: blockUrl,
                siteName: "Mars Blocs",
                type: "website",
                images: [
                    {
                        url: "/og-image.png",
                        width: 1200,
                        height: 630,
                        alt: `Mars Blocs plot #${id}`,
                    },
                ],
            },
            twitter: {
                card: "summary_large_image",
                title: `Plot #${id}`,
                description: `View land plot #${id} on Mars Blocs, the decentralized 100x100 grid on Planet Mars.`,
                images: ["/og-image.png"],
            },
        };
    }

    const textPreview = block.text ? truncate(block.text, 48) : "";
    const title = textPreview ? `Plot #${id}: "${textPreview}"` : `Plot #${id}`;
    const description = block.imageUrl
        ? "Explore this image plot on Mars Blocs and see its on-chain owner and metadata."
        : `Owned by ${block.owner.slice(0, 4)}...${block.owner.slice(-4)} on the Mars Blocs colony map.`;

    const safeImageUrl = toSafeExternalUrl(block.imageUrl);
    const ogImage = safeImageUrl
        ? [
            {
                url: safeImageUrl,
                alt: `Image for plot #${id} on Mars Blocs`,
            },
        ]
        : [
            {
                url: "/og-image.png",
                width: 1200,
                height: 630,
                alt: `Mars Blocs plot #${id}`,
            },
        ];

    return {
        title,
        description,
        alternates: {
            canonical: blockPath,
        },
        openGraph: {
            title,
            description,
            url: blockUrl,
            siteName: "Mars Blocs",
            type: "website",
            images: ogImage,
        },
        twitter: {
            card: "summary_large_image",
            title,
            description,
            images: safeImageUrl ? [safeImageUrl] : ["/og-image.png"],
        }
    };
}

export default function BlockPage() {
    return <BlockClient />;
}
