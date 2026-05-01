import { describe, it, expect, vi } from 'vitest';

const { mockRegister, mockUseStandardWallets } = vi.hoisted(() => ({
    mockRegister: vi.fn(() => vi.fn()),
    mockUseStandardWallets: vi.fn<() => { ready: boolean; wallets: unknown[] }>(() => ({ ready: true, wallets: [] })),
}));

// ---------- Mock PrivyProvider ----------
vi.mock('@privy-io/react-auth', () => ({
    PrivyProvider: ({ children, appId, config }: {
        children: React.ReactNode;
        appId: string;
        config: Record<string, unknown>;
    }) => (
        <div
            data-testid="privy-provider"
            data-app-id={appId}
            data-config={JSON.stringify(config)}
        >
            {children}
        </div>
    ),
}));

vi.mock('@privy-io/react-auth/solana', () => ({
    toSolanaWalletConnectors: () => 'mock-solana-connectors',
    useStandardWallets: mockUseStandardWallets,
}));

vi.mock('@wallet-standard/app', () => ({
    getWallets: () => ({
        register: mockRegister,
    }),
}));

// ---------- Mock wallet adapter ----------
vi.mock('@solana/wallet-adapter-react', () => ({
    ConnectionProvider: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="connection-provider">{children}</div>
    ),
    WalletProvider: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="wallet-provider">{children}</div>
    ),
}));

vi.mock('@solana/wallet-adapter-react-ui', () => ({
    WalletModalProvider: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="wallet-modal-provider">{children}</div>
    ),
}));

vi.mock('@/components/providers/PrivyWalletBridge', () => ({
    PrivyWalletBridge: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="privy-wallet-bridge">{children}</div>
    ),
}));

vi.mock('@/utils/rpc', () => ({
    resolveSolanaRpcEndpoint: () => 'https://api.devnet.solana.com',
}));

import { render, screen } from '@testing-library/react';

describe('WalletContextProvider', () => {
    const ORIGINAL_ENV = process.env;

    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        mockUseStandardWallets.mockReturnValue({ ready: true, wallets: [] });
        process.env = {
            ...ORIGINAL_ENV,
            NEXT_PUBLIC_SOLANA_RPC_URL: 'https://api.devnet.solana.com'
        };
    });

    afterEach(() => {
        process.env = ORIGINAL_ENV;
    });

    it('throws if NEXT_PUBLIC_PRIVY_APP_ID is missing', async () => {
        delete process.env.NEXT_PUBLIC_PRIVY_APP_ID;
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

        // Since validation happens in src/env.ts at module level, 
        // importing the component (which imports env) will throw.
        await expect(import('../WalletContextProvider')).rejects.toThrow();

        consoleSpy.mockRestore();
    });

    it('renders full provider stack when NEXT_PUBLIC_PRIVY_APP_ID is set', async () => {
        process.env.NEXT_PUBLIC_PRIVY_APP_ID = 'test-privy-app-id';

        const { WalletContextProvider } = await import('../WalletContextProvider');

        render(
            <WalletContextProvider>
                <div data-testid="app-child">hello</div>
            </WalletContextProvider>
        );

        expect(screen.getByTestId('privy-provider')).toBeInTheDocument();
        expect(screen.getByTestId('connection-provider')).toBeInTheDocument();
        expect(screen.getByTestId('wallet-provider')).toBeInTheDocument();
        expect(screen.getByTestId('wallet-modal-provider')).toBeInTheDocument();
        expect(screen.getByTestId('privy-wallet-bridge')).toBeInTheDocument();
        expect(screen.getByTestId('app-child')).toHaveTextContent('hello');
    });

    it('registers Privy Solana standard wallet for wallet-adapter discovery', async () => {
        process.env.NEXT_PUBLIC_PRIVY_APP_ID = 'test-id';
        const privyWallet = { name: 'Privy', isPrivyWallet: true };
        const phantomWallet = { name: 'Phantom' };
        mockUseStandardWallets.mockReturnValue({
            ready: true,
            wallets: [privyWallet, phantomWallet],
        });

        const { WalletContextProvider } = await import('../WalletContextProvider');

        render(
            <WalletContextProvider>
                <div>test</div>
            </WalletContextProvider>
        );

        expect(mockRegister).toHaveBeenCalledWith(privyWallet);
        expect(mockRegister).not.toHaveBeenCalledWith(phantomWallet);
    });

    it('passes correct appId to PrivyProvider', async () => {
        process.env.NEXT_PUBLIC_PRIVY_APP_ID = 'my-app-id-123';

        const { WalletContextProvider } = await import('../WalletContextProvider');

        render(
            <WalletContextProvider>
                <div>test</div>
            </WalletContextProvider>
        );

        const privyProvider = screen.getByTestId('privy-provider');
        expect(privyProvider).toHaveAttribute('data-app-id', 'my-app-id-123');
    });

    it('configures Privy with dark theme and solana-only wallets', async () => {
        process.env.NEXT_PUBLIC_PRIVY_APP_ID = 'test-id';

        const { WalletContextProvider } = await import('../WalletContextProvider');

        render(
            <WalletContextProvider>
                <div>test</div>
            </WalletContextProvider>
        );

        const privyProvider = screen.getByTestId('privy-provider');
        const config = JSON.parse(privyProvider.getAttribute('data-config') || '{}');

        expect(config.appearance.theme).toBe('dark');
        expect(config.appearance.walletChainType).toBe('solana-only');
    });

    it('configures Solana embedded wallet to create on login', async () => {
        process.env.NEXT_PUBLIC_PRIVY_APP_ID = 'test-id';

        const { WalletContextProvider } = await import('../WalletContextProvider');

        render(
            <WalletContextProvider>
                <div>test</div>
            </WalletContextProvider>
        );

        const privyProvider = screen.getByTestId('privy-provider');
        const config = JSON.parse(privyProvider.getAttribute('data-config') || '{}');

        expect(config.embeddedWallets.solana.createOnLogin).toBe('all-users');
    });

    it('includes social login methods', async () => {
        process.env.NEXT_PUBLIC_PRIVY_APP_ID = 'test-id';

        const { WalletContextProvider } = await import('../WalletContextProvider');

        render(
            <WalletContextProvider>
                <div>test</div>
            </WalletContextProvider>
        );

        const privyProvider = screen.getByTestId('privy-provider');
        const config = JSON.parse(privyProvider.getAttribute('data-config') || '{}');

        expect(config.loginMethods).toContain('email');
        expect(config.loginMethods).toContain('google');
        expect(config.loginMethods).toContain('twitter');
        expect(config.loginMethods).toContain('apple');
        expect(config.loginMethods).toContain('wallet');
    });
});
