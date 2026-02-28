"use client";

import { useProgram } from "@/context/ProgramContext";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { GRID_SIZE } from "@/utils/constants";
import { toSafeExternalUrl } from "@/utils/url";
import { useWallet } from "@solana/wallet-adapter-react";
import { toErrorCategory, trackPlausibleEvent } from "@/utils/analytics";

export default function BlockClient() {
    const params = useParams();
    const router = useRouter();
    const { blocks, isLoading, buyBlock, openWalletModal } = useProgram();
    const { publicKey } = useWallet();
    const [isBuying, setIsBuying] = useState(false);
    const lastTrackedViewBlockId = useRef<number | null>(null);

    // Parse ID from URL
    const id = typeof params.id === 'string' ? parseInt(params.id, 10) : -1;

    // Touch state for swipe
    const touchStartX = useRef<number | null>(null);

    // Navigation
    const handlePrev = () => {
        const prevId = id > 0 ? id - 1 : GRID_SIZE - 1;
        trackPlausibleEvent("block_navigation_clicked", {
            from_block_id: id,
            to_block_id: prevId,
            direction: "prev",
            ui_source: "block_detail",
        });
        router.push(`/block/${prevId}`);
    };

    const handleNext = () => {
        const nextId = id < GRID_SIZE - 1 ? id + 1 : 0;
        trackPlausibleEvent("block_navigation_clicked", {
            from_block_id: id,
            to_block_id: nextId,
            direction: "next",
            ui_source: "block_detail",
        });
        router.push(`/block/${nextId}`);
    };

    // Swipe Handlers
    const onTouchStart = (e: React.TouchEvent) => {
        touchStartX.current = e.touches[0].clientX;
    };

    const onTouchEnd = (e: React.TouchEvent) => {
        if (touchStartX.current === null) return;
        const touchEndX = e.changedTouches[0].clientX;
        const diff = touchStartX.current - touchEndX;

        if (diff > 50) handleNext();
        else if (diff < -50) handlePrev();
        touchStartX.current = null;
    };

    // Find Block Data
    const block = id >= 0 && id < blocks.length ? blocks[id] : undefined;
    const safeBlockUrl = toSafeExternalUrl(block?.url);
    const safeBlockImageUrl = toSafeExternalUrl(block?.imageUrl);

    useEffect(() => {
        if (isLoading || !block) {
            return;
        }

        if (lastTrackedViewBlockId.current === block.id) {
            return;
        }
        lastTrackedViewBlockId.current = block.id;

        trackPlausibleEvent("block_detail_viewed", {
            block_id: block.id,
            is_for_sale: block.isForSale,
            has_owner: Boolean(block.owner),
            has_text: Boolean(block.text),
            has_image: Boolean(block.imageUrl),
            has_link: Boolean(block.url),
        });
    }, [isLoading, block]);

    if (isLoading) {
        return (
            <div style={containerStyle}>
                <div className="animate-pulse">Loading Block #{id}...</div>
            </div>
        );
    }

    if (!block) {
        return (
            <div style={containerStyle}>
                <h1 style={{ fontSize: '2rem', marginBottom: '1rem', fontWeight: 'bold' }}>Block #{id} not found</h1>
                <button onClick={() => router.push('/')} style={secondaryButtonStyle}>Back to Grid</button>
            </div>
        );
    }

    return (
        <div
            className="block-detail-container"
            style={containerStyle}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
        >
            {/* Header / Nav */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                maxWidth: '500px',
                marginBottom: '24px',
                padding: '0 10px'
            }}>
                <button onClick={handlePrev} style={navButtonStyle} aria-label="Previous Block">
                    ←
                </button>
                <div style={{ textAlign: 'center' }}>
                    <h1 style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#fff' }}>Block #{id}</h1>
                    <span style={{ fontSize: '0.8rem', color: '#888' }}>{block.owner ? 'Owned' : 'Available'}</span>
                </div>
                <button onClick={handleNext} style={navButtonStyle} aria-label="Next Block">
                    →
                </button>
            </div>

            {/* Glass Card */}
            <div style={cardStyle}>

                {/* Image Container */}
                <div style={{
                    width: '100%',
                    aspectRatio: '1/1',
                    backgroundColor: safeBlockImageUrl ? 'transparent' : (block.color || '#222'),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    overflow: 'hidden',
                    borderBottom: '1px solid rgba(255,255,255,0.05)'
                }}>
                    {safeBlockImageUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                            src={safeBlockImageUrl}
                            alt={`Block ${id}`}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                    ) : (
                        <div style={{ opacity: 0.3, fontSize: '2rem', color: 'rgba(255,255,255,0.5)' }}>Empty</div>
                    )}
                </div>

                {/* Info Content */}
                <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

                    {/* Text / Message */}
                    <div>
                        <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '1px', color: '#666', marginBottom: '4px', fontWeight: '600' }}>
                            Message
                        </div>
                        <div style={{ fontSize: '1.2rem', fontWeight: '500', lineHeight: '1.4', color: block.text ? '#fff' : '#444' }}>
                            {block.text ? `"${block.text}"` : "No message set."}
                        </div>
                    </div>

                    {/* Link */}
                    {block.url && safeBlockUrl && (
                        <div>
                            <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '1px', color: '#666', marginBottom: '4px', fontWeight: '600' }}>
                                Link
                            </div>
                            <a
                                href={safeBlockUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ color: '#9945FF', textDecoration: 'none', wordBreak: 'break-all', display: 'flex', alignItems: 'center', gap: '6px' }}
                            >
                                🔗 <span style={{ textDecoration: 'underline' }}>{block.url}</span>
                            </a>
                        </div>
                    )}

                    <div style={{ height: '1px', backgroundColor: 'rgba(255,255,255,0.1)', margin: '8px 0' }} />

                    {/* Footer / Action */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ fontSize: '0.7rem', color: '#666', marginBottom: '2px' }}>Owner</div>
                            <div style={{ fontFamily: 'monospace', color: '#ccc', fontSize: '0.9rem', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px' }}>
                                {block.owner ? `${block.owner.slice(0, 4)}...${block.owner.slice(-4)}` : 'None'}
                            </div>
                        </div>

                        {block.isForSale ? (
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '0.7rem', color: '#666', marginBottom: '2px' }}>Price</div>
                                <div style={{ fontWeight: 'bold', color: '#14F195', fontSize: '1.2rem' }}>{block.price} SOL</div>
                            </div>
                        ) : (
                            <div style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', fontSize: '0.8rem', color: '#888', fontWeight: '500' }}>
                                Not For Sale
                            </div>
                        )}
                    </div>

                    {block.isForSale && (
                        <button
                            onClick={async () => {
                                trackPlausibleEvent("buy_cta_clicked", {
                                    block_id: block.id,
                                    ui_source: "block_detail",
                                    wallet_connected: Boolean(publicKey),
                                    price_sol: block.price || 0,
                                });
                                if (!publicKey) {
                                    openWalletModal("block_detail_buy");
                                    return;
                                }
                                if (isBuying) {
                                    return;
                                }
                                setIsBuying(true);
                                try {
                                    await buyBlock(block.id, block.price || 0, undefined, "block_detail");
                                } catch (error) {
                                    trackPlausibleEvent("buy_flow_failed", {
                                        block_id: block.id,
                                        ui_source: "block_detail",
                                        error_category: toErrorCategory(error),
                                    });
                                    // buyBlock already handles user-facing errors via toasts.
                                } finally {
                                    setIsBuying(false);
                                }
                            }}
                            style={primaryButtonStyle}
                            disabled={isBuying}
                        >
                            {isBuying ? "Processing..." : "Buy Now"}
                        </button>
                    )}
                </div>
            </div>

            <button
                onClick={() => {
                    trackPlausibleEvent("close_block_detail_clicked", {
                        block_id: block.id,
                        ui_source: "block_detail",
                    });
                    router.push('/');
                }}
                style={{
                    marginTop: '32px',
                    background: 'transparent',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#888',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 20px',
                    borderRadius: '30px',
                    transition: 'all 0.2s',
                }}
            >
                ✕ Close and Return to Grid
            </button>
        </div>
    );
}

