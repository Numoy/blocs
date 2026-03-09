"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { useConnection, useAnchorWallet, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { usePrivy } from "@privy-io/react-auth";
import { useFundWallet } from "@privy-io/react-auth/solana";
import { AnchorProvider, Idl, Program } from "@coral-xyz/anchor";
import { PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import idl from "@/utils/idl.json";
import { trackPlausibleEvent } from "@/utils/analytics";
import { isMobile, isWalletBrowser } from "@/utils/mobile";
import { asBlocsProgram } from "@/utils/programTypes";
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
    const { login } = usePrivy();
    const { fundWallet } = useFundWallet();

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

    const openWalletModal = useCallback((source: WalletModalSource = "unknown") => {
        trackPlausibleEvent("wallet_modal_opened", {
            source,
            is_mobile: isMobile(),
            is_wallet_browser: isWalletBrowser(),
        });

        if (isWalletBrowser()) {
            // Wallet extension/injection detected (Phantom desktop, Phantom in-app browser, Backpack, etc.)
            // → open the standard wallet-adapter modal for direct connection, no Privy required
            setWalletModalVisible(true);
        } else {
            // No injected wallet detected: mobile browser or desktop without extension.
            // Privy handles WalletConnect (deep-links to wallet app on mobile) and
            // social/email login (creates an embedded wallet for users without one).
            login();
        }
    }, [login, setWalletModalVisible]);

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
        </ProgramContext.Provider>
    );
};

export const useProgram = () => {
    const context = useContext(ProgramContext);
    if (!context) throw new Error("useProgram must be used within ProgramProvider");
    return context;
};
