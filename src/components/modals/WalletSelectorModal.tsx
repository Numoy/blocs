import React from 'react';
import { generateWalletDeepLinks } from '@/utils/mobile';
import styles from './WalletSelectorModal.module.css';

interface WalletSelectorModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentUrl: string;
}

const PhantomLogo = () => (
    <svg viewBox="0 0 128 128" className={styles.walletIcon} style={{ fill: "#AB9FF2" }}>
        <path d="M106.32 99.88c-1.84 3.03-5.22 4.09-8.23 2.19l-9.16-5.46-.37-.7c-4.47-8.31-7.16-16.71-8.15-25.13l-12.83 20.35a7.35 7.35 0 0 1-9.92 2.13 7.37 7.37 0 0 1-2.12-2.13L32.18 56.63c-3-4.82-5.78-9.45-8.24-13.8-1-1.82-1.28-3.79-.38-5.32 1.34-2.26 4.67-2.6 7.42-1l7.32 4.31c2.11 1.25 4.8 3.06 7.75 5.51a56 56 0 0 1 12.64-15c-.2 1.84.18 4 1.4 5.91l8.77 13.91 10.37-16.48c1.33-2.11 3.53-3.64 6-4 4.82-.69 9.38 2.37 10.74 6.89l.34 1.13c5.38 17.8 7.38 30.64 12.01 41.7 1.83 4.34 1.25 9.4-1.21 13.68-.42.74-.75 1.54-1.07 2.38.16.27.3.55.51.8l8.36 10.37c2.31 2.87 1.88 7.46-1.55 9.77z"></path>
    </svg>
);

const SolflareLogo = () => (
    <svg viewBox="0 0 379 328" className={styles.walletIcon} style={{ fill: "none" }}>
        <path d="M189.5 0L0 82V246L189.5 328L379 246V82L189.5 0Z" fill="#FC7225" />
        <path d="M189.5 59.8L287.7 102.3V195.9L189.5 238.4L91.3 195.9V102.3L189.5 59.8Z" fill="white" />
        <path d="M189.5 130.6L209.8 141.2V162.4L189.5 173L169.2 162.4V141.2L189.5 130.6Z" fill="#FC7225" />
    </svg>
);

// Backpack logo approximated placeholder (usually a simple shape or the 'B' stylized)
const BackpackLogo = () => (
    <svg viewBox="0 0 24 24" className={styles.walletIcon} style={{ fill: "#E33E3F" }}>
        <rect x="2" y="2" width="20" height="20" rx="4" fill="#E33E3F" />
        <path d="M7 8h10M7 12h10M7 16h6" stroke="white" strokeWidth="2" strokeLinecap="round" />
    </svg>
);

const MetaMaskLogo = () => (
    <svg viewBox="0 0 32 32" className={styles.walletIcon}>
        <path fill="#e2761b" d="M27.2 4.1l-1.6 3-8.8-3.1-8.7 3.1-1.6-3L1.1 6.5l.4.5c.3.5 1 .7 1.6.4.2-.1.3-.2.4-.4l5.3-2 6.8 2.5h.9l6.7-2.5 5.3 2c.2.1.3.1.5.1h.3c.5-.1 1-.4 1.2-.8l.4-.5-5.7-1.7zm-22 3.8s-.1 0 0 0c-1.3 5.4 0 12 4.2 16.4l-1-7.1-3.2-9.3zm21.6 0l-3.2 9.4-1 7c4.2-4.4 5.5-11 4.2-16.4zm-14 3.7l-4.2 12.3c.6.4 1.2.8 1.8 1.1l2.4-13.4zm6.5 0l2.3 13.5c.6-.3 1.2-.7 1.8-1.1L19.3 11.6zM16 11.9l-2.4 13c.8.2 1.6.3 2.4.3s1.6-.1 2.4-.3l-2.4-13z" />
    </svg>
);

export const WalletSelectorModal: React.FC<WalletSelectorModalProps> = ({ isOpen, onClose, currentUrl }) => {
    if (!isOpen) return null;

    const urls = generateWalletDeepLinks(currentUrl);

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
                <h2 className={styles.title}>Transaction Failed</h2>
                <p className={styles.subtitle}>
                    Use a wallet browser to complete this purchase securely.
                </p>

                <div className={styles.grid}>
                    <a href={urls.phantom} className={styles.walletOption}>
                        <PhantomLogo />
                        <span className={styles.walletName}>Phantom</span>
                    </a>
                    <a href={urls.solflare} className={styles.walletOption}>
                        <SolflareLogo />
                        <span className={styles.walletName}>Solflare</span>
                    </a>
                    <a href={urls.backpack} className={styles.walletOption}>
                        <BackpackLogo />
                        <span className={styles.walletName}>Backpack</span>
                    </a>
                    <a href={urls.metamask} className={styles.walletOption}>
                        <MetaMaskLogo />
                        <span className={styles.walletName}>MetaMask</span>
                    </a>
                </div>

                <button className={styles.closeButton} onClick={onClose}>
                    Close
                </button>
            </div>
        </div>
    );
};
