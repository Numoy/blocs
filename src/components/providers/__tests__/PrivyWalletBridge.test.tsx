import { describe, it, expect, vi } from 'vitest';
import { render, act } from '@testing-library/react';

// vi.mock factory cannot reference top-level variables.
// Use vi.hoisted() to hoist the mock function definition.
const { mockUseStandardWallets, mockUsePrivy, mockUseWallet } = vi.hoisted(() => ({
    mockUseStandardWallets: vi.fn().mockReturnValue({ ready: true, wallets: [] }),
    mockUsePrivy: vi.fn().mockReturnValue({ authenticated: false, user: null }),
    mockUseWallet: vi.fn().mockReturnValue({ select: vi.fn(), connect: vi.fn(), wallet: null, connected: false, connecting: false, wallets: [] }),
}));

vi.mock('@privy-io/react-auth/solana', () => ({
    useStandardWallets: mockUseStandardWallets,
}));

vi.mock('@privy-io/react-auth', () => ({
    usePrivy: mockUsePrivy,
}));

vi.mock('@solana/wallet-adapter-react', () => ({
    useWallet: mockUseWallet,
}));

// Import after mocks so they take effect
import { PrivyWalletBridge } from '../PrivyWalletBridge';

describe('PrivyWalletBridge', () => {
    it('calls useStandardWallets to register embedded wallet', () => {
        render(
            <PrivyWalletBridge>
                <div data-testid="child">content</div>
            </PrivyWalletBridge>
        );

        expect(mockUseStandardWallets).toHaveBeenCalled();
    });

    it('renders children passthrough', () => {
        const { getByTestId } = render(
            <PrivyWalletBridge>
                <div data-testid="child">hello</div>
            </PrivyWalletBridge>
        );

        expect(getByTestId('child')).toHaveTextContent('hello');
    });

    it('does not select any wallet when not authenticated', () => {
        const mockSelect = vi.fn();
        mockUsePrivy.mockReturnValue({ authenticated: false, user: null });
        mockUseWallet.mockReturnValue({ select: mockSelect, wallet: null, wallets: [] });

        render(<PrivyWalletBridge><div /></PrivyWalletBridge>);

        expect(mockSelect).not.toHaveBeenCalled();
    });

    it('selects the privy embedded wallet after social/email login', async () => {
        const mockSelect = vi.fn();
        const privyAdapter = { adapter: { name: 'Privy' } };

        mockUsePrivy.mockReturnValue({
            authenticated: true,
            user: { wallet: { walletClientType: 'privy' } },
        });
        mockUseWallet.mockReturnValue({
            select: mockSelect,
            wallet: null,
            wallets: [privyAdapter],
        });

        await act(async () => {
            render(<PrivyWalletBridge><div /></PrivyWalletBridge>);
        });

        expect(mockSelect).toHaveBeenCalledWith('Privy');
    });

    it('selects the Phantom adapter after external wallet login', async () => {
        const mockSelect = vi.fn();
        const phantomAdapter = { adapter: { name: 'Phantom' } };
        const privyAdapter = { adapter: { name: 'Privy' } };

        mockUsePrivy.mockReturnValue({
            authenticated: true,
            user: { wallet: { walletClientType: 'phantom' } },
        });
        mockUseWallet.mockReturnValue({
            select: mockSelect,
            wallet: null,
            wallets: [privyAdapter, phantomAdapter],
        });

        await act(async () => {
            render(<PrivyWalletBridge><div /></PrivyWalletBridge>);
        });

        expect(mockSelect).toHaveBeenCalledWith('Phantom');
    });

    it('falls back to embedded wallet if external adapter is not detected', async () => {
        const mockSelect = vi.fn();
        const privyAdapter = { adapter: { name: 'Privy' } };

        mockUsePrivy.mockReturnValue({
            authenticated: true,
            user: { wallet: { walletClientType: 'backpack' } },
        });
        mockUseWallet.mockReturnValue({
            select: mockSelect,
            wallet: null,
            wallets: [privyAdapter], // Backpack not detected
        });

        await act(async () => {
            render(<PrivyWalletBridge><div /></PrivyWalletBridge>);
        });

        expect(mockSelect).toHaveBeenCalledWith('Privy');
    });

    it('does not auto-select if a wallet is already connected', async () => {
        const mockSelect = vi.fn();
        const privyAdapter = { adapter: { name: 'Privy' } };

        mockUsePrivy.mockReturnValue({
            authenticated: true,
            user: { wallet: { walletClientType: 'privy' } },
        });
        mockUseWallet.mockReturnValue({
            select: mockSelect,
            connect: vi.fn(),
            wallet: { adapter: { name: 'Phantom' } }, // already connected
            connected: true,
            connecting: false,
            wallets: [privyAdapter],
        });

        await act(async () => {
            render(<PrivyWalletBridge><div /></PrivyWalletBridge>);
        });

        expect(mockSelect).not.toHaveBeenCalled();
    });
});
