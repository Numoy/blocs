"use client";

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import styles from './MarsGlobe.module.css';
import type { BlockData } from '@/types';
import { toSafeExternalUrl } from '@/utils/url';
import { parseMosaicImageUrl, getMosaicTileUrl } from '@/utils/mosaicImage';

interface MarsGlobeProps {
    blocks: BlockData[];
    selectedBlockId: number | null;
    onSelectBlock: (blockId: number) => void;
    /** Mount the camera over this block at the given apparent globe size (px),
     *  so arriving from the flat map feels like one continuous zoom. */
    initialView?: { blockId: number; apparentDiameterPx: number } | null;
    /** Fired when the user keeps zooming in at minimum distance: hands over the
     *  block under the viewport center and the globe's current apparent size. */
    onZoomIntoSurface?: (blockId: number, apparentDiameterPx: number) => void;
}

const FOV_DEG = 45;
const TAN_HALF_FOV = Math.tan((FOV_DEG / 2) * (Math.PI / 180));
const RADIUS = 4.0;
const MIN_DISTANCE = 5.2;
const MAX_DISTANCE = 18.0;

// Direction from globe center for texture coordinates (u across, v from top).
// Derived from THREE.SphereGeometry's vertex formula so it inverts the same
// UV mapping the raycast click handling reads (col = floor(uv.x * 100)):
//   x = -cos(2π·u)·sin(π·v), y = cos(π·v), z = sin(2π·u)·sin(π·v)
const directionFromUV = (u: number, v: number) => {
    const azimuth = 2 * Math.PI * u;
    const polar = Math.PI * v;
    return new THREE.Vector3(
        -Math.cos(azimuth) * Math.sin(polar),
        Math.cos(polar),
        Math.sin(azimuth) * Math.sin(polar)
    );
};

const blockDirection = (blockId: number) =>
    directionFromUV(((blockId % 100) + 0.5) / 100, (Math.floor(blockId / 100) + 0.5) / 100);

// Billboards float this far above the surface and fade out as the camera
// closes in (the painted surface parcels take over up close).
const BILLBOARD_ALTITUDE = 0.62;
const BILLBOARD_HEIGHT = 0.55;
const BILLBOARD_FADE_NEAR = 6.4;
const BILLBOARD_FADE_FAR = 7.6;
const MAX_BILLBOARDS = 60;

