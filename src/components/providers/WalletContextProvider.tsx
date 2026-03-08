"use client";

import { FC, ReactNode, useMemo } from "react";
import { PrivyProvider } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import '@solana/wallet-adapter-react-ui/styles.css';
import { env } from "@/env";
import { resolveSolanaRpcEndpoint } from "@/utils/rpc";
import { PrivyWalletBridge } from "@/components/providers/PrivyWalletBridge";

const solanaConnectors = toSolanaWalletConnectors();

export const WalletContextProvider: FC<{ children: ReactNode }> = ({ children }) => {
    const endpoint = useMemo(() => {
        return resolveSolanaRpcEndpoint(env.NEXT_PUBLIC_SOLANA_RPC_URL);
    }, []);

    const wallets = useMemo(
        () => [], // Rely on standard wallet detection (MWA) to avoid duplications like MetaMask/Backpack
        []
    );

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
            }}
        >
            <ConnectionProvider endpoint={endpoint}>
                <WalletProvider wallets={wallets} autoConnect>
                    <WalletModalProvider>
                        <PrivyWalletBridge>
                            {children}
                        </PrivyWalletBridge>
                    </WalletModalProvider>
                </WalletProvider>
            </ConnectionProvider>
        </PrivyProvider>
    );
};
