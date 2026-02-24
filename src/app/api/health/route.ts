import { NextResponse } from "next/server";
import { getBucketName, getS3Client } from "@/utils/s3";
import { normalizeRpcEndpoint, resolveSolanaRpcEndpoint } from "@/utils/rpc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const isUploadConfigured = (): boolean => {
    try {
        getBucketName();
        getS3Client();
        return true;
    } catch {
        return false;
    }
};

export async function GET() {
    const publicRpc = normalizeRpcEndpoint(process.env.NEXT_PUBLIC_SOLANA_RPC_URL);
    const serverRpc = normalizeRpcEndpoint(process.env.SOLANA_RPC_URL);
    const resolvedRpc = resolveSolanaRpcEndpoint(serverRpc, publicRpc);

    const uploadConfigured = isUploadConfigured();
    const sharedGuardsConfigured = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

    return NextResponse.json(
        {
            ok: uploadConfigured,
            service: "blocs",
            timestamp: new Date().toISOString(),
            config: {
                rpc: {
                    public: publicRpc,
                    server: serverRpc,
                    resolved: resolvedRpc,
                },
                upload: {
                    configured: uploadConfigured,
                    sharedGuardsConfigured,
                },
            },
        },
        { status: uploadConfigured ? 200 : 503 },
    );
}
