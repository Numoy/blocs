import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { PublicKey, TransactionInstruction } from '@solana/web3.js';
import { useBlockActions } from '../useBlockActions';
import { deriveBlockPda } from '@/context/program/helpers';

// ── Mocks ─────────────────────────────────────────────────────────────────────

// vi.hoisted ensures these are initialised before vi.mock factories run
const mockToast = vi.hoisted(() => ({
    loading: vi.fn().mockReturnValue('mock-toast-id'),
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
}));
const mockToastId = 'mock-toast-id';

vi.mock('sonner', () => ({ toast: mockToast }));
vi.mock('@/utils/analytics', () => ({
    trackPlausibleEvent: vi.fn(),
    toErrorCategory: vi.fn().mockReturnValue('unknown'),
}));
vi.mock('@/utils/moderation', () => ({
    isContentAllowed: vi.fn().mockReturnValue(true),
}));
// deriveBlockPda uses findProgramAddressSync which fails in the test crypto env,
// so we stub it with a deterministic fake PDA
vi.mock('@/context/program/helpers', async () => {
    const actual = await vi.importActual('@/context/program/helpers') as object;
    return { ...actual, deriveBlockPda: vi.fn() };
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

const FAKE_PDA = new PublicKey('11111111111111111111111111111111');
const BUYER = new PublicKey('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM');
const SELLER = new PublicKey('8FE27ioQh3T7o22QsYVT5Re8NnHFqmFNbdqwiF3ywuZQ');
const PROGRAM_ID = new PublicKey('C4MgCjSCzHPnxaFHqTPFH7ur67rKHeunEQAzGRSMDKDM');
const ADMIN = new PublicKey('11111111111111111111111111111111');

// Real TransactionInstruction so Transaction.add() doesn't throw
const fakeIx = () => new TransactionInstruction({ keys: [], programId: PROGRAM_ID });

const makeInstructionChain = () => ({
    accounts: vi.fn().mockReturnValue({
        instruction: vi.fn().mockResolvedValue(fakeIx()),
    }),
});

const makeMockProgram = () => ({
    methods: {
        buyBlock: vi.fn().mockReturnValue(makeInstructionChain()),
        buyResale: vi.fn().mockReturnValue(makeInstructionChain()),
        updateBlock: vi.fn().mockReturnValue(makeInstructionChain()),
        sellBlock: vi.fn().mockReturnValue(makeInstructionChain()),
    },
    account: {
        gridState: { fetch: vi.fn().mockResolvedValue({ admin: ADMIN }) },
    },
    programId: PROGRAM_ID,
});

const makeMockConnection = () => ({
    getBalance: vi.fn().mockResolvedValue(100_000_000), // 0.1 SOL — enough for any buy
    getLatestBlockhash: vi.fn().mockResolvedValue({ blockhash: 'fakehash', lastValidBlockHeight: 100 }),
    getSignatureStatuses: vi.fn().mockResolvedValue({
        value: [{ err: null, confirmationStatus: 'confirmed' }],
    }),
    getBlockHeight: vi.fn().mockResolvedValue(99),
});

const unclaimedBlock = {
    id: 5,
    owner: null,
    price: 0.01,
    isForSale: true,
    text: '',
    imageUrl: '',
    url: '',
    image: null,
};

const resaleBlock = {
    ...unclaimedBlock,
    id: 1,
    owner: SELLER.toBase58(),
    price: 2.0,
    isForSale: true,
};

const buildHook = (overrides: Partial<Parameters<typeof useBlockActions>[0]> = {}) => {
    const program = makeMockProgram();
    const connection = makeMockConnection();
    const sendTransaction = vi.fn().mockResolvedValue('tx-signature');
    const updateBlockInState = vi.fn();
    const fetchGrid = vi.fn().mockResolvedValue(undefined);
    const refreshBlockById = vi.fn().mockResolvedValue(undefined);
    const queueGridSync = vi.fn();
    const onFundWallet = vi.fn();

    const { result } = renderHook(() =>
        useBlockActions({
            connected: true,
            publicKey: BUYER,
            wallet: { publicKey: BUYER },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            sendTransaction: sendTransaction as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            connection: connection as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            program: program as any,
            blocks: [unclaimedBlock, resaleBlock],
            gridAdmin: ADMIN,
            fetchGrid,
            refreshBlockById,
            queueGridSync,
            updateBlockInState,
            onFundWallet,
            ...overrides,
        })
    );

    return { result, program, connection, sendTransaction, updateBlockInState, fetchGrid, refreshBlockById, queueGridSync, onFundWallet };
};

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(deriveBlockPda).mockReturnValue(FAKE_PDA);
});

describe('buyBlock — pre-flight checks', () => {
    it('throws and shows error toast when wallet is not connected', async () => {
        const { result } = buildHook({ connected: false, publicKey: null });
        await expect(result.current.buyBlock(5, 0.01)).rejects.toThrow('Wallet not connected');
        expect(mockToast.error).toHaveBeenCalledWith('Connect wallet first');
    });
});

