import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MobileBlockSheet } from '../MobileBlockSheet';
import type { BlockData } from '@/types';

vi.mock('next/link', () => ({
    default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
        <a href={href} className={className}>{children}</a>
    ),
}));

const baseBlock: BlockData = {
    id: 42,
    owner: 'other-owner-key',
    price: 1.5,
    isForSale: true,
    color: '#9945FF',
    text: 'Buy me!',
    imageUrl: '',
    url: '',
    image: null,
};

const defaultProps = {
    block: baseBlock,
    isOwner: false,
    isBuying: false,
    onBuy: vi.fn().mockResolvedValue(undefined),
    onEdit: vi.fn(),
    onShare: vi.fn().mockResolvedValue(undefined),
    onClose: vi.fn(),
};

describe('MobileBlockSheet', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('renders nothing when block is null', () => {
        const { container } = render(<MobileBlockSheet {...defaultProps} block={null} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('renders block id and text', () => {
        render(<MobileBlockSheet {...defaultProps} />);
        expect(screen.getByText('Block #42')).toBeInTheDocument();
        expect(screen.getByText('Buy me!')).toBeInTheDocument();
    });

    // ── Buy button ────────────────────────────────────────────────────────────

    it('shows Buy button when block is for sale and user is not the owner', () => {
        render(<MobileBlockSheet {...defaultProps} block={{ ...baseBlock, isForSale: true }} isOwner={false} />);
        expect(screen.getByRole('button', { name: 'Buy' })).toBeInTheDocument();
    });

    it('hides Buy button when block is not for sale', () => {
        render(<MobileBlockSheet {...defaultProps} block={{ ...baseBlock, isForSale: false }} isOwner={false} />);
        expect(screen.queryByRole('button', { name: /buy/i })).not.toBeInTheDocument();
    });

    it('hides Buy button when user is the owner', () => {
        render(<MobileBlockSheet {...defaultProps} block={{ ...baseBlock, isForSale: true }} isOwner={true} />);
        expect(screen.queryByRole('button', { name: /buy/i })).not.toBeInTheDocument();
    });

    it('shows "Processing..." and disables Buy button while buying', () => {
        render(<MobileBlockSheet {...defaultProps} isBuying={true} />);
        const btn = screen.getByRole('button', { name: 'Processing...' });
        expect(btn).toBeDisabled();
    });

    it('calls onBuy when Buy button is clicked', () => {
        render(<MobileBlockSheet {...defaultProps} />);
        fireEvent.click(screen.getByRole('button', { name: 'Buy' }));
        expect(defaultProps.onBuy).toHaveBeenCalledTimes(1);
    });

    // ── Wallet hint ───────────────────────────────────────────────────────────

    it('shows wallet confirmation hint when isBuying is true', () => {
        render(<MobileBlockSheet {...defaultProps} isBuying={true} />);
        expect(screen.getByText('Check your wallet to confirm.')).toBeInTheDocument();
    });

    it('hides wallet confirmation hint when not buying', () => {
        render(<MobileBlockSheet {...defaultProps} isBuying={false} />);
        expect(screen.queryByText('Check your wallet to confirm.')).not.toBeInTheDocument();
    });

    // ── Not-for-sale note ─────────────────────────────────────────────────────

    it('shows "not listed for sale" note when block has owner but is not for sale', () => {
        render(<MobileBlockSheet {...defaultProps} block={{ ...baseBlock, isForSale: false, owner: 'someone' }} isOwner={false} />);
        expect(screen.getByText('Not listed for sale.')).toBeInTheDocument();
    });

    it('shows "not claimed yet" note when block has no owner and is not for sale', () => {
        render(<MobileBlockSheet {...defaultProps} block={{ ...baseBlock, isForSale: false, owner: null }} isOwner={false} />);
        expect(screen.getByText('Not claimed yet — be the first to own it.')).toBeInTheDocument();
    });

    it('does not show the not-for-sale note when block is for sale', () => {
        render(<MobileBlockSheet {...defaultProps} block={{ ...baseBlock, isForSale: true }} />);
        expect(screen.queryByText(/not listed for sale/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/not been claimed/i)).not.toBeInTheDocument();
    });

    it('does not show the not-for-sale note when user is the owner', () => {
        render(<MobileBlockSheet {...defaultProps} block={{ ...baseBlock, isForSale: false }} isOwner={true} />);
        expect(screen.queryByText(/not listed for sale/i)).not.toBeInTheDocument();
    });

    // ── Edit button ───────────────────────────────────────────────────────────

    it('shows Edit button for the owner', () => {
        render(<MobileBlockSheet {...defaultProps} isOwner={true} />);
        expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    });

    it('hides Edit button for non-owners', () => {
        render(<MobileBlockSheet {...defaultProps} isOwner={false} />);
        expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    });

    it('calls onEdit when Edit button is clicked', () => {
        render(<MobileBlockSheet {...defaultProps} isOwner={true} />);
        fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
        expect(defaultProps.onEdit).toHaveBeenCalledTimes(1);
    });

    // ── Subtitle ──────────────────────────────────────────────────────────────

    it('shows "Owned by you" when isOwner', () => {
        render(<MobileBlockSheet {...defaultProps} isOwner={true} block={{ ...baseBlock, owner: 'me' }} />);
        expect(screen.getByText('Owned by you')).toBeInTheDocument();
    });

    it('shows "Owned" when block has an owner that is not the user', () => {
        render(<MobileBlockSheet {...defaultProps} isOwner={false} block={{ ...baseBlock, owner: 'someone-else' }} />);
        expect(screen.getByText('Owned')).toBeInTheDocument();
    });

    it('shows "Available" when block has no owner', () => {
        render(<MobileBlockSheet {...defaultProps} block={{ ...baseBlock, owner: null }} />);
        expect(screen.getByText('Available')).toBeInTheDocument();
    });

    // ── Share / Close / Details ───────────────────────────────────────────────

    it('calls onShare when Share button is clicked', () => {
        render(<MobileBlockSheet {...defaultProps} />);
        fireEvent.click(screen.getByRole('button', { name: 'Share' }));
        expect(defaultProps.onShare).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when Close button is clicked', () => {
        render(<MobileBlockSheet {...defaultProps} />);
        // There are two close triggers: the button and the backdrop
        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
    });

    it('renders a Details link pointing to the block page', () => {
        render(<MobileBlockSheet {...defaultProps} />);
        const link = screen.getByRole('link', { name: 'Details' });
        expect(link).toHaveAttribute('href', '/block/42');
    });

    // ── Price chip ────────────────────────────────────────────────────────────

    it('shows price chip when block is for sale', () => {
        render(<MobileBlockSheet {...defaultProps} block={{ ...baseBlock, isForSale: true, price: 2.5 }} />);
        expect(screen.getByText('2.5 SOL')).toBeInTheDocument();
    });

    it('shows "Not for sale" chip when not for sale', () => {
        render(<MobileBlockSheet {...defaultProps} block={{ ...baseBlock, isForSale: false }} />);
        expect(screen.getByText('Not for sale')).toBeInTheDocument();
    });
});
