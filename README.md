# Blocs - 10,000 Blocks on Solana

Blocs is a decentralized experiment on the Solana blockchain. A 100x100 grid of 10,000 blocks, fully customizable and ownable by the community.

## Overview

-   **Total Supply**: 10,000 Blocks (Fixed).
-   **Grid Size**: 100x100.
-   **On-Chain Data**: Color, Text, Image URL, Website URL.
-   **Economy**: Buy, Sell, Trade. 5% Royalty on secondary sales to the creator.

## Project Structure

-   `src/`: Next.js Frontend (React, TypeScript, CSS Modules).
-   `anchor/`: Solana Smart Contract (Rust, Anchor Framework).

## Verification

The smart contract is deployed on Solana Devnet (and Mainnet soon). You can verify the code matches the on-chain program.

**Program ID**: `C4MgCjSCzHPnxaFHqTPFH7ur67rKHeunEQAzGRSMDKDM`

### Build & Verify
1.  Navigate to `anchor/`
2.  Run `anchor build`
3.  Compare the checksum of `anchor/target/deploy/blocs.so` with the on-chain program data.

## Running Locally

### Prerequisites
-   Node.js 22+
-   Rust & Cargo
-   Solana CLI
-   Anchor CLI

### Steps
1.  **Frontend**:
    ```bash
    cp .env.example .env
    npm install
    npm run dev
    ```
    Open `http://localhost:3000`.

    Required environment variables are documented in `.env.example`, including:
-   `NEXT_PUBLIC_SOLANA_RPC_URL`
-   `NEXT_PUBLIC_SITE_URL`
-   `SOLANA_RPC_URL` (optional server-side override)
-   `HETZNER_*` object storage credentials/settings
-   `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (optional shared upload guards for multi-instance deploys)

2.  **Smart Contract**:
    ```bash
    cd anchor
    anchor build
    anchor test
    ```

### Quality Checks

```bash
npm run lint
npm run typecheck
npm run test -- --run
```

## License

MIT License.
