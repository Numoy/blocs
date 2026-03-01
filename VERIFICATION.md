# Verification Guide

This repository is public so anyone can verify what is running at [https://10000-blocks.com](https://10000-blocks.com).
Use this guide to validate the deployed app against source, container artifacts, and release provenance.

## Prerequisites

- `git`
- `curl`
- `jq`
- `cosign`

## Step 1: Read Build Metadata From Production

```bash
curl -fsS https://10000-blocks.com/api/health | jq .
```

Check `build`:

- `build.commitSha`
- `build.tag`
- `build.imageDigest`
- `build.metadataPresent` should be `true` for CI/CD releases

If those values are missing, the service was not deployed through the signed release workflow.

## Step 2: Confirm Tag to Commit Mapping

Given `build.tag` and `build.commitSha` from the health response:

```bash
git fetch --tags
git cat-file -t "<tag>"        # expected: tag (annotated tag object)
git verify-tag "<tag>"         # expected: Good signature
git rev-parse "<tag>^{commit}"
```

The resolved commit must match `build.commitSha`.

## Step 3: Confirm the Published Image Digest

The release workflow publishes:

- `ghcr.io/<owner>/<repo>:<tag>`
- `ghcr.io/<owner>/<repo>:latest`
- `ghcr.io/<owner>/<repo>@<digest>`

`<digest>` must match `build.imageDigest`.

You can inspect image tags in GitHub Container Registry and compare the digest shown there to the health payload.

## Step 4: Verify Sigstore Signature (Keyless)

Use the digest from `build.imageDigest`:

```bash
cosign verify \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  --certificate-identity-regexp "https://github.com/.+/.+/.github/workflows/release.yml@refs/tags/.+" \
  ghcr.io/<owner>/<repo>@<digest>
```

This confirms the image was signed by GitHub Actions OIDC identity for this repository workflow.

## Step 5: Verify Build Provenance Attestation

```bash
cosign verify-attestation \
  --type slsaprovenance \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  --certificate-identity-regexp "https://github.com/.+/.+/.github/workflows/release.yml@refs/tags/.+" \
  ghcr.io/<owner>/<repo>@<digest>
```

The attestation should reference the same source repository and commit.

## Step 6 (Optional): Verify On-Chain Program Build

Program ID (Devnet):

`C4MgCjSCzHPnxaFHqTPFH7ur67rKHeunEQAzGRSMDKDM`

To compare local build artifacts:

```bash
cd anchor
anchor build
shasum -a 256 target/deploy/blocs.so
```

You can compare this checksum with your expected release artifact or independently audited program artifacts.

## Notes

- The trust model is: signed release tag -> reproducible CI build -> signed image + attestation -> deployed digest exposed by health endpoint.
- `latest` alone is not a trust anchor. Always verify by digest.
