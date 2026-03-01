"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useConnection, useAnchorWallet, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { AnchorProvider, Idl, Program } from "@coral-xyz/anchor";
import { PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import idl from "@/utils/idl.json";
import { isMobile, isWalletBrowser } from "@/utils/mobile";
import { trackPlausibleEvent } from "@/utils/analytics";
import { WalletSelectorModal } from "@/components/modals";
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
    const { setVisible } = useWalletModal();

    const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
    const [walletModalUrl, setWalletModalUrl] = useState("");

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

    const openWalletSelectorModal = useCallback((currentUrl: string) => {
        setWalletModalUrl(currentUrl);
        setIsWalletModalOpen(true);
    }, []);

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
        openWalletSelectorModal,
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

        if (isMobile() && !isWalletBrowser()) {
            openWalletSelectorModal(window.location.href);
            return;
        }

        setVisible(true);
    }, [openWalletSelectorModal, setVisible]);

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
            <WalletSelectorModal
                isOpen={isWalletModalOpen}
                onClose={() => setIsWalletModalOpen(false)}
                currentUrl={walletModalUrl}
            />
        </ProgramContext.Provider>
    );
};

export const useProgram = () => {
    const context = useContext(ProgramContext);
    if (!context) throw new Error("useProgram must be used within ProgramProvider");
    return context;
};
