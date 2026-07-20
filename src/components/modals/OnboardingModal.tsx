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

                <h2 id="onboarding-modal-title" className={styles.title}>Welcome to Mars Blocs</h2>

                <div className={styles.content}>
                    <ul className={styles.tips}>
                        <li className={styles.tip}>
                            <strong>Explore</strong> — spin the planet and zoom in to drop onto the surface map. Zoom out anytime to return to orbit. Every parcel is a real piece of Mars registered on the Solana blockchain.
                        </li>
                        <li className={styles.tip}>
                            <strong>Claim</strong> — tap any parcel to see its details, then claim available land for SOL and make it permanently yours.
                        </li>
                        <li className={styles.tip}>
                            <strong>Customize</strong> your plot with an image, custom colonist message, and link to mark your base.
                        </li>
                        <li className={styles.tip}>
                            <strong>Trade</strong> — list your plot for resale to other colonists at any price you choose.
                        </li>
                    </ul>

                    <button
                        className={styles.ctaButton}
                        onClick={onClose}
                        data-autofocus="true"
                    >
                        Explore Mars
                    </button>
                </div>
            </div>
        </div>
    );
};
