"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, Environment, Float, Lightformer, OrbitControls, Sparkles } from "@react-three/drei";
import * as THREE from "three";
import type { PriceDirection } from "@/hooks/useBinanceTicker";

const GOLD = "#F0B90B";
const GREEN = "#0ECB81";
const RED = "#F6465D";

/**
 * Rasterises a coin's "white" logo (a white disc with the glyph cut out) at high resolution and
 * inverts it, leaving just the glyph on a transparent background. Used as an inlay on the coin face.
 */
function useGlyphTexture(url: string) {
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null);

  useEffect(() => {
    let alive = true;
    let created: THREE.CanvasTexture | null = null;
    let blobUrl = "";
    const S = 1024;
    const img = new Image();
    img.onload = () => {
      if (!alive) return;
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = S;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(S / 2, S / 2, (S / 2) * 0.96, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = "destination-out"; // erase the disc, keep the cut-out glyph
      ctx.drawImage(img, 0, 0, S, S);
      created = new THREE.CanvasTexture(canvas);
      created.colorSpace = THREE.SRGBColorSpace;
      created.anisotropy = 8;
      setTexture(created);
    };
    // Give the SVG an explicit size: some browsers (Firefox) won't draw size-less SVGs to canvas.
    fetch(url)
      .then((r) => r.text())
      .then((svg) => {
        if (!alive) return;
        const sized = svg.replace("<svg ", `<svg width="${S}" height="${S}" `);
        blobUrl = URL.createObjectURL(new Blob([sized], { type: "image/svg+xml" }));
        img.src = blobUrl;
      })
      .catch(() => {
        /* no logo: coin renders without the inlay */
      });
    return () => {
      alive = false;
      created?.dispose();
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [url]);

  return texture;
}

function Emblem({ direction, price, color, logo }: { direction: PriceDirection; price: number; color: string; logo: string }) {
  const group = useRef<THREE.Group>(null);
  const spin = useRef(0.6);
  const glyph = useGlyphTexture(logo);

  const { notches, mats, bright } = useMemo(() => {
    const tint = new THREE.Color(color);
    const deep = tint.clone().multiplyScalar(0.62);
    const bright = tint.clone().lerp(new THREE.Color("#ffffff"), 0.45);

    const notches = Array.from({ length: 24 }, (_, i) => {
      const a = (i / 24) * Math.PI * 2;
      return { pos: [Math.cos(a) * 1.44, Math.sin(a) * 1.44, 0] as [number, number, number], rot: a };
    });

    const mats = {
      body: new THREE.MeshStandardMaterial({ color: deep, metalness: 1, roughness: 0.34, envMapIntensity: 1.1 }),
      gold: new THREE.MeshStandardMaterial({ color: tint, metalness: 1, roughness: 0.18, envMapIntensity: 1.4 }),
      polished: new THREE.MeshStandardMaterial({ color: bright, metalness: 1, roughness: 0.08, envMapIntensity: 1.8 }),
    };
    return { notches, mats, bright };
  }, [color]);

  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);

  useEffect(() => {
    if (price > 0) spin.current = Math.max(spin.current, 1.8);
  }, [price]);

  useEffect(() => {
    spin.current = 3;
  }, [direction]);

  useFrame((_, dt) => {
    if (!group.current) return;
    spin.current = THREE.MathUtils.lerp(spin.current, 0.6, Math.min(1, dt * 1.5));
    group.current.rotation.y += dt * spin.current;
  });

  return (
    <group ref={group}>
      <mesh rotation={[Math.PI / 2, 0, 0]} material={mats.body} castShadow receiveShadow>
        <cylinderGeometry args={[1.6, 1.6, 0.22, 96]} />
      </mesh>
      <mesh material={mats.gold} castShadow>
        <torusGeometry args={[1.6, 0.075, 24, 128]} />
      </mesh>
      {[1, -1].map((side) => (
        <group key={side} position={[0, 0, side * 0.115]} rotation={[0, side === 1 ? 0 : Math.PI, 0]}>
          <mesh material={mats.gold}>
            <torusGeometry args={[1.28, 0.035, 16, 128]} />
          </mesh>
          {glyph && (
            <mesh position={[0, 0, 0.004]}>
              <circleGeometry args={[1.2, 96]} />
              <meshStandardMaterial
                key={glyph.uuid}
                map={glyph}
                color={bright}
                metalness={1}
                roughness={0.1}
                envMapIntensity={2}
                transparent
                alphaTest={0.4}
                polygonOffset
                polygonOffsetFactor={-2}
              />
            </mesh>
          )}
          {notches.map((n, i) => (
            <mesh key={i} material={mats.gold} position={n.pos} rotation={[0, 0, n.rot]}>
              <boxGeometry args={[0.13, 0.05, 0.05]} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

interface CryptoScene3DProps {
  direction?: PriceDirection;
  price?: number;
  color?: string;
  label?: string;
  className?: string;
}

export default function CryptoScene3D({
  direction = "up",
  price = 0,
  color = GOLD,
  label = "BTC",
  className = "",
}: CryptoScene3DProps) {
  const accent = direction === "up" ? GREEN : RED;

  return (
    <div className={`relative h-full min-h-[260px] w-full overflow-hidden ${className}`}>
      <div
        className="pointer-events-none absolute inset-0 transition-[background] duration-700"
        style={{ background: `radial-gradient(ellipse at center, ${color}24, transparent 65%)` }}
      />
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [0, 0.4, 5.6], fov: 38 }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      >
        <ambientLight intensity={0.25} />
        <spotLight position={[5, 6, 5]} angle={0.35} penumbra={1} intensity={60} color="#FFF6D5" castShadow />
        <directionalLight position={[-4, 2, -3]} intensity={1.2} color="#FFD36B" />
        <pointLight position={[0, -2, 3]} intensity={8} distance={8} color={accent} />

        <Suspense fallback={null}>
          <Float speed={1.6} rotationIntensity={0.25} floatIntensity={0.6}>
            <Emblem direction={direction} price={price} color={color} logo={`/coins/white/${label.toLowerCase()}.svg`} />
          </Float>
          <Sparkles count={70} scale={[7, 4.5, 4]} size={2.2} speed={0.35} color={color} opacity={0.8} />
          <Sparkles count={30} scale={[6, 4, 3]} size={3} speed={0.6} color={accent} opacity={0.6} />
          <ContactShadows position={[0, -2.1, 0]} opacity={0.45} scale={9} blur={2.6} far={4} color="#000000" />
          <Environment resolution={256} frames={1}>
            <group rotation={[-Math.PI / 3, 0, 1]}>
              <Lightformer form="circle" intensity={4} rotation-x={Math.PI / 2} position={[0, 5, -9]} scale={2} />
              <Lightformer form="circle" intensity={2} rotation-y={Math.PI / 2} position={[-5, 1, -1]} scale={2} />
              <Lightformer form="ring" color={GOLD} intensity={3} rotation-y={Math.PI / 2} position={[-5, -1, -1]} scale={4} />
              <Lightformer form="rect" intensity={2} rotation-y={-Math.PI / 2} position={[10, 1, 0]} scale={[20, 2, 1]} />
            </group>
          </Environment>
        </Suspense>

        <OrbitControls
          enablePan={false}
          enableDamping
          minDistance={3.5}
          maxDistance={9}
          minPolarAngle={Math.PI / 4}
          maxPolarAngle={Math.PI * 0.7}
        />
      </Canvas>
      <span
        className="pointer-events-none absolute left-3 top-3 rounded bg-black/40 px-2 py-1 text-[10px] font-medium uppercase tracking-wider"
        style={{ color }}
      >
        {label} · 3D
      </span>
      <span className="pointer-events-none absolute bottom-3 right-3 text-[10px] text-[#5E6673]">Drag to orbit · Scroll to zoom</span>
    </div>
  );
}
