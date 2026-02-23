"use client";

import { FC, ReactNode, useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import '@solana/wallet-adapter-react-ui/styles.css';
import { resolveSolanaRpcEndpoint } from "@/utils/rpc";

export const WalletContextProvider: FC<{ children: ReactNode }> = ({ children }) => {
    const endpoint = useMemo(() => {
        return resolveSolanaRpcEndpoint(process.env.NEXT_PUBLIC_SOLANA_RPC_URL);
    }, []);


    const wallets = useMemo(
        () => [], // Rely on standard wallet detection (MWA) to avoid duplications like MetaMask/Backpack
        []
    );

    return (
        <ConnectionProvider endpoint={endpoint}>
            <WalletProvider wallets={wallets} autoConnect>
                <WalletModalProvider>{children}</WalletModalProvider>
            </WalletProvider>
        </ConnectionProvider>
    );
};
