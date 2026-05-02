"use client";

import { getMosaicTileUrl, type MosaicImageMetadata } from "@/utils/mosaicImage";
import styles from "./MosaicPreview.module.css";

type MosaicPreviewProps = {
    alt: string;
    metadata: MosaicImageMetadata;
    variant?: "compact" | "hover" | "large";
};

export const MosaicPreview = ({ alt, metadata, variant = "compact" }: MosaicPreviewProps) => {
    return (
        <div
            className={`${styles.preview} ${variant === "large" ? styles.large : ""} ${variant === "hover" ? styles.hover : ""}`}
            style={{
                gridTemplateColumns: `repeat(${metadata.width}, 1fr)`,
                aspectRatio: `${metadata.width} / ${metadata.height}`,
            }}
            role="img"
            aria-label={alt}
        >
            {Array.from({ length: metadata.width * metadata.height }, (_, index) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    key={index}
                    src={getMosaicTileUrl(metadata, index)}
                    alt=""
                    draggable={false}
                    className={index === metadata.index ? styles.currentTile : undefined}
                />
            ))}
        </div>
    );
};
