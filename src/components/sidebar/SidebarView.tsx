"use client";

import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { toast } from 'sonner';
import { trackPlausibleEvent } from '@/utils/analytics';
import { toSafeExternalUrl } from '@/utils/url';
import { BlockData } from '@/types';
import styles from './Sidebar.module.css';

interface SidebarViewProps {
    block: BlockData;
    isOwner: boolean;
    onBuy: (block: BlockData) => Promise<void>;
    onEditToggle: () => void;
    onViewOwnerBlocks?: (owner: string) => void;
}

export const SidebarView = ({
    block,
    isOwner,
    onBuy,
    onEditToggle,
    onViewOwnerBlocks,
}: SidebarViewProps) => {
    const { publicKey } = useWallet();
    const [isBuying, setIsBuying] = useState(false);

    const safeBlockUrl = toSafeExternalUrl(block.url);
    const safeBlockImageUrl = toSafeExternalUrl(block.imageUrl);

    const handleShare = async () => {
        const url = `${window.location.origin}/block/${block.id}`;
        try {
            if (navigator.share) {
                await navigator.share({
                    title: `Block #${block.id} on Blocs`,
                    text: "Check out this block on the Blocs grid.",
                    url,
                });
                trackPlausibleEvent("share_block_link_clicked", {
                    block_id: block.id,
                    ui_source: "sidebar",
                    method: "native_share",
                });
                return;
            }
            await navigator.clipboard.writeText(url);
            trackPlausibleEvent("share_block_link_clicked", {
                block_id: block.id,
                ui_source: "sidebar",
                method: "clipboard",
            });
            toast.success("Link copied to clipboard!");
        } catch (error) {
            const abortError = error as DOMException;
            if (abortError?.name === "AbortError") return;
            toast.error("Could not share this block right now.");
        }
    };

    const handleBuyClick = async () => {
        trackPlausibleEvent("buy_cta_clicked", {
            block_id: block.id,
            ui_source: "sidebar",
            wallet_connected: Boolean(publicKey),
            price_sol: block.price || 0,
        });
        setIsBuying(true);
        try {
            await onBuy(block);
        } finally {
            setIsBuying(false);
        }
    };

    return (
        <>
            {safeBlockImageUrl && (
                <div className={`${styles.section} ${styles.imagePadless}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={safeBlockImageUrl}
                        alt={`Block ${block.id}`}
                        className={styles.image}
                    />
                </div>
            )}

            <div className={styles.section}>
                <div className={styles.infoRow}>
                    <span className={styles.infoRowLabel}>Owner</span>
                    <div className={styles.infoRowValue}>
                        {block.owner
                            ? isOwner
                                ? "You"
                                : onViewOwnerBlocks
                                    ? <button
                                        className={styles.ownerButton}
                                        onClick={() => onViewOwnerBlocks(block.owner!)}
                                    >
                                        {block.owner.slice(0, 4)}...{block.owner.slice(-4)}
                                    </button>
                                    : block.owner
                            : "Available"}
                    </div>
                </div>
                {block.text && (
                    <div className={styles.infoRow}>
                        <span className={styles.infoRowLabel}>Message</span>
                        <div className={styles.infoRowValue}>{block.text}</div>
                    </div>
                )}
                {block.url && (
                    <div className={styles.infoRow}>
                        <span className={styles.infoRowLabel}>Link</span>
                        <div className={styles.infoRowValue}>
                            {safeBlockUrl ? (
                                <a href={safeBlockUrl} target="_blank" rel="noopener noreferrer" className={styles.link}>
                                    {block.url}
                                </a>
                            ) : (
                                block.url
                            )}
                        </div>
                    </div>
                )}
                {!block.text && !block.url && !block.imageUrl && (
                    <div className={styles.emptyNote}>No content yet</div>
                )}
            </div>

            {block.isForSale && (block.price !== null) && !isOwner && (
                <div className={styles.section}>
                    <div className={styles.priceDisplay}>
                        {block.price} SOL
                    </div>
                    <button
                        className={`${styles.button} uiButton uiButtonPrimary`}
                        onClick={handleBuyClick}
                        disabled={isBuying}
                    >
                        {isBuying ? "Processing..." : "Buy Block"}
                    </button>
                    {isBuying && (
                        <p className={styles.helperText}>
                            Please confirm the transaction in your wallet.
                        </p>
                    )}
                </div>
            )}

            <div className={styles.actionsGroup}>
                {isOwner && (
                    <button className={`${styles.button} uiButton uiButtonSecondary`} onClick={onEditToggle}>
                        Edit Block
                    </button>
                )}
                <button
                    className={`${styles.button} uiButton uiButtonGhost`}
                    onClick={handleShare}
                >
                    Share Block
                </button>
            </div>
        </>
    );
};
