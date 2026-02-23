"use client";

import { useState, useCallback, useEffect } from 'react';
import { BlockData } from '@/types';
import styles from './Sidebar.module.css';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { useProgram } from '@/context/ProgramContext';
import { SidebarInput } from './SidebarInput';
import { toast } from 'sonner';
import { buildUploadAuthMessage } from '@/utils/uploadAuth';
import { toSafeExternalUrl } from '@/utils/url';
import { fitsUtf8Bytes } from '@/utils/text';
import { parseSolToLamports } from '@/utils/sol';
import { toErrorCategory, trackPlausibleEvent } from '@/utils/analytics';
import {
    BLOCK_ACCOUNT_SIZE_BYTES,
    BLOCK_IMAGE_URL_MAX_BYTES,
    BLOCK_LINK_URL_MAX_BYTES,
    BLOCK_TEXT_MAX_BYTES
} from '@/utils/constants';

interface SidebarProps {
    block: BlockData | null;
    onClose: () => void;
    onBuy: (block: BlockData) => void;
    initialMode?: 'view' | 'edit';
}

export const Sidebar = ({ block, onClose, onBuy, initialMode = 'view' }: SidebarProps) => {
    const { connection } = useConnection();
    const { publicKey, signMessage } = useWallet();
    const { updateBlock, sellBlock, openWalletModal } = useProgram();
    const [isEditing, setIsEditing] = useState(initialMode === 'edit');
    const [isBuying, setIsBuying] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [rentFee, setRentFee] = useState<number | null>(null);

    useEffect(() => {
        const fetchRent = async () => {
            try {
                const rent = await connection.getMinimumBalanceForRentExemption(BLOCK_ACCOUNT_SIZE_BYTES);
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
    const safeBlockUrl = toSafeExternalUrl(block?.url);
    const safeBlockImageUrl = toSafeExternalUrl(block?.imageUrl);
    const safeEditingImageUrl = toSafeExternalUrl(imageUrl);

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

        if (!block || !isOwner || !publicKey) {
            trackPlausibleEvent("upload_image_blocked", {
                block_id: block?.id,
                reason: "not_owner_or_wallet_missing",
            });
            toast.error("You can only upload images to blocks you own.");
            return;
        }

        if (!signMessage) {
            trackPlausibleEvent("upload_image_blocked", {
                block_id: block.id,
                reason: "wallet_no_sign_message",
            });
            toast.error("Your wallet does not support message signing.");
            return;
        }

        if (file.size > 5 * 1024 * 1024) { // 5MB limit
            trackPlausibleEvent("upload_image_blocked", {
                block_id: block.id,
                reason: "file_too_large",
                file_size_kb: Math.round(file.size / 1024),
            });
            toast.error("File size too large (max 5MB)");
            return;
        }

        trackPlausibleEvent("upload_image_started", {
            block_id: block.id,
            file_type: file.type || "unknown",
            file_size_kb: Math.round(file.size / 1024),
        });
        setIsUploading(true);
        const formData = new FormData();
        formData.append("file", file);

        try {
            const owner = publicKey.toBase58();
            const timestamp = Date.now();
            const authMessage = buildUploadAuthMessage({
                blockId: block.id,
                owner,
                timestamp,
            });
            const signatureBytes = await signMessage(new TextEncoder().encode(authMessage));
            const signature = btoa(String.fromCharCode(...signatureBytes));

            formData.append("owner", owner);
            formData.append("blockId", String(block.id));
            formData.append("timestamp", String(timestamp));
            formData.append("signature", signature);

            const response = await fetch("/api/upload", {
                method: "POST",
                body: formData,
            });

            if (!response.ok) {
                let errorMessage = "Upload failed";
                try {
                    const errorData = await response.json();
                    errorMessage = errorData.error || errorMessage;
                } catch {
                    // Keep generic upload error fallback when server response is not JSON.
                }
                throw new Error(errorMessage);
            }

            const data = await response.json();
            if (data.url) {
                setImageUrl(data.url);
                trackPlausibleEvent("upload_image_succeeded", {
                    block_id: block.id,
                    file_type: file.type || "unknown",
                    file_size_kb: Math.round(file.size / 1024),
                });
                toast.success("Image uploaded!");
            }
        } catch (error) {
            console.error(error);
            trackPlausibleEvent("upload_image_failed", {
                block_id: block.id,
                file_type: file.type || "unknown",
                file_size_kb: Math.round(file.size / 1024),
                error_category: toErrorCategory(error),
            });
            toast.error("Upload failed: " + ((error as Error).message));
        } finally {
            setIsUploading(false);
            // Reset input value to allow re-uploading same file if needed
            e.target.value = '';
        }
    };

    const handleSave = async () => {
        const safeUrlForSave = url.trim() ? toSafeExternalUrl(url) : "";
        if (url.trim() && !safeUrlForSave) {
            toast.error("Invalid URL. Only http(s) links are allowed.");
            return;
        }

        const safeImageUrlForSave = imageUrl.trim() ? toSafeExternalUrl(imageUrl) : "";
        if (imageUrl.trim() && !safeImageUrlForSave) {
            toast.error("Invalid image URL. Only http(s) links are allowed.");
            return;
        }

        if (!fitsUtf8Bytes(text, BLOCK_TEXT_MAX_BYTES)) {
            toast.error(`Message is too long (max ${BLOCK_TEXT_MAX_BYTES} UTF-8 bytes).`);
            return;
        }

        if (!fitsUtf8Bytes(safeImageUrlForSave || "", BLOCK_IMAGE_URL_MAX_BYTES)) {
            toast.error(`Image URL is too long (max ${BLOCK_IMAGE_URL_MAX_BYTES} UTF-8 bytes).`);
            return;
        }

        if (!fitsUtf8Bytes(safeUrlForSave || "", BLOCK_LINK_URL_MAX_BYTES)) {
            toast.error(`Link URL is too long (max ${BLOCK_LINK_URL_MAX_BYTES} UTF-8 bytes).`);
            return;
        }

        let targetPriceLamports: bigint;
        try {
            targetPriceLamports = parseSolToLamports(price);
        } catch (error) {
            toast.error((error as Error).message || "Invalid SOL amount format.");
            return;
        }

        const currentPriceLamports = BigInt(Math.round((block.price || 0) * 1_000_000_000));
        const currentText = block.text || "";
        const currentImageUrl = toSafeExternalUrl(block.imageUrl) || "";
        const currentUrl = toSafeExternalUrl(block.url) || "";

        const needsContentUpdate =
            text !== currentText ||
            (safeImageUrlForSave || "") !== currentImageUrl ||
            (safeUrlForSave || "") !== currentUrl;

        const needsPriceUpdate =
            targetPriceLamports !== currentPriceLamports ||
            (targetPriceLamports > BigInt(0)) !== Boolean(block.isForSale);

        if (!needsContentUpdate && !needsPriceUpdate) {
            trackPlausibleEvent("save_block_skipped", {
                block_id: block.id,
                reason: "no_changes",
            });
            toast.info("No changes to save.");
            setIsEditing(false);
            return;
        }

        trackPlausibleEvent("save_block_started", {
            block_id: block.id,
            updates_content: needsContentUpdate,
            updates_sale: needsPriceUpdate,
            target_for_sale: targetPriceLamports > BigInt(0),
        });
        let contentUpdated = false;
        let priceUpdated = false;

        try {
            if (needsContentUpdate) {
                await updateBlock(block.id, text, safeImageUrlForSave || "", safeUrlForSave || "");
                contentUpdated = true;
            }
            if (needsPriceUpdate) {
                await sellBlock(block.id, price);
                priceUpdated = true;
            }
            trackPlausibleEvent("save_block_succeeded", {
                block_id: block.id,
                updated_content: contentUpdated,
                updated_sale: priceUpdated,
            });
            setIsEditing(false);
        } catch (error) {
            trackPlausibleEvent("save_block_failed", {
                block_id: block.id,
                updated_content: contentUpdated,
                updated_sale: priceUpdated,
                error_category: toErrorCategory(error),
            });
            if (contentUpdated || priceUpdated) {
                const savedParts = [
                    contentUpdated ? "content" : null,
                    priceUpdated ? "sale settings" : null,
                ].filter(Boolean).join(" and ");
                const pendingParts = [
                    !contentUpdated && needsContentUpdate ? "content" : null,
                    !priceUpdated && needsPriceUpdate ? "sale settings" : null,
                ].filter(Boolean).join(" and ");

                toast.error(`Saved ${savedParts}, but failed to update ${pendingParts}. Please retry.`);
                return;
            }
            return;
        }
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
                        {safeBlockImageUrl && (
                            <div className={styles.section}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={safeBlockImageUrl}
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
                                {safeBlockUrl ? (
                                    <a href={safeBlockUrl} target="_blank" rel="noopener noreferrer" className={styles.link}>
                                        {block.url}
                                    </a>
                                ) : (
                                    <div className={styles.value}>{block.url}</div>
                                )}
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
                                        trackPlausibleEvent("buy_cta_clicked", {
                                            block_id: block.id,
                                            ui_source: "sidebar",
                                            wallet_connected: Boolean(publicKey),
                                            price_sol: block.price || 0,
                                        });
                                        if (!publicKey) {
                                            openWalletModal("sidebar_buy");
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
                                navigator.clipboard.writeText(url);
                                trackPlausibleEvent("share_block_link_clicked", {
                                    block_id: block.id,
                                    ui_source: "sidebar",
                                });
                                toast.success("Link copied to clipboard!");
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
                                <div title="Supported formats: PNG, JPG, GIF, WEBP" style={{ cursor: 'help', display: 'flex', alignItems: 'center', opacity: 0.7 }}>
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
                                        {safeEditingImageUrl ? (
                                            <>
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img
                                                    src={safeEditingImageUrl}
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
                                            </>
                                        ) : (
                                            <div className={styles.value}>Invalid image URL format.</div>
                                        )}
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
                                            accept="image/png,image/jpeg,image/gif,image/webp"
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
                                min="0"
                                step="0.000000001"
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
