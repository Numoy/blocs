"use client";

import styles from './OnboardingModal.module.css';
import { useAccessibleDialog } from './useAccessibleDialog';

interface OnboardingModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const OnboardingModal = ({ isOpen, onClose }: OnboardingModalProps) => {
    const { dialogRef } = useAccessibleDialog({ isOpen, onClose });

    if (!isOpen) return null;

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div
                ref={dialogRef}
                className={styles.modal}
                onClick={e => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="onboarding-modal-title"
                tabIndex={-1}
            >
                <button
                    className={styles.closeButton}
                    onClick={onClose}
                    aria-label="Close welcome dialog"
                >
                    ×
                </button>

                <h2 id="onboarding-modal-title" className={styles.title}>Welcome to 10,000 Blocks</h2>

                <div className={styles.content}>
                    <ul className={styles.tips}>
                        <li className={styles.tip}>
                            <strong>Explore</strong> the 100×100 grid by panning and zooming — every block is a piece of the Solana blockchain.
                        </li>
                        <li className={styles.tip}>
                            <strong>Buy</strong> any available block for SOL and make it permanently yours.
                        </li>
                        <li className={styles.tip}>
                            <strong>Customize</strong> your block with an image, message, and link for the world to see.
                        </li>
                        <li className={styles.tip}>
                            <strong>Trade</strong> — list your block for sale at any price you choose.
                        </li>
                    </ul>

                    <button
                        className={styles.ctaButton}
                        onClick={onClose}
                        data-autofocus="true"
                    >
                        Explore the Grid
                    </button>
                </div>
            </div>
        </div>
    );
};
