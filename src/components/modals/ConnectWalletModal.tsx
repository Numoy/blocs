"use client";

import styles from "./ConnectWalletModal.module.css";
import { useAccessibleDialog } from "./useAccessibleDialog";

interface ConnectWalletModalProps {
    isOpen: boolean;
    onClose: () => void;
    onOpenSocialLogin: () => void;
    /** Present on desktop or in-app wallet browsers — opens wallet-adapter modal */
    onOpenBrowserWallet?: () => void;
    /** Present on mobile (non-wallet-browser) — opens WalletConnect deep-link flow */
    onOpenWalletApp?: () => void;
}

export const ConnectWalletModal = ({
    isOpen,
    onClose,
    onOpenSocialLogin,
    onOpenBrowserWallet,
    onOpenWalletApp,
}: ConnectWalletModalProps) => {
    const { dialogRef } = useAccessibleDialog({ isOpen, onClose });

    if (!isOpen) return null;

    const hasSecondaryOption = Boolean(onOpenBrowserWallet || onOpenWalletApp);

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div
                ref={dialogRef}
                className={styles.modal}
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="connect-wallet-title"
                tabIndex={-1}
            >
                <button
                    className={styles.closeButton}
                    onClick={onClose}
                    aria-label="Close connect wallet dialog"
                >
                    ×
                </button>

                <h2 id="connect-wallet-title" className={styles.title}>
                    Connect Wallet
                </h2>

                <p className={styles.description}>
                    {onOpenWalletApp
                        ? "Sign in with email or social, or jump into your wallet app."
                        : onOpenBrowserWallet
                          ? "Sign in with email or social, or connect your browser extension."
                          : "Sign in with email or social to get started."}
                </p>

                <button
                    className={`uiButton uiButtonPrimary ${styles.actionButton}`}
                    onClick={onOpenSocialLogin}
                    data-autofocus="true"
                >
                    Continue with email or social
                </button>

                {onOpenBrowserWallet && (
                    <button
                        className={`uiButton uiButtonSecondary ${styles.actionButton} ${hasSecondaryOption ? styles.secondaryButton : ""}`}
                        onClick={onOpenBrowserWallet}
                    >
                        Use Browser Wallet
                    </button>
                )}

                {onOpenWalletApp && (
                    <button
                        className={`uiButton uiButtonSecondary ${styles.actionButton} ${hasSecondaryOption ? styles.secondaryButton : ""}`}
                        onClick={onOpenWalletApp}
                    >
                        Open in Wallet App
                    </button>
                )}
            </div>
        </div>
    );
};
