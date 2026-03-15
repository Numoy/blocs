import { useState } from 'react';
import { BlockData } from '@/types';
import styles from './MyBlocksList.module.css';
import { toSafeExternalUrl } from '@/utils/url';
import { BLOCK_EMPTY_COLOR } from '@/utils/constants';

interface MyBlocksListProps {
    blocks: BlockData[];
    onSelectBlock: (block: BlockData) => void;
    isWalletConnected?: boolean;
    title?: string;
    onClear?: () => void;
}

export const MyBlocksList = ({
    blocks,
    onSelectBlock,
    isWalletConnected,
    title,
    onClear,
}: MyBlocksListProps) => {
    const [isOpen, setIsOpen] = useState(false);

    // External owner view with 0 blocks → hide
    if (title && blocks.length === 0) return null;

    // Not wallet-connected and not an external owner view → hide
    if (!isWalletConnected && !title) return null;

    const label = title ?? `My Blocks (${blocks.length})`;

    return (
        <div className={styles.container}>
            <div className={styles.toggleHeader}>
                <button
                    className={styles.toggleButton}
                    onClick={() => setIsOpen(!isOpen)}
                    aria-expanded={isOpen}
                >
                    {label} {isOpen ? '▼' : '▲'}
                </button>
                {onClear && (
                    <button
                        className={styles.clearButton}
                        onClick={onClear}
                        aria-label="Close"
                    >
                        ×
                    </button>
                )}
            </div>

            {isOpen && blocks.length === 0 && (
                <div className={styles.emptyState}>
                    No blocks yet. Browse the grid to find one to buy!
                </div>
            )}

            {isOpen && blocks.length > 0 && (
                <div className={styles.list}>
                    {blocks.map(block => {
                        const safeImageUrl = toSafeExternalUrl(block.imageUrl);
                        return (
                            <button
                                key={block.id}
                                className={styles.item}
                                onClick={() => onSelectBlock(block)}
                                aria-label={`Block #${block.id}${block.isForSale ? `, for sale at ${block.price} SOL` : ''}`}
                            >
                                {safeImageUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={safeImageUrl} alt="" className={styles.thumbnail} />
                                ) : (
                                    <div className={styles.placeholder} style={{ backgroundColor: BLOCK_EMPTY_COLOR }} />
                                )}
                                <div className={styles.info}>
                                    <span className={styles.id}>Block #{block.id}</span>
                                    {block.isForSale && <span className={styles.price}>{block.price} SOL</span>}
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
