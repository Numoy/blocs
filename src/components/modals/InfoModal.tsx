"use client";

import styles from './InfoModal.module.css';

interface InfoModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const InfoModal = ({ isOpen, onClose }: InfoModalProps) => {
    if (!isOpen) return null;

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
                <button className={styles.closeButton} onClick={onClose}>×</button>

                <h2 className={styles.title}>About Blocs</h2>

                <div className={styles.content}>
                    <p className={styles.highlight}>
                        <strong>1 Grid. 10,000 Blocks. Yours Forever.</strong>
                    </p>

                    <p>
                        Blocs is a decentralized experiment on the Solana blockchain.
                        There are exactly 10,000 blocks available. No more will ever be created.
                    </p>

                    <h3 className={styles.subtitle}>How it works</h3>
                    <ul className={styles.list}>
                        <li><strong>Buy:</strong> Select an available block (black) and purchase it for SOL.</li>
                        <li><strong>Own:</strong> Once bought, the block belongs to your wallet address.</li>
                        <li><strong>Customize:</strong> Set the color, image, and link of your block.</li>
                        <li><strong>Trade:</strong> List your block for sale at any price. Resales incur a 5% royalty fee.</li>
                    </ul>

                    <p className={styles.footer}>
                        Powered by Solana. Built for the community.
                    </p>
                </div>
            </div>
        </div>
    );
};
