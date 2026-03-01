# Blocs - Solana Grid Protocol

Blocs is a decentralized 100x100 grid on Solana. Users can buy blocks, update color/text/image/link metadata, and list blocks for resale.

## Architecture

The program uses one PDA per block instead of a single giant grid account:
- `GridState` PDA (`["grid"]`): global admin/config account.
- `Block` PDA (`["block", id_le_bytes]`): block ownership, pricing, and metadata for each block id.

Core instruction set:
1. `initialize`: creates `GridState` and sets the admin.
2. `buy_block`: primary sale for an uninitialized block PDA at `INITIAL_PRICE + id`.
3. `buy_resale`: secondary sale with a 5% royalty to admin.
4. `update_block`: owner-only metadata updates (text/image URL/link URL).
5. `sell_block`: owner-only list/delist with lamport price.
6. `update_admin`: admin rotation.
7. `close_block`: owner closes block PDA and recovers rent.

## Setup and Development

### Prerequisites

- [Rust](https://www.rust-lang.org/tools/install)
- [Solana CLI](https://docs.solana.com/cli/install-solana-cli-tools)
- [Anchor](https://www.anchor-lang.com/docs/installation)
- [Yarn](https://yarnpkg.com/)

### Installation

1. Clone the repository:
    ```bash
    git clone <repo-url>
    cd blocs/anchor
    ```

2. Install dependencies:
    ```bash
    yarn install
    ```

3. Build the program:
    ```bash
    anchor build
    ```

4. Run tests:
    ```bash
    yarn test
    ```

`yarn test` wraps `anchor test` and auto-selects free validator ports to avoid local port collisions.

## Security Notes

- PDA seed constraints enforce deterministic account ownership (`grid` and per-block `block` PDAs).
- Ownership checks (`has_one = owner`) gate updates, listing, and closure.
- Admin validation is required for primary sale payout and royalty payout in resale flow.
- Fixed-size metadata arrays enforce strict max lengths on-chain.

## License

[MIT](../LICENSE)
