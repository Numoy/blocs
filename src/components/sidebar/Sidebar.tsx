"use client";

import { useState, useEffect, useRef } from 'react';
import { BlockData } from '@/types';
import styles from './Sidebar.module.css';
import { useWallet } from '@solana/wallet-adapter-react';
import { SidebarView } from './SidebarView';
import { SidebarEdit } from './SidebarEdit';
import { GRID_WIDTH, GRID_SIZE } from '@/utils/constants';

interface SidebarProps {
    block: BlockData | null;
    onClose: () => void;
    onBuy: (block: BlockData) => Promise<void>;
    initialMode?: 'view' | 'edit';
    onPrev?: () => void;
    onNext?: () => void;
    onViewOwnerBlocks?: (owner: string) => void;
}

export const Sidebar = ({ block, onClose, onBuy, initialMode = 'view', onPrev, onNext, onViewOwnerBlocks }: SidebarProps) => {
    const { publicKey } = useWallet();

    const isOwner = Boolean(publicKey && block && block.owner === publicKey.toBase58());

    const [isEditing, setIsEditing] = useState(() => initialMode === 'edit' && isOwner);
    const sidebarRef = useRef<HTMLDivElement>(null);

    // Escape key to close (only if focused within sidebar or no other modals are active)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                // If a wallet modal is open (often uses a standard overlay wrapper class), do not close the sidebar.
                // This is a common heuristic approach without injecting into the modal provider directly.
                const walletModalOpen = document.querySelector('.wallet-adapter-modal-wrapper');
                if (walletModalOpen) return;

                onClose();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    if (!block) return null;

    const handleEditToggle = () => {
        setIsEditing(!isEditing);
    };

    const statusBadgeClass = !block.owner
        ? `${styles.statusBadge} ${styles.statusAvailable}`
        : block.isForSale && !isOwner
            ? `${styles.statusBadge} ${styles.statusForSale}`
            : isOwner
                ? `${styles.statusBadge} ${styles.statusOwned}`
                : `${styles.statusBadge} ${styles.statusAvailable}`;

    const statusLabel = !block.owner
        ? "Available"
        : block.isForSale && !isOwner
            ? "For Sale"
            : isOwner
                ? "Yours"
                : "Owned";

    return (
        <>
            <div className={styles.overlay} onClick={onClose} aria-hidden="true" />
            <div
                className={styles.sidebar}
                role="dialog"
                aria-modal="true"
                aria-labelledby="sidebar-title"
                ref={sidebarRef}
                // Auto focus so screen readers can access content
                tabIndex={-1}
            >
                <div className={styles.titleRow}>
                    <button
                        className={styles.navButton}
                        onClick={onPrev}
                        disabled={!onPrev || block.id === 0}
                        aria-label="Previous block"
                    >←</button>
                    <div className={styles.titleGroup}>
                        <div className={styles.titleLine}>
                            <h2 id="sidebar-title" className={styles.title}>Block #{block.id}</h2>
                        </div>
                        <div className={styles.titleMeta}>
                            <span className={styles.coordinates}>
                                Row {Math.floor(block.id / GRID_WIDTH) + 1}, Col {(block.id % GRID_WIDTH) + 1}
                            </span>
                            <span className={statusBadgeClass}>{statusLabel}</span>
                        </div>
                    </div>
                    <button
                        className={styles.navButton}
                        onClick={onNext}
                        disabled={!onNext || block.id === GRID_SIZE - 1}
                        aria-label="Next block"
                    >→</button>
                    <button className={styles.closeButton} onClick={onClose} aria-label="Close sidebar" autoFocus>
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <line x1="1" y1="1" x2="13" y2="13" />
                            <line x1="13" y1="1" x2="1" y2="13" />
                        </svg>
                    </button>
                </div>

                <div className={styles.divider} />

                {!isEditing ? (
                    <SidebarView
                        block={block}
                        isOwner={isOwner}
                        onBuy={onBuy}
                        onEditToggle={handleEditToggle}
                        onViewOwnerBlocks={onViewOwnerBlocks}
                    />
                ) : (
                    <SidebarEdit
                        block={block}
                        onEditToggle={handleEditToggle}
                    />
                )}
            </div>
        </>
    );
};
