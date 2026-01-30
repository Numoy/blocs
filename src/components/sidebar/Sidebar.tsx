"use client";

import { useState, useCallback, useEffect } from 'react';
import { BlockData } from '@/types';
import styles from './Sidebar.module.css';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { useProgram } from '@/context/ProgramContext';
import { SidebarInput } from './SidebarInput';
import { toast } from 'sonner';

interface SidebarProps {
    block: BlockData | null;
    onClose: () => void;
    onBuy: (block: BlockData) => void;
    initialMode?: 'view' | 'edit';
}

export const Sidebar = ({ block, onClose, onBuy, initialMode = 'view' }: SidebarProps) => {
    const { connection } = useConnection();
    const { publicKey } = useWallet();
    const { updateBlock, sellBlock, openWalletModal } = useProgram();
    const [isEditing, setIsEditing] = useState(initialMode === 'edit');
    const [isBuying, setIsBuying] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [rentFee, setRentFee] = useState<number | null>(null);

    useEffect(() => {
        const fetchRent = async () => {
            try {
                // 376 bytes is the Block account size
                const rent = await connection.getMinimumBalanceForRentExemption(376);
                setRentFee(rent / 1e9); // Convert lamports to SOL
            } catch (e) {
                console.error("Failed to fetch rent", e);
            }
        };
        fetchRent();
    }, [connection]);

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

    const isOwner = publicKey && block && block.owner === publicKey.toBase58();

    // Effect to handle mode switching
    useEffect(() => {
        // Enforce ownership: You cannot edit if you don't own it.
        // This covers cases where 'initialMode' might be stale or set erroneously.
        if (initialMode === 'edit' && isOwner) {
            setIsEditing(true);
            initForm();
        } else {
            setIsEditing(false);
        }
    }, [initialMode, initForm, isOwner]);

    if (!block) return null;

    const handleEditToggle = () => {
        if (!isEditing) {
            initForm();
        }
        setIsEditing(!isEditing);
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) { // 5MB limit
            toast.error("File size too large (max 5MB)");
            return;
        }

        setIsUploading(true);
        const formData = new FormData();
        formData.append("file", file);

        try {
            const response = await fetch("/api/upload", {
                method: "POST",
                body: formData,
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || "Upload failed");
            }

            const data = await response.json();
            if (data.url) {
                setImageUrl(data.url);
                toast.success("Image uploaded!");
            }
        } catch (error) {
            console.error(error);
            toast.error("Upload failed: " + ((error as Error).message));
        } finally {
            setIsUploading(false);
            // Reset input value to allow re-uploading same file if needed
            e.target.value = '';
        }
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
            <div className={styles.overlay} onClick={onClose} aria-hidden="true" />
            <div className={styles.sidebar} role="dialog" aria-modal="true" aria-labelledby="sidebar-title">
                <button className={styles.closeButton} onClick={onClose} aria-label="Close sidebar">×</button>

                <h2 id="sidebar-title" className={styles.title}>Block #{block.id}</h2>

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

                        {block.isForSale && (block.price !== null) && !isOwner && (
                            <div className={styles.section}>
                                <span className={styles.label}>Price</span>
                                {(!block.owner && rentFee) ? (
                                    <div style={{ marginBottom: '12px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: '#ccc' }}>
                                            <span>Block Price:</span>
                                            <span>{block.price} SOL</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: '#ccc' }}>
                                            <span>Network Fee (Rent):</span>
                                            <span>~{rentFee.toFixed(4)} SOL</span>
                                        </div>
                                        <div style={{ borderTop: '1px solid #333', marginTop: '4px', paddingTop: '4px', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', color: 'var(--accent-secondary)' }}>
                                            <span>Total:</span>
                                            <span>~{((block.price || 0) + rentFee).toFixed(4)} SOL</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className={styles.value} style={{ fontSize: '1.5rem', color: 'var(--accent-secondary)' }}>
                                        {block.price} SOL
                                    </div>
                                )}

                                <button
                                    className={`${styles.button} ${styles.buyButton} `}
                                    onClick={async () => {
                                        if (!publicKey) {
                                            openWalletModal();
                                            return;
                                        }
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
                            <button className={styles.button} style={{ background: '#333', color: '#fff', marginBottom: '8px' }} onClick={handleEditToggle}>
                                Edit Block
                            </button>
                        )}

                        <button
                            className={styles.button}
                            style={{ background: 'transparent', border: '1px solid #333', color: '#fff' }}
                            onClick={() => {
                                const url = `${window.location.origin}/block/${block.id}`;
                                if (navigator.share) {
                                    navigator.share({
                                        title: `Block #${block.id}`,
                                        text: `Check out Block #${block.id} on 10000-blocks.com`,
                                        url: url
                                    }).catch(console.error);
                                } else {
                                    navigator.clipboard.writeText(url);
                                    toast.success("Link copied to clipboard!");
                                }
                            }}
                        >
                            Share Block
                        </button>
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

                        {/* Image Management */}
                        <div className={styles.section}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                                <span className={styles.label} style={{ marginBottom: 0 }}>Image</span>
                                <div title="Supported formats: PNG, JPG, GIF, WEBP, SVG" style={{ cursor: 'help', display: 'flex', alignItems: 'center', opacity: 0.7 }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="12" cy="12" r="10"></circle>
                                        <line x1="12" y1="16" x2="12" y2="12"></line>
                                        <line x1="12" y1="8" x2="12.01" y2="8"></line>
                                    </svg>
                                </div>
                            </div>

                            {imageUrl ? (
                                <div style={{ marginBottom: '10px' }}>
                                    {/* Preview */}
                                    <div style={{ position: 'relative', width: '100%', marginBottom: '10px' }}>
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={imageUrl}
                                            alt="Preview"
                                            style={{
                                                width: '100%',
                                                borderRadius: '8px',
                                                maxHeight: '200px',
                                                objectFit: 'contain',
                                                background: '#333',
                                                border: '1px solid #444'
                                            }}
                                        />
                                    </div>

                                    <button
                                        className={styles.button}
                                        style={{ background: '#ff4444', color: '#fff', width: '100%' }}
                                        onClick={() => setImageUrl("")}
                                    >
                                        Remove Image
                                    </button>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexDirection: 'column', width: '100%' }}>
                                    <label
                                        className={styles.button}
                                        style={{
                                            background: 'rgba(255,255,255,0.1)',
                                            border: '1px solid rgba(255,255,255,0.1)',
                                            color: '#fff',
                                            cursor: 'pointer',
                                            display: 'block',
                                            textAlign: 'center',
                                            padding: '8px 16px',
                                            fontSize: '0.9rem',
                                            marginBottom: 0,
                                            width: '100%'
                                        }}
                                    >
                                        {isUploading ? "Uploading..." : "Upload New Image"}
                                        <input
                                            type="file"
                                            accept="image/*"
                                            style={{ display: 'none' }}
                                            disabled={isUploading}
                                            onChange={handleFileUpload}
                                        />
                                    </label>
                                    {isUploading && <span style={{ fontSize: '0.8rem', color: '#888' }}>Uploading...</span>}
                                </div>
                            )}
                        </div>

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
