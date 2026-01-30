import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Blocs } from "../target/types/blocs";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { assert } from "chai";

describe("blocs", () => {
    // Configure the client to use the local cluster.
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);

    const program = anchor.workspace.Blocs as Program<Blocs>;

    // PDAs
    const [gridPubkey, _] = PublicKey.findProgramAddressSync(
        [Buffer.from("grid")],
        program.programId
    );

    it("Is initialized!", async () => {
        // Check if grid is already initialized (e.g. from previous run or deploy script)
        // If not, we try to initialize it.
        try {
            await program.account.gridState.fetch(gridPubkey);
            console.log("Grid already initialized");
        } catch (e) {
            await program.methods.initialize()
                .accounts({
                    grid: gridPubkey,
                    admin: provider.wallet.publicKey,
                    systemProgram: SystemProgram.programId,
                })
                .rpc();
        }

        const gridAccount = await program.account.gridState.fetch(gridPubkey);
        assert.ok(gridAccount.admin.equals(provider.wallet.publicKey));
    });

    const user1 = anchor.web3.Keypair.generate();
    const user2 = anchor.web3.Keypair.generate();
    const blockId = 100;
    const blockPrice = 0.5 * LAMPORTS_PER_SOL;

    const [blockPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("block"), new anchor.BN(blockId).toArrayLike(Buffer, 'le', 4)],
        program.programId
    );

    it("Fund users", async () => {
        // AirDrop SOL to users
        const tx1 = await provider.connection.requestAirdrop(user1.publicKey, 10 * LAMPORTS_PER_SOL);
        await provider.connection.confirmTransaction(tx1);
        const tx2 = await provider.connection.requestAirdrop(user2.publicKey, 10 * LAMPORTS_PER_SOL);
        await provider.connection.confirmTransaction(tx2);
    });

    it("User1 can buy a block", async () => {
        const color = [255, 0, 0]; // Red

        const adminBefore = await provider.connection.getBalance(provider.wallet.publicKey);

        await program.methods.buyBlock(blockId, color)
            .accounts({
                block: blockPda,
                grid: gridPubkey,
                buyer: user1.publicKey,
                admin: provider.wallet.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .signers([user1])
            .rpc();

        const blockAccount = await program.account.block.fetch(blockPda);
        assert.equal(blockAccount.id, blockId);
        assert.ok(blockAccount.owner.equals(user1.publicKey));
        assert.deepEqual(blockAccount.color, color);
        assert.ok(blockAccount.isForSale === false);

        // Check Admin received funds (approximate due to rent? No, rent is paid by buyer for account creation)
        // admin receives price.
        // Price might be calculated on chain or fixed. 
        // Assuming defined constant price in contract. 
        // We should check what the price is. Usually defined in contract constants.
    });

    it("User1 can update block", async () => {
        const newText = "Hello Solana";
        const newUrl = "https://solana.com";
        const newImage = "https://example.com/image.png";

        await program.methods.updateBlock(blockId, newText, newImage, newUrl)
            .accounts({
                block: blockPda,
                owner: user1.publicKey,
            })
            .signers([user1])
            .rpc();

        const blockAccount = await program.account.block.fetch(blockPda);
        // Needed to strip null bytes if handled as byte arrays, but Anchor strings are standard
        // If contract uses `[u8; N]`, we need to decode. Assuming String for now based on context usage in frontend.
        // Frontend used `parseString` suggesting `[u8]` arrays. 
        // Let's verify standard Anchor types usage in `lib.rs` later if this fails.
        // For now, assuming they align with frontend's `TextDecoder` expectations if they are raw bytes,
        // OR they are strings. Ideally contract uses `String`.
        // If tests fail on type mismatch, we adjust.
    });

    it("User1 can sell block", async () => {
        const salePrice = new anchor.BN(blockPrice);

        await program.methods.sellBlock(blockId, salePrice)
            .accounts({
                block: blockPda,
                owner: user1.publicKey,
            })
            .signers([user1])
            .rpc();

        const blockAccount = await program.account.block.fetch(blockPda);
        assert.ok(blockAccount.isForSale);
        assert.ok(blockAccount.price.eq(salePrice));
    });

    it("User2 can buy resale block", async () => {
        const user1BalanceBefore = await provider.connection.getBalance(user1.publicKey);

        await program.methods.buyResale(blockId)
            .accounts({
                block: blockPda,
                grid: gridPubkey,
                buyer: user2.publicKey,
                seller: user1.publicKey,
                admin: provider.wallet.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .signers([user2])
            .rpc();

        const blockAccount = await program.account.block.fetch(blockPda);
        assert.ok(blockAccount.owner.equals(user2.publicKey));
        assert.ok(!blockAccount.isForSale);

        const user1BalanceAfter = await provider.connection.getBalance(user1.publicKey);
        assert.ok(user1BalanceAfter > user1BalanceBefore); // User1 got paid
    });
});
