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
import { isMobile, isWalletBrowser } from "@/utils/mobile";
import { asBlocsProgram } from "@/utils/programTypes";
import { ConnectWalletModal } from "@/components/modals/ConnectWalletModal";
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
    const { sendTransaction, signTransaction, publicKey, connected, wallet: adapterWalletState } = useWallet();
    const { setVisible: setWalletModalVisible } = useWalletModal();
    const { login, authenticated } = usePrivy();
    const { fundWallet } = useFundWallet();
    const [isConnectWalletModalOpen, setIsConnectWalletModalOpen] = useState(false);

    const walletAddress = publicKey?.toBase58();

    // The Privy embedded wallet's standard-wallet `signAndSendTransaction` sends
    // via Privy's own RPC and fails with "Failed to connect to wallet".
    // Detect Privy's adapter and sign separately, then send via our Helius connection.
    const isPrivyEmbedded = adapterWalletState?.adapter.name.toLowerCase().includes("privy") ?? false;

    const effectiveSendTransaction: typeof sendTransaction = useCallback(
        async (transaction, conn, options) => {
            if (isPrivyEmbedded && signTransaction) {
                const signed = await signTransaction(transaction as Transaction);
                return conn.sendRawTransaction(signed.serialize(), options);
            }
            return sendTransaction(transaction, conn, options);
        },
        [isPrivyEmbedded, signTransaction, sendTransaction],
    );

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
    const onFundWallet = useCallback(async (amount?: string) => {
        if (!walletAddress) {
            login();
            return;
        }
        try {
            await fundWallet({ address: walletAddress, ...(amount ? { amount } : {}) });
        } catch { /* user cancelled, ignore */ }
    }, [fundWallet, walletAddress, login]);

    const { buyBlock, updateBlock, updateBlocks, sellBlock } = useBlockActions({
        connected,
        publicKey,
        wallet: wallet ?? null,
        sendTransaction: effectiveSendTransaction,
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
        setIsConnectWalletModalOpen(false);
        login({
            loginMethods: ["email", "google", "twitter", "apple"],
            walletChainType: "solana-only",
        });
    }, [login]);

    const openBrowserWallet = useCallback(() => {
        setIsConnectWalletModalOpen(false);
        setWalletModalVisible(true);
    }, [setWalletModalVisible]);

    const openWalletApp = useCallback(() => {
        setIsConnectWalletModalOpen(false);
        login({
            loginMethods: ["wallet"],
            walletChainType: "solana-only",
        });
    }, [login]);

    const openWalletModal = useCallback((source: WalletModalSource = "unknown") => {
        trackPlausibleEvent("wallet_modal_opened", {
            source,
            is_mobile: isMobile(),
            is_wallet_browser: isWalletBrowser(),
        });
        setIsConnectWalletModalOpen(true);
    }, []);

    return (
        <ProgramContext.Provider
            value={{
                blocks,
                buyBlock,
                updateBlock,
                updateBlocks,
                sellBlock,
                refreshBlock,
                isLoading,
                isSyncing,
                openWalletModal,
            }}
        >
            {children}
            <ConnectWalletModal
                isOpen={isConnectWalletModalOpen}
                onClose={() => setIsConnectWalletModalOpen(false)}
                onOpenSocialLogin={openSocialLogin}
                onOpenBrowserWallet={isWalletBrowser() ? openBrowserWallet : undefined}
                onOpenWalletApp={isMobile() && !isWalletBrowser() ? openWalletApp : undefined}
            />
        </ProgramContext.Provider>
    );
};

export const useProgram = () => {
    const context = useContext(ProgramContext);
    if (!context) throw new Error("useProgram must be used within ProgramProvider");
    return context;
};
