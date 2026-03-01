# Blocs

Blocs is a 100x100 on-chain grid on Solana.
Each cell is a tradable block that can hold color, text, image URL, and link metadata.
Live app: [https://10000-blocks.com](https://10000-blocks.com)
This repository is the public reference for that live deployment.

## Why Blocs

- Ownable digital space with transparent on-chain state.
- Fixed supply (10,000 blocks) with simple market mechanics.
- Lightweight way to publish identity, art, links, or community campaigns.

## How It Works

1. Unowned blocks are bought from the protocol at deterministic primary pricing.
2. Owners can update their block metadata.
3. Owners can list blocks for resale.
4. Secondary sales apply a 5% royalty to the admin address.

## Network + Program

- Default RPC target in examples: Solana Devnet
- Runtime cluster is environment-driven via `NEXT_PUBLIC_SOLANA_RPC_URL`/`SOLANA_RPC_URL`
- Production release workflow validates mainnet-style RPC endpoints
- Program ID: `C4MgCjSCzHPnxaFHqTPFH7ur67rKHeunEQAzGRSMDKDM`

To verify a local build against on-chain artifacts:

1. Go to `anchor/`
2. Run `anchor build`
3. Compare `anchor/target/deploy/blocs.so` checksum with the deployed program artifact

## Project Layout

- `src/`: Next.js app (frontend + API routes)
- `anchor/`: Solana smart contract (Rust + Anchor)
  - Smart contract details: [`anchor/README.md`](./anchor/README.md)

## Local Development

### Prerequisites

- Node.js 22+
- Rust + Cargo
- Solana CLI
- Anchor CLI

### Run Frontend

```bash
cp .env.example .env
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment Variables

See [`.env.example`](./.env.example). Important variables include:

- `NEXT_PUBLIC_SOLANA_RPC_URL`
- `NEXT_PUBLIC_SITE_URL`
- `SOLANA_RPC_URL` (optional server-side override)
- `NEXT_PUBLIC_SOLANA_RPC_FALLBACK_URLS` (optional comma-separated fallback RPC endpoints)
- `HETZNER_*` object storage settings
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (optional shared upload guards)
- `ALLOW_IN_MEMORY_UPLOAD_GUARDS` (default `false`; production upload route expects shared guards unless explicitly allowed)
- `ERROR_REPORT_WEBHOOK_URL` (optional client error forwarding target)
- `HEALTH_PUBLIC_READ_PROBE_URL` (optional URL to probe public-read access in `/api/health`)

RPC values must be valid HTTP(S) URLs (for example `https://api.devnet.solana.com`).

### Run Smart Contract Tests

```bash
cd anchor
yarn install --frozen-lockfile
anchor build
yarn test
```

`yarn test` wraps `anchor test` and auto-selects validator ports.

## Quality Checks

```bash
npm run lint
npm run typecheck
npm run test -- --run
npm run build
```

Health endpoint check after deploy:

```bash
curl -sS https://10000-blocks.com/api/health
```

## Verify The Live App

Use the build metadata exposed at:

```bash
curl -fsS https://10000-blocks.com/api/health | jq .
```

Then verify tag, commit, image digest, and signature/provenance using [`VERIFICATION.md`](./VERIFICATION.md).

## Trust + Governance

- Security policy: [`SECURITY.md`](./SECURITY.md)
- Contribution guide: [`CONTRIBUTING.md`](./CONTRIBUTING.md)
- Code of conduct: [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md)
- Changelog: [`CHANGELOG.md`](./CHANGELOG.md)
- Privacy notice: [`PRIVACY.md`](./PRIVACY.md)
- Support policy: [`SUPPORT.md`](./SUPPORT.md)
- Release process: [`RELEASE.md`](./RELEASE.md)
- Toolchain upgrade plan: [`TOOLCHAIN_UPGRADE_PLAN.md`](./TOOLCHAIN_UPGRADE_PLAN.md)
- Threat model: [`THREAT_MODEL.md`](./THREAT_MODEL.md)
- Verification guide: [`VERIFICATION.md`](./VERIFICATION.md)

## License

[MIT](./LICENSE)
