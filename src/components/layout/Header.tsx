"use client";

import { useMemo, useState } from 'react';
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import styles from './Header.module.css';
import { ClientOnly } from "@/components/utils/ClientOnly";
import { InfoModal } from "@/components/modals/InfoModal";
import { useProgram } from '@/context/ProgramContext';

export const Header = () => {
    const [isInfoOpen, setIsInfoOpen] = useState(false);
    const { blocks, isLoading } = useProgram();

    const marketStats = useMemo(() => {
        const forSale = blocks.filter(b => b.isForSale && b.price !== null);
        if (!forSale.length) return null;
        return {
            floor: Math.min(...forSale.map(b => b.price!)),
            count: forSale.length,
        };
    }, [blocks]);

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
                        <WalletMultiButton />
                    </ClientOnly>
                </div>
            </header>
            <InfoModal isOpen={isInfoOpen} onClose={() => setIsInfoOpen(false)} />
        </>
    );
};
