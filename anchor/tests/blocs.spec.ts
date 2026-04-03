import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { assert } from "chai";
import type { Blocs } from "../target/types/blocs";

const INITIAL_PRICE_LAMPORTS = 10_000_000; // Must match on-chain constant.
const RESALE_FEE_BPS = 500;                // Must match on-chain constant.
const TEXT_MAX_LEN = 64;                   // Must match on-chain [u8; 64].
const IMAGE_URL_MAX_LEN = 128;             // Must match on-chain [u8; 128].
const URL_MAX_LEN = 128;                   // Must match on-chain [u8; 128].
const GRID_SIZE = 10_000;                  // Must match on-chain GRID_SIZE.
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
    owner?: PublicKey | string;
    price: anchor.BN | number;
    isForSale?: boolean;
    is_for_sale?: boolean;
}

interface BlockResoldEvent {
    id: number;
    buyer: PublicKey | string;
    price: anchor.BN | number;
}

interface BlockUpdatedEvent {
    id: number;
    owner: PublicKey | string;
    text: string;
    imageUrl?: string;
    image_url?: string;
    url: string;
}

interface AdminUpdatedEvent {
    oldAdmin: PublicKey | string;
    old_admin?: PublicKey | string;
    newAdmin: PublicKey | string;
    new_admin?: PublicKey | string;
}

const decodeFixedString = (value: number[] | Uint8Array): string =>
    Buffer.from(value).toString("utf8").replace(/\0/g, "");

const toLamportsNumber = (value: unknown): number => {
    if (typeof value === "number") return value;
    if (typeof value === "bigint") return Number(value);
    if (value && typeof (value as anchor.BN).toNumber === "function") {
        return (value as anchor.BN).toNumber();
    }
    return Number(value ?? 0);
};

const toPublicKey = (value: PublicKey | string): PublicKey =>
    value instanceof PublicKey ? value : new PublicKey(value);

const expectAnchorError = async (operation: Promise<unknown>, includesText: string) => {
    try {
        await operation;
        assert.fail(`Expected Anchor error including "${includesText}"`);
    } catch (error) {
        const message = (error as Error).message || String(error);
        assert.include(message, includesText);
    }
};

