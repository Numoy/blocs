import { NextResponse } from "next/server";
import { getBucketName, getS3Client } from "@/utils/s3";
import { inferRpcCluster, normalizeRpcEndpoint, resolveSolanaRpcEndpoint } from "@/utils/rpc";

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
    const inferredCluster = inferRpcCluster(resolvedRpc);
    const resolvedCluster = inferredCluster === "unknown" ? "custom" : inferredCluster;

    const uploadConfigured = isUploadConfigured();
    const sharedGuardsConfigured = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
    const buildCommitSha = process.env.BLOCS_BUILD_COMMIT_SHA || null;
    const buildTag = process.env.BLOCS_BUILD_TAG || null;
    const imageDigest = process.env.BLOCS_IMAGE_DIGEST || null;

    return NextResponse.json(
        {
            ok: uploadConfigured,
            service: "blocs",
            timestamp: new Date().toISOString(),
            build: {
                commitSha: buildCommitSha,
                tag: buildTag,
                imageDigest,
                metadataPresent: Boolean(buildCommitSha && buildTag && imageDigest),
            },
            config: {
                rpc: {
                    cluster: resolvedCluster,
                    publicConfigured: Boolean(publicRpc),
                    serverOverrideConfigured: Boolean(serverRpc),
                    usingServerOverride: Boolean(serverRpc),
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
