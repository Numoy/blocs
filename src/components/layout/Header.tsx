"use client";

import { useState } from 'react';
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import styles from './Header.module.css';
import { ClientOnly } from "@/components/utils/ClientOnly";
import { InfoModal } from "@/components/modals/InfoModal";

export const Header = () => {
    const [isInfoOpen, setIsInfoOpen] = useState(false);

    return (
        <>
            <header className={styles.header}>
                <div className={styles.logo}>10,000 Blocks</div>
                <div className={styles.actions}>
                    <button
                        className={styles.infoButton}
                        onClick={() => setIsInfoOpen(true)}
                        aria-label="About"
                    >
                        About
                    </button>
                    <ClientOnly>
                        <WalletMultiButton />
                    </ClientOnly>
                </div>
            </header>
            <InfoModal isOpen={isInfoOpen} onClose={() => setIsInfoOpen(false)} />
        </>
    );
};
