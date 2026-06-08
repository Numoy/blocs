import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, act } from '@testing-library/react';

// vi.mock factory cannot reference top-level variables.
// Use vi.hoisted() to hoist the mock function definition.
const { mockUseStandardWallets, mockUsePrivy, mockUseWallet } = vi.hoisted(() => ({
    mockUseStandardWallets: vi.fn().mockReturnValue({ ready: true, wallets: [] }),
    mockUsePrivy: vi.fn().mockReturnValue({ authenticated: false, user: null }),
    mockUseWallet: vi.fn().mockReturnValue({ select: vi.fn(), connect: vi.fn().mockResolvedValue(undefined), wallet: null, connected: false, connecting: false, wallets: [] }),
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

const privyStandardWallet = (accounts = [{}]) => ({
    name: 'Privy',
    isPrivyWallet: true,
    accounts,
});

describe('PrivyWalletBridge', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUseStandardWallets.mockReturnValue({ ready: true, wallets: [] });
        mockUsePrivy.mockReturnValue({ authenticated: false, user: null });
        mockUseWallet.mockReturnValue({
            select: vi.fn(),
            connect: vi.fn().mockResolvedValue(undefined),
            wallet: null,
            connected: false,
            connecting: false,
            wallets: [],
        });
    });

    it('calls useStandardWallets to track embedded wallet readiness', () => {
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

        mockUseStandardWallets.mockReturnValue({
            ready: true,
            wallets: [privyStandardWallet()],
        });
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

    it('waits for the Privy embedded account before selecting the adapter', async () => {
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
        mockUseStandardWallets.mockReturnValue({
            ready: true,
            wallets: [privyStandardWallet([])],
        });

        const { rerender } = render(<PrivyWalletBridge><div /></PrivyWalletBridge>);
        expect(mockSelect).not.toHaveBeenCalled();

        mockUseStandardWallets.mockReturnValue({
            ready: true,
            wallets: [privyStandardWallet()],
        });

        await act(async () => {
            rerender(<PrivyWalletBridge><div /></PrivyWalletBridge>);
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

        mockUseStandardWallets.mockReturnValue({
            ready: true,
            wallets: [privyStandardWallet()],
        });
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

    it('auto-selects the Privy wallet if a different wallet is connected', async () => {
        const mockSelect = vi.fn();
        const privyAdapter = { adapter: { name: 'Privy' } };

        mockUseStandardWallets.mockReturnValue({
            ready: true,
            wallets: [privyStandardWallet()],
        });
        mockUsePrivy.mockReturnValue({
            authenticated: true,
            user: { wallet: { walletClientType: 'privy' } },
        });
        mockUseWallet.mockReturnValue({
            select: mockSelect,
            connect: vi.fn(),
            wallet: { adapter: { name: 'Phantom' } }, // different wallet connected
            connected: true,
            connecting: false,
            wallets: [privyAdapter],
        });

        await act(async () => {
            render(<PrivyWalletBridge><div /></PrivyWalletBridge>);
        });

        expect(mockSelect).toHaveBeenCalledWith('Privy');
    });

    it('gates connect() for Privy wallet adapter on accounts array loading', async () => {
        const mockConnect = vi.fn().mockResolvedValue(undefined);
        const privyAdapter = { adapter: { name: 'Privy' } };

        mockUseStandardWallets.mockReturnValue({
            ready: true,
            wallets: [privyStandardWallet([])], // no accounts
        });
        mockUsePrivy.mockReturnValue({
            authenticated: true,
            user: { wallet: { walletClientType: 'privy' } },
        });
        mockUseWallet.mockReturnValue({
            select: vi.fn(),
            connect: mockConnect,
            wallet: privyAdapter,
            connected: false,
            connecting: false,
            wallets: [privyAdapter],
        });

        const { rerender } = render(<PrivyWalletBridge><div /></PrivyWalletBridge>);
        expect(mockConnect).not.toHaveBeenCalled();

        mockUseStandardWallets.mockReturnValue({
            ready: true,
            wallets: [privyStandardWallet([{}])], // account loads
        });

        await act(async () => {
            rerender(<PrivyWalletBridge><div /></PrivyWalletBridge>);
        });

        expect(mockConnect).toHaveBeenCalled();
    });

    it('does not gate connect() for non-Privy wallet adapters', async () => {
        const mockConnect = vi.fn().mockResolvedValue(undefined);
        const phantomAdapter = { adapter: { name: 'Phantom' } };

        mockUseStandardWallets.mockReturnValue({
            ready: true,
            wallets: [],
        });
        mockUsePrivy.mockReturnValue({
            authenticated: false,
            user: null,
        });
        mockUseWallet.mockReturnValue({
            select: vi.fn(),
            connect: mockConnect,
            wallet: phantomAdapter,
            connected: false,
            connecting: false,
            wallets: [phantomAdapter],
        });

        render(<PrivyWalletBridge><div /></PrivyWalletBridge>);
        expect(mockConnect).toHaveBeenCalled();
    });
});
