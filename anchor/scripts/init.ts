import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import fs from 'fs';

const PROGRAM_ID = new PublicKey("C4MgCjSCzHPnxaFHqTPFH7ur67rKHeunEQAzGRSMDKDM");
const FEE_ADMIN = new PublicKey("7q63mndma7Pe9EzeWYfvVyGKsyCDpeYmLQbyBKWwtJBx");

async function main() {
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);

    const program = new anchor.Program(require("../target/idl/blocs.json"), provider) as any;

    const [gridPubkey] = PublicKey.findProgramAddressSync(
        [Buffer.from("grid")],
        PROGRAM_ID
    );
    console.log("Grid PDA:", gridPubkey.toBase58());

    // Step 1: Initialize with deploy wallet as admin (required signer)
    try {
        console.log("Initializing Grid Account...");
        const tx = await program.methods.initialize()
            .accounts({
                grid: gridPubkey,
                admin: provider.wallet.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .rpc();
        console.log("Initialized. Tx:", tx);
        fs.writeFileSync("grid_pubkey.txt", gridPubkey.toBase58());
    } catch (e: any) {
        if (e.message?.includes("already in use") || e.logs?.some((l: string) => l.includes("already initialized"))) {
            console.log("Grid already initialized, skipping init step.");
            fs.writeFileSync("grid_pubkey.txt", gridPubkey.toBase58());
        } else {
            throw e;
        }
    }

    // Step 2: Rotate admin to Phantom fee wallet
    console.log(`Rotating admin to fee wallet: ${FEE_ADMIN.toBase58()}`);
    const tx2 = await program.methods.updateAdmin(FEE_ADMIN)
        .accounts({
            grid: gridPubkey,
            admin: provider.wallet.publicKey,
        })
        .rpc();
    console.log("Admin rotated. Tx:", tx2);
    console.log("Done. Fee admin is now:", FEE_ADMIN.toBase58());
}

main().then(() => process.exit(0)).catch(e => {
    console.error(e);
    process.exit(1);
});
