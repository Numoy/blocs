import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Header } from '../Header';

// ---------- Privy mock ----------
const mockLogin = vi.fn();
const mockLogout = vi.fn();
const mockExportWallet = vi.fn();
const mockFundWallet = vi.fn();
let mockAuthenticated = false;
let mockPrivyReady = true;
let mockPrivyUser: { wallet?: { address: string }, google?: boolean, twitter?: boolean, apple?: boolean, email?: boolean } | null = null;

vi.mock('@privy-io/react-auth', () => ({
    usePrivy: () => ({
        login: mockLogin,
        logout: mockLogout,
        authenticated: mockAuthenticated,
        ready: mockPrivyReady,
        user: mockPrivyUser,
    }),
}));

vi.mock('@privy-io/react-auth/solana', () => ({
    useExportWallet: () => ({ exportWallet: mockExportWallet }),
    useFundWallet: () => ({ fundWallet: mockFundWallet }),
}));

// ---------- wallet-adapter mock ----------
const mockPublicKey = { toBase58: () => 'ABCDef1234567890ABCDef1234567890ABCDef12' };
const mockDisconnect = vi.fn();
let mockConnected = false;
let mockPk: typeof mockPublicKey | null = null;

vi.mock('@solana/wallet-adapter-react', () => ({
    useWallet: () => ({
        publicKey: mockPk,
        connected: mockConnected,
        disconnect: mockDisconnect,
    }),
}));

// ---------- Program context mock ----------
vi.mock('@/context/ProgramContext', () => ({
    useProgram: () => ({
        blocks: [],
        isLoading: false,
    }),
}));

// ---------- CSS module mock ----------
vi.mock('../Header.module.css', () => ({
    default: new Proxy({}, { get: (_t, key) => String(key) }),
}));

// ---------- Subcomponent mocks ----------
vi.mock('@/components/utils/ClientOnly', () => ({
    ClientOnly: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/modals/InfoModal', () => ({
    InfoModal: () => null,
}));

vi.mock('@/utils/analytics', () => ({
    trackPlausibleEvent: vi.fn(),
}));

describe('Header (Privy integration)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockAuthenticated = false;
        mockPrivyReady = true;
        mockPrivyUser = null;
        mockConnected = false;
        mockPk = null;
    });

    it('shows Connect button when not authenticated', () => {
        render(<Header />);
        expect(screen.getByText('Connect')).toBeInTheDocument();
    });

    it('calls Privy login() when Connect is clicked', () => {
        render(<Header />);
        fireEvent.click(screen.getByText('Connect'));
        expect(mockLogin).toHaveBeenCalledTimes(1);
    });

    it('shows truncated wallet address when external wallet is connected', () => {
        mockConnected = true;
        mockAuthenticated = true;
        mockPk = mockPublicKey;
        render(<Header />);

        expect(screen.getByText('ABCD...ef12')).toBeInTheDocument();
        expect(screen.queryByText('Connect')).not.toBeInTheDocument();
    });

    it('shows truncated address from Privy user when no external wallet', () => {
        mockAuthenticated = true;
        mockPrivyUser = { wallet: { address: '9XYZabc123456789XYZabc123456789XYZabc1234' } };
        render(<Header />);

        expect(screen.getByText('9XYZ...1234')).toBeInTheDocument();
    });

    it('falls back to "Connected" when no address available', () => {
        mockAuthenticated = true;
        mockPrivyUser = null;
        mockPk = null;
        render(<Header />);

        expect(screen.getByText('Connected')).toBeInTheDocument();
    });

    it('opens dropdown and calls disconnect/logout when Disconnect is clicked in menu', async () => {
        mockConnected = true;
        mockAuthenticated = true;
        mockPk = mockPublicKey;
        mockDisconnect.mockResolvedValue(undefined);
        mockLogout.mockResolvedValue(undefined);

        render(<Header />);

        // 1. Click to open dropdown
        fireEvent.click(screen.getByText('ABCD...ef12'));

        // 2. Click Disconnect in the menu
        const disconnectBtn = screen.getByText('Disconnect');
        fireEvent.click(disconnectBtn);

        await waitFor(() => {
            expect(mockDisconnect).toHaveBeenCalledTimes(1);
            expect(mockLogout).toHaveBeenCalledTimes(1);
        });
    });

    it('opens dropdown and calls fund wallet when clicked', async () => {
        mockConnected = true;
        mockPk = mockPublicKey;
        render(<Header />);

        fireEvent.click(screen.getByText('ABCD...ef12'));
        fireEvent.click(screen.getByText(/Fund Wallet/));

        expect(mockFundWallet).toHaveBeenCalledWith({ address: 'ABCDef1234567890ABCDef1234567890ABCDef12' });
    });

    it('does NOT show Export Wallet for external wallets', async () => {
        mockConnected = true;
        mockAuthenticated = true;
        mockPk = mockPublicKey;
        render(<Header />);

        fireEvent.click(screen.getByText('ABCD...ef12'));
        expect(screen.queryByText(/Export Wallet/)).not.toBeInTheDocument();
    });

    it('shows Export Wallet for embedded wallets and calls it on click', async () => {
        mockConnected = false;
        mockAuthenticated = true;
        mockPk = null;
        mockPrivyUser = { wallet: { address: '1234567890123456789012345678901234567890' } };

        render(<Header />);
        fireEvent.click(screen.getByText('1234...7890'));

        const exportBtn = screen.getByText(/Export Wallet/);
        expect(exportBtn).toBeInTheDocument();

        fireEvent.click(exportBtn);
        expect(mockExportWallet).toHaveBeenCalledTimes(1);
    });

    it('does not render wallet button while Privy is loading', () => {
        mockPrivyReady = false;
        render(<Header />);

        expect(screen.queryByText('Connect')).not.toBeInTheDocument();
        expect(screen.queryByText('Connected')).not.toBeInTheDocument();
    });

    it('always renders the About button', () => {
        render(<Header />);
        expect(screen.getByLabelText('About')).toBeInTheDocument();
    });
});