describe('buyBlock — primary purchase (unclaimed block)', () => {
    it('shows loading toast and sends transaction', async () => {
        const { result, sendTransaction } = buildHook();
        await result.current.buyBlock(5, 0.01, 'grid_sidebar');
        expect(mockToast.loading).toHaveBeenCalledWith('Buying block...');
        expect(sendTransaction).toHaveBeenCalledTimes(1);
    });

    it('calls updateBlockInState optimistically with buyer as new owner', async () => {
        const { result, updateBlockInState } = buildHook();
        await result.current.buyBlock(5, 0.01);
        expect(updateBlockInState).toHaveBeenCalledWith(5, expect.any(Function));
        const updater = updateBlockInState.mock.calls[0][1];
        const updated = updater(unclaimedBlock);
        expect(updated.owner).toBe(BUYER.toBase58());
        expect(updated.isForSale).toBe(false);
    });

    it('shows success toast after on-chain confirmation', async () => {
        const { result, connection } = buildHook();
        await result.current.buyBlock(5, 0.01);
        expect(connection.getSignatureStatuses).toHaveBeenCalledWith(['tx-signature']);
        expect(mockToast.success).toHaveBeenCalledWith(
            'Block purchased!',
            expect.objectContaining({ id: mockToastId })
        );
    });

    it('refreshes the individual block after purchase', async () => {
        const { result, refreshBlockById } = buildHook();
        await result.current.buyBlock(5, 0.01);
        expect(refreshBlockById).toHaveBeenCalledWith(5);
    });
});

describe('buyBlock — user rejection', () => {
    it('shows "Transaction cancelled" info toast when user rejects', async () => {
        const { result } = buildHook({
            sendTransaction: vi.fn().mockRejectedValue(new Error('User rejected the request.')) as never,
        });
        await expect(result.current.buyBlock(5, 0.01)).rejects.toThrow('User cancelled');
        expect(mockToast.info).toHaveBeenCalledWith(
            'Transaction cancelled',
            expect.objectContaining({ id: mockToastId })
        );
        expect(mockToast.error).not.toHaveBeenCalled();
    });

    it('handles "cancelled" wording', async () => {
        const { result } = buildHook({
            sendTransaction: vi.fn().mockRejectedValue(new Error('Transaction was cancelled by the user')) as never,
        });
        await expect(result.current.buyBlock(5, 0.01)).rejects.toThrow();
        expect(mockToast.info).toHaveBeenCalledWith('Transaction cancelled', expect.anything());
        expect(mockToast.error).not.toHaveBeenCalled();
    });
});

describe('buyBlock — insufficient funds', () => {
    it('shows "Not enough SOL" error with "Add SOL" action', async () => {
        const { result } = buildHook({
            sendTransaction: vi.fn().mockRejectedValue(
                new Error('Transaction simulation failed: insufficient funds for instruction')
            ) as never,
        });
        await expect(result.current.buyBlock(5, 0.01)).rejects.toThrow();
        expect(mockToast.error).toHaveBeenCalledWith(
            'Not enough SOL in your wallet to buy this block.',
            expect.objectContaining({ id: mockToastId, action: expect.objectContaining({ label: 'Add SOL' }) })
        );
    });

    it('"Add SOL" action onClick calls onFundWallet', async () => {
        const { result, onFundWallet } = buildHook({
            sendTransaction: vi.fn().mockRejectedValue(
                new Error('insufficient funds')
            ) as never,
        });
        await expect(result.current.buyBlock(5, 0.01)).rejects.toThrow();
        const action = mockToast.error.mock.calls[0][1].action;
        action.onClick();
        expect(onFundWallet).toHaveBeenCalledTimes(1);
    });

    it('detects "insufficient lamports" phrasing', async () => {
        const { result } = buildHook({
            sendTransaction: vi.fn().mockRejectedValue(
                new Error('Transfer: insufficient lamports 500, need 1000000000')
            ) as never,
        });
        await expect(result.current.buyBlock(5, 0.01)).rejects.toThrow();
        expect(mockToast.error).toHaveBeenCalledWith(
            'Not enough SOL in your wallet to buy this block.',
            expect.anything()
        );
    });
});

describe('buyBlock — block not found', () => {
    it('throws and fetches the grid when block id is not in the blocks array', async () => {
        const { result, fetchGrid } = buildHook();
        await expect(result.current.buyBlock(999, 0.01)).rejects.toThrow('Block data unavailable');
        expect(fetchGrid).toHaveBeenCalled();
    });
});

describe('buyBlock — resale price mismatch', () => {
    it('throws and refreshes grid when the stored price differs from the buy price', async () => {
        const { result, fetchGrid } = buildHook();
        // resaleBlock is at id=1 with price=2.0; pass stale price 1.0
        await expect(result.current.buyBlock(1, 1.0)).rejects.toThrow('Price changed');
        expect(fetchGrid).toHaveBeenCalled();
        expect(mockToast.error).toHaveBeenCalledWith('Price changed. Grid refreshed.');
    });
});

describe('buyBlock — generic error', () => {
    it('shows a specific failure toast for unexpected errors', async () => {
        const { result } = buildHook({
            sendTransaction: vi.fn().mockRejectedValue(new Error('Network error')) as never,
        });
        await expect(result.current.buyBlock(5, 0.01)).rejects.toThrow('Network error');
        expect(mockToast.error).toHaveBeenCalledWith(
            expect.stringContaining('Network error'),
            expect.objectContaining({ id: mockToastId })
        );
    });
});
