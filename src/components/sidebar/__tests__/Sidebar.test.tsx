import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Sidebar } from '../Sidebar';
import { BlockData } from '@/types';

// Mock Hooks
const mockUpdateBlock = vi.fn();
const mockSellBlock = vi.fn();
const mockOpenWalletModal = vi.fn();

vi.mock('@/context/ProgramContext', () => ({
    useProgram: () => ({
        updateBlock: mockUpdateBlock,
        sellBlock: mockSellBlock,
        openWalletModal: mockOpenWalletModal,
    }),
}));

const mockPublicKey = { toBase58: () => 'user-public-key' };

vi.mock('@solana/wallet-adapter-react', () => ({
    useWallet: () => ({
        publicKey: mockPublicKey,
    }),
    useConnection: () => ({
        connection: {
            getMinimumBalanceForRentExemption: vi.fn().mockResolvedValue(1000000), // 0.001 SOL
        },
    }),
}));

vi.mock('sonner', () => ({
    toast: {
        error: vi.fn(),
        success: vi.fn(),
    },
}));

// Mock Block Data
const mockBlock: BlockData = {
    id: 1,
    owner: 'other-owner',
    price: 1.5,
    isForSale: true,
    color: '#ffffff',
    text: 'Hello World',
    imageUrl: '',
    url: 'https://example.com',
    image: null
};

const mockOwnedBlock: BlockData = {
    ...mockBlock,
    owner: 'user-public-key',
};

describe('Sidebar Component', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should not render if no block provided', async () => {
        let container: HTMLElement;
        await act(async () => {
            ({ container } = render(
                <Sidebar block={null} onClose={vi.fn()} onBuy={vi.fn()} />
            ));
        });
        expect(container).toBeEmptyDOMElement();
    });

    it('should render block details correctly', async () => {
        await act(async () => {
            render(<Sidebar block={mockBlock} onClose={vi.fn()} onBuy={vi.fn()} />);
        });

        expect(screen.getByText('Block #1')).toBeInTheDocument();
        expect(screen.getByText('Hello World')).toBeInTheDocument();
    });

    it('should show Buy button for for-sale blocks not owned by user', async () => {
        const onBuy = vi.fn();
        await act(async () => {
            render(<Sidebar block={mockBlock} onClose={vi.fn()} onBuy={onBuy} />);
        });

        const buyButton = screen.getByText('Buy Block');
        expect(buyButton).toBeInTheDocument();

        await act(async () => {
            fireEvent.click(buyButton);
        });
        expect(onBuy).toHaveBeenCalledWith(mockBlock);
    });

    it('should show Edit button for owned blocks', async () => {
        await act(async () => {
            render(<Sidebar block={mockOwnedBlock} onClose={vi.fn()} onBuy={vi.fn()} />);
        });

        expect(screen.getByText('Edit Block')).toBeInTheDocument();
        expect(screen.queryByText('Buy Block')).not.toBeInTheDocument();
    });

    it('should call onClose when close button clicked', async () => {
        const onClose = vi.fn();
        await act(async () => {
            render(<Sidebar block={mockBlock} onClose={onClose} onBuy={vi.fn()} />);
        });

        await act(async () => {
            fireEvent.click(screen.getByLabelText('Close sidebar'));
        });
        expect(onClose).toHaveBeenCalled();
    });
});
