"use client";

import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, Environment, Float, Lightformer, OrbitControls, Sparkles } from "@react-three/drei";
import * as THREE from "three";
import type { PriceDirection } from "@/hooks/useBinanceTicker";

const GOLD = "#F0B90B";
const GREEN = "#0ECB81";
const RED = "#F6465D";

function hexPoints(r: number) {
  return Array.from({ length: 6 }, (_, i) => {
    const a = Math.PI / 6 + (i * Math.PI) / 3;
    return new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r);
  });
}

function Emblem({ direction, price, color }: { direction: PriceDirection; price: number; color: string }) {
  const group = useRef<THREE.Group>(null);
  const spin = useRef(0.6);

  const { hexGeo, notches, mats } = useMemo(() => {
    const tint = new THREE.Color(color);
    const deep = tint.clone().multiplyScalar(0.78);
    const bright = tint.clone().lerp(new THREE.Color("#ffffff"), 0.28);
    const outer = new THREE.Shape(hexPoints(0.72));
    outer.holes.push(new THREE.Path(hexPoints(0.42)));
    const geo = new THREE.ExtrudeGeometry(outer, {
      depth: 0.08,
      bevelEnabled: true,
      bevelThickness: 0.03,
      bevelSize: 0.03,
      bevelSegments: 4,
      curveSegments: 1,
    });
    geo.center();

    const notches = Array.from({ length: 24 }, (_, i) => {
      const a = (i / 24) * Math.PI * 2;
      return { pos: [Math.cos(a) * 1.44, Math.sin(a) * 1.44, 0] as [number, number, number], rot: a };
    });

    const mats = {
      body: new THREE.MeshStandardMaterial({ color: deep, metalness: 1, roughness: 0.34, envMapIntensity: 1.1 }),
      gold: new THREE.MeshStandardMaterial({ color: tint, metalness: 1, roughness: 0.18, envMapIntensity: 1.4 }),
      polished: new THREE.MeshStandardMaterial({ color: bright, metalness: 1, roughness: 0.08, envMapIntensity: 1.8 }),
    };
    return { hexGeo: geo, notches, mats };
  }, [color]);

  useEffect(
    () => () => {
      hexGeo.dispose();
      Object.values(mats).forEach((m) => m.dispose());
    },
    [hexGeo, mats],
  );

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
          <mesh geometry={hexGeo} material={mats.polished} position={[0, 0, 0.05]} castShadow />
          <mesh material={mats.polished} position={[0, 0, 0.06]} rotation={[0, 0, Math.PI / 4]} castShadow>
            <boxGeometry args={[0.3, 0.3, 0.14]} />
          </mesh>
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
            <Emblem direction={direction} price={price} color={color} />
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
