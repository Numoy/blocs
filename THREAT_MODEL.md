# Threat Model

Last updated: 2026-03-01

## System Boundaries

- Frontend: Next.js client and server routes.
- Smart contract: Anchor program under `anchor/`.
- Storage: S3-compatible object storage for uploads.
- Optional shared guards: Upstash Redis.
- Deployment: Docker image built in GitHub Actions and deployed over SSH.

## Primary Assets

- Block ownership and metadata integrity.
- Upload pipeline integrity (authorized owner updates only).
- Deployment pipeline integrity (image provenance, release authenticity).
- Infrastructure secrets (storage keys, server SSH keys, webhook credentials).

## Trust Assumptions

- Solana and selected RPC endpoints are reachable and sufficiently trustworthy for expected finality.
- Maintainer GitHub accounts and signing keys are secured.
- Deployment host is hardened and SSH key custody is controlled.

## Key Threats

1. Unauthorized metadata/image updates.
2. Replay of previously valid upload signatures.
3. Upload and error-report endpoint abuse (DoS/spam).
4. Supply-chain tampering in CI/CD actions or release artifacts.
5. Secret exposure in source, CI logs, or environment configuration.
6. Malicious/compromised dependency or compromised container artifact.

## Existing Controls

- Upload route signature verification against wallet public key.
- Ownership verification before upload acceptance.
- Upload replay protection with TTL-bound tokens.
- Per-IP/per-wallet rate limits, with optional shared Redis guards.
- Post-upload public URL probe to catch non-public object-storage configs.
- CI checks for lint/type/tests and security scans.
- Action pinning to immutable commit SHAs.
- Release-gated signed tag verification.
- Container signing (cosign), build provenance attestation, and SBOM generation.

## Residual Risks

- Compromise of maintainer account/signing key can still authorize bad releases.
- Misconfigured object storage ACLs can expose or allow overwrite of assets.
- RPC-level outages or integrity issues can degrade availability or correctness.
- In-memory fallback guards are weaker in multi-instance deployments.

## Planned Improvements

1. Enforce GitHub branch/ruleset protections with required checks.
2. Rotate and scope all production secrets regularly.
3. Periodically test disaster recovery and key compromise response.
4. Add continuous image vulnerability scanning in CI.
