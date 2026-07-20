"use client";

import styles from './InfoModal.module.css';
import { useAccessibleDialog } from './useAccessibleDialog';

interface InfoModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const InfoModal = ({ isOpen, onClose }: InfoModalProps) => {
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
                aria-labelledby="info-modal-title"
                tabIndex={-1}
            >
                <button
                    className={styles.closeButton}
                    onClick={onClose}
                    aria-label="Close info dialog"
                    data-autofocus="true"
                >
                    ×
                </button>

                <h2 id="info-modal-title" className={styles.title}>About Mars Blocs</h2>

                <div className={styles.content}>
                    <p className={styles.highlight}>
                        <strong>1 Planet. 10,000 Plots. Yours Forever.</strong>
                    </p>

                    <p>
                        Mars Blocs is a permanent on-chain planetary map built on Solana.
                        There are exactly 10,000 plots of land — no more will ever be created.
                    </p>

                    <h3 className={styles.subtitle}>How it works</h3>
                    <ul className={styles.list}>
                        <li><strong>Claim:</strong> Tap an available parcel — on the globe or the surface map — and claim it for SOL.</li>
                        <li><strong>Own:</strong> Once claimed, the land plot belongs to your wallet address permanently.</li>
                        <li><strong>Customize:</strong> Set the image, message, and link to mark your settlement on the Martian surface.</li>
                        <li><strong>Trade:</strong> List your plot for resale to other colonists at any price. Resales incur a 5% royalty fee.</li>
                    </ul>

                    <h3 className={styles.subtitle}>How to get SOL?</h3>
                    <ul className={styles.list}>
                        <li><strong>Exchanges:</strong> Buy SOL on major exchanges like Coinbase, Binance, or Kraken and withdraw to your wallet.</li>
                        <li><strong>In-Wallet:</strong> Use the &quot;Buy&quot; button directly in your Phantom or Solflare wallet.</li>
                        <li><strong>Bridge:</strong> Bridge assets from other chains using tools like <a href="https://jup.ag" target="_blank" rel="noreferrer" className={styles.link}>Jupiter</a> or <a href="https://portalbridge.com" target="_blank" rel="noreferrer" className={styles.link}>Portal</a>.</li>
                    </ul>

                    <h3 className={styles.subtitle}>Open source</h3>
                    <div className={styles.githubCard}>
                        <p className={styles.githubText}>
                            Browse the code, track issues, and contribute on GitHub.
                        </p>
                        <a
                            href="https://github.com/Numoy/blocs"
                            target="_blank"
                            rel="noreferrer"
                            className={styles.githubButton}
                            aria-label="Open the Blocs GitHub repository"
                        >
                            View on GitHub
                        </a>
                    </div>

                    <p className={styles.footer}>
                        Powered by Solana. Built for the community.
                    </p>
                </div>
            </div>
        </div>
    );
};
