"use client";

import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useProgram } from '@/context/ProgramContext';
import { toast } from 'sonner';
import { buildUploadAuthMessage } from '@/utils/uploadAuth';
import { toSafeExternalUrl } from '@/utils/url';
import { fitsUtf8Bytes } from '@/utils/text';
import { parseSolToLamports } from '@/utils/sol';
import { toErrorCategory, trackPlausibleEvent } from '@/utils/analytics';
import { BlockData } from '@/types';
import { SidebarInput } from './SidebarInput';
import styles from './Sidebar.module.css';
import {
    BLOCK_IMAGE_URL_MAX_BYTES,
    BLOCK_LINK_URL_MAX_BYTES,
    BLOCK_TEXT_MAX_BYTES,
} from '@/utils/constants';

type UploadApiErrorPayload = {
    error?: string;
    code?: string;
    status?: number | null;
    url?: string;
};

interface SidebarEditProps {
    block: BlockData;
    onEditToggle: () => void;
}

export const SidebarEdit = ({ block, onEditToggle }: SidebarEditProps) => {
    const { publicKey, signMessage } = useWallet();
    const { updateBlock, sellBlock } = useProgram();

    const [isUploading, setIsUploading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Form State mapped to unified state
    const [form, setForm] = useState({
        text: block.text || "",
        imageUrl: block.imageUrl || "",
        url: block.url || "",
        price: block.price ? block.price.toString() : "",
    });

    // Validation State
    const [validation, setValidation] = useState({
        imageUrlValid: true,
        urlValid: true,
    });

    const isOwner = publicKey && block && block.owner === publicKey.toBase58();

    // Debounced Validation for URLs
    useEffect(() => {
        const timer = setTimeout(() => {
            setValidation({
                imageUrlValid: form.imageUrl.trim() === "" || Boolean(toSafeExternalUrl(form.imageUrl)),
                urlValid: form.url.trim() === "" || Boolean(toSafeExternalUrl(form.url)),
            });
        }, 500);
        return () => clearTimeout(timer);
    }, [form.imageUrl, form.url]);

    const handleChange = (field: keyof typeof form, value: string) => {
        setForm(prev => ({ ...prev, [field]: value }));
    };

    const mapUploadErrorMessage = (payload: UploadApiErrorPayload | null, statusCode: number): string => {
        if (payload?.code === "UPLOAD_URL_NOT_PUBLIC") {
            return "Image uploaded, but it is not publicly reachable. Check your object-storage public read policy.";
        }
        if (statusCode === 502) {
            return "Upload storage is reachable, but the final image URL could not be verified.";
        }
        if (statusCode >= 500) {
            return "Upload service is temporarily unavailable. Please retry.";
        }
        return payload?.error || "Upload failed";
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
                    const errorData = await response.json() as UploadApiErrorPayload;
                    errorMessage = mapUploadErrorMessage(errorData, response.status);
                } catch {
                    errorMessage = response.status >= 500
                        ? "Upload service is temporarily unavailable. Please retry."
                        : errorMessage;
                }
                throw new Error(errorMessage);
            }

            const data = await response.json();
            if (data.url) {
                handleChange("imageUrl", data.url);
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
            e.target.value = '';
        }
    };

    const handleSave = async () => {
        const safeUrlForSave = form.url.trim() ? toSafeExternalUrl(form.url) : "";
        if (form.url.trim() && !safeUrlForSave) {
            toast.error("Invalid URL. Only http(s) links are allowed.");
            return;
        }

        const safeImageUrlForSave = form.imageUrl.trim() ? toSafeExternalUrl(form.imageUrl) : "";
        if (form.imageUrl.trim() && !safeImageUrlForSave) {
            toast.error("Invalid image URL. Only http(s) links are allowed.");
            return;
        }

        if (!fitsUtf8Bytes(form.text, BLOCK_TEXT_MAX_BYTES)) {
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
            targetPriceLamports = parseSolToLamports(form.price);
        } catch (error) {
            toast.error((error as Error).message || "Invalid SOL amount format.");
            return;
        }

        const currentPriceLamports = BigInt(Math.round((block.price || 0) * 1_000_000_000));
        const currentText = block.text || "";
        const currentImageUrl = toSafeExternalUrl(block.imageUrl) || "";
        const currentUrl = toSafeExternalUrl(block.url) || "";

        const needsContentUpdate =
            form.text !== currentText ||
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
            onEditToggle();
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

        setIsSaving(true);
        try {
            if (needsContentUpdate) {
                await updateBlock(block.id, form.text, safeImageUrlForSave || "", safeUrlForSave || "");
                contentUpdated = true;
            }
            if (needsPriceUpdate) {
                await sellBlock(block.id, form.price);
                priceUpdated = true;
            }
            trackPlausibleEvent("save_block_succeeded", {
                block_id: block.id,
                updated_content: contentUpdated,
                updated_sale: priceUpdated,
            });
            onEditToggle();
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
        } finally {
            setIsSaving(false);
        }
    };

    const safeEditingImageUrl = toSafeExternalUrl(form.imageUrl);

    return (
        <>
            <SidebarInput
                label="Message"
                value={form.text}
                onChange={(v) => handleChange("text", v)}
                maxBytes={BLOCK_TEXT_MAX_BYTES}
            />

            <div className={styles.section}>
                <div className={styles.uploadHeader}>
                    <span className={styles.label} style={{ marginBottom: 0 }}>Image</span>
                    <div title="Supported formats: PNG, JPG, GIF, WEBP" className={styles.infoIcon}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="16" x2="12" y2="12"></line>
                            <line x1="12" y1="8" x2="12.01" y2="8"></line>
                        </svg>
                    </div>
                </div>

                {form.imageUrl ? (
                    <div className={styles.imagePreviewWrap}>
                        {safeEditingImageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={safeEditingImageUrl}
                                alt="Preview"
                                className={styles.imagePreview}
                            />
                        ) : (
                            <div className={styles.invalidText}>
                                {form.imageUrl.trim() ? "Invalid image URL format." : "Failed to load image."}
                            </div>
                        )}
                        <button
                            className={`${styles.button} uiButton uiButtonGhost`}
                            onClick={() => handleChange("imageUrl", "")}
                            disabled={isSaving}
                        >
                            Remove Image
                        </button>
                    </div>
                ) : (
                    <div className={styles.uploadArea}>
                        <label className={`${styles.uploadLabel} uiButton uiButtonSecondary ${isUploading || isSaving ? styles.disabled : ''}`}>
                            {isUploading ? "Uploading..." : "Upload Image"}
                            <input
                                type="file"
                                accept="image/png,image/jpeg,image/gif,image/webp"
                                className={styles.uploadInput}
                                disabled={isUploading || isSaving}
                                onChange={handleFileUpload}
                            />
                        </label>
                    </div>
                )}
            </div>

            <SidebarInput
                label="Link URL"
                value={form.url}
                onChange={(v) => handleChange("url", v)}
                maxBytes={BLOCK_LINK_URL_MAX_BYTES}
                isInvalid={!validation.urlValid}
                invalidText="Invalid URL. Must be http(s)."
            />

            <SidebarInput
                label="Price (SOL)"
                type="number"
                value={form.price}
                onChange={(v) => handleChange("price", v)}
                placeholder="Leave empty to stop selling"
                helperText="Leave empty to delist"
                min="0"
                step="0.000000001"
            />

            <div className={styles.splitActions}>
                <button
                    className={`${styles.button} uiButton uiButtonPrimary`}
                    onClick={handleSave}
                    disabled={isSaving || isUploading || !validation.urlValid || !validation.imageUrlValid}
                >
                    {isSaving ? "Saving..." : "Save Changes"}
                </button>
                <button
                    className={`${styles.button} uiButton uiButtonGhost`}
                    onClick={onEditToggle}
                    disabled={isSaving}
                >
                    Cancel
                </button>
            </div>
        </>
    );
};
