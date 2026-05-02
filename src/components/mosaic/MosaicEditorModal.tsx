"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useWallet } from "@solana/wallet-adapter-react";
import { useProgram } from "@/context/ProgramContext";
import type { BatchBlockUpdate } from "@/context/program/shared";
import type { MosaicSelection } from "@/utils/mosaic";
import { buildMosaicUploadAuthMessage } from "@/utils/uploadAuth";
import { toSafeExternalUrl } from "@/utils/url";
import { useAccessibleDialog } from "@/components/modals/useAccessibleDialog";
import styles from "./MosaicEditorModal.module.css";

type MosaicEditorModalProps = {
    isOpen: boolean;
    onClose: () => void;
    selection: MosaicSelection | null;
};

type UploadResponse = {
    error?: string;
    slices?: Array<{ blockId: number; url: string }>;
};

export const MosaicEditorModal = ({ isOpen, onClose, selection }: MosaicEditorModalProps) => {
    const { publicKey, signMessage } = useWallet();
    const { updateBlocks } = useProgram();
    const [file, setFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState("");
    const previewUrlRef = useRef("");
    const [linkUrl, setLinkUrl] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [statusText, setStatusText] = useState("");
    const [progress, setProgress] = useState({ completed: 0, failed: 0, total: 0 });
    const [pendingRetryUpdates, setPendingRetryUpdates] = useState<BatchBlockUpdate[]>([]);

    useEffect(() => {
        return () => {
            if (previewUrlRef.current) {
                URL.revokeObjectURL(previewUrlRef.current);
                previewUrlRef.current = "";
            }
        };
    }, []);

    const safeLinkUrl = useMemo(() => {
        return linkUrl.trim() ? toSafeExternalUrl(linkUrl) : "";
    }, [linkUrl]);

    const resetForm = () => {
        if (previewUrlRef.current) {
            URL.revokeObjectURL(previewUrlRef.current);
            previewUrlRef.current = "";
        }
        setFile(null);
        setPreviewUrl("");
        setLinkUrl("");
        setIsSaving(false);
        setStatusText("");
        setProgress({ completed: 0, failed: 0, total: 0 });
        setPendingRetryUpdates([]);
    };

    const closeModal = () => {
        resetForm();
        onClose();
    };

    const { dialogRef } = useAccessibleDialog({ isOpen, onClose: closeModal });

    if (!isOpen || !selection) return null;

    const handleFileChange = (nextFile: File | null) => {
        if (previewUrlRef.current) {
            URL.revokeObjectURL(previewUrlRef.current);
            previewUrlRef.current = "";
        }
        setFile(nextFile);
        if (!nextFile) {
            setPreviewUrl("");
            return;
        }
        const nextPreviewUrl = URL.createObjectURL(nextFile);
        previewUrlRef.current = nextPreviewUrl;
        setPreviewUrl(nextPreviewUrl);
    };

    const canSave = Boolean(
        file &&
        publicKey &&
        signMessage &&
        !isSaving &&
        (!linkUrl.trim() || safeLinkUrl),
    );

    const uploadSlices = async (): Promise<BatchBlockUpdate[]> => {
        if (!file || !publicKey || !signMessage) {
            throw new Error("Wallet and image are required.");
        }

        const owner = publicKey.toBase58();
        const timestamp = Date.now();
        const message = buildMosaicUploadAuthMessage({
            blockIds: selection.blockIds,
            height: selection.height,
            owner,
            timestamp,
            width: selection.width,
        });
        const signatureBytes = await signMessage(new TextEncoder().encode(message));
        const signature = btoa(String.fromCharCode(...signatureBytes));
        const formData = new FormData();
        formData.append("file", file);
        formData.append("owner", owner);
        formData.append("timestamp", String(timestamp));
        formData.append("signature", signature);
        formData.append("width", String(selection.width));
        formData.append("height", String(selection.height));
        formData.append("blockIds", selection.blockIds.join(","));

        const response = await fetch("/api/upload/mosaic", {
            method: "POST",
            body: formData,
        });
        const payload = await response.json() as UploadResponse;
        if (!response.ok || !payload.slices) {
            throw new Error(payload.error || "Mosaic upload failed.");
        }

        return payload.slices.map((slice) => ({
            id: slice.blockId,
            imageUrl: slice.url,
            url: safeLinkUrl || "",
        }));
    };

    const saveUpdates = async (updates: BatchBlockUpdate[]) => {
        setProgress({ completed: 0, failed: 0, total: updates.length });
        const result = await updateBlocks(updates, {
            onProgress: (nextProgress) => {
                setProgress({
                    completed: nextProgress.completed,
                    failed: nextProgress.failed,
                    total: nextProgress.total,
                });
                setStatusText(`Saved ${nextProgress.completed} of ${nextProgress.total} blocks.`);
            },
        });

        if (result.failed.length > 0) {
            const failedIds = new Set(result.failed.map((failure) => failure.blockId));
            setPendingRetryUpdates(updates.filter((update) => failedIds.has(update.id)));
            toast.error(`Saved ${result.succeeded.length} blocks. ${result.failed.length} need retry.`);
            return;
        }

        toast.success("Mosaic saved.");
        closeModal();
    };

    const handleSave = async () => {
        setIsSaving(true);
        setPendingRetryUpdates([]);
        try {
            setStatusText("Uploading and slicing image...");
            const updates = await uploadSlices();
            setStatusText("Saving block updates...");
            await saveUpdates(updates);
        } catch (error) {
            toast.error((error as Error).message || "Mosaic save failed.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleRetry = async () => {
        if (pendingRetryUpdates.length === 0) return;
        setIsSaving(true);
        try {
            setStatusText("Retrying failed blocks...");
            await saveUpdates(pendingRetryUpdates);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className={styles.backdrop} onMouseDown={closeModal}>
            <div
                className={styles.modal}
                role="dialog"
                aria-modal="true"
                aria-labelledby="mosaic-title"
                ref={dialogRef}
                tabIndex={-1}
                onMouseDown={(event) => event.stopPropagation()}
            >
                <div className={styles.header}>
                    <div>
                        <h2 id="mosaic-title">Create Mosaic</h2>
                        <p>{selection.width} x {selection.height} blocks, {selection.blockIds.length} total</p>
                    </div>
                    <button type="button" className={styles.closeButton} onClick={closeModal} aria-label="Close mosaic editor">
                        ×
                    </button>
                </div>

                <div className={styles.body}>
                    <div className={styles.previewPanel}>
                        {previewUrl ? (
                            <div
                                className={styles.previewGrid}
                                style={{
                                    gridTemplateColumns: `repeat(${selection.width}, 1fr)`,
                                    aspectRatio: `${selection.width} / ${selection.height}`,
                                }}
                            >
                                {selection.blockIds.map((blockId, index) => {
                                    const col = index % selection.width;
                                    const row = Math.floor(index / selection.width);
                                    return (
                                        <div
                                            className={styles.previewTile}
                                            key={blockId}
                                            style={{
                                                backgroundImage: `url(${previewUrl})`,
                                                backgroundSize: `${selection.width * 100}% ${selection.height * 100}%`,
                                                backgroundPosition: `${selection.width === 1 ? 0 : (col / (selection.width - 1)) * 100}% ${selection.height === 1 ? 0 : (row / (selection.height - 1)) * 100}%`,
                                            }}
                                        >
                                            <span>#{blockId}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className={styles.emptyPreview}>Upload an image to preview the sliced mosaic.</div>
                        )}
                    </div>

                    <div className={styles.controls}>
                        <label className={styles.field}>
                            <span>Image</span>
                            <input
                                data-autofocus="true"
                                type="file"
                                accept="image/png,image/jpeg,image/gif,image/webp"
                                disabled={isSaving}
                                onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
                            />
                        </label>
                        <label className={styles.field}>
                            <span>Shared Link</span>
                            <input
                                type="url"
                                value={linkUrl}
                                placeholder="https://example.com"
                                disabled={isSaving}
                                onChange={(event) => setLinkUrl(event.target.value)}
                            />
                        </label>
                        {linkUrl.trim() && !safeLinkUrl && (
                            <p className={styles.errorText}>Only http(s) links are allowed.</p>
                        )}

                        {(statusText || progress.total > 0) && (
                            <div className={styles.progressBox}>
                                <div>{statusText || "Preparing..."}</div>
                                {progress.total > 0 && (
                                    <progress value={progress.completed + progress.failed} max={progress.total} />
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <div className={styles.footer}>
                    {pendingRetryUpdates.length > 0 && (
                        <button type="button" className="uiButton uiButtonSecondary" disabled={isSaving} onClick={handleRetry}>
                            Retry Failed
                        </button>
                    )}
                    <button type="button" className="uiButton uiButtonGhost" disabled={isSaving} onClick={closeModal}>
                        Cancel
                    </button>
                    <button type="button" className="uiButton uiButtonPrimary" disabled={!canSave} onClick={handleSave}>
                        {isSaving ? "Saving..." : "Save Mosaic"}
                    </button>
                </div>
            </div>
        </div>
    );
};
