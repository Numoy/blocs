# Release Process

## Preconditions

- `main` is green in CI.
- Maintainers use signed commits.
- Release tag must be an annotated, signed tag.

## Create a Release Tag

```bash
git checkout main
git pull
git tag -s vX.Y.Z -m "Release vX.Y.Z"
git push origin vX.Y.Z
```

The `Release to Production` workflow runs automatically on `v*` tags.

## What the Release Workflow Produces

- Builds and pushes an immutable container image to GHCR.
- Signs the image with keyless `cosign` (OIDC).
- Publishes build provenance attestation to the registry.
- Generates an SPDX JSON SBOM artifact.
- Deploys to production host and runs smoke checks.

## Verification

Replace `<image-ref>` with `ghcr.io/<owner>/<repo>@sha256:<digest>`.

```bash
cosign verify <image-ref>
cosign verify-attestation --type slsaprovenance <image-ref>
```

Download the SBOM artifact from the workflow run and inspect it with your preferred SBOM tooling.
