import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import fs from 'fs';

async function main() {
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);

    const programId = new PublicKey("C4MgCjSCzHPnxaFHqTPFH7ur67rKHeunEQAzGRSMDKDM");
    const program = new anchor.Program(require("../target/idl/blocs.json"), provider) as any;

    console.log("Initializing Grid (PDA Strategy)...");

    // Derive the Grid PDA
    const [gridPubkey, bump] = PublicKey.findProgramAddressSync(
        [Buffer.from("grid")],
        programId
    );
    console.log("Grid PDA:", gridPubkey.toBase58());

    try {
        console.log("Initializing Grid Account...");

        const tx = await program.methods.initialize()
            .accounts({
                grid: gridPubkey,
                admin: provider.wallet.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .rpc();

        console.log("Success! Transaction signature:", tx);
        console.log("Initialized Grid at:", gridPubkey.toBase58());

        // Save Pubkey to file
        fs.writeFileSync("grid_pubkey.txt", gridPubkey.toBase58());

    } catch (e: any) {
        console.error("Initialization failed:", e);
        if (e.message?.includes("already in use") || e.logs?.some((l: string) => l.includes("already initialized"))) {
            console.log("Grid appears to be already initialized. Using existing PDA.");
            fs.writeFileSync("grid_pubkey.txt", gridPubkey.toBase58());
        }
    }
}

main().then(() => process.exit(0)).catch(e => {
    console.error(e);
    process.exit(1);
});
