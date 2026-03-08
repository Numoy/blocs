"use client";

import { FC, ReactNode, useEffect, useRef } from "react";
import { useStandardWallets } from "@privy-io/react-auth/solana";
import { usePrivy } from "@privy-io/react-auth";
import { useWallet } from "@solana/wallet-adapter-react";

/**
 * Bridge component that:
 * 1. Registers Privy's embedded Solana wallet as a Standard Wallet
 *    so @solana/wallet-adapter-react auto-detects it.
 * 2. Auto-selects the Privy embedded wallet after login so the
 *    user is immediately ready to transact.
 *
 * Must be rendered inside both PrivyProvider and WalletProvider.
 */
export const PrivyWalletBridge: FC<{ children: ReactNode }> = ({ children }) => {
    const { wallets: standardWallets } = useStandardWallets();
    const { authenticated } = usePrivy();
    const { select, wallet, wallets: adapterWallets } = useWallet();
    const hasAutoSelected = useRef(false);

    // Auto-select Privy's embedded wallet after login if no wallet is already connected
    useEffect(() => {
        if (!authenticated || wallet || hasAutoSelected.current) return;

        // Find the Privy wallet in the adapter's detected wallets
        const privyWallet = adapterWallets.find(w =>
            w.adapter.name.toLowerCase().includes("privy")
        );

        if (privyWallet) {
            select(privyWallet.adapter.name);
            hasAutoSelected.current = true;
        }
    }, [authenticated, wallet, adapterWallets, select, standardWallets]);

    // Reset auto-select flag on logout
    useEffect(() => {
        if (!authenticated) {
            hasAutoSelected.current = false;
        }
    }, [authenticated]);

    return <>{children}</>;
};
