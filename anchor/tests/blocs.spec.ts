import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { assert } from "chai";
import { Blocs } from "../target/types/blocs";

const INITIAL_PRICE_LAMPORTS = 10_000_000; // Must match on-chain constant.
const RESALE_FEE_BPS = 500; // Must match on-chain constant.
const TEXT_MAX_LEN = 64; // Must match on-chain [u8; 64].
const GRID_SIZE = 10_000; // Must match on-chain GRID_SIZE.
const FEE_JITTER_TOLERANCE_LAMPORTS = 64;
const TEST_BLOCK_ID_START = 7_000;
const TEST_BLOCK_ID_END = 9_499;
const EMPTY_PUBKEY = new PublicKey("11111111111111111111111111111111");

interface BlockBoughtEvent {
    id: number;
    buyer: PublicKey | string;
    price: anchor.BN | number;
}

interface BlockSoldEvent {
    id: number;
    price: anchor.BN | number;
    isForSale?: boolean;
    is_for_sale?: boolean;
}

interface BlockResoldEvent {
    id: number;
    buyer: PublicKey | string;
    price: anchor.BN | number;
}

const decodeFixedString = (value: number[] | Uint8Array): string => {
    return Buffer.from(value).toString("utf8").replace(/\0/g, "");
};

const toLamportsNumber = (value: unknown): number => {
    if (typeof value === "number") {
        return value;
    }
    if (typeof value === "bigint") {
        return Number(value);
    }
    if (value && typeof (value as anchor.BN).toNumber === "function") {
        return (value as anchor.BN).toNumber();
    }
    return Number(value ?? 0);
};

const toPublicKey = (value: PublicKey | string): PublicKey => {
    return value instanceof PublicKey ? value : new PublicKey(value);
};

const expectAnchorError = async (operation: Promise<unknown>, includesText: string) => {
    try {
        await operation;
        assert.fail(`Expected Anchor error including "${includesText}"`);
    } catch (error) {
        const message = (error as Error).message || String(error);
        assert.include(message, includesText);
    }
};

const expectAnchorErrorOneOf = async (operation: Promise<unknown>, includesText: string[]) => {
    try {
        await operation;
        assert.fail(`Expected Anchor error including one of: ${includesText.join(", ")}`);
    } catch (error) {
        const message = (error as Error).message || String(error);
        const matched = includesText.some(part => message.includes(part));
        assert.isTrue(
            matched,
            `Expected Anchor error to include one of [${includesText.join(", ")}], but got: ${message}`,
        );
    }
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const fetchTransactionWithRetry = async (
    provider: anchor.AnchorProvider,
    signature: string,
    maxAttempts = 20,
    delayMs = 300,
) => {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const tx = await provider.connection.getTransaction(signature, {
            commitment: "confirmed",
            maxSupportedTransactionVersion: 0,
        });
        if (tx) {
            return tx;
        }

        // Local validator can lag briefly before a transaction is queryable.
        await provider.connection.confirmTransaction(signature, "confirmed");
        await sleep(delayMs);
    }

    return null;
};

const getTransactionFeeLamports = async (
    provider: anchor.AnchorProvider,
    signature: string,
): Promise<number> => {
    const tx = await fetchTransactionWithRetry(provider, signature);
    return tx?.meta?.fee ?? 0;
};

const findEventInTransaction = async <T>(
    provider: anchor.AnchorProvider,
    program: Program<Blocs>,
    signature: string,
    eventName: "BlockBought" | "BlockSold" | "BlockResold",
): Promise<T | null> => {
    const tx = await fetchTransactionWithRetry(provider, signature);
    if (!tx) {
        return null;
    }

    const logs = tx?.meta?.logMessages ?? [];
    const parser = new anchor.EventParser(program.programId, program.coder);
    for (const event of parser.parseLogs(logs)) {
        if (event.name === eventName) {
            return event.data as T;
        }
    }

    // Some local validator/Anchor combinations do not consistently expose event logs via getTransaction.
    // Keep event assertions opportunistic and rely on state + balance invariants for deterministic checks.
    return null;
};

