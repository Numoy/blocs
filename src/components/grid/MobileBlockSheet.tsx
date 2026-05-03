"use client";

import Link from "next/link";
import { toSafeExternalUrl } from "@/utils/url";
import { BLOCK_EMPTY_COLOR, getPrimaryBlockPriceSol, formatSol } from "@/utils/constants";
import { useProgram } from "@/context/ProgramContext";
import type { BlockData } from "@/types";
import styles from "./MobileBlockSheet.module.css";

interface MobileBlockSheetProps {
    block: BlockData | null;
    isOwner: boolean;
    isBuying: boolean;
    onBuy: () => Promise<void>;
    onEdit: () => void;
    onShare: () => Promise<void>;
    onClose: () => void;
}

export const MobileBlockSheet = ({
    block,
    isOwner,
    isBuying,
    onBuy,
    onEdit,
    onShare,
    onClose,
}: MobileBlockSheetProps) => {
    const { walletBalance, onFundWallet } = useProgram();

    if (!block) return null;

    const safeImageUrl = toSafeExternalUrl(block.imageUrl);
    const blockPrice = block.isForSale && block.price ? block.price : getPrimaryBlockPriceSol(block.id);
    const neededSol = blockPrice + 0.005;
    const isLowBalance = walletBalance !== null && walletBalance < neededSol;
    const suggestedAmount = (Math.ceil(neededSol * 100) / 100).toString();

    return (
        <>
            <div className={styles.backdrop} onClick={onClose} aria-hidden="true" />
            <section className={styles.sheet} role="dialog" aria-modal="true" aria-label={`Block ${block.id} quick actions`}>
                <div className={styles.handle} aria-hidden="true" />

                <div className={styles.headerRow}>
                    <div>
                        <h2 className={styles.title}>Block #{block.id}</h2>
                        <div className={styles.subtitle}>{block.owner ? (isOwner ? "Owned by you" : "Owned") : "Available"}</div>
                    </div>
                    <button type="button" className="uiButton uiButtonGhost" onClick={onClose}>
                        Close
                    </button>
                </div>

                <div className={styles.previewCard}>
                    {safeImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={safeImageUrl} alt="" className={styles.previewImage} />
                    ) : (
                        <div className={styles.emptyPreview} style={{ backgroundColor: BLOCK_EMPTY_COLOR }}>No Image</div>
                    )}

                    <p className={styles.message}>{block.text || "No message"}</p>

                    <div className={styles.metaRow}>
                        <span className="uiChip">{block.isForSale && block.price !== null ? `${formatSol(block.price)} SOL` : "Not for sale"}</span>
                        {block.url && <span className="uiChipMuted">Link</span>}
                    </div>
                </div>

                {!block.isForSale && !isOwner && (
                    <p className={styles.notForSaleNote}>
                        {block.owner ? "Not listed for sale." : "Not claimed yet — be the first to own it."}
                    </p>
                )}

                <div className={styles.actionRow}>
                    {block.isForSale && !isOwner && (
                        <button type="button" className="uiButton uiButtonPrimary" disabled={isBuying} onClick={onBuy}>
                            {isBuying ? "Processing..." : "Buy"}
                        </button>
                    )}
                    {isBuying && (
                        <p className={styles.walletHint}>Check your wallet to confirm.</p>
                    )}
                    {block.isForSale && !isOwner && walletBalance !== null && (
                        <p className={`${styles.walletHint} ${isLowBalance ? styles.balanceLow : ""}`}>
                            Balance: {walletBalance.toFixed(3)} SOL
                            {isLowBalance && (
                                <> · <button className={styles.addSolLink} onClick={() => onFundWallet(suggestedAmount)}>Add SOL</button></>
                            )}
                        </p>
                    )}

                    {isOwner && (
                        <button type="button" className="uiButton uiButtonSecondary" onClick={onEdit}>
                            Edit
                        </button>
                    )}

                    <button type="button" className="uiButton uiButtonGhost" onClick={onShare}>
                        Share
                    </button>

                    <Link href={`/block/${block.id}`} className="uiButton uiButtonGhost">
                        Details
                    </Link>
                </div>
            </section>
        </>
    );
};
