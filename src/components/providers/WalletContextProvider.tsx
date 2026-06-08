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
    const latestWalletRef = useRef<SolanaStandardWallet | null>(null);
    type ChangeProperties = { accounts?: readonly unknown[]; chains?: readonly string[] };
    const listenersRef = useRef(new Set<(properties: ChangeProperties) => void>());
    const prevAccountsRef = useRef<readonly unknown[]>([]);

    // Keep latestWalletRef updated
    useEffect(() => {
        if (privyStandardWallet) {
            latestWalletRef.current = privyStandardWallet;
        }
    }, [privyStandardWallet]);

    // Handle account change notifications
    useEffect(() => {
        if (!privyStandardWallet) return;

        const newAccounts = privyStandardWallet.accounts || [];
        const oldAccounts = prevAccountsRef.current;

        const accountsChanged = newAccounts.length !== oldAccounts.length ||
            newAccounts.some((acc, idx) => {
                const oldAcc = oldAccounts[idx] as { address?: string } | undefined;
                return acc.address !== oldAcc?.address;
            });

        if (accountsChanged) {
            prevAccountsRef.current = newAccounts;
            for (const listener of listenersRef.current) {
                try {
                    listener({ accounts: newAccounts });
                } catch (e) {
                    console.error("Error in Wallet Standard change listener:", e);
                }
            }
        }
    }, [privyStandardWallet]);

    const wrapperWallet = useMemo<SolanaStandardWallet>(() => {
        return {
            get version() {
                return (latestWalletRef.current?.version ?? "1.0.0") as SolanaStandardWallet["version"];
            },
            get name() {
                return latestWalletRef.current?.name ?? "Privy";
            },
            get icon() {
                return (latestWalletRef.current?.icon ?? "data:image/svg+xml;base64,") as SolanaStandardWallet["icon"];
            },
            get chains() {
                return (latestWalletRef.current?.chains ?? ["solana:mainnet", "solana:devnet"]) as SolanaStandardWallet["chains"];
            },
            get accounts() {
                return (latestWalletRef.current?.accounts ?? []) as SolanaStandardWallet["accounts"];
            },
            get isPrivyWallet() {
                return true;
            },
            get features() {
                const currentFeatures = latestWalletRef.current?.features ?? {};
                const features: Record<string, unknown> = {};

                for (const key of Object.keys(currentFeatures)) {
                    if (key === 'standard:events') continue;

                    const featureMethods: Record<string, unknown> = {};
                    features[key] = featureMethods;
                    const featureObj = currentFeatures[key];
                    if (featureObj && typeof featureObj === 'object') {
                        for (const prop of Object.keys(featureObj)) {
                            const val = (featureObj as Record<string, unknown>)[prop];
                            if (typeof val === 'function') {
                                featureMethods[prop] = (...args: unknown[]) => {
                                    const latestFeatures = latestWalletRef.current?.features as Record<string, Record<string, unknown>> | undefined;
                                    const latestFeatureObj = latestFeatures?.[key];
                                    if (latestFeatureObj && typeof latestFeatureObj[prop] === 'function') {
                                        const method = latestFeatureObj[prop] as (...args: unknown[]) => unknown;
                                        return method(...args);
                                    }
                                    throw new Error(`Feature ${key} method ${prop} is not available.`);
                                };
                            } else {
                                Object.defineProperty(featureMethods, prop, {
                                    get() {
                                        const latestFeatures = latestWalletRef.current?.features as Record<string, Record<string, unknown>> | undefined;
                                        return latestFeatures?.[key]?.[prop];
                                    },
                                    enumerable: true,
                                    configurable: true
                                });
                            }
                        }
                    }
                }

                features['standard:events'] = {
                    on: (event: 'change', listener: (properties: ChangeProperties) => void) => {
                        listenersRef.current.add(listener);

                        let origCleanup: (() => void) | undefined;
                        const origOn = latestWalletRef.current?.features?.['standard:events']?.on;
                        if (origOn) {
                            try {
                                origCleanup = origOn(event, listener as Parameters<typeof origOn>[1]);
                            } catch (e) {
                                console.error("Error setting up original standard:events listener:", e);
                            }
                        }

                        return () => {
                            listenersRef.current.delete(listener);
                            if (origCleanup) origCleanup();
                        };
                    }
                };

                return features as SolanaStandardWallet["features"];
            }
        } as SolanaStandardWallet;
    }, []);

    useEffect(() => {
        if (!ready || !privyStandardWallet) return;
        if (unregisterRef.current) return;

        unregisterRef.current = getWallets().register(wrapperWallet);
    }, [privyStandardWallet, ready, wrapperWallet]);

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
