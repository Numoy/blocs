"use client";

import { FC, ReactNode, useEffect, useRef } from "react";
import { useStandardWallets, type SolanaStandardWallet } from "@privy-io/react-auth/solana";
import { usePrivy } from "@privy-io/react-auth";
import { useWallet } from "@solana/wallet-adapter-react";

type PrivySolanaStandardWallet = SolanaStandardWallet & { isPrivyWallet: true };

const isPrivyStandardWallet = (wallet: SolanaStandardWallet): wallet is PrivySolanaStandardWallet => (
    ("isPrivyWallet" in wallet && wallet.isPrivyWallet === true) ||
    wallet.name.toLowerCase().includes("privy")
);

/**
 * Bridge component that:
 * 1. Tracks Privy's embedded Solana standard wallet readiness.
 * 2. Auto-selects the correct wallet adapter after login:
 *    - Embedded wallet (social/email login) → selects the "privy" adapter
 *    - External wallet (Phantom, Backpack, etc.) → selects the matching adapter
 *      by walletClientType name so publicKey and sendTransaction work correctly.
 *
 * Must be rendered inside both PrivyProvider and WalletProvider.
 */
export const PrivyWalletBridge: FC<{ children: ReactNode }> = ({ children }) => {
    const { wallets: standardWallets } = useStandardWallets();
    const { authenticated, user } = usePrivy();
    const { select, connect, wallet, connected, connecting, wallets: adapterWallets } = useWallet();

    const privyStandardWallet = standardWallets.find(isPrivyStandardWallet);
    const privyAccountsLength = privyStandardWallet?.accounts?.length ?? 0;

    const hasAutoSelectedRef = useRef(false);

    useEffect(() => {
        if (!authenticated) {
            hasAutoSelectedRef.current = false;
        }
    }, [authenticated]);

    // Auto-select the correct wallet adapter after login
    useEffect(() => {
        if (!authenticated) return;
        if (hasAutoSelectedRef.current) return;

        const walletClientType = user?.wallet?.walletClientType;
        const isEmbedded = !walletClientType || walletClientType === "privy" || walletClientType === "privy-v2";

        let targetWallet;
        if (isEmbedded) {
            if (privyAccountsLength === 0) return;

            // Social/email login: select Privy's embedded wallet adapter
            targetWallet = adapterWallets.find(w =>
                w.adapter.name.toLowerCase().includes("privy")
            );
        } else {
            // External wallet login (Phantom, Backpack, Solflare, etc.):
            // match by walletClientType — Privy uses lowercase names ("phantom"),
            // wallet-adapter uses title-case ("Phantom"), so compare lowercased.
            targetWallet = adapterWallets.find(w =>
                w.adapter.name.toLowerCase() === walletClientType.toLowerCase()
            );
            // If the extension isn't detected yet, fall back to embedded wallet
            if (!targetWallet) {
                targetWallet = adapterWallets.find(w =>
                    w.adapter.name.toLowerCase().includes("privy")
                );
            }
        }

        if (targetWallet) {
            if (wallet?.adapter.name === targetWallet.adapter.name) {
                hasAutoSelectedRef.current = true;
                return;
            }

            select(targetWallet.adapter.name);
            hasAutoSelectedRef.current = true;
        }
    }, [authenticated, user, wallet, adapterWallets, select, standardWallets, privyAccountsLength]);

    // autoConnect only fires on mount (from localStorage) — it does NOT auto-connect
    // after a programmatic select(). Explicitly connect once the wallet is selected.
    useEffect(() => {
        if (!wallet || connected || connecting) return;

        // If it is the Privy standard wallet adapter, only connect if accounts are ready
        const isPrivy = wallet.adapter.name.toLowerCase().includes("privy");
        if (isPrivy && privyAccountsLength === 0) return;

        connect().catch(() => {});
    }, [wallet, connected, connecting, connect, privyAccountsLength]);

    return <>{children}</>;
};
