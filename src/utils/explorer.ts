import { deriveBlockPda } from "@/context/program/helpers";
import { PROGRAM_ID } from "@/utils/constants";

const getExplorerCluster = (rpcEndpoint: string | undefined): string => {
    const endpoint = (rpcEndpoint || "").toLowerCase();
    if (endpoint.includes("devnet")) return "devnet";
    if (endpoint.includes("testnet")) return "testnet";
    return "mainnet";
};

const withCluster = (baseUrl: string, cluster: string): string => {
    if (cluster === "mainnet") return baseUrl;
    return `${baseUrl}?cluster=${cluster}`;
};

export const getExplorerUrl = (
    kind: "address" | "tx",
    value: string,
    rpcEndpoint = process.env.NEXT_PUBLIC_SOLANA_RPC_URL,
): string => {
    const cluster = getExplorerCluster(rpcEndpoint);
    return withCluster(`https://explorer.solana.com/${kind}/${value}`, cluster);
};

export const getBlockAccountExplorerUrl = (blockId: number): string => {
    try {
        return getExplorerUrl("address", deriveBlockPda(blockId, PROGRAM_ID).toBase58());
    } catch {
        return getExplorerUrl("address", PROGRAM_ID.toBase58());
    }
};