const ATMOSPHERE_VERTEX = `
varying vec3 vNormal;
void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const ATMOSPHERE_FRAGMENT = `
varying vec3 vNormal;
void main() {
    float intensity = pow(0.66 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.0);
    vec3 glow = mix(vec3(0.91, 0.51, 0.35), vec3(0.60, 0.27, 1.00), 0.45);
    gl_FragColor = vec4(glow, 1.0) * intensity;
}
`;

export const MarsGlobe = ({ blocks, selectedBlockId, onSelectBlock, initialView, onZoomIntoSurface }: MarsGlobeProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [loading, setLoading] = useState(true);

    // Loaded parcel images are reused across redraws; failed URLs are not retried.
    const imagesRef = useRef<Map<string, HTMLImageElement>>(new Map());
    const failedTexturesRef = useRef<Set<string>>(new Set());

    // The scene mounts once; prop changes flow in through refs so block-data
    // refreshes and selection changes only repaint the overlay texture instead
    // of rebuilding the scene (which used to reset the camera and stutter).
    const blocksRef = useRef(blocks);
    const selectedRef = useRef(selectedBlockId);
    const onSelectRef = useRef(onSelectBlock);
    const onZoomRef = useRef(onZoomIntoSurface);
    const initialViewRef = useRef(initialView);
    const redrawRef = useRef<(() => void) | null>(null);
    const focusCameraRef = useRef<((blockId: number) => void) | null>(null);

    useEffect(() => {
        onSelectRef.current = onSelectBlock;
        onZoomRef.current = onZoomIntoSurface;
    });

    // Repaint the surface overlay when data or selection changes; glide the
    // camera over to the selected parcel if it's out of view.
    useEffect(() => {
        blocksRef.current = blocks;
        const selectionChanged = selectedRef.current !== selectedBlockId;
        selectedRef.current = selectedBlockId;
        redrawRef.current?.();
        if (selectionChanged && selectedBlockId !== null) {
            focusCameraRef.current?.(selectedBlockId);
        }
    }, [blocks, selectedBlockId]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const width = container.clientWidth;
        const height = container.clientHeight;

        const scene = new THREE.Scene();

        const camera = new THREE.PerspectiveCamera(FOV_DEG, width / height, 0.1, 100);
        camera.position.set(0, 0, 11);

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(width, height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        container.appendChild(renderer.domElement);

        // OrbitControls for Google Earth style navigation
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.minDistance = MIN_DISTANCE;
        controls.maxDistance = MAX_DISTANCE;
        controls.enablePan = false; // Keep globe locked in the center
        controls.autoRotateSpeed = 0.3; // Gentle rotation

        // Apply the handover view from the flat map, if one was given.
        const initial = initialViewRef.current;
        controls.autoRotate = !initial; // Idle rotation only until the user takes control
        if (initial) {
            const apparentPx = Math.max(initial.apparentDiameterPx, 120);
            const dist = Math.min(
                Math.max((RADIUS * height) / (TAN_HALF_FOV * apparentPx), MIN_DISTANCE + 0.2),
                MAX_DISTANCE - 0.5
            );
            camera.position.copy(blockDirection(initial.blockId).multiplyScalar(dist));
        }
        controls.update();

        const stopAutoRotate = () => {
            controls.autoRotate = false;
        };
        controls.addEventListener('start', stopAutoRotate);

        // Lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
        scene.add(ambientLight);

        const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.7);
        dirLight1.position.set(5, 8, 5);
        scene.add(dirLight1);

        const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.25);
        dirLight2.position.set(-5, -8, -5);
        scene.add(dirLight2);

        // Load Mars texture
        const textureLoader = new THREE.TextureLoader();
        const marsTexture = textureLoader.load('/mars_surface.jpg', () => {
            setLoading(false);
        });
        marsTexture.colorSpace = THREE.SRGBColorSpace;
        marsTexture.minFilter = THREE.LinearMipmapLinearFilter;
        marsTexture.magFilter = THREE.LinearFilter;
        const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
        marsTexture.anisotropy = maxAnisotropy;

        // 1. Mars sphere
        const sphereGeo = new THREE.SphereGeometry(RADIUS, 64, 64);
        const marsMat = new THREE.MeshStandardMaterial({
            map: marsTexture,
            roughness: 0.8,
            metalness: 0.1
        });
        const marsMesh = new THREE.Mesh(sphereGeo, marsMat);
        scene.add(marsMesh);

        // Atmosphere rim glow (warm coral into Sol purple)
        const atmosphereMat = new THREE.ShaderMaterial({
            vertexShader: ATMOSPHERE_VERTEX,
            fragmentShader: ATMOSPHERE_FRAGMENT,
            blending: THREE.AdditiveBlending,
            side: THREE.BackSide,
            transparent: true,
            depthWrite: false,
        });
        const atmosphereMesh = new THREE.Mesh(sphereGeo, atmosphereMat);
        atmosphereMesh.scale.set(1.12, 1.12, 1.12);
        scene.add(atmosphereMesh);

        // 2. Surface overlay: gridlines, colonized parcels, block images, and the
        // selection outline are painted into one equirectangular canvas texture,
        // so parcels lie flat on the planet instead of protruding as 3D meshes.
        const OVERLAY_W = 4096;
        const OVERLAY_H = 2048;
        const CELL_W = OVERLAY_W / 100;
        const CELL_H = OVERLAY_H / 100;

        const overlayCanvas = document.createElement('canvas');
        overlayCanvas.width = OVERLAY_W;
        overlayCanvas.height = OVERLAY_H;
        const overlayCtx = overlayCanvas.getContext('2d')!;

        const overlayTex = new THREE.CanvasTexture(overlayCanvas);
        overlayTex.colorSpace = THREE.SRGBColorSpace;
        overlayTex.anisotropy = maxAnisotropy;
        const overlayMat = new THREE.MeshBasicMaterial({
            map: overlayTex,
            transparent: true,
            depthWrite: false
        });
        const overlayMesh = new THREE.Mesh(sphereGeo, overlayMat);
        overlayMesh.scale.set(1.001, 1.001, 1.001); // Prevent z-fighting
        scene.add(overlayMesh);

        const images = imagesRef.current;
        const failedTextures = failedTexturesRef.current;
        let disposed = false;

        // (Re)bind an image's callbacks to THIS mount's redraw. Images outlive
        // component mounts via imagesRef, so a cached image finishing its load
        // must repaint the current overlay, not a disposed one.
        const bindImageHandlers = (image: HTMLImageElement, safeUrl: string) => {
            image.onload = () => {
                if (!disposed) drawOverlay();
            };
            image.onerror = () => {
                // Hosts without CORS headers fail the direct load;
                // retry through our same-origin image proxy.
                if (!image.dataset.proxyTried) {
                    image.dataset.proxyTried = "true";
                    image.src = `/api/image-proxy?url=${encodeURIComponent(safeUrl)}`;
                    return;
                }
                failedTextures.add(safeUrl);
                if (!disposed) drawOverlay();
            };
        };

        // Billboard cards: parcel artwork floats above its land, camera-facing,
        // with a stalk down to the parcel. Mosaics get one card showing the
        // assembled artwork. Depth testing lets the planet occlude far-side
        // cards; the animate loop fades them out as the camera closes in.
        const billboardGroup = new THREE.Group();
        scene.add(billboardGroup);

        const disposeBillboards = () => {
            for (const child of [...billboardGroup.children]) {
                billboardGroup.remove(child);
                if (child instanceof THREE.Sprite) {
                    child.material.map?.dispose();
                    child.material.dispose();
                } else if (child instanceof THREE.Line) {
                    child.geometry.dispose();
                    (child.material as THREE.Material).dispose();
                }
            }
        };

        const rebuildBillboards = () => {
            disposeBillboards();
            const selected = selectedRef.current;
            const seenGroups = new Set<string>();
            let count = 0;

            for (const block of blocksRef.current) {
                if (count >= MAX_BILLBOARDS) break;
                if (!block.owner || !block.imageUrl) continue;
                const safeUrl = toSafeExternalUrl(block.imageUrl);
                if (!safeUrl) continue;

                const mosaic = parseMosaicImageUrl(safeUrl);
                if (mosaic && seenGroups.has(mosaic.groupId)) continue;

                let cols = 1;
                let rows = 1;
                let anchorId = block.id;
                let centerU: number;
                let centerV: number;
                let tiles: (HTMLImageElement | undefined)[];
                let isSelected: boolean;

                if (mosaic) {
                    seenGroups.add(mosaic.groupId);
                    cols = mosaic.width;
                    rows = mosaic.height;
                    anchorId = mosaic.startId;
                    tiles = [];
                    for (let i = 0; i < cols * rows; i++) {
                        const tileUrl = toSafeExternalUrl(getMosaicTileUrl(mosaic, i));
                        const img = tileUrl ? images.get(tileUrl) : undefined;
                        tiles.push(img && img.complete && img.naturalWidth > 0 ? img : undefined);
                    }
                    const startCol = mosaic.startId % 100;
                    const startRow = Math.floor(mosaic.startId / 100);
                    centerU = (startCol + cols / 2) / 100;
                    centerV = (startRow + rows / 2) / 100;
                    const selCol = selected !== null ? selected % 100 : -1;
                    const selRow = selected !== null ? Math.floor(selected / 100) : -1;
                    isSelected = selCol >= startCol && selCol < startCol + cols
                        && selRow >= startRow && selRow < startRow + rows;
                } else {
                    const img = images.get(safeUrl);
                    tiles = [img && img.complete && img.naturalWidth > 0 ? img : undefined];
                    centerU = ((block.id % 100) + 0.5) / 100;
                    centerV = (Math.floor(block.id / 100) + 0.5) / 100;
                    isSelected = selected === block.id;
                }

                // No card until at least one tile has loaded
                if (!tiles.some(Boolean)) continue;

                const aspect = cols / rows;
                const cw = aspect >= 1 ? 256 : Math.round(256 * aspect);
                const ch = aspect >= 1 ? Math.round(256 / aspect) : 256;
                const card = document.createElement('canvas');
                card.width = cw;
                card.height = ch;
                const cctx = card.getContext('2d')!;
                const corner = 14;

                cctx.beginPath();
                if (typeof cctx.roundRect === 'function') {
                    cctx.roundRect(1, 1, cw - 2, ch - 2, corner);
                } else {
                    cctx.rect(1, 1, cw - 2, ch - 2);
                }
                cctx.fillStyle = '#15121f';
                cctx.fill();
                cctx.save();
                cctx.clip();
                const cellW = (cw - 12) / cols;
                const cellH = (ch - 12) / rows;
                tiles.forEach((img, i) => {
                    if (!img) return;
                    const cx = 6 + (i % cols) * cellW;
                    const cy = 6 + Math.floor(i / cols) * cellH;
                    const s = Math.max(cellW / img.naturalWidth, cellH / img.naturalHeight);
                    const sw = cellW / s;
                    const sh = cellH / s;
                    cctx.drawImage(
                        img,
                        (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh,
                        cx, cy, cellW, cellH
                    );
                });
                cctx.restore();
                cctx.beginPath();
                if (typeof cctx.roundRect === 'function') {
                    cctx.roundRect(2, 2, cw - 4, ch - 4, corner);
                } else {
                    cctx.rect(2, 2, cw - 4, ch - 4);
                }
                cctx.lineWidth = 4;
                cctx.strokeStyle = isSelected ? '#14f195' : 'rgba(241, 235, 227, 0.9)';
                cctx.stroke();

                const cardTex = new THREE.CanvasTexture(card);
                cardTex.colorSpace = THREE.SRGBColorSpace;
                const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
                    map: cardTex,
                    transparent: true,
                    depthTest: true,
                }));
                const dir = directionFromUV(centerU, centerV);
                sprite.position.copy(dir.clone().multiplyScalar(RADIUS + BILLBOARD_ALTITUDE));
                sprite.scale.set(BILLBOARD_HEIGHT * (cw / ch), BILLBOARD_HEIGHT, 1);
                sprite.userData = { blockId: anchorId };

                const stalkGeo = new THREE.BufferGeometry().setFromPoints([
                    dir.clone().multiplyScalar(RADIUS + 0.01),
                    dir.clone().multiplyScalar(RADIUS + BILLBOARD_ALTITUDE - BILLBOARD_HEIGHT / 2),
                ]);
                const stalk = new THREE.Line(
                    stalkGeo,
                    new THREE.LineBasicMaterial({ color: 0x14f195, transparent: true, opacity: 0.55 })
                );

                billboardGroup.add(stalk);
                billboardGroup.add(sprite);
                count++;
            }
        };

        const drawOverlay = () => {
            const ctx = overlayCtx;
            ctx.clearRect(0, 0, OVERLAY_W, OVERLAY_H);

            // Gridlines
            ctx.strokeStyle = 'rgba(247, 203, 160, 0.16)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let i = 0; i <= 100; i++) {
                const x = (i / 100) * OVERLAY_W;
                ctx.moveTo(x, 0);
                ctx.lineTo(x, OVERLAY_H);
                const y = (i / 100) * OVERLAY_H;
                ctx.moveTo(0, y);
                ctx.lineTo(OVERLAY_W, y);
            }
            ctx.stroke();

            // Owned parcels
            blocksRef.current.forEach((block) => {
                if (!block.owner) return;

                const col = block.id % 100;
                const row = Math.floor(block.id / 100);
                const x = col * CELL_W;
                const y = row * CELL_H;

                const safeUrl = block.imageUrl ? toSafeExternalUrl(block.imageUrl) : null;
                const img = safeUrl && !failedTextures.has(safeUrl) ? images.get(safeUrl) : undefined;

                if (img && img.complete && img.naturalWidth > 0) {
                    if (parseMosaicImageUrl(safeUrl!)) {
                        // Mosaic tiles must fill their cell exactly so adjacent
                        // tiles join into one continuous artwork on the sphere.
                        ctx.drawImage(img, x, y, CELL_W, CELL_H);
                    } else {
                        // Cover-crop the image into the parcel cell. Texture pixel density
                        // is equal in both axes, so aspect is preserved on the sphere.
                        const s = Math.max(CELL_W / img.naturalWidth, CELL_H / img.naturalHeight);
                        const sw = CELL_W / s;
                        const sh = CELL_H / s;
                        const sx = (img.naturalWidth - sw) / 2;
                        const sy = (img.naturalHeight - sh) / 2;
                        ctx.drawImage(img, sx, sy, sw, sh, x, y, CELL_W, CELL_H);
                    }
                } else {
                    // Colonized tint (also the placeholder while an image loads)
                    ctx.fillStyle = 'rgba(20, 241, 149, 0.28)';
                    ctx.fillRect(x + 1, y + 1, CELL_W - 2, CELL_H - 2);
                    ctx.strokeStyle = 'rgba(20, 241, 149, 0.8)';
                    ctx.lineWidth = 1.5;
                    ctx.strokeRect(x + 0.75, y + 0.75, CELL_W - 1.5, CELL_H - 1.5);

                    if (safeUrl && !failedTextures.has(safeUrl)) {
                        const cached = images.get(safeUrl);
                        if (cached) {
                            bindImageHandlers(cached, safeUrl);
                        } else {
                            const image = new Image();
                            // Keep the canvas untainted so it can upload as a WebGL texture
                            image.crossOrigin = 'anonymous';
                            bindImageHandlers(image, safeUrl);
                            images.set(safeUrl, image);
                            image.src = safeUrl;
                        }
                    }
                }
            });

            // Selection outline (any parcel, owned or free)
            const selected = selectedRef.current;
            if (selected !== null) {
                const col = selected % 100;
                const row = Math.floor(selected / 100);
                const x = col * CELL_W;
                const y = row * CELL_H;
                ctx.strokeStyle = 'rgba(20, 241, 149, 0.35)';
                ctx.lineWidth = 8;
                ctx.strokeRect(x - 2, y - 2, CELL_W + 4, CELL_H + 4);
                ctx.strokeStyle = '#14f195';
                ctx.lineWidth = 4;
                ctx.strokeRect(x + 2, y + 2, CELL_W - 4, CELL_H - 4);
            }

            overlayTex.needsUpdate = true;
            rebuildBillboards();
        };

        redrawRef.current = drawOverlay;
        drawOverlay();

        // Camera glide: rotate to face a parcel when it's selected off-center
        // (e.g. sidebar prev/next walking onto the far side of the planet).
        let cameraTween: {
            fromDir: THREE.Vector3;
            toDir: THREE.Vector3;
            distance: number;
            start: number;
            duration: number;
        } | null = null;

        const focusCamera = (blockId: number) => {
            const toDir = blockDirection(blockId);
            const fromDir = camera.position.clone().normalize();
            // Already roughly facing it — no need to move
            if (fromDir.dot(toDir) > Math.cos(Math.PI / 9)) return;
            controls.autoRotate = false;
            cameraTween = {
                fromDir,
                toDir,
                distance: camera.position.length(),
                start: performance.now(),
                duration: 600,
            };
        };
        focusCameraRef.current = focusCamera;

        const cancelTween = () => {
            cameraTween = null;
        };
        controls.addEventListener('start', cancelTween);

        // Raycasting click detection
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();

        let isDragging = false;
        let downX = 0;
        let downY = 0;

        const onPointerDown = (event: PointerEvent) => {
            isDragging = false;
            downX = event.clientX;
            downY = event.clientY;
        };

        const onPointerMove = (event: PointerEvent) => {
            // Only a real movement counts as a drag — otherwise fast flicks
            // (rotating the globe) would register as parcel clicks
            if (Math.hypot(event.clientX - downX, event.clientY - downY) > 6) {
                isDragging = true;
            }
        };

        const onPointerUp = (event: PointerEvent) => {
            if (isDragging) return;

            const rect = renderer.domElement.getBoundingClientRect();
            mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

            raycaster.setFromCamera(mouse, camera);
            const marsHit = raycaster.intersectObject(marsMesh)[0];
            const cardHit = billboardGroup.visible
                ? raycaster.intersectObjects(
                    billboardGroup.children.filter((child) => child instanceof THREE.Sprite),
                    false
                )[0]
                : undefined;

            // A billboard wins only when it's actually in front of the planet
            if (cardHit && (!marsHit || cardHit.distance < marsHit.distance)) {
                onSelectRef.current(cardHit.object.userData.blockId as number);
                return;
            }
            if (marsHit?.uv) {
                const col = Math.floor(marsHit.uv.x * 100);
                const row = Math.floor((1 - marsHit.uv.y) * 100);
                onSelectRef.current(row * 100 + col);
            }
        };

        container.addEventListener('pointerdown', onPointerDown);
        container.addEventListener('pointermove', onPointerMove);
        container.addEventListener('pointerup', onPointerUp);

        // Zooming in past the minimum distance hands over to the flat map,
        // centered on the parcel under the middle of the viewport.
        let surfaceZoomFired = false;
        const tryZoomThrough = (distanceBand: number) => {
            const onZoom = onZoomRef.current;
            if (!onZoom || surfaceZoomFired) return;
            const dist = camera.position.distanceTo(controls.target);
            if (dist > MIN_DISTANCE + distanceBand) return;

            const centerRaycaster = new THREE.Raycaster();
            centerRaycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
            const hit = centerRaycaster.intersectObject(marsMesh)[0];
            if (!hit?.uv) return;

            const col = Math.min(99, Math.floor(hit.uv.x * 100));
            const row = Math.min(99, Math.floor((1 - hit.uv.y) * 100));
            const containerHeight = container.clientHeight || height;
            surfaceZoomFired = true;
            onZoom(row * 100 + col, (RADIUS * containerHeight) / (TAN_HALF_FOV * dist));
        };

        const onWheelZoomThrough = (event: WheelEvent) => {
            if (event.deltaY >= 0) return;
            tryZoomThrough(0.4);
        };
        renderer.domElement.addEventListener('wheel', onWheelZoomThrough);

        // Touch parity: a continued pinch-out at minimum distance also drops
        // onto the flat map (the wheel path is desktop-only).
        let lastPinchSpread: number | null = null;
        const onTouchMove = (event: TouchEvent) => {
            if (event.touches.length !== 2) {
                lastPinchSpread = null;
                return;
            }
            const dx = event.touches[0].clientX - event.touches[1].clientX;
            const dy = event.touches[0].clientY - event.touches[1].clientY;
            const spread = Math.hypot(dx, dy);
            if (lastPinchSpread !== null && spread - lastPinchSpread > 2) {
                tryZoomThrough(0.15);
            }
            lastPinchSpread = spread;
        };
        const onTouchEnd = () => {
            lastPinchSpread = null;
        };
        renderer.domElement.addEventListener('touchmove', onTouchMove, { passive: true });
        renderer.domElement.addEventListener('touchend', onTouchEnd, { passive: true });

        const handleResize = () => {
            if (!containerRef.current) return;
            const w = containerRef.current.clientWidth;
            const h = containerRef.current.clientHeight;
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            renderer.setSize(w, h);
        };
        window.addEventListener('resize', handleResize);

        let animId: number;
        const animate = () => {
            animId = requestAnimationFrame(animate);

            if (cameraTween) {
                const t = Math.min((performance.now() - cameraTween.start) / cameraTween.duration, 1);
                const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
                const angle = cameraTween.fromDir.angleTo(cameraTween.toDir);
                const axis = new THREE.Vector3()
                    .crossVectors(cameraTween.fromDir, cameraTween.toDir)
                    .normalize();
                const dir = axis.lengthSq() > 0.5
                    ? cameraTween.fromDir.clone().applyAxisAngle(axis, angle * eased)
                    : cameraTween.toDir.clone();
                camera.position.copy(dir.multiplyScalar(cameraTween.distance));
                camera.lookAt(0, 0, 0);
                if (t >= 1) cameraTween = null;
            }

            // Fade billboards out as the camera closes in on the surface
            const camDist = camera.position.length();
            const fade = Math.min(Math.max(
                (camDist - BILLBOARD_FADE_NEAR) / (BILLBOARD_FADE_FAR - BILLBOARD_FADE_NEAR), 0), 1);
            billboardGroup.visible = fade > 0.01;
            if (billboardGroup.visible) {
                for (const child of billboardGroup.children) {
                    const mat = (child as THREE.Sprite).material as THREE.SpriteMaterial;
                    mat.opacity = (child instanceof THREE.Line ? 0.55 : 1) * fade;
                }
            }

            controls.update();
            renderer.render(scene, camera);
        };
        animate();

        return () => {
            disposed = true;
            redrawRef.current = null;
            focusCameraRef.current = null;
            cancelAnimationFrame(animId);
            window.removeEventListener('resize', handleResize);
            container.removeEventListener('pointerdown', onPointerDown);
            container.removeEventListener('pointermove', onPointerMove);
            container.removeEventListener('pointerup', onPointerUp);
            renderer.domElement.removeEventListener('wheel', onWheelZoomThrough);
            renderer.domElement.removeEventListener('touchmove', onTouchMove);
            renderer.domElement.removeEventListener('touchend', onTouchEnd);
            controls.removeEventListener('start', stopAutoRotate);
            controls.removeEventListener('start', cancelTween);
            disposeBillboards();
            overlayTex.dispose();
            marsTexture.dispose();
            atmosphereMat.dispose();
            sphereGeo.dispose();
            controls.dispose();
            renderer.dispose();
            if (container.contains(renderer.domElement)) {
                container.removeChild(renderer.domElement);
            }
        };
        // Scene mounts once; live data flows in through refs (see effects above).
    }, []);

    return (
        <div className={styles.container} ref={containerRef}>
            {loading && (
                <div className={styles.loadingOverlay}>
                    <div className={styles.spinner}></div>
                    <div className={styles.loadingText}>Preparing Mars for colonization…</div>
                    <div className={styles.loadingSub}>10,000 plots · on Solana</div>
                </div>
            )}
        </div>
    );
};
