"use client";

import { FC, ReactNode, useEffect, useRef } from "react";
import { useStandardWallets, type SolanaStandardWallet } from "@privy-io/react-auth/solana";
import { usePrivy } from "@privy-io/react-auth";
import { useWallet } from "@solana/wallet-adapter-react";

type PrivySolanaStandardWallet = SolanaStandardWallet & { isPrivyWallet: true };

const isPrivyStandardWallet = (wallet: SolanaStandardWallet): wallet is PrivySolanaStandardWallet => (
    "isPrivyWallet" in wallet && wallet.isPrivyWallet === true
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
    const hasAutoSelected = useRef(false);

    // Auto-select the correct wallet adapter after login
    useEffect(() => {
        if (!authenticated || wallet || hasAutoSelected.current) return;

        if (process.env.NODE_ENV !== "production") {
            console.debug("[PrivyWalletBridge] adapterWallets:", adapterWallets.map(w => w.adapter.name));
            console.debug("[PrivyWalletBridge] standardWallets count:", standardWallets.length);
        }

        const walletClientType = user?.wallet?.walletClientType;
        const isEmbedded = !walletClientType || walletClientType === "privy" || walletClientType === "privy-v2";
        const privyStandardWallet = standardWallets.find(isPrivyStandardWallet);

        let targetWallet;
        if (isEmbedded) {
            if (!privyStandardWallet?.accounts.length) return;

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
            select(targetWallet.adapter.name);
            hasAutoSelected.current = true;
        }
    }, [authenticated, user, wallet, adapterWallets, select, standardWallets]);

    // autoConnect only fires on mount (from localStorage) — it does NOT auto-connect
    // after a programmatic select(). Explicitly connect once the wallet is selected.
    useEffect(() => {
        if (!wallet || connected || connecting) return;
        if (process.env.NODE_ENV !== "production") {
            console.debug("[PrivyWalletBridge] calling connect() on wallet:", wallet.adapter.name);
        }
        connect().catch((err) => {
            console.warn('[PrivyWalletBridge] connect() failed:', err);
        });
    }, [wallet, connected, connecting, connect]);

    // Reset auto-select flag on logout
    useEffect(() => {
        if (!authenticated) {
            hasAutoSelected.current = false;
        }
    }, [authenticated]);

    return <>{children}</>;
};
