import React from 'react';
import { generateWalletDeepLinks } from '@/utils/mobile';
import styles from './WalletSelectorModal.module.css';

interface WalletSelectorModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentUrl: string;
}

const PhantomLogo = () => (
    <svg viewBox="0 0 1200 1200" fill="none" xmlns="http://www.w3.org/2000/svg" className={styles.walletIcon}>
        <g clip-path="url(#clip0_2596_138572)">
            <rect y="0.00100708" width="1200" height="1200" fill="#AB9FF2" />
            <path fill-rule="evenodd" clip-rule="evenodd" d="M522.218 764.815C475.101 837.013 396.147 928.38 291.089 928.38C241.425 928.38 193.671 907.934 193.671 819.124C193.671 592.944 502.479 242.814 789.003 242.814C952.003 242.814 1016.95 355.904 1016.95 484.327C1016.95 649.17 909.979 837.652 803.647 837.652C769.901 837.652 753.346 819.124 753.346 789.733C753.346 782.066 754.62 773.76 757.167 764.815C720.874 826.791 650.835 884.294 585.253 884.294C537.499 884.294 513.304 854.264 513.304 812.095C513.304 796.761 516.487 780.788 522.218 764.815ZM769.035 479.869C769.035 517.291 746.956 536.002 722.258 536.002C697.185 536.002 675.481 517.291 675.481 479.869C675.481 442.448 697.185 423.737 722.258 423.737C746.956 423.737 769.035 442.448 769.035 479.869ZM909.367 479.87C909.367 517.291 887.288 536.002 862.59 536.002C837.517 536.002 815.813 517.291 815.813 479.87C815.813 442.448 837.517 423.737 862.59 423.737C887.288 423.737 909.367 442.448 909.367 479.87Z" fill="#FFFDF8" />
        </g>
        <defs>
            <clipPath id="clip0_2596_138572">
                <rect y="0.00100708" width="1200" height="1200" fill="white" />
            </clipPath>
        </defs>
    </svg>
);

const SolflareLogo = () => (
    <svg viewBox="0 0 290 290" fill="none" xmlns="http://www.w3.org/2000/svg" className={styles.walletIcon}>
        <g clip-path="url(#clip0_146_299)">
            <path d="M63.2951 1H226.705C261.11 1 289 28.8905 289 63.2951V226.705C289 261.11 261.11 289 226.705 289H63.2951C28.8905 289 1 261.11 1 226.705V63.2951C1 28.8905 28.8905 1 63.2951 1Z" fill="#FFEF46" stroke="#EEDA0F" stroke-width="2" />
            <path d="M140.548 153.231L154.832 139.432L181.462 148.147C198.893 153.958 207.609 164.61 207.609 179.62C207.609 190.999 203.251 198.504 194.536 208.188L191.873 211.093L192.841 204.314C196.714 179.62 189.452 168.968 165.484 161.22L140.548 153.231ZM104.717 68.739L177.347 92.9488L161.61 107.959L123.843 95.3698C110.77 91.012 106.412 83.9911 104.717 69.2232V68.739ZM100.359 191.725L116.822 175.988L147.811 186.157C164.031 191.483 169.599 198.504 167.905 216.177L100.359 191.725ZM79.539 121.516C79.539 116.917 81.9599 112.559 86.0756 108.927C90.4334 115.222 97.9384 120.79 109.801 124.664L135.464 133.137L121.18 146.937L96.0016 138.705C84.3809 134.832 79.539 129.021 79.539 121.516ZM155.558 248.618C208.819 213.272 237.387 189.304 237.387 159.768C237.387 140.158 225.766 129.263 200.104 120.79L180.736 114.253L233.756 63.4128L223.103 52.0342L207.367 65.8337L133.043 41.3818C110.043 48.8869 80.9916 70.9178 80.9916 92.9487C80.9916 95.3697 81.2337 97.7907 81.96 100.454C62.8342 111.348 55.0871 121.516 55.0871 134.105C55.0871 145.968 61.3816 157.831 81.4758 164.368L97.4542 169.694L42.2559 222.713L52.9082 234.092L70.0972 218.356L155.558 248.618Z" fill="#02050A" />
        </g>
        <defs>
            <clipPath id="clip0_146_299">
                <rect width="290" height="290" fill="white" />
            </clipPath>
        </defs>
    </svg>

);

