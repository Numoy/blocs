import { BN, Program, AnchorProvider, Idl } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import BlockClient from "./BlockClient";
import idl from "@/utils/idl.json";
import { PROGRAM_ID } from "@/utils/constants";
import { Metadata } from 'next';

// This is a Server Component

const getBlockData = async (id: number) => {
    // 1. Connection
    // Use a public RPC or specific env var
    const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com";
    const connection = new Connection(rpcUrl, "confirmed");

    // 2. Provider (Read-only)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const provider = new AnchorProvider(connection, { publicKey: PublicKey.default } as any, {});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const program = new Program(idl as Idl, provider) as any;

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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const account: any = await program.account.block.fetch(blockPda);

        // Helper to parse bytes to string
        const parseString = (arr: number[]) => {
            const uint8 = new Uint8Array(arr);
            const decoder = new TextDecoder("utf-8");
            return decoder.decode(uint8).replace(/\0/g, "");
        };

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

type Props = {
    params: { id: string };
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const id = parseInt(params.id);
    const block = await getBlockData(id);

    if (!block) {
        return {
            title: `Block #${id} - Blocs`,
            description: "View this block on the grid.",
        };
    }

    const title = block.text ? `Block #${id}: "${block.text}"` : `Block #${id} - Blocs`;
    const description = block.imageUrl ? "Check out this image block on Blocs!" : `Owned by ${block.owner.slice(0, 4)}...${block.owner.slice(-4)}`;

    return {
        title: title,
        description: description,
        openGraph: {
            title: title,
            description: description,
            images: block.imageUrl ? [block.imageUrl] : [], // TODO: Add default OG image if none
        },
        twitter: {
            card: "summary_large_image",
            title: title,
            description: description,
            images: block.imageUrl ? [block.imageUrl] : [],
        }
    };
}

export default function BlockPage() {
    return <BlockClient />;
}
