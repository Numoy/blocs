import React from 'react';
import { BlockData } from '@/types';
import styles from './PurchaseSuccessModal.module.css';

interface PurchaseSuccessModalProps {
    block: BlockData | null;
    isOpen: boolean;
    onClose: () => void;
    onEdit: () => void;
}

export const PurchaseSuccessModal: React.FC<PurchaseSuccessModalProps> = ({ block, isOpen, onClose, onEdit }) => {
    if (!isOpen || !block) return null;

    return (
        <div className={styles.overlay}>
            <div className={styles.modal}>
                <div className={styles.icon}>🎉</div>
                <h2 className={styles.title}>Block Purchased!</h2>
                <p className={styles.description}>
                    You are now the owner of <strong>Block #{block.id}</strong>.
                    You can customize it with an image, text, and optional link.
                </p>
                <div className={styles.actions}>
                    <button className={styles.editButton} onClick={onEdit}>
                        Edit Block
                    </button>
                    <button className={styles.closeButton} onClick={onClose}>
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};
