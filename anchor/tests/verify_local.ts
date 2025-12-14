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
                    grid: gridPubkey,
                    admin: admin.publicKey,
                    systemProgram: anchor.web3.SystemProgram.programId,
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

    it("Can buy a block!", async () => {
        const buyer = anchor.web3.Keypair.generate();

        // Airdrop SOL to buyer
        const airdropSig = await provider.connection.requestAirdrop(buyer.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
        await provider.connection.confirmTransaction(airdropSig);

        // Buy Block #42
        await program.methods
            .buyBlock(42, [255, 0, 0]) // ID 42, Red Color
            .accounts({
                grid: gridPubkey,
                buyer: buyer.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            .signers([buyer])
            .rpc();

        // Verify
        const gridAccount = await program.account.gridState.fetch(gridPubkey);
        const block = gridAccount.blocks[42]; // ZeroCopy access might require special handling in TS? 
        // Usually Anchor TS client maps `blocks` to an array if defined as such in IDL.

        expect(block.owner.toBase58()).to.equal(buyer.publicKey.toBase58());
        console.log("Block #42 bought by", block.owner.toBase58());
    });
});
