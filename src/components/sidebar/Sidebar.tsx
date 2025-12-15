"use client";

import { useState, useCallback, useEffect } from 'react';
import { BlockData } from '@/types';
import styles from './Sidebar.module.css';
import { useWallet } from '@solana/wallet-adapter-react';
import { useProgram } from '@/context/ProgramContext';
import { SidebarInput } from './SidebarInput';

interface SidebarProps {
    block: BlockData | null;
    onClose: () => void;
    onBuy: (block: BlockData) => void;
    initialMode?: 'view' | 'edit';
}

export const Sidebar = ({ block, onClose, onBuy, initialMode = 'view' }: SidebarProps) => {
    const { publicKey } = useWallet();
    const { updateBlock, sellBlock } = useProgram();
    const [isEditing, setIsEditing] = useState(initialMode === 'edit');
    const [isBuying, setIsBuying] = useState(false);

    // Form State
    const [text, setText] = useState("");
    const [imageUrl, setImageUrl] = useState("");
    const [url, setUrl] = useState("");
    const [price, setPrice] = useState("");

    // Initialize form when block changes or editing starts
    const initForm = useCallback(() => {
        if (block) {
            setText(block.text || "");
            setImageUrl(block.imageUrl || "");
            setUrl(block.url || "");
            setPrice(block.price ? block.price.toString() : "");
        }
    }, [block]);

    // Effect to handle mode switching
    // Effect to handle mode switching
    useEffect(() => {
        if (initialMode === 'edit') {
            setIsEditing(true);
            initForm();
        } else {
            setIsEditing(false);
        }
    }, [initialMode, initForm]);

    if (!block) return null;

    const isOwner = publicKey && block.owner === publicKey.toBase58();

    const handleEditToggle = () => {
        if (!isEditing) {
            initForm();
        }
        setIsEditing(!isEditing);
    };

    const handleSave = async () => {
        await updateBlock(block.id, text, imageUrl, url);
        const priceValue = price === "" ? 0 : parseFloat(price);
        // Always call sellBlock to update price or delist (0)
        await sellBlock(block.id, priceValue);
        setIsEditing(false);
    };

    return (
        <>
            <div className={styles.overlay} onClick={onClose} />
            <div className={styles.sidebar}>
                <button className={styles.closeButton} onClick={onClose} aria-label="Close sidebar">×</button>

                <h2 className={styles.title}>Block #{block.id}</h2>

                {!isEditing ? (
                    <>
                        {/* View Mode */}
                        {block.imageUrl && (
                            <div className={styles.section}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={block.imageUrl}
                                    alt={`Block ${block.id} `}
                                    style={{ width: '100%', borderRadius: '8px' }}
                                />
                            </div>
                        )}

                        <div className={styles.section}>
                            <span className={styles.label}>Owner</span>
                            <div className={styles.value}>
                                {block.owner ? (block.owner === publicKey?.toBase58() ? "You" : block.owner) : "Available"}
                            </div>
                        </div>

                        {block.text && (
                            <div className={styles.section}>
                                <span className={styles.label}>Message</span>
                                <div className={styles.value}>{block.text}</div>
                            </div>
                        )}

                        {block.url && (
                            <div className={styles.section}>
                                <span className={styles.label}>Link</span>
                                <a href={block.url} target="_blank" rel="noopener noreferrer" className={styles.link}>
                                    {block.url}
                                </a>
                            </div>
                        )}

                        {/* Debug visibility removed */}
                        {block.isForSale && (block.price !== null) && !isOwner && (
                            <div className={styles.section}>
                                <span className={styles.label}>Price</span>
                                <div className={styles.value} style={{ fontSize: '1.5rem', color: 'var(--accent-secondary)' }}>
                                    {block.price} SOL
                                </div>
                                <button
                                    className={`${styles.button} ${styles.buyButton} `}
                                    onClick={async () => {
                                        setIsBuying(true);
                                        try {
                                            await onBuy(block);
                                        } finally {
                                            setIsBuying(false);
                                        }
                                    }}
                                    style={{
                                        opacity: isBuying ? 0.7 : 1,
                                        pointerEvents: isBuying ? 'none' : 'auto'
                                    }}
                                >
                                    {isBuying ? "Processing..." : "Buy Block"}
                                </button>
                                {isBuying && (
                                    <p style={{ color: '#aaa', fontSize: '0.8rem', marginTop: '8px', textAlign: 'center' }}>
                                        Please confirm the transaction in your wallet.
                                    </p>
                                )}
                            </div>
                        )}

                        {isOwner && (
                            <button className={styles.button} style={{ background: '#333', color: '#fff' }} onClick={handleEditToggle}>
                                Edit Block
                            </button>
                        )}
                    </>
                ) : (
                    <>
                        {/* Edit Mode */}
                        <SidebarInput
                            label="Message"
                            value={text}
                            onChange={setText}
                            maxLength={64}
                        />

                        <SidebarInput
                            label="Image URL"
                            value={imageUrl}
                            onChange={setImageUrl}
                        />

                        <SidebarInput
                            label="Link URL"
                            value={url}
                            onChange={setUrl}
                        />

                        <div className={styles.section}>
                            <span className={styles.label}>Price (SOL) - Leave empty to stop selling</span>
                            <input
                                className={styles.input}
                                type="number"
                                value={price}
                                onChange={(e) => setPrice(e.target.value)}
                            />
                        </div>

                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button className={styles.button} style={{ background: 'var(--accent-secondary)', color: '#000' }} onClick={handleSave}>
                                Save Changes
                            </button>
                            <button className={styles.button} style={{ background: 'transparent', border: '1px solid #333', color: '#fff' }} onClick={handleEditToggle}>
                                Cancel
                            </button>
                        </div>
                    </>
                )}
            </div>
        </>
    );
};
