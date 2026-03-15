"use client";

import { memo } from 'react';
import styles from './Grid.module.css';
import { BlockData } from '@/types';
import { toSafeExternalUrl } from '@/utils/url';

interface BlockProps {
    data: BlockData;
    onClick: (e: React.MouseEvent) => void;
    onMouseEnter: (data: BlockData, event: React.MouseEvent) => void;
    onMouseLeave: () => void;
}

export const Block = memo(({ data, onClick, onMouseEnter, onMouseLeave }: BlockProps) => {
    const safeImageUrl = toSafeExternalUrl(data.imageUrl);

    return (
        <div
            className={`${styles.block} ${data.owner ? styles.owned : ''}`}
            // Remove title as we will use a custom hover card
            // title={`Block #${data.id} ${data.owner ? `(Owned by ${data.owner})` : ''}`} 
            onClick={onClick}
            onMouseEnter={(e) => onMouseEnter(data, e)}
            onMouseLeave={onMouseLeave}
            style={{
                backgroundColor: safeImageUrl ? 'transparent' : undefined,
                backgroundImage: safeImageUrl ? `url(${safeImageUrl})` : undefined,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
            }}
        />
    );
});

Block.displayName = 'Block';
