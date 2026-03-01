# Release Process

## Staging Deployments

- Workflow: `Deploy to Staging` (`.github/workflows/staging.yml`)
- Trigger: push of a semver tag (`v*.*.*`, for example `v1.0.0`)
- Environment: GitHub `staging`
- Tag policy in staging:
  - annotated/signed tags are preferred,
  - lightweight or unsigned tags are allowed for staging only.

Required staging secrets/vars:

- `SITE_BASE_URL` (for example `https://staging.10000-blocks.com`)
- `NEXT_PUBLIC_SOLANA_RPC_URL` (devnet is fine in staging; defaults to `https://api.devnet.solana.com` if not set)
- `SOLANA_RPC_URL` (optional override; falls back to `NEXT_PUBLIC_SOLANA_RPC_URL`)
- `HETZNER_ACCESS_KEY_ID`
- `HETZNER_SECRET_ACCESS_KEY`
- `HETZNER_BUCKET_NAME` (environment variable)
- `HETZNER_REGION` (optional, defaults to `fsn1`)
- `HETZNER_ENDPOINT` (optional)
- `HETZNER_PUBLIC_BASE_URL` (optional)
- `SERVER_HOST` (environment variable or secret)
- `SSH_PRIVATE_KEY` (secret)
- Optional for staging upload guard fallback: `ALLOW_IN_MEMORY_UPLOAD_GUARDS=true`
- Optional shared guards: `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`

## Production Releases

### Preconditions

- `main` is green in CI.
- Maintainers use signed commits.
- Release tag must be an annotated, signed tag.
- GitHub `production` environment secrets/vars are configured.
  - `NEXT_PUBLIC_SOLANA_RPC_URL` must be a mainnet endpoint (for example `https://api.mainnet-beta.solana.com`).
  - `SOLANA_RPC_URL` should also be a mainnet endpoint (optional override; falls back to `NEXT_PUBLIC_SOLANA_RPC_URL`).
  - `SERVER_HOST` (environment variable or secret)
  - `SSH_PRIVATE_KEY` (secret)
  - `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (recommended/expected for upload guards)
  - Keep `ALLOW_IN_MEMORY_UPLOAD_GUARDS=false` in production.

### Create a Release Tag

```bash
git checkout main
git pull
git tag -s vX.Y.Z -m "Release vX.Y.Z"
git push origin vX.Y.Z
```

This tag push triggers the staging deployment workflow.

### Trigger Production Manually

1. Open GitHub Actions > `Release to Production`.
2. Click `Run workflow`.
3. Set `release_tag` to the signed tag you want to deploy (for example `v1.0.0`).
4. Run the workflow.

Note: production smoke checks in the current workflow target `https://10000-blocks.com`.

### What the Release Workflow Produces

- Builds and pushes an immutable container image to GHCR.
- Signs the image with keyless `cosign` (OIDC).
- Publishes build provenance attestation to the registry.
- Generates an SPDX JSON SBOM artifact.
- Deploys to production host and runs smoke checks.

Smoke checks currently validate:

- `GET /` returns `200`
- `GET /api/health` returns `200` with upload config marked as configured
- `POST /api/upload` with dummy form fields returns `400` (route is reachable and configured)

### Verification

Replace `<image-ref>` with `ghcr.io/<owner>/<repo>@sha256:<digest>`.

```bash
cosign verify <image-ref>
cosign verify-attestation --type slsaprovenance <image-ref>
```

Download the SBOM artifact from the workflow run and inspect it with your preferred SBOM tooling.
