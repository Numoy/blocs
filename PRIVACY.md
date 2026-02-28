# Privacy Notice

Last updated: 2026-02-28

## Scope

This notice covers data processed by the Blocs web app and its API routes.

## Data We Process

### Public blockchain data

- Wallet public keys and block state are processed as part of Solana transactions.
- On-chain data is public by design and may be permanently accessible on-chain.

### Upload API data (`/api/upload`)

- Submitted fields: wallet address, block id, timestamp, wallet signature, and uploaded image bytes.
- Abuse-prevention identifiers:
  - trusted client IP (only when trusted proxy headers are present), or
  - an anonymous request fingerprint derived from request headers.

### Client error reports (`/api/client-errors`)

- Error name/message and optional stack/component stack.
- Browser context fields (`href`, `userAgent`) and timestamp.

## Why We Process This Data

- To render and operate the app.
- To verify ownership and signatures for upload authorization.
- To prevent abuse (rate limits and replay protection).
- To debug production issues when error reporting is enabled.

## Where Data Is Stored

- On-chain block metadata: Solana (public blockchain).
- Uploaded media: configured S3-compatible object storage (for example Hetzner Object Storage).
- Rate-limit and replay keys:
  - in-memory maps on the server, and/or
  - Upstash Redis when configured.
- Optional client error forwarding: `ERROR_REPORT_WEBHOOK_URL` destination.

## Retention

- On-chain records are retained by the blockchain.
- Upload replay tokens are retained for up to 5 minutes.
- Upload and client-error rate-limit windows are 60 seconds.
- Storage retention for uploaded assets and forwarded webhook logs depends on your infrastructure configuration.

## Third-Party Services

- Solana RPC providers.
- Object storage provider configured via environment variables.
- Upstash Redis (optional).
- Optional webhook target for forwarded client error reports.

## Security Notes

- Do not send secrets or private keys in app inputs.
- Security reports should follow [`SECURITY.md`](./SECURITY.md).

## Contact

For privacy or data-handling questions, open a GitHub issue in this repository.