// Backpack logo approximated placeholder (usually a simple shape or the 'B' stylized)
const BackpackLogo = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 11 15.999799728393555" className={styles.walletIcon}><g clip-path="url(#clip0_1_803)"><path fill-rule="evenodd" clip-rule="evenodd" d="M6.54201 1.25805C7.12356 1.25805 7.66905 1.33601 8.1741 1.48059C7.67963 0.328169 6.65297 0 5.51038 0C4.36555 0 3.3371 0.329459 2.84375 1.48738C3.3451 1.33771 3.88824 1.25805 4.4678 1.25805H6.54201ZM4.33478 2.41504C1.57335 2.41504 0 4.58743 0 7.2672V10.02C0 10.288 0.223858 10.5 0.5 10.5H10.5C10.7761 10.5 11 10.288 11 10.02V7.2672C11 4.58743 9.17041 2.41504 6.40899 2.41504H4.33478ZM5.49609 7.29102C6.46259 7.29102 7.24609 6.50751 7.24609 5.54102C7.24609 4.57452 6.46259 3.79102 5.49609 3.79102C4.5296 3.79102 3.74609 4.57452 3.74609 5.54102C3.74609 6.50751 4.5296 7.29102 5.49609 7.29102ZM0 12.118C0 11.8501 0.223858 11.6328 0.5 11.6328H10.5C10.7761 11.6328 11 11.8501 11 12.118V15.0293C11 15.5653 10.5523 15.9998 10 15.9998H1C0.447715 15.9998 0 15.5653 0 15.0293V12.118Z" fill="#E33E3F"></path></g></svg>
);

const MetaMaskLogo = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 97 94" fill="none" role="presentation" className={styles.walletIcon}><path fill="#FF5C16" d="m90.504 89.91-20.803-6.181-15.688 9.358-10.946-.005-15.698-9.353-20.794 6.18L.25 68.603l6.325-23.648L.25 24.96 6.575.18l32.493 19.37h18.944L90.504.18l6.325 24.78-6.325 19.994 6.325 23.648z"></path><path fill="#FF5C16" d="m6.578.18 32.493 19.385-1.293 13.303zm20.797 68.43 14.297 10.867-14.297 4.25zm13.15-17.968-2.748-17.767L20.19 44.956l-.01-.005v.01l.055 12.435 7.132-6.754zM90.5.18 58.008 19.565l1.287 13.303zM69.71 68.61 55.415 79.476l14.296 4.25zm7.185-23.65h.005zv-.009l-.004.005-17.589-12.081-2.747 17.767h13.154l7.136 6.754z"></path><path fill="#E34807" d="m27.37 83.727-20.795 6.18L.25 68.61h27.12zM40.522 50.64l3.972 25.685-5.505-14.28-18.762-4.646 7.136-6.758zM69.71 83.727l20.795 6.18L96.83 68.61H69.71zM56.558 50.64l-3.972 25.685 5.505-14.28 18.762-4.646-7.141-6.758z"></path><path fill="#FF8D5D" d="m.25 68.602 6.325-23.649h13.603l.05 12.44 18.762 4.645 5.505 14.281-2.83 3.145L27.37 68.597H.25zm96.581 0-6.325-23.649H76.903l-.05 12.44-18.762 4.645-5.505 14.281 2.83 3.145 14.296-10.867H96.83zM58.013 19.547H39.069L37.781 32.85l6.715 43.452h8.09l6.72-43.452z"></path><path fill="#661800" d="M6.575.18.25 24.96l6.325 19.994h13.603l17.597-12.086zm30.021 55.621h-6.162l-3.356 3.282 11.92 2.95-2.402-6.236zM90.505.18l6.325 24.78-6.325 19.994H76.902L59.305 32.868zM60.494 55.801h6.17l3.356 3.287-11.934 2.954 2.408-6.245zM54.01 84.61l1.406-5.137-2.829-3.145h-8.094l-2.829 3.145 1.406 5.136"></path><path fill="#C0C4CD" d="M54.004 84.61v8.48H43.063v-8.48z"></path><path fill="#E7EBF6" d="m27.375 83.719 15.702 9.367v-8.481l-1.405-5.136zm42.335 0-15.702 9.367v-8.481l1.405-5.136z"></path></svg>
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
