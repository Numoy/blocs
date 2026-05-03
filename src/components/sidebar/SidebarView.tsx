"use client";

import { useState } from 'react';
import Link from 'next/link';
import { useWallet } from '@solana/wallet-adapter-react';
import { trackPlausibleEvent } from '@/utils/analytics';
import { toSafeExternalUrl } from '@/utils/url';
import { shareBlock } from '@/utils/shareBlock';
import { BlockActivity } from '@/components/block/BlockActivity';
import { MosaicPreview } from '@/components/mosaic/MosaicPreview';
import { parseMosaicImageUrl } from '@/utils/mosaicImage';
import { useProgram } from '@/context/ProgramContext';
import { getPrimaryBlockPriceSol, formatSol } from '@/utils/constants';
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
    const { walletBalance, onFundWallet } = useProgram();
    const [isBuying, setIsBuying] = useState(false);

    const blockPrice = block.isForSale && block.price ? block.price : getPrimaryBlockPriceSol(block.id);
    const neededSol = blockPrice + 0.005;
    const isLowBalance = walletBalance !== null && walletBalance < neededSol;
    const suggestedAmount = (Math.ceil(neededSol * 100) / 100).toString();

    const safeBlockUrl = toSafeExternalUrl(block.url);
    const safeBlockImageUrl = toSafeExternalUrl(block.imageUrl);
    const mosaicMetadata = parseMosaicImageUrl(safeBlockImageUrl);

    const handleShare = () => shareBlock(block.id, "sidebar");

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
                    {mosaicMetadata ? (
                        <MosaicPreview
                            alt={`Mosaic containing block ${block.id}`}
                            metadata={mosaicMetadata}
                        />
                    ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={safeBlockImageUrl}
                            alt={`Block ${block.id}`}
                            className={styles.image}
                        />
                    )}
                </div>
            )}

            <div className={styles.section}>
                <div className={styles.infoRow}>
                    <span className={styles.infoRowLabel}>Owner</span>
                    <div className={styles.infoRowValue}>
                        {block.owner
                            ? isOwner
                                ? "You"
                                : <div className={styles.ownerActions}>
                                    {onViewOwnerBlocks && (
                                        <button
                                            className={styles.ownerButton}
                                            onClick={() => onViewOwnerBlocks(block.owner!)}
                                        >
                                            {block.owner.slice(0, 4)}...{block.owner.slice(-4)}
                                        </button>
                                    )}
                                    <Link href={`/owner/${block.owner}`} className={styles.ownerProfileLink}>
                                        Profile
                                    </Link>
                                </div>
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
                    <div className={styles.emptyNote}>Nothing here yet</div>
                )}
            </div>

            <BlockActivity block={block} compact />

            {block.isForSale && (block.price !== null) && !isOwner && (
                <div className={styles.section}>
                    <div className={styles.priceDisplay}>
                        {formatSol(block.price!)} SOL
                    </div>
                    <button
                        className={`${styles.button} uiButton uiButtonPrimary`}
                        onClick={handleBuyClick}
                        disabled={isBuying}
                    >
                        {isBuying ? "Processing..." : "Buy Block"}
                    </button>
                    {walletBalance !== null && (
                        <p className={`${styles.balanceRow} ${isLowBalance ? styles.balanceLow : ""}`}>
                            Balance: {walletBalance.toFixed(3)} SOL
                            {isLowBalance && (
                                <> · <button className={styles.addSolLink} onClick={() => onFundWallet(suggestedAmount)}>Add SOL</button></>
                            )}
                        </p>
                    )}
                    {isBuying && (
                        <p className={styles.helperText}>
                            Confirm in your wallet to complete.
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
