"use client";

import { FC, ReactNode, useEffect, useMemo, useRef } from "react";
import { PrivyProvider } from "@privy-io/react-auth";
import { toSolanaWalletConnectors, useStandardWallets, defaultSolanaRpcsPlugin, type SolanaStandardWallet } from "@privy-io/react-auth/solana";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { getWallets } from "@wallet-standard/app";
import '@solana/wallet-adapter-react-ui/styles.css';
import { env } from "@/env";
import { resolveSolanaRpcEndpoint } from "@/utils/rpc";
import { PrivyWalletBridge } from "@/components/providers/PrivyWalletBridge";

const solanaConnectors = toSolanaWalletConnectors();

type PrivySolanaStandardWallet = SolanaStandardWallet & { isPrivyWallet: true };

const isPrivyStandardWallet = (wallet: SolanaStandardWallet): wallet is PrivySolanaStandardWallet => (
    ("isPrivyWallet" in wallet && wallet.isPrivyWallet === true) ||
    wallet.name.toLowerCase().includes("privy")
);

const SolanaWalletProviderStack: FC<{ endpoint: string; children: ReactNode }> = ({ endpoint, children }) => {
    const { ready, wallets: standardWallets } = useStandardWallets();
    const privyStandardWallet = useMemo(
        () => standardWallets.find(isPrivyStandardWallet) ?? null,
        [standardWallets]
    );
    const unregisterRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        if (!ready || !privyStandardWallet) return;
        if (unregisterRef.current) return;

        unregisterRef.current = getWallets().register(privyStandardWallet);
    }, [privyStandardWallet, ready]);

    useEffect(() => {
        return () => {
            if (unregisterRef.current) {
                unregisterRef.current();
                unregisterRef.current = null;
            }
        };
    }, []);

    const wallets = useMemo(
        () => [], // Rely on standard wallet detection (MWA) to avoid duplications like MetaMask/Backpack
        []
    );

    return (
        <ConnectionProvider endpoint={endpoint}>
            <WalletProvider wallets={wallets} autoConnect>
                <WalletModalProvider>
                    <PrivyWalletBridge>
                        {children}
                    </PrivyWalletBridge>
                </WalletModalProvider>
            </WalletProvider>
        </ConnectionProvider>
    );
};

export const WalletContextProvider: FC<{ children: ReactNode }> = ({ children }) => {
    const endpoint = useMemo(() => {
        return resolveSolanaRpcEndpoint(env.NEXT_PUBLIC_SOLANA_RPC_URL);
    }, []);

    const privyAppId = env.NEXT_PUBLIC_PRIVY_APP_ID;

    return (
        <PrivyProvider
            appId={privyAppId}
            config={{
                appearance: {
                    theme: "dark",
                    walletChainType: "solana-only",
                    logo: "/icon.png",
                },
                loginMethods: ["email", "google", "twitter", "apple", "wallet"],
                embeddedWallets: {
                    solana: {
                        createOnLogin: "all-users",
                    },
                },
                externalWallets: {
                    solana: {
                        connectors: solanaConnectors,
                    },
                },
                plugins: [defaultSolanaRpcsPlugin()],
            }}
        >
            <SolanaWalletProviderStack endpoint={endpoint}>
                {children}
            </SolanaWalletProviderStack>
        </PrivyProvider>
    );
};
