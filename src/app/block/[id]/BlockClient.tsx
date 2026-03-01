"use client";

import { useProgram } from "@/context/ProgramContext";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { GRID_SIZE } from "@/utils/constants";
import { toSafeExternalUrl } from "@/utils/url";
import { useWallet } from "@solana/wallet-adapter-react";
import { toErrorCategory, trackPlausibleEvent } from "@/utils/analytics";
import { parseGridBlockId } from "@/utils/numberParsing";
import styles from "./BlockClient.module.css";

export default function BlockClient() {
    const params = useParams();
    const router = useRouter();
    const { blocks, isLoading, buyBlock, openWalletModal } = useProgram();
    const { publicKey } = useWallet();
    const [isBuying, setIsBuying] = useState(false);
    const lastTrackedViewBlockId = useRef<number | null>(null);

    // Parse ID from URL
    const id = typeof params.id === "string" ? (parseGridBlockId(params.id) ?? -1) : -1;

    // Touch state for swipe
    const touchStartX = useRef<number | null>(null);

    // Navigation
    const handlePrev = () => {
        const prevId = id > 0 ? id - 1 : GRID_SIZE - 1;
        trackPlausibleEvent("block_navigation_clicked", {
            from_block_id: id,
            to_block_id: prevId,
            direction: "prev",
            ui_source: "block_detail",
        });
        router.push(`/block/${prevId}`);
    };

    const handleNext = () => {
        const nextId = id < GRID_SIZE - 1 ? id + 1 : 0;
        trackPlausibleEvent("block_navigation_clicked", {
            from_block_id: id,
            to_block_id: nextId,
            direction: "next",
            ui_source: "block_detail",
        });
        router.push(`/block/${nextId}`);
    };

    // Swipe Handlers
    const onTouchStart = (e: React.TouchEvent) => {
        touchStartX.current = e.touches[0].clientX;
    };

    const onTouchEnd = (e: React.TouchEvent) => {
        if (touchStartX.current === null) return;
        const touchEndX = e.changedTouches[0].clientX;
        const diff = touchStartX.current - touchEndX;

        if (diff > 50) handleNext();
        else if (diff < -50) handlePrev();
        touchStartX.current = null;
    };

    // Find Block Data
    const block = id >= 0 && id < blocks.length ? blocks[id] : undefined;
    const safeBlockUrl = toSafeExternalUrl(block?.url);
    const safeBlockImageUrl = toSafeExternalUrl(block?.imageUrl);

    useEffect(() => {
        if (isLoading || !block) {
            return;
        }

        if (lastTrackedViewBlockId.current === block.id) {
            return;
        }
        lastTrackedViewBlockId.current = block.id;

        trackPlausibleEvent("block_detail_viewed", {
            block_id: block.id,
            is_for_sale: block.isForSale,
            has_owner: Boolean(block.owner),
            has_text: Boolean(block.text),
            has_image: Boolean(block.imageUrl),
            has_link: Boolean(block.url),
        });
    }, [isLoading, block]);

    if (isLoading) {
        return (
            <div className={styles.stateContainer}>
                <div>Loading Block #{id}...</div>
            </div>
        );
    }

    if (!block) {
        return (
            <div className={styles.stateContainer}>
                <h1 className={styles.stateTitle}>Block #{id} not found</h1>
                <button onClick={() => router.push('/')} className="uiButton uiButtonSecondary">
                    Back to Grid
                </button>
            </div>
        );
    }

    return (
        <div
            className={styles.page}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
        >
            <div className={styles.navRow}>
                <button onClick={handlePrev} className={`${styles.navButton} uiButton uiButtonGhost`} aria-label="Previous Block">
                    ←
                </button>
                <div className={styles.navCenter}>
                    <h1 className={styles.blockTitle}>Block #{id}</h1>
                    <span className={styles.blockState}>{block.owner ? 'Owned' : 'Available'}</span>
                </div>
                <button onClick={handleNext} className={`${styles.navButton} uiButton uiButtonGhost`} aria-label="Next Block">
                    →
                </button>
            </div>

            <article className={`${styles.card} uiCard`}>
                <div className={styles.media} style={{ backgroundColor: safeBlockImageUrl ? 'transparent' : (block.color || '#222') }}>
                    {safeBlockImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={safeBlockImageUrl}
                            alt={`Block ${id}`}
                        />
                    ) : (
                        <div className={styles.empty}>Empty</div>
                    )}
                </div>

                <div className={styles.body}>
                    <div>
                        <div className={styles.metaLabel}>Message</div>
                        <div className={`${styles.message} ${!block.text ? styles.messageEmpty : ''}`}>
                            {block.text ? `"${block.text}"` : "No message set."}
                        </div>
                    </div>

                    {block.url && safeBlockUrl && (
                        <div>
                            <div className={styles.metaLabel}>Link</div>
                            <a
                                href={safeBlockUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={styles.blockLink}
                            >
                                {block.url}
                            </a>
                        </div>
                    )}

                    <div className={styles.separator} />

                    <div className={styles.footer}>
                        <div>
                            <div className={styles.metaLabel}>Owner</div>
                            <div className={styles.ownerValue}>
                                {block.owner ? `${block.owner.slice(0, 4)}...${block.owner.slice(-4)}` : 'None'}
                            </div>
                        </div>

                        {block.isForSale ? (
                            <div className={styles.price}>
                                <div className={styles.metaLabel}>Price</div>
                                <div className={styles.priceValue}>{block.price} SOL</div>
                            </div>
                        ) : (
                            <div className={styles.notForSale}>Not For Sale</div>
                        )}
                    </div>

                    {block.isForSale && (
                        <button
                            onClick={async () => {
                                trackPlausibleEvent("buy_cta_clicked", {
                                    block_id: block.id,
                                    ui_source: "block_detail",
                                    wallet_connected: Boolean(publicKey),
                                    price_sol: block.price || 0,
                                });
                                if (!publicKey) {
                                    openWalletModal("block_detail_buy");
                                    return;
                                }
                                if (isBuying) {
                                    return;
                                }
                                setIsBuying(true);
                                try {
                                    await buyBlock(block.id, block.price || 0, undefined, "block_detail");
                                } catch (error) {
                                    trackPlausibleEvent("buy_flow_failed", {
                                        block_id: block.id,
                                        ui_source: "block_detail",
                                        error_category: toErrorCategory(error),
                                    });
                                    // buyBlock already handles user-facing errors via toasts.
                                } finally {
                                    setIsBuying(false);
                                }
                            }}
                            className={`${styles.buyButton} uiButton uiButtonPrimary`}
                            disabled={isBuying}
                        >
                            {isBuying ? "Processing..." : "Buy Now"}
                        </button>
                    )}
                </div>
            </article>

            <button
                onClick={() => {
                    trackPlausibleEvent("close_block_detail_clicked", {
                        block_id: block.id,
                        ui_source: "block_detail",
                    });
                    router.push('/');
                }}
                className={`${styles.closeButton} uiButton uiButtonGhost`}
            >
                Close and Return to Grid
            </button>
        </div>
    );
}
