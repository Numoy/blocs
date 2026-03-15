import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { Sidebar } from '../Sidebar';
import { BlockData } from '@/types';

// Mock Hooks
const mockUpdateBlock = vi.fn();
const mockSellBlock = vi.fn();
const mockOpenWalletModal = vi.fn();
const mockGetMinimumBalanceForRentExemption = vi.fn();

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
            getMinimumBalanceForRentExemption: mockGetMinimumBalanceForRentExemption, // 0.001 SOL
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
        mockGetMinimumBalanceForRentExemption.mockResolvedValue(1000000);
    });

    const renderSidebar = (block: BlockData | null, overrides?: { onClose?: () => void; onBuy?: (block: BlockData) => Promise<void> }) => {
        const onClose = overrides?.onClose ?? vi.fn();
        const onBuy = overrides?.onBuy ?? vi.fn().mockResolvedValue(undefined);
        const rendered = render(<Sidebar block={block} onClose={onClose} onBuy={onBuy} />);
        return { ...rendered, onClose, onBuy };
    };

    it('should not render if no block provided', () => {
        const { container } = renderSidebar(null);
        expect(container).toBeEmptyDOMElement();
    });

    it('should render block details correctly', async () => {
        renderSidebar(mockBlock);

        await waitFor(() => {
            expect(screen.getByText('Block #1')).toBeInTheDocument();
        });
        expect(screen.getByText('Hello World')).toBeInTheDocument();
    });

    it('should show Buy button for for-sale blocks not owned by user', async () => {
        const onBuy = vi.fn().mockResolvedValue(undefined);
        renderSidebar(mockBlock, { onBuy });

        await waitFor(() => {
            expect(screen.getByText('Buy Block')).toBeInTheDocument();
        });

        const buyButton = screen.getByText('Buy Block');
        await act(async () => {
            fireEvent.click(buyButton);
        });

        await waitFor(() => expect(onBuy).toHaveBeenCalledWith(mockBlock));
    });

    it('should show Edit button for owned blocks', async () => {
        renderSidebar(mockOwnedBlock);

        await waitFor(() => {
            expect(screen.getByText('Edit Block')).toBeInTheDocument();
        });
        expect(screen.queryByText('Buy Block')).not.toBeInTheDocument();
    });

    it('should call onClose when close button clicked', async () => {
        const onClose = vi.fn();
        renderSidebar(mockBlock, { onClose });

        await waitFor(() => {
            expect(screen.getByLabelText('Close sidebar')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByLabelText('Close sidebar'));
        expect(onClose).toHaveBeenCalled();
    });
});