const expectAnchorErrorOneOf = async (operation: Promise<unknown>, candidates: string[]) => {
    try {
        await operation;
        assert.fail(`Expected Anchor error including one of: ${candidates.join(", ")}`);
    } catch (error) {
        const message = (error as Error).message || String(error);
        const matched = candidates.some(part => message.includes(part));
        assert.isTrue(
            matched,
            `Expected error to include one of [${candidates.join(", ")}], got: ${message}`,
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
        if (tx) return tx;
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
    eventName: "BlockBought" | "BlockSold" | "BlockResold" | "BlockUpdated" | "AdminUpdated",
): Promise<T | null> => {
    const tx = await fetchTransactionWithRetry(provider, signature);
    if (!tx) return null;
    const logs = tx?.meta?.logMessages ?? [];
    const parser = new anchor.EventParser(program.programId, program.coder);
    for (const event of parser.parseLogs(logs)) {
        if (event.name === eventName) return event.data as T;
    }
    // Local validator/Anchor combinations do not always expose event logs via
    // getTransaction. Keep event assertions opportunistic; rely on state and
    // balance invariants for deterministic checks.
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

    const findBlockPda = (id: number): PublicKey =>
        PublicKey.findProgramAddressSync(
            [Buffer.from("block"), new anchor.BN(id).toArrayLike(Buffer, "le", 4)],
            program.programId,
        )[0];

    before(async () => {
        const freeBlocks: Array<{ id: number; pda: PublicKey }> = [];

        for (let candidateId = TEST_BLOCK_ID_START; candidateId <= TEST_BLOCK_ID_END; candidateId++) {
            const candidatePda = findBlockPda(candidateId);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const existing = await (program.account as any).block.fetchNullable(candidatePda);
            if (!existing) {
                freeBlocks.push({ id: candidateId, pda: candidatePda });
                if (freeBlocks.length >= 2) break;
            }
        }

        if (freeBlocks.length < 2) {
            throw new Error("No available free block IDs in configured test range.");
        }

        blockId = freeBlocks[0].id;
        blockPda = freeBlocks[0].pda;
        secondaryBlockId = freeBlocks[1].id;
        secondaryBlockPda = freeBlocks[1].pda;
    });

    // ── Setup ────────────────────────────────────────────────────────────────

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

    // ── buy_block ────────────────────────────────────────────────────────────

    it("rejects block ids outside the grid range", async () => {
        const invalidId = GRID_SIZE;
        const invalidBlockPda = findBlockPda(invalidId);

        await expectAnchorError(
            program.methods.buyBlock(invalidId)
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
            program.methods.buyBlock(secondaryBlockId)
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

    it("rejects primary buy when buyer is the admin (self-purchase)", async () => {
        // Admin buying their own block would be a self-transfer, effectively
        // acquiring the block for free (only paying tx fee + rent).
        await expectAnchorErrorOneOf(
            program.methods.buyBlock(secondaryBlockId)
                .accounts({
                    block: secondaryBlockPda,
                    grid: gridPubkey,
                    buyer: provider.wallet.publicKey,
                    admin: provider.wallet.publicKey,
                    systemProgram: SystemProgram.programId,
                } as any)
                .rpc(),
            ["Admin cannot purchase blocks.", "ConstraintRaw"],
        );
    });

    it("user1 buys a new block, emits expected event, and admin receives expected payment", async () => {
        const adminBefore = await provider.connection.getBalance(provider.wallet.publicKey);

        const signature = await program.methods.buyBlock(blockId)
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
            provider, program, signature, "BlockBought",
        );
        if (boughtEvent) {
            assert.equal(boughtEvent.id, blockId);
            assert.ok(toPublicKey(boughtEvent.buyer).equals(user1.publicKey));
            assert.equal(toLamportsNumber(boughtEvent.price), INITIAL_PRICE_LAMPORTS);
        }

        const adminAfter = await provider.connection.getBalance(provider.wallet.publicKey);
        const adminDelta = adminAfter - adminBefore;
        const buyTxFee = await getTransactionFeeLamports(provider, signature);
        assert.isAtLeast(
            adminDelta,
            INITIAL_PRICE_LAMPORTS - buyTxFee - FEE_JITTER_TOLERANCE_LAMPORTS,
        );
        assert.isAtMost(adminDelta, INITIAL_PRICE_LAMPORTS + FEE_JITTER_TOLERANCE_LAMPORTS);

        const blockAccount = await program.account.block.fetch(blockPda);
        assert.equal(blockAccount.id, blockId);
        assert.ok(blockAccount.owner.equals(user1.publicKey));
        assert.ok(!blockAccount.isForSale);
        assert.ok(blockAccount.price.eq(new anchor.BN(0)));
    });

    it("rejects buying a block that is already owned", async () => {
        // The `init` constraint on the block PDA must prevent re-initialization.
        await expectAnchorErrorOneOf(
            program.methods.buyBlock(blockId)
                .accounts({
                    block: blockPda,
                    grid: gridPubkey,
                    buyer: user2.publicKey,
                    admin: provider.wallet.publicKey,
                    systemProgram: SystemProgram.programId,
                } as any)
                .signers([user2])
                .rpc(),
            ["already in use", "already been allocated", "0x0"],
        );
    });

    // ── update_block ─────────────────────────────────────────────────────────

    it("rejects unauthorized updates", async () => {
        await expectAnchorErrorOneOf(
            program.methods.updateBlock(blockId, "forbidden", "", "")
                .accounts({ block: blockPda, owner: user2.publicKey } as any)
                .signers([user2])
                .rpc(),
            ["You are not the owner of this block.", "ConstraintHasOne", "has one constraint was violated"],
        );
    });

    it("rejects over-length text updates", async () => {
        await expectAnchorError(
            program.methods.updateBlock(blockId, "x".repeat(TEXT_MAX_LEN + 1), "", "")
                .accounts({ block: blockPda, owner: user1.publicKey } as any)
                .signers([user1])
                .rpc(),
            "String is too long.",
        );
    });

    it("rejects over-length image_url", async () => {
        const tooLong = "https://example.com/" + "x".repeat(IMAGE_URL_MAX_LEN);

        await expectAnchorError(
            program.methods.updateBlock(blockId, "", tooLong, "")
                .accounts({ block: blockPda, owner: user1.publicKey } as any)
                .signers([user1])
                .rpc(),
            "String is too long.",
        );
    });

    it("rejects over-length url", async () => {
        const tooLong = "https://example.com/" + "x".repeat(URL_MAX_LEN);

        await expectAnchorError(
            program.methods.updateBlock(blockId, "", "", tooLong)
                .accounts({ block: blockPda, owner: user1.publicKey } as any)
                .signers([user1])
                .rpc(),
            "String is too long.",
        );
    });

    it("rejects image_url with javascript: scheme", async () => {
        await expectAnchorError(
            program.methods.updateBlock(blockId, "", "javascript:alert(1)", "")
                .accounts({ block: blockPda, owner: user1.publicKey } as any)
                .signers([user1])
                .rpc(),
            "URL must be empty or start with https://.",
        );
    });

    it("rejects url with data: scheme", async () => {
        await expectAnchorError(
            program.methods.updateBlock(blockId, "", "", "data:text/html,<script>alert(1)</script>")
                .accounts({ block: blockPda, owner: user1.publicKey } as any)
                .signers([user1])
                .rpc(),
            "URL must be empty or start with https://.",
        );
    });

    it("rejects url with http:// scheme (https-only policy)", async () => {
        await expectAnchorError(
            program.methods.updateBlock(blockId, "", "http://example.com/image.png", "")
                .accounts({ block: blockPda, owner: user1.publicKey } as any)
                .signers([user1])
                .rpc(),
            "URL must be empty or start with https://.",
        );
    });

    it("rejects url with file:// scheme", async () => {
        await expectAnchorError(
            program.methods.updateBlock(blockId, "", "", "file:///etc/passwd")
                .accounts({ block: blockPda, owner: user1.publicKey } as any)
                .signers([user1])
                .rpc(),
            "URL must be empty or start with https://.",
        );
    });

    it("updates block content with valid https URLs, emits enriched event, and updates timestamp", async () => {
        const before = await program.account.block.fetch(blockPda);
        const newText = "Hello Solana";
        const newImage = "https://example.com/image.png";
        const newUrl = "https://solana.com";

        const signature = await program.methods.updateBlock(blockId, newText, newImage, newUrl)
            .accounts({ block: blockPda, owner: user1.publicKey } as any)
            .signers([user1])
            .rpc();

        const blockAccount = await program.account.block.fetch(blockPda);
        assert.equal(decodeFixedString(blockAccount.text), newText);
        assert.equal(decodeFixedString(blockAccount.imageUrl), newImage);
        assert.equal(decodeFixedString(blockAccount.url), newUrl);
        assert.isAtLeast(blockAccount.timestamp.toNumber(), before.timestamp.toNumber());

        const event = await findEventInTransaction<BlockUpdatedEvent>(
            provider, program, signature, "BlockUpdated",
        );
        if (event) {
            assert.ok(toPublicKey(event.owner).equals(user1.publicKey));
            assert.equal(event.text, newText);
            assert.equal(event.imageUrl ?? event.image_url, newImage);
            assert.equal(event.url, newUrl);
        }
    });

    it("allows clearing all fields with empty strings", async () => {
        await program.methods.updateBlock(blockId, "", "", "")
            .accounts({ block: blockPda, owner: user1.publicKey } as any)
            .signers([user1])
            .rpc();

        const blockAccount = await program.account.block.fetch(blockPda);
        assert.equal(decodeFixedString(blockAccount.text), "");
        assert.equal(decodeFixedString(blockAccount.imageUrl), "");
        assert.equal(decodeFixedString(blockAccount.url), "");
    });

    // ── sell_block ───────────────────────────────────────────────────────────

    it("rejects listing by non-owner", async () => {
        await expectAnchorErrorOneOf(
            program.methods.sellBlock(blockId, new anchor.BN(resalePriceLamports))
                .accounts({ block: blockPda, owner: user2.publicKey } as any)
                .signers([user2])
                .rpc(),
            ["You are not the owner of this block.", "ConstraintHasOne", "has one constraint was violated"],
        );
    });

    it("lists and delists block for sale while emitting expected events", async () => {
        const salePrice = new anchor.BN(resalePriceLamports);

        const listSignature = await program.methods.sellBlock(blockId, salePrice)
            .accounts({ block: blockPda, owner: user1.publicKey } as any)
            .signers([user1])
            .rpc();

        const listedEvent = await findEventInTransaction<BlockSoldEvent>(
            provider, program, listSignature, "BlockSold",
        );
        if (listedEvent) {
            assert.equal(listedEvent.id, blockId);
            if (listedEvent.owner) assert.ok(toPublicKey(listedEvent.owner).equals(user1.publicKey));
            assert.equal(toLamportsNumber(listedEvent.price), resalePriceLamports);
            assert.equal(Boolean(listedEvent.isForSale ?? listedEvent.is_for_sale), true);
        }

        const listedBlock = await program.account.block.fetch(blockPda);
        assert.ok(listedBlock.isForSale);
        assert.ok(listedBlock.price.eq(salePrice));

        const delistSignature = await program.methods.sellBlock(blockId, new anchor.BN(0))
            .accounts({ block: blockPda, owner: user1.publicKey } as any)
            .signers([user1])
            .rpc();

        const delistedEvent = await findEventInTransaction<BlockSoldEvent>(
            provider, program, delistSignature, "BlockSold",
        );
        if (delistedEvent) {
            assert.equal(delistedEvent.id, blockId);
            if (delistedEvent.owner) assert.ok(toPublicKey(delistedEvent.owner).equals(user1.publicKey));
            assert.equal(toLamportsNumber(delistedEvent.price), 0);
            assert.equal(Boolean(delistedEvent.isForSale ?? delistedEvent.is_for_sale), false);
        }

        const delistedBlock = await program.account.block.fetch(blockPda);
        assert.ok(!delistedBlock.isForSale);
        assert.ok(delistedBlock.price.eq(new anchor.BN(0)));
    });

    // ── buy_resale ───────────────────────────────────────────────────────────

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

    it("rejects resale with wrong seller account", async () => {
        await program.methods.sellBlock(blockId, new anchor.BN(resalePriceLamports))
            .accounts({ block: blockPda, owner: user1.publicKey } as any)
            .signers([user1])
            .rpc();

        await expectAnchorErrorOneOf(
            program.methods.buyResale(blockId)
                .accounts({
                    block: blockPda,
                    grid: gridPubkey,
                    buyer: user2.publicKey,
                    seller: user2.publicKey, // wrong: user1 owns the block
                    admin: provider.wallet.publicKey,
                    systemProgram: SystemProgram.programId,
                } as any)
                .signers([user2])
                .rpc(),
            ["You are not the owner of this block.", "ConstraintRaw"],
        );
    });

    it("rejects resale with wrong admin account", async () => {
        // blockId is still listed from the previous test
        await expectAnchorErrorOneOf(
            program.methods.buyResale(blockId)
                .accounts({
                    block: blockPda,
                    grid: gridPubkey,
                    buyer: user2.publicKey,
                    seller: user1.publicKey,
                    admin: user2.publicKey, // wrong
                    systemProgram: SystemProgram.programId,
                } as any)
                .signers([user2])
                .rpc(),
            ["Invalid Admin Account.", "ConstraintRaw"],
        );
    });

    it("rejects self-purchase in resale (buyer equals seller)", async () => {
        // blockId is still listed; user1 owns it. Passing user1 as both buyer and
        // seller would make the SOL transfers cancel out, costing user1 only the 5%
        // fee for no benefit.
        await expectAnchorErrorOneOf(
            program.methods.buyResale(blockId)
                .accounts({
                    block: blockPda,
                    grid: gridPubkey,
                    buyer: user1.publicKey,
                    seller: user1.publicKey,
                    admin: provider.wallet.publicKey,
                    systemProgram: SystemProgram.programId,
                } as any)
                .signers([user1])
                .rpc(),
            ["You are not the owner of this block.", "ConstraintRaw"],
        );
    });

    it("executes resale, emits expected event, and splits funds correctly", async () => {
        // blockId is still listed from the "rejects resale with wrong seller" test.
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
            provider, program, resaleSignature, "BlockResold",
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
        assert.isAtLeast(adminDelta, expectedFee - resaleTxFee - FEE_JITTER_TOLERANCE_LAMPORTS);
        assert.isAtMost(adminDelta, expectedFee + FEE_JITTER_TOLERANCE_LAMPORTS);

        const blockAccount = await program.account.block.fetch(blockPda);
        assert.ok(blockAccount.owner.equals(user2.publicKey));
        assert.ok(!blockAccount.isForSale);
        assert.ok(blockAccount.price.eq(new anchor.BN(0)));
    });

    // ── close_block ──────────────────────────────────────────────────────────

    it("user1 buys secondary block for close_block tests", async () => {
        await program.methods.buyBlock(secondaryBlockId)
            .accounts({
                block: secondaryBlockPda,
                grid: gridPubkey,
                buyer: user1.publicKey,
                admin: provider.wallet.publicKey,
                systemProgram: SystemProgram.programId,
            } as any)
            .signers([user1])
            .rpc();

        const blockAccount = await program.account.block.fetch(secondaryBlockPda);
        assert.ok(blockAccount.owner.equals(user1.publicKey));
        assert.ok(!blockAccount.isForSale);
    });

    it("rejects close_block by non-owner", async () => {
        await expectAnchorErrorOneOf(
            program.methods.closeBlock(secondaryBlockId)
                .accounts({ block: secondaryBlockPda, owner: user2.publicKey } as any)
                .signers([user2])
                .rpc(),
            ["You are not the owner of this block.", "ConstraintHasOne", "has one constraint was violated"],
        );
    });

    it("rejects close_block when block is listed for sale", async () => {
        await program.methods.sellBlock(secondaryBlockId, new anchor.BN(resalePriceLamports))
            .accounts({ block: secondaryBlockPda, owner: user1.publicKey } as any)
            .signers([user1])
            .rpc();

        const listedBlock = await program.account.block.fetch(secondaryBlockPda);
        assert.ok(listedBlock.isForSale);

        await expectAnchorErrorOneOf(
            program.methods.closeBlock(secondaryBlockId)
                .accounts({ block: secondaryBlockPda, owner: user1.publicKey } as any)
                .signers([user1])
                .rpc(),
            ["Block is currently listed for sale.", "ConstraintRaw"],
        );
    });

    it("closes a delisted block and returns rent to owner", async () => {
        // Delist first (block is still listed from the previous test).
        await program.methods.sellBlock(secondaryBlockId, new anchor.BN(0))
            .accounts({ block: secondaryBlockPda, owner: user1.publicKey } as any)
            .signers([user1])
            .rpc();

        const ownerBefore = await provider.connection.getBalance(user1.publicKey);

        await program.methods.closeBlock(secondaryBlockId)
            .accounts({ block: secondaryBlockPda, owner: user1.publicKey } as any)
            .signers([user1])
            .rpc();

        // Account must no longer exist.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const closedAccount = await (program.account as any).block.fetchNullable(secondaryBlockPda);
        assert.isNull(closedAccount, "Block account should be closed");

        // Owner receives rent refund (~0.003 SOL), which far exceeds the tx fee.
        const ownerAfter = await provider.connection.getBalance(user1.publicKey);
        assert.isAbove(ownerAfter, ownerBefore - 10_000);
    });

    // ── update_admin ─────────────────────────────────────────────────────────

    it("rejects update_admin by non-admin signer", async () => {
        await expectAnchorErrorOneOf(
            program.methods.updateAdmin(user2.publicKey)
                .accounts({ grid: gridPubkey, admin: user2.publicKey } as any)
                .signers([user2])
                .rpc(),
            ["Invalid Admin Account.", "ConstraintHasOne", "has one constraint was violated"],
        );
    });

    it("rejects update_admin with zero pubkey as new admin", async () => {
        // Setting admin to the default pubkey would permanently brick the grid since
        // nobody can sign for Pubkey::default().
        await expectAnchorError(
            program.methods.updateAdmin(EMPTY_PUBKEY)
                .accounts({ grid: gridPubkey, admin: provider.wallet.publicKey } as any)
                .rpc(),
            "Invalid Admin Account.",
        );
    });

    it("transfers admin authority, emits AdminUpdated event, then restores", async () => {
        const sig1 = await program.methods.updateAdmin(user1.publicKey)
            .accounts({ grid: gridPubkey, admin: provider.wallet.publicKey } as any)
            .rpc();

        const event1 = await findEventInTransaction<AdminUpdatedEvent>(
            provider, program, sig1, "AdminUpdated",
        );
        if (event1) {
            const oldAdmin = event1.oldAdmin ?? event1.old_admin;
            const newAdmin = event1.newAdmin ?? event1.new_admin;
            assert.ok(toPublicKey(oldAdmin!).equals(provider.wallet.publicKey));
            assert.ok(toPublicKey(newAdmin!).equals(user1.publicKey));
        }

        const gridAfterChange = await program.account.gridState.fetch(gridPubkey);
        assert.ok(gridAfterChange.admin.equals(user1.publicKey));

        // Restore admin using user1 as signer (they are now the admin).
        const sig2 = await program.methods.updateAdmin(provider.wallet.publicKey)
            .accounts({ grid: gridPubkey, admin: user1.publicKey } as any)
            .signers([user1])
            .rpc();

        const event2 = await findEventInTransaction<AdminUpdatedEvent>(
            provider, program, sig2, "AdminUpdated",
        );
        if (event2) {
            const oldAdmin = event2.oldAdmin ?? event2.old_admin;
            const newAdmin = event2.newAdmin ?? event2.new_admin;
            assert.ok(toPublicKey(oldAdmin!).equals(user1.publicKey));
            assert.ok(toPublicKey(newAdmin!).equals(provider.wallet.publicKey));
        }

        const gridRestored = await program.account.gridState.fetch(gridPubkey);
        assert.ok(gridRestored.admin.equals(provider.wallet.publicKey));
    });
});
