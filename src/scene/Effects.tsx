import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { create } from 'zustand';
import { rng } from '../../shared/rules.ts';

// 场景特效：签约彩纸粒子、技能激活光环。由角色动画在「就座」时触发。

export interface Burst {
  id: number;
  x: number;
  y: number;
  z: number;
  at: number;
  color: string;
  label?: string;
  sub?: string;
}

interface FxStore {
  bursts: Burst[];
  add: (b: Omit<Burst, 'id' | 'at'>) => void;
  prune: () => void;
}

let seq = 1;
export const useFx = create<FxStore>((set) => ({
  bursts: [],
  add: (b) => set((s) => ({ bursts: [...s.bursts, { ...b, id: seq++, at: performance.now() }] })),
  prune: () => set((s) => ({ bursts: s.bursts.filter((b) => performance.now() - b.at < 4200) })),
}));

const CONFETTI = 90;
const COLORS = ['#ff4fb8', '#3ef0ff', '#ffd166', '#7dffa8', '#ff7a3d', '#b18cff'];

function Confetti({ burst }: { burst: Burst }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const parts = useMemo(() => {
    const r = rng(burst.id * 97 + 3);
    return Array.from({ length: CONFETTI }, () => {
      const a = r() * Math.PI * 2;
      const sp = 1.2 + r() * 2.4;
      return {
        v: new THREE.Vector3(Math.cos(a) * sp * 0.6, 3.2 + r() * 3, Math.sin(a) * sp * 0.6),
        rot: new THREE.Vector3(r() * 6, r() * 6, r() * 6),
        spin: new THREE.Vector3(r() * 10, r() * 10, r() * 10),
        color: COLORS[Math.floor(r() * COLORS.length)],
      };
    });
  }, [burst.id]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const colored = useRef(false);
  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    const t = (performance.now() - burst.at) / 1000;
    parts.forEach((p, i) => {
      const drag = Math.min(t, 2.6);
      dummy.position.set(burst.x + p.v.x * drag, burst.y + p.v.y * t - 4.2 * t * t * 0.5 * 1.6, burst.z + p.v.z * drag);
      if (dummy.position.y < 0.02) dummy.position.y = 0.02;
      dummy.rotation.set(p.rot.x + p.spin.x * t, p.rot.y + p.spin.y * t, p.rot.z + p.spin.z * t);
      const s = t > 3.2 ? Math.max(0, 1 - (t - 3.2) / 0.8) : 1;
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      if (!colored.current) m.setColorAt(i, new THREE.Color(p.color).multiplyScalar(1.6));
    });
    colored.current = true;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, CONFETTI]} frustumCulled={false}>
      <planeGeometry args={[0.07, 0.11]} />
      <meshBasicMaterial side={THREE.DoubleSide} toneMapped={false} />
    </instancedMesh>
  );
}

function SkillRing({ burst }: { burst: Burst }) {
  const ring = useRef<THREE.Mesh>(null);
  const beam = useRef<THREE.Mesh>(null);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color(burst.color).multiplyScalar(2.4), transparent: true, toneMapped: false, depthWrite: false, side: THREE.DoubleSide }), [burst.color]);
  const beamMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: new THREE.Color(burst.color).multiplyScalar(1.6), transparent: true, toneMapped: false, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
    [burst.color],
  );
  useFrame(() => {
    const t = (performance.now() - burst.at) / 1000;
    if (ring.current) {
      const s = 0.3 + t * 1.6;
      ring.current.scale.set(s, s, s);
      ring.current.position.y = 0.05 + t * 0.35;
      mat.opacity = Math.max(0, 1 - t / 2.2);
    }
    if (beam.current) {
      beam.current.scale.y = Math.min(1, t * 3);
      beamMat.opacity = Math.max(0, 0.45 * (1 - t / 3));
    }
  });
  return (
    <group position={[burst.x, 0, burst.z]}>
      <mesh ref={ring} rotation-x={-Math.PI / 2} material={mat}>
        <ringGeometry args={[0.8, 0.95, 48]} />
      </mesh>
      <mesh ref={beam} position={[0, 1.6, 0]} material={beamMat}>
        <cylinderGeometry args={[0.55, 0.75, 3.2, 32, 1, true]} />
      </mesh>
      {burst.label && (
        <Html position={[0, 3.25, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div className="fx-label" style={{ ['--c' as string]: burst.color }}>
            <b>{burst.label}</b>
            {burst.sub && <span>{burst.sub}</span>}
          </div>
        </Html>
      )}
    </group>
  );
}

export function Effects() {
  const bursts = useFx((s) => s.bursts);
  const prune = useFx((s) => s.prune);
  const last = useRef(0);
  useFrame(() => {
    const now = performance.now();
    if (now - last.current > 1000) {
      last.current = now;
      if (bursts.some((b) => now - b.at > 4200)) prune();
    }
  });
  return (
    <group>
      {bursts.map((b) => (
        <group key={b.id}>
          <Confetti burst={b} />
          <SkillRing burst={b} />
        </group>
      ))}
    </group>
  );
}
