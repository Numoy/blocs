import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

// vi.mock factory cannot reference top-level variables.
// Use vi.hoisted() to hoist the mock function definition.
const { mockUseStandardWallets, mockUsePrivy, mockUseWallet } = vi.hoisted(() => ({
    mockUseStandardWallets: vi.fn().mockReturnValue({ ready: true, wallets: [] }),
    mockUsePrivy: vi.fn().mockReturnValue({ authenticated: false }),
    mockUseWallet: vi.fn().mockReturnValue({ select: vi.fn(), wallet: null, wallets: [] }),
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
});
