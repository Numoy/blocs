import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Blocs } from "../target/types/blocs";
import { expect } from "chai";

describe("blocs-verification", () => {
    // Configure the client to use the local cluster.
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);

    const program = anchor.workspace.Blocs as Program<Blocs>;
    const admin = provider.wallet;

    // Keypair for the Grid Account (PDA or specific kp)
    // In our contract logic, it's a PDA seeds=[b"grid"]
    const [gridPubkey] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("grid")],
        program.programId
    );

    it("Is initialized!", async () => {
        // 1. Initialize the Grid (Admin only)
        try {
            await program.methods
                .initialize()
                .accounts({
                    admin: admin.publicKey,
                })
                .rpc();

            console.log("Grid Initialized!");
        } catch (e) {
            console.log("Grid might already be initialized", e);
        }

        // Verify state
        const gridAccount = await program.account.gridState.fetch(gridPubkey);
        expect(gridAccount.admin.toBase58()).to.equal(admin.publicKey.toBase58());
    });

    it("Can buy and sell a block!", async () => {
        const buyer = anchor.web3.Keypair.generate();
        const buyer2 = anchor.web3.Keypair.generate();

        // Airdrop SOL to buyer
        const airdropSig = await provider.connection.requestAirdrop(buyer.publicKey, 100 * anchor.web3.LAMPORTS_PER_SOL);
        await provider.connection.confirmTransaction(airdropSig);

        const airdropSig2 = await provider.connection.requestAirdrop(buyer2.publicKey, 100 * anchor.web3.LAMPORTS_PER_SOL);
        await provider.connection.confirmTransaction(airdropSig2);

        // Buy Block #42
        await program.methods
            .buyBlock(42, [255, 0, 0]) // ID 42, Red Color
            .accounts({
                buyer: buyer.publicKey,
                admin: admin.publicKey,
                grid: gridPubkey,
            })
            .signers([buyer])
            .rpc();

        // Verify

        // Derive Block PDA
        const [blockPubkey] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("block"), new anchor.BN(42).toArrayLike(Buffer, "le", 4)],
            program.programId
        );

        const blockAccount = await program.account.block.fetch(blockPubkey);

        expect(blockAccount.owner.toBase58()).to.equal(buyer.publicKey.toBase58());
        console.log("Block #42 bought by", blockAccount.owner.toBase58());

        // Sell Block #42
        await program.methods
            .sellBlock(42, new anchor.BN(10 * anchor.web3.LAMPORTS_PER_SOL))
            .accounts({
                owner: buyer.publicKey,
            })
            .signers([buyer])
            .rpc();

        const blockAccountForSale = await program.account.block.fetch(blockPubkey);
        expect(blockAccountForSale.isForSale).to.be.true;
        console.log("Block #42 is for sale");

        // Buy Block #42 from buyer
        await program.methods
            .buyResale(42)
            .accounts({
                buyer: buyer2.publicKey,
                seller: buyer.publicKey,
                admin: admin.publicKey,
                grid: gridPubkey,
            })
            .signers([buyer2])
            .rpc();

        const blockAccountSold = await program.account.block.fetch(blockPubkey);
        expect(blockAccountSold.owner.toBase58()).to.equal(buyer2.publicKey.toBase58());
        console.log("Block #42 sold to", blockAccountSold.owner.toBase58());

        // Update Block #42
        await program.methods
            .updateBlock(42, "Hello, World!", "https://example.com/image.png", "https://example.com")
            .accounts({
                owner: buyer2.publicKey,
            })
            .signers([buyer2])
            .rpc();
        
        const blockAccountUpdated = await program.account.block.fetch(blockPubkey);
        expect(new TextDecoder("utf-8").decode(new Uint8Array(blockAccountUpdated.text)).replace(/\0/g, '')).to.equal("Hello, World!");
        console.log("Block #42 updated");
    });
});