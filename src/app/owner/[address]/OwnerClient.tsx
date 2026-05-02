"use client";

import Link from "next/link";
import { PublicKey } from "@solana/web3.js";
import { useMemo } from "react";
import { useProgram } from "@/context/ProgramContext";
import { toSafeExternalUrl } from "@/utils/url";
import { BLOCK_EMPTY_COLOR } from "@/utils/constants";
import { getExplorerUrl } from "@/utils/explorer";
import styles from "./OwnerClient.module.css";

type OwnerClientProps = {
    address: string;
};

const isValidAddress = (address: string): boolean => {
    try {
        return new PublicKey(address).toBase58() === address;
    } catch {
        return false;
    }
};

export default function OwnerClient({ address }: OwnerClientProps) {
    const { blocks, isLoading } = useProgram();
    const isValid = isValidAddress(address);

    const ownedBlocks = useMemo(
        () => blocks.filter((block) => block.owner === address),
        [address, blocks],
    );

    const listedBlocks = useMemo(
        () => ownedBlocks.filter((block) => block.isForSale && block.price !== null),
        [ownedBlocks],
    );

    const listedValue = listedBlocks.reduce((total, block) => total + (block.price ?? 0), 0);
    const displayAddress = `${address.slice(0, 4)}...${address.slice(-4)}`;

    if (!isValid) {
        return (
            <main className={styles.statePage}>
                <h1>Owner not found</h1>
                <p>That does not look like a valid Solana address.</p>
                <Link href="/" className="uiButton uiButtonSecondary">Back to Grid</Link>
            </main>
        );
    }

    return (
        <main className={styles.page}>
            <section className={styles.header}>
                <Link href="/" className={styles.backLink}>Back to Grid</Link>
                <div className={styles.kicker}>Owner Profile</div>
                <h1>{displayAddress}</h1>
                <a
                    href={getExplorerUrl("address", address)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.address}
                >
                    {address}
                </a>
                <div className={styles.stats}>
                    <div>
                        <span>{isLoading ? "..." : ownedBlocks.length.toLocaleString()}</span>
                        <small>Owned</small>
                    </div>
                    <div>
                        <span>{isLoading ? "..." : listedBlocks.length.toLocaleString()}</span>
                        <small>Listed</small>
                    </div>
                    <div>
                        <span>{isLoading ? "..." : listedValue.toFixed(3)}</span>
                        <small>Listed SOL</small>
                    </div>
                </div>
            </section>

            <section className={styles.content} aria-label="Owner blocks">
                {isLoading ? (
                    <div className={styles.emptyState}>Loading owner blocks...</div>
                ) : ownedBlocks.length === 0 ? (
                    <div className={styles.emptyState}>No blocks owned by this address yet.</div>
                ) : (
                    <div className={styles.grid}>
                        {ownedBlocks.map((block) => {
                            const safeImageUrl = toSafeExternalUrl(block.imageUrl);
                            return (
                                <Link href={`/block/${block.id}`} key={block.id} className={styles.card}>
                                    <div className={styles.thumb}>
                                        {safeImageUrl ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={safeImageUrl} alt="" />
                                        ) : (
                                            <div className={styles.placeholder} style={{ backgroundColor: BLOCK_EMPTY_COLOR }} />
                                        )}
                                    </div>
                                    <div className={styles.cardBody}>
                                        <strong>Block #{block.id}</strong>
                                        <span>{block.isForSale && block.price !== null ? `${block.price} SOL` : "Not listed"}</span>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                )}
            </section>
        </main>
    );
}