// ---------------- STYLES ----------------

const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    background: 'radial-gradient(circle at center, #1a1a1a 0%, #000000 100%)',
    color: '#fff',
    padding: '80px 20px 20px 20px', // Top padding for header
};

const cardStyle: React.CSSProperties = {
    width: '100%',
    maxWidth: '420px',
    background: 'rgba(28, 28, 30, 0.6)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '24px',
    overflow: 'hidden',
    boxShadow: '0 20px 40px -10px rgba(0,0,0,0.5)',
    display: 'flex',
    flexDirection: 'column'
};

const navButtonStyle: React.CSSProperties = {
    width: '44px',
    height: '44px',
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.05)',
    color: '#fff',
    fontSize: '1.2rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'background 0.2s, transform 0.1s'
};

const primaryButtonStyle: React.CSSProperties = {
    marginTop: '8px',
    width: '100%',
    padding: '14px',
    background: 'linear-gradient(135deg, #9945FF 0%, #14F195 100%)',
    color: '#fff',
    border: 'none',
    borderRadius: '16px',
    fontWeight: 'bold',
    fontSize: '1rem',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(20, 241, 149, 0.2)',
    transition: 'transform 0.1s',
    textShadow: '0 1px 2px rgba(0,0,0,0.2)'
};

const secondaryButtonStyle: React.CSSProperties = {
    padding: '10px 20px',
    backgroundColor: '#333',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer'
};
