"use client";

import { memo } from 'react';
import styles from './Grid.module.css';
import { BlockData } from '@/types';

interface BlockProps {
    data: BlockData;
    onClick: (e: React.MouseEvent) => void;
    onMouseEnter: (data: BlockData, event: React.MouseEvent) => void;
    onMouseLeave: () => void;
}

export const Block = memo(({ data, onClick, onMouseEnter, onMouseLeave }: BlockProps) => {
    return (
        <div
            className={`${styles.block} ${data.owner ? styles.owned : ''}`}
            // Remove title as we will use a custom hover card
            // title={`Block #${data.id} ${data.owner ? `(Owned by ${data.owner})` : ''}`} 
            onClick={onClick}
            onMouseEnter={(e) => onMouseEnter(data, e)}
            onMouseLeave={onMouseLeave}
            style={{
                backgroundColor: data.imageUrl ? 'transparent' : (data.color || undefined),
                backgroundImage: data.imageUrl ? `url(${data.imageUrl})` : undefined,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
            }}
        />
    );
});

Block.displayName = 'Block';
