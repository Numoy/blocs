"use client";

import Link from "next/link";
import { toSafeExternalUrl } from "@/utils/url";
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
    if (!block) return null;

    const safeImageUrl = toSafeExternalUrl(block.imageUrl);

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
                        <div className={styles.emptyPreview} style={{ backgroundColor: block.color || "#222" }}>No Image</div>
                    )}

                    <p className={styles.message}>{block.text || "No message set"}</p>

                    <div className={styles.metaRow}>
                        <span className="uiChip">{block.isForSale && block.price !== null ? `${block.price} SOL` : "Not for sale"}</span>
                        {block.url && <span className="uiChipMuted">Has link</span>}
                    </div>
                </div>

                <div className={styles.actionRow}>
                    {block.isForSale && !isOwner && (
                        <button type="button" className="uiButton uiButtonPrimary" disabled={isBuying} onClick={onBuy}>
                            {isBuying ? "Processing..." : "Buy"}
                        </button>
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