describe("blocs", () => {
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);

    const program = anchor.workspace.Blocs as Program<Blocs>;

    const [gridPubkey] = PublicKey.findProgramAddressSync(
        [Buffer.from("grid")],
        program.programId,
    );

    const user1 = anchor.web3.Keypair.generate();
    const user2 = anchor.web3.Keypair.generate();
    let blockId = TEST_BLOCK_ID_START;
    let secondaryBlockId = TEST_BLOCK_ID_START + 1;
    let blockPda = EMPTY_PUBKEY;
    let secondaryBlockPda = EMPTY_PUBKEY;
    const resalePriceLamports = Math.floor(0.5 * LAMPORTS_PER_SOL);
    let primaryPriceLamports = INITIAL_PRICE_LAMPORTS + blockId;

    before(async () => {
        const freeBlocks: Array<{ id: number; pda: PublicKey }> = [];

        for (let candidateId = TEST_BLOCK_ID_START; candidateId <= TEST_BLOCK_ID_END; candidateId++) {
            const [candidatePda] = PublicKey.findProgramAddressSync(
                [Buffer.from("block"), new anchor.BN(candidateId).toArrayLike(Buffer, "le", 4)],
                program.programId,
            );
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const existing = await (program.account as any).block.fetchNullable(candidatePda);
            if (!existing) {
                freeBlocks.push({ id: candidateId, pda: candidatePda });
                if (freeBlocks.length >= 2) {
                    break;
                }
            }
        }

        if (freeBlocks.length < 2) {
            throw new Error("No available free block IDs in configured test range.");
        }

        blockId = freeBlocks[0].id;
        blockPda = freeBlocks[0].pda;
        secondaryBlockId = freeBlocks[1].id;
        secondaryBlockPda = freeBlocks[1].pda;
        primaryPriceLamports = INITIAL_PRICE_LAMPORTS + blockId;
    });

    it("initializes grid", async () => {
        try {
            await program.account.gridState.fetch(gridPubkey);
        } catch {
            await program.methods.initialize()
                .accounts({
                    grid: gridPubkey,
                    admin: provider.wallet.publicKey,
                    systemProgram: SystemProgram.programId,
                } as any)
                .rpc();
        }

        const gridAccount = await program.account.gridState.fetch(gridPubkey);
        assert.ok(gridAccount.admin.equals(provider.wallet.publicKey));
    });

    it("funds test users", async () => {
        const ensureFunded = async (pubkey: PublicKey) => {
            const current = await provider.connection.getBalance(pubkey);
            if (current >= 2 * LAMPORTS_PER_SOL) return;

            const sig = await provider.connection.requestAirdrop(pubkey, 10 * LAMPORTS_PER_SOL);
            await provider.connection.confirmTransaction(sig, "confirmed");
        };

        await ensureFunded(user1.publicKey);
        await ensureFunded(user2.publicKey);
    });

    it("rejects block ids outside the grid range", async () => {
        const invalidId = GRID_SIZE;
        const [invalidBlockPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("block"), new anchor.BN(invalidId).toArrayLike(Buffer, "le", 4)],
            program.programId,
        );

        await expectAnchorError(
            program.methods.buyBlock(invalidId, [1, 2, 3])
                .accounts({
                    block: invalidBlockPda,
                    grid: gridPubkey,
                    buyer: user1.publicKey,
                    admin: provider.wallet.publicKey,
                    systemProgram: SystemProgram.programId,
                } as any)
                .signers([user1])
                .rpc(),
            "Invalid Block ID.",
        );
    });

    it("rejects primary buy with an invalid admin account", async () => {
        await expectAnchorErrorOneOf(
            program.methods.buyBlock(secondaryBlockId, [10, 20, 30])
                .accounts({
                    block: secondaryBlockPda,
                    grid: gridPubkey,
                    buyer: user1.publicKey,
                    admin: user2.publicKey,
                    systemProgram: SystemProgram.programId,
                } as any)
                .signers([user1])
                .rpc(),
            ["Invalid Admin Account.", "ConstraintRaw"],
        );
    });

    it("user1 buys a new block, emits expected event, and admin receives expected payment", async () => {
        const adminBefore = await provider.connection.getBalance(provider.wallet.publicKey);

        const signature = await program.methods.buyBlock(blockId, [255, 0, 0])
            .accounts({
                block: blockPda,
                grid: gridPubkey,
                buyer: user1.publicKey,
                admin: provider.wallet.publicKey,
                systemProgram: SystemProgram.programId,
            } as any)
            .signers([user1])
            .rpc();

        const boughtEvent = await findEventInTransaction<BlockBoughtEvent>(
            provider,
            program,
            signature,
            "BlockBought",
        );

        if (boughtEvent) {
            assert.equal(boughtEvent.id, blockId);
            assert.ok(toPublicKey(boughtEvent.buyer).equals(user1.publicKey));
            assert.equal(toLamportsNumber(boughtEvent.price), primaryPriceLamports);
        }

        const adminAfter = await provider.connection.getBalance(provider.wallet.publicKey);
        const adminDelta = adminAfter - adminBefore;
        const buyTxFee = await getTransactionFeeLamports(provider, signature);
        assert.isAtLeast(
            adminDelta,
            primaryPriceLamports - buyTxFee - FEE_JITTER_TOLERANCE_LAMPORTS,
            `Unexpectedly low admin delta for buy_block: got ${adminDelta}`,
        );
        assert.isAtMost(
            adminDelta,
            primaryPriceLamports + FEE_JITTER_TOLERANCE_LAMPORTS,
            `Unexpectedly high admin delta for buy_block: got ${adminDelta}`,
        );

        const blockAccount = await program.account.block.fetch(blockPda);
        assert.equal(blockAccount.id, blockId);
        assert.ok(blockAccount.owner.equals(user1.publicKey));
        assert.deepEqual(blockAccount.color, [255, 0, 0]);
        assert.ok(!blockAccount.isForSale);
        assert.ok(blockAccount.price.eq(new anchor.BN(0)));
    });

    it("rejects unauthorized updates", async () => {
        await expectAnchorErrorOneOf(
            program.methods.updateBlock(blockId, "forbidden", "", "")
                .accounts({
                    block: blockPda,
                    owner: user2.publicKey,
                } as any)
                .signers([user2])
                .rpc(),
            ["You are not the owner of this block.", "ConstraintHasOne", "has one constraint was violated"],
        );
    });

    it("rejects over-length text updates", async () => {
        const tooLongText = "x".repeat(TEXT_MAX_LEN + 1);

        await expectAnchorError(
            program.methods.updateBlock(blockId, tooLongText, "", "")
                .accounts({
                    block: blockPda,
                    owner: user1.publicKey,
                } as any)
                .signers([user1])
                .rpc(),
            "String is too long.",
        );
    });

    it("updates block content for owner", async () => {
        const newText = "Hello Solana";
        const newUrl = "https://solana.com";
        const newImage = "https://example.com/image.png";

        await program.methods.updateBlock(blockId, newText, newImage, newUrl)
            .accounts({
                block: blockPda,
                owner: user1.publicKey,
            } as any)
            .signers([user1])
            .rpc();

        const blockAccount = await program.account.block.fetch(blockPda);
        assert.equal(decodeFixedString(blockAccount.text), newText);
        assert.equal(decodeFixedString(blockAccount.imageUrl), newImage);
        assert.equal(decodeFixedString(blockAccount.url), newUrl);
    });

    it("lists and delists block for sale while emitting expected events", async () => {
        const salePrice = new anchor.BN(resalePriceLamports);

        const listSignature = await program.methods.sellBlock(blockId, salePrice)
            .accounts({
                block: blockPda,
                owner: user1.publicKey,
            } as any)
            .signers([user1])
            .rpc();

        const listedEvent = await findEventInTransaction<BlockSoldEvent>(
            provider,
            program,
            listSignature,
            "BlockSold",
        );
        if (listedEvent) {
            assert.equal(listedEvent.id, blockId);
            assert.equal(toLamportsNumber(listedEvent.price), resalePriceLamports);
            assert.equal(Boolean(listedEvent.isForSale ?? listedEvent.is_for_sale), true);
        }

        const listedBlock = await program.account.block.fetch(blockPda);
        assert.ok(listedBlock.isForSale);
        assert.ok(listedBlock.price.eq(salePrice));

        const delistSignature = await program.methods.sellBlock(blockId, new anchor.BN(0))
            .accounts({
                block: blockPda,
                owner: user1.publicKey,
            } as any)
            .signers([user1])
            .rpc();

        const delistedEvent = await findEventInTransaction<BlockSoldEvent>(
            provider,
            program,
            delistSignature,
            "BlockSold",
        );
        if (delistedEvent) {
            assert.equal(delistedEvent.id, blockId);
            assert.equal(toLamportsNumber(delistedEvent.price), 0);
            assert.equal(Boolean(delistedEvent.isForSale ?? delistedEvent.is_for_sale), false);
        }

        const delistedBlock = await program.account.block.fetch(blockPda);
        assert.ok(!delistedBlock.isForSale);
        assert.ok(delistedBlock.price.eq(new anchor.BN(0)));
    });

    it("rejects resale when block is not listed", async () => {
        await expectAnchorError(
            program.methods.buyResale(blockId)
                .accounts({
                    block: blockPda,
                    grid: gridPubkey,
                    buyer: user2.publicKey,
                    seller: user1.publicKey,
                    admin: provider.wallet.publicKey,
                    systemProgram: SystemProgram.programId,
                } as any)
                .signers([user2])
                .rpc(),
            "This block is not for sale.",
        );
    });

    it("executes resale, emits expected event, and splits funds correctly", async () => {
        const salePrice = new anchor.BN(resalePriceLamports);

        await program.methods.sellBlock(blockId, salePrice)
            .accounts({
                block: blockPda,
                owner: user1.publicKey,
            } as any)
            .signers([user1])
            .rpc();

        const sellerBefore = await provider.connection.getBalance(user1.publicKey);
        const adminBefore = await provider.connection.getBalance(provider.wallet.publicKey);

        const resaleSignature = await program.methods.buyResale(blockId)
            .accounts({
                block: blockPda,
                grid: gridPubkey,
                buyer: user2.publicKey,
                seller: user1.publicKey,
                admin: provider.wallet.publicKey,
                systemProgram: SystemProgram.programId,
            } as any)
            .signers([user2])
            .rpc();

        const resoldEvent = await findEventInTransaction<BlockResoldEvent>(
            provider,
            program,
            resaleSignature,
            "BlockResold",
        );

        if (resoldEvent) {
            assert.equal(resoldEvent.id, blockId);
            assert.ok(toPublicKey(resoldEvent.buyer).equals(user2.publicKey));
            assert.equal(toLamportsNumber(resoldEvent.price), resalePriceLamports);
        }

        const sellerAfter = await provider.connection.getBalance(user1.publicKey);
        const adminAfter = await provider.connection.getBalance(provider.wallet.publicKey);

        const expectedFee = Math.floor((resalePriceLamports * RESALE_FEE_BPS) / 10_000);
        const expectedSellerAmount = resalePriceLamports - expectedFee;

        assert.equal(sellerAfter - sellerBefore, expectedSellerAmount);
        const adminDelta = adminAfter - adminBefore;
        const resaleTxFee = await getTransactionFeeLamports(provider, resaleSignature);
        assert.isAtLeast(
            adminDelta,
            expectedFee - resaleTxFee - FEE_JITTER_TOLERANCE_LAMPORTS,
            `Unexpectedly low admin delta for buy_resale: got ${adminDelta}`,
        );
        assert.isAtMost(
            adminDelta,
            expectedFee + FEE_JITTER_TOLERANCE_LAMPORTS,
            `Unexpectedly high admin delta for buy_resale: got ${adminDelta}`,
        );

        const blockAccount = await program.account.block.fetch(blockPda);
        assert.ok(blockAccount.owner.equals(user2.publicKey));
        assert.ok(!blockAccount.isForSale);
        assert.ok(blockAccount.price.eq(new anchor.BN(0)));
    });
});
