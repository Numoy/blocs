"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useConnection, useAnchorWallet, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { usePrivy } from "@privy-io/react-auth";
import { useFundWallet } from "@privy-io/react-auth/solana";
import { AnchorProvider, Idl, Program } from "@coral-xyz/anchor";
import { PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import idl from "@/utils/idl.json";
import { trackPlausibleEvent } from "@/utils/analytics";
import { getWalletConnectEntryPoint, isMobile, isWalletBrowser } from "@/utils/mobile";
import { asBlocsProgram } from "@/utils/programTypes";
import { MobileWalletOptionsModal } from "@/components/modals/MobileWalletOptionsModal";
import {
    type BuySource,
    type ProgramContextState,
    type WalletModalSource,
} from "@/context/program/shared";
import { useGridSync } from "@/context/program/useGridSync";
import { useBlockActions } from "@/context/program/useBlockActions";

const ProgramContext = createContext<ProgramContextState | null>(null);
export type { BuySource, WalletModalSource };

export const ProgramProvider = ({ children }: { children: ReactNode }) => {
    const { connection } = useConnection();
    const wallet = useAnchorWallet();
    const { sendTransaction, publicKey, connected } = useWallet();
    const { setVisible: setWalletModalVisible } = useWalletModal();
    const { login, authenticated } = usePrivy();
    const { fundWallet } = useFundWallet();
    const [isMobileWalletOptionsOpen, setIsMobileWalletOptionsOpen] = useState(false);

    const walletAddress = publicKey?.toBase58();

    const providerWallet = useMemo(() => (
        wallet || {
            publicKey: new PublicKey("11111111111111111111111111111111"),
            signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T): Promise<T> => tx,
            signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> => txs,
        }
    ), [wallet]);

    const program = useMemo(() => {
        const provider = new AnchorProvider(connection, providerWallet, { preflightCommitment: "confirmed" });
        return asBlocsProgram(new Program(idl as Idl, provider));
    }, [connection, providerWallet]);

    const {
        blocks,
        isLoading,
        isSyncing,
        gridAdmin,
        fetchGrid,
        refreshBlockById,
        queueGridSync,
        updateBlockInState,
    } = useGridSync({
        connection,
        providerWallet,
        program,
    });

    // Called when a buy fails due to insufficient SOL — opens on-ramp to fund with real money
    const onFundWallet = useCallback(async () => {
        if (!walletAddress) {
            login();
            return;
        }
        try {
            await fundWallet({ address: walletAddress });
        } catch { /* user cancelled, ignore */ }
    }, [fundWallet, walletAddress, login]);

    const { buyBlock, updateBlock, sellBlock } = useBlockActions({
        connected,
        publicKey,
        wallet: wallet ?? null,
        sendTransaction,
        connection,
        program,
        blocks,
        gridAdmin,
        fetchGrid,
        refreshBlockById,
        queueGridSync,
        updateBlockInState,
        onFundWallet,
    });

    const refreshBlock = useCallback(async () => {
        await fetchGrid();
    }, [fetchGrid]);

    const openSocialLogin = useCallback(() => {
        setIsMobileWalletOptionsOpen(false);
        login({
            loginMethods: ["email", "google", "twitter", "apple"],
            walletChainType: "solana-only",
        });
    }, [login]);

    const openWalletLogin = useCallback(() => {
        setIsMobileWalletOptionsOpen(false);
        login({
            loginMethods: ["wallet"],
            walletChainType: "solana-only",
        });
    }, [login]);

    const openWalletModal = useCallback((source: WalletModalSource = "unknown") => {
        const entryPoint = getWalletConnectEntryPoint({ isAuthenticated: authenticated });

        trackPlausibleEvent("wallet_modal_opened", {
            source,
            is_mobile: isMobile(),
            is_wallet_browser: isWalletBrowser(),
            entry_point: entryPoint,
        });

        if (entryPoint === "wallet_adapter") {
            // Wallet extension/injection detected (Phantom desktop, Phantom in-app browser, Backpack, etc.)
            // → open the standard wallet-adapter modal for direct connection, no Privy required
            setWalletModalVisible(true);
            return;
        }

        if (entryPoint === "mobile_choice") {
            setIsMobileWalletOptionsOpen(true);
            return;
        }

        if (entryPoint === "privy_wallet_login") {
            openWalletLogin();
            return;
        }

        // Desktop browsers without an injected wallet should still have access to broader
        // login methods like social/email, which create an embedded wallet when needed.
        login({
            walletChainType: "solana-only",
        });
    }, [authenticated, login, openWalletLogin, setWalletModalVisible]);

    return (
        <ProgramContext.Provider
            value={{
                blocks,
                buyBlock,
                updateBlock,
                sellBlock,
                refreshBlock,
                isLoading,
                isSyncing,
                openWalletModal,
            }}
        >
            {children}
            <MobileWalletOptionsModal
                isOpen={isMobileWalletOptionsOpen}
                onClose={() => setIsMobileWalletOptionsOpen(false)}
                onOpenSocialLogin={openSocialLogin}
                onOpenWalletLogin={openWalletLogin}
            />
        </ProgramContext.Provider>
    );
};

export const useProgram = () => {
    const context = useContext(ProgramContext);
    if (!context) throw new Error("useProgram must be used within ProgramProvider");
    return context;
};
