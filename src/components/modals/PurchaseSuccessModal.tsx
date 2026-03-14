import { BlockData } from '@/types';
import styles from './PurchaseSuccessModal.module.css';
import { useAccessibleDialog } from './useAccessibleDialog';

interface PurchaseSuccessModalProps {
    block: BlockData | null;
    isOpen: boolean;
    onClose: () => void;
    onEdit: () => void;
}

export const PurchaseSuccessModal = ({ block, isOpen, onClose, onEdit }: PurchaseSuccessModalProps) => {
    const { dialogRef } = useAccessibleDialog({ isOpen, onClose });

    if (!isOpen || !block) return null;

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div
                ref={dialogRef}
                className={styles.modal}
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="purchase-success-title"
                tabIndex={-1}
            >
                <div className={styles.icon}>🎉</div>
                <h2 id="purchase-success-title" className={styles.title}>Block Purchased!</h2>
                <p className={styles.description}>
                    You are now the owner of <strong>Block #{block.id}</strong>.
                    You can customize it with an image, text, and optional link.
                </p>
                <div className={styles.actions}>
                    <button className={styles.editButton} onClick={onEdit} data-autofocus="true">
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
