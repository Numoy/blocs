import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Keypair } from "@solana/web3.js";
import fs from 'fs';

async function main() {
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);

    const programId = new PublicKey("C4MgCjSCzHPnxaFHqTPFH7ur67rKHeunEQAzGRSMDKDM");
    const program = new anchor.Program(require("../target/idl/blocs.json"), provider) as any;

    console.log("Initializing Grid (Keypair Strategy)...");

    // Generate a fresh Grid Account
    const gridKeypair = Keypair.generate();
    console.log("New Grid Pubkey:", gridKeypair.publicKey.toBase58());

    // Calculate Size
    // 8 (Disc) + 32 (Admin) + 10000 * 368 (Block) = 3,680,040
    // Round up for safety: 3,681,000
    const SPACE = 3681000;

    // Calculate Rent
    const lamports = await provider.connection.getMinimumBalanceForRentExemption(SPACE);
    console.log(`Rent required: ${lamports / 1e9} SOL`);

    try {
        console.log("Creating Account & Initializing...");

        const tx = await program.methods.initialize()
            .accounts({
                grid: gridKeypair.publicKey,
                admin: provider.wallet.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .preInstructions([
                SystemProgram.createAccount({
                    fromPubkey: provider.wallet.publicKey,
                    newAccountPubkey: gridKeypair.publicKey,
                    space: SPACE,
                    lamports,
                    programId: programId,
                })
            ])
            .signers([gridKeypair]) // Grid Account must sign creation
            .rpc();

        console.log("Success! Transaction signature:", tx);
        console.log("Initialized Grid at:", gridKeypair.publicKey.toBase58());

        // Save Pubkey to file
        fs.writeFileSync("grid_pubkey.txt", gridKeypair.publicKey.toBase58());

    } catch (e) {
        console.error("Initialization failed:", e);
    }
}

main().then(() => process.exit(0)).catch(e => {
    console.error(e);
    process.exit(1);
});
