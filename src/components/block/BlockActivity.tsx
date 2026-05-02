"use client";

import Link from "next/link";
import type { BlockData } from "@/types";
import { getBlockAccountExplorerUrl } from "@/utils/explorer";
import styles from "./BlockActivity.module.css";

type BlockActivityProps = {
    block: BlockData;
    compact?: boolean;
};

export const BlockActivity = ({ block, compact = false }: BlockActivityProps) => {
    const explorerUrl = getBlockAccountExplorerUrl(block.id);
    const hasContent = Boolean(block.text || block.imageUrl || block.url);

    const rows = [
        {
            label: block.owner ? "Owned" : "Unclaimed",
            value: block.owner ? `${block.owner.slice(0, 4)}...${block.owner.slice(-4)}` : "Protocol primary sale",
        },
        {
            label: block.isForSale ? "Listed" : "Sale",
            value: block.isForSale && block.price !== null ? `${block.price} SOL` : "Not listed",
        },
        {
            label: "Content",
            value: hasContent ? [
                block.text ? "message" : null,
                block.imageUrl ? "image" : null,
                block.url ? "link" : null,
            ].filter(Boolean).join(", ") : "No metadata yet",
        },
    ];

    return (
        <section className={compact ? styles.compactPanel : styles.panel} aria-label={`Block ${block.id} activity`}>
            <div className={styles.headerRow}>
                <h3 className={styles.title}>Activity</h3>
                <a
                    href={explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.explorerLink}
                >
                    Explorer
                </a>
            </div>
            <div className={styles.timeline}>
                {rows.map((row) => (
                    <div className={styles.row} key={row.label}>
                        <span className={styles.dot} aria-hidden="true" />
                        <div>
                            <div className={styles.rowLabel}>{row.label}</div>
                            <div className={styles.rowValue}>{row.value}</div>
                        </div>
                    </div>
                ))}
            </div>
            {block.owner && (
                <Link href={`/owner/${block.owner}`} className={styles.ownerLink}>
                    View owner profile
                </Link>
            )}
        </section>
    );
};
