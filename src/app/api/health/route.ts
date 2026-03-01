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

const HEALTH_PUBLIC_READ_PROBE_TIMEOUT_MS = 4_000;

const normalizeOptionalUrl = (value?: string | null): string | null => {
    if (!value) {
        return null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }

    try {
        return new URL(trimmed).toString();
    } catch {
        return null;
    }
};

type PublicReadProbeResult = {
    configured: boolean;
    ok: boolean | null;
    status: number | null;
    warning: string | null;
};

const runPublicReadProbe = async (probeUrl: string | null): Promise<PublicReadProbeResult> => {
    if (!probeUrl) {
        return {
            configured: false,
            ok: null,
            status: null,
            warning: "public_read_probe_not_configured",
        };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HEALTH_PUBLIC_READ_PROBE_TIMEOUT_MS);

    try {
        const response = await fetch(probeUrl, {
            method: "HEAD",
            cache: "no-store",
            redirect: "follow",
            signal: controller.signal,
        });
        return {
            configured: true,
            ok: response.ok,
            status: response.status,
            warning: response.ok ? null : `public_read_probe_failed_${response.status}`,
        };
    } catch {
        return {
            configured: true,
            ok: false,
            status: null,
            warning: "public_read_probe_unreachable",
        };
    } finally {
        clearTimeout(timeout);
    }
};

export async function GET() {
    const publicRpc = normalizeRpcEndpoint(process.env.NEXT_PUBLIC_SOLANA_RPC_URL);
    const serverRpc = normalizeRpcEndpoint(process.env.SOLANA_RPC_URL);
    const resolvedRpc = resolveSolanaRpcEndpoint(publicRpc, serverRpc);
    const inferredCluster = inferRpcCluster(resolvedRpc);
    const resolvedCluster = inferredCluster === "unknown" ? "custom" : inferredCluster;

    const uploadConfigured = isUploadConfigured();
    const sharedGuardsConfigured = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
    const publicReadProbeUrl = normalizeOptionalUrl(process.env.HEALTH_PUBLIC_READ_PROBE_URL);
    const publicReadProbe = uploadConfigured
        ? await runPublicReadProbe(publicReadProbeUrl)
        : {
            configured: publicReadProbeUrl !== null,
            ok: null,
            status: null,
            warning: "upload_not_configured",
        };
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
                    usingServerOverride: Boolean(serverRpc) && resolvedRpc === serverRpc,
                },
                upload: {
                    configured: uploadConfigured,
                    sharedGuardsConfigured,
                    publicReadProbeUrlConfigured: publicReadProbeUrl !== null,
                    publicReadProbe,
                },
            },
        },
        { status: uploadConfigured ? 200 : 503 },
    );
}
