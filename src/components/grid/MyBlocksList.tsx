import React, { useState } from 'react';
import { BlockData } from '@/types';
import styles from './MyBlocksList.module.css';
import { toSafeExternalUrl } from '@/utils/url';

interface MyBlocksListProps {
    blocks: BlockData[];
    onSelectBlock: (block: BlockData) => void;
}

export const MyBlocksList: React.FC<MyBlocksListProps> = ({ blocks, onSelectBlock }) => {
    const [isOpen, setIsOpen] = useState(false);

    if (!blocks || blocks.length === 0) return null;

    return (
        <div className={styles.container}>
            <button
                className={styles.toggleButton}
                onClick={() => setIsOpen(!isOpen)}
            >
                My Blocks ({blocks.length}) {isOpen ? '▼' : '▲'}
            </button>

            {isOpen && (
                <div className={styles.list}>
                    {blocks.map(block => {
                        const safeImageUrl = toSafeExternalUrl(block.imageUrl);
                        return (
                        <div
                            key={block.id}
                            className={styles.item}
                            onClick={() => {
                                onSelectBlock(block);
                                // Optional: setIsOpen(false); // Keep open for multi-manage?
                            }}
                        >
                            {safeImageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={safeImageUrl} alt="" className={styles.thumbnail} />
                            ) : (
                                <div className={styles.placeholder} style={{ backgroundColor: block.color || '#333' }} />
                            )}
                            <div className={styles.info}>
                                <span className={styles.id}>Block #{block.id}</span>
                                {block.isForSale && <span className={styles.price}>{block.price} SOL</span>}
                            </div>
                        </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
