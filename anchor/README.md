# Blocs - Solana Grid Protocol

Blocs is a decentralized 100x100 grid stored on the Solana blockchain. Users can buy blocks, set their color, and update metadata (URL, Image, Text). The state is managed in a single large "Zero Copy" account for efficiency.

## 🏗 Architecture

The project is built using:
- **Solana** for the blockchain layer.
- **Anchor Framework** for smart contract development.
- **Zero Copy Deserialization** to handle the large 10,000 block grid state within Solana's account limits.

### Smart Contract

- **Program ID**: `C4MgCjSCzHPnxaFHqTPFH7ur67rKHeunEQAzGRSMDKDM` (Devnet)
- **Account Structure**: 
  - `GridState`: The main account holding admin info and the 10,000 blocks.
  - `BlockInfo`: Struct representing a single block (Owner, Price, Color, Content).

### Instructions

1.  **`initialize`**: Sets up the grid. Can only be run once by the admin.
2.  **`buy_block`**: Purchasing a block.
    -   If owned by System (default), buy from Admin for 0.01 SOL.
    -   If owned by User, buy from User (if for sale). Includes 5% royalty to Admin.
3.  **`update_block`**: Update content strings (Text, Image URL, Link URL).
4.  **`sell_block`**: List or delist a block for sale.

## 🚀 Setup & Development

### Prerequisites

- [Rust](https://www.rust-lang.org/tools/install)
- [Solana CLI](https://docs.solana.com/cli/install-solana-cli-tools)
- [Anchor](https://www.anchor-lang.com/docs/installation)
- [Yarn](https://yarnpkg.com/)

### Installation

1.  Clone the repository:
    ```bash
    git clone <repo-url>
    cd blocs/anchor
    ```

2.  Install dependencies:
    ```bash
    yarn install
    ```

3.  Build the program:
    ```bash
    anchor build
    ```

4.  Run tests:
    ```bash
    anchor test
    ```

## 🔒 Security

- **Re-initialization Prevention**: The `initialize` instruction checks for an existing discriminator to prevent overwriting the grid.
- **Access Control**: Only the block owner can update content or list for sale.
- **Zero Copy**: We use `#[account(zero_copy)]` and `load_mut()` to safely handle the large data structure without blowing the stack.

## 📄 License

MIT
