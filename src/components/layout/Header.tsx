"use client";

import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { usePrivy } from "@privy-io/react-auth";
import { useExportWallet, useFundWallet } from "@privy-io/react-auth/solana";
import { useWallet } from "@solana/wallet-adapter-react";
import styles from './Header.module.css';
import { ClientOnly } from "@/components/utils/ClientOnly";
import { InfoModal } from "@/components/modals/InfoModal";
import { useProgram } from '@/context/ProgramContext';
import { trackPlausibleEvent } from "@/utils/analytics";
import { toast } from 'sonner';

export const Header = () => {
    const [isInfoOpen, setIsInfoOpen] = useState(false);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const { blocks, isLoading, openWalletModal } = useProgram();
    const { logout, authenticated, ready: privyReady, user } = usePrivy();
    const { publicKey, connected, disconnect } = useWallet();
    const { exportWallet } = useExportWallet();
    const { fundWallet } = useFundWallet();

    const marketStats = useMemo(() => {
        const forSale = blocks.filter(b => b.isForSale && b.price !== null);
        if (!forSale.length) return null;
        return {
            floor: Math.min(...forSale.map(b => b.price!)),
            count: forSale.length,
        };
    }, [blocks]);

    const walletAddress = useMemo(() => {
        if (publicKey) return publicKey.toBase58();
        if (user?.wallet?.address) return user.wallet.address;
        return null;
    }, [publicKey, user]);

    const displayAddress = useMemo(() => {
        if (!walletAddress) return null;
        return `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`;
    }, [walletAddress]);

    // Track login method after successful authentication
    useEffect(() => {
        if (authenticated && user) {
            const method = user.google ? "google"
                : user.twitter ? "twitter"
                    : user.apple ? "apple"
                        : user.email ? "email"
                            : user.wallet ? "wallet"
                                : "unknown";
            trackPlausibleEvent("privy_login_method", { method });
        }
    }, [authenticated, user]);

    const handleDisconnect = useCallback(async () => {
        setIsDropdownOpen(false);
        try {
            if (connected) {
                await disconnect();
            }
            await logout();
            trackPlausibleEvent("wallet_disconnected");
        } catch (error) {
            const msg = (error as Error)?.message?.toLowerCase() ?? "";
            if (!msg.includes("user cancelled") && !msg.includes("user rejected")) {
                toast.error("Failed to disconnect. Please try again.");
            }
        }
    }, [connected, disconnect, logout]);

    const handleCopyAddress = useCallback(() => {
        if (!walletAddress) return;
        navigator.clipboard.writeText(walletAddress).catch(() => { });
        setIsDropdownOpen(false);
        trackPlausibleEvent("wallet_address_copied");
    }, [walletAddress]);

    const handleFundWallet = useCallback(async () => {
        if (!walletAddress) {
            toast.error("No wallet address found. Please connect a wallet first.");
            return;
        }
        setIsDropdownOpen(false);
        trackPlausibleEvent("fund_wallet_opened");
        try {
            await fundWallet({ address: walletAddress });
        } catch (error) {
            const msg = (error as Error)?.message || "";
            if (!msg.toLowerCase().includes("user cancelled") && !msg.toLowerCase().includes("user rejected")) {
                toast.error("Could not open funding flow. Make sure on-ramp is enabled in your Privy dashboard.");
            }
        }
    }, [walletAddress, fundWallet]);

    const handleExportWallet = useCallback(async () => {
        setIsDropdownOpen(false);
        trackPlausibleEvent("export_wallet_opened");
        try {
            await exportWallet();
        } catch (error) {
            const msg = (error as Error)?.message?.toLowerCase() ?? "";
            if (!msg.includes("user cancelled") && !msg.includes("user rejected")) {
                toast.error("Could not export wallet. Please try again.");
            }
        }
    }, [exportWallet]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        };
        if (isDropdownOpen) {
            document.addEventListener("mousedown", handleClickOutside);
        }
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [isDropdownOpen]);

    // Embedded wallet check (Privy-created, not external)
    const isEmbeddedWallet = authenticated && !connected;

    return (
        <>
            <header className={styles.header}>
                <div className={styles.logo}>10,000 Blocks</div>

                <div className={styles.marketStats}>
                    {isLoading ? (
                        <div className={styles.statsSkeleton} aria-hidden="true" />
                    ) : marketStats ? (
                        <span className={styles.statsText}>
                            Floor: {marketStats.floor.toFixed(2)} SOL · {marketStats.count.toLocaleString()} listed
                        </span>
                    ) : null}
                </div>

                <div className={styles.actions}>
                    <button
                        className={styles.infoButton}
                        onClick={() => setIsInfoOpen(true)}
                        aria-label="About"
                    >
                        About
                    </button>
                    <ClientOnly>
                        {privyReady && (
                            authenticated || connected ? (
                                <div className={styles.walletContainer} ref={dropdownRef}>
                                    <button
                                        className={styles.walletButton}
                                        onClick={() => setIsDropdownOpen(prev => !prev)}
                                        aria-expanded={isDropdownOpen}
                                        aria-haspopup="true"
                                    >
                                        <span className={styles.walletDot} />
                                        {displayAddress || "Connected"}
                                    </button>
                                    {isDropdownOpen && (
                                        <div className={styles.dropdown} role="menu">
                                            <button
                                                className={styles.dropdownItem}
                                                onClick={handleCopyAddress}
                                                role="menuitem"
                                            >
                                                📋 Copy Address
                                            </button>
                                            <button
                                                className={styles.dropdownItem}
                                                onClick={handleFundWallet}
                                                role="menuitem"
                                            >
                                                💰 Fund Wallet
                                            </button>
                                            {isEmbeddedWallet && (
                                                <button
                                                    className={styles.dropdownItem}
                                                    onClick={handleExportWallet}
                                                    role="menuitem"
                                                >
                                                    🔑 Export Wallet
                                                </button>
                                            )}
                                            <div className={styles.dropdownDivider} />
                                            <button
                                                className={`${styles.dropdownItem} ${styles.dropdownItemDanger}`}
                                                onClick={handleDisconnect}
                                                role="menuitem"
                                            >
                                                Disconnect
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <button
                                    className={styles.walletButton}
                                    onClick={() => openWalletModal("header_connect")}
                                >
                                    Connect
                                </button>
                            )
                        )}
                    </ClientOnly>
                </div>
            </header>
            <InfoModal isOpen={isInfoOpen} onClose={() => setIsInfoOpen(false)} />
        </>
    );
};
