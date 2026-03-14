"use client";

import styles from "./MobileWalletOptionsModal.module.css";
import { useAccessibleDialog } from "./useAccessibleDialog";

interface MobileWalletOptionsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onOpenSocialLogin: () => void;
    onOpenWalletLogin: () => void;
}

export const MobileWalletOptionsModal = ({
    isOpen,
    onClose,
    onOpenSocialLogin,
    onOpenWalletLogin,
}: MobileWalletOptionsModalProps) => {
    const { dialogRef } = useAccessibleDialog({ isOpen, onClose });

    if (!isOpen) return null;

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div
                ref={dialogRef}
                className={styles.modal}
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="mobile-wallet-options-title"
                tabIndex={-1}
            >
                <button
                    className={styles.closeButton}
                    onClick={onClose}
                    aria-label="Close wallet options dialog"
                >
                    ×
                </button>

                <h2 id="mobile-wallet-options-title" className={styles.title}>
                    Connect on mobile
                </h2>

                <p className={styles.description}>
                    Continue with email or social login, or jump straight into your wallet app.
                </p>

                <button
                    className={`uiButton uiButtonPrimary ${styles.actionButton}`}
                    onClick={onOpenSocialLogin}
                    data-autofocus="true"
                >
                    Continue with email or social
                </button>

                <button
                    className={`uiButton uiButtonSecondary ${styles.actionButton} ${styles.secondaryButton}`}
                    onClick={onOpenWalletLogin}
                >
                    Continue with wallet
                </button>
            </div>
        </div>
    );
};
