import { LocalPointLight } from './LocalLights.tsx';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { PALETTE, glow, std } from './materials.ts';
import { chartScreen, monitorScreen, whiteboard } from './textures.ts';
import { rng } from '../../shared/rules.ts';
import { mergeStaticParts } from './staticGeometry.ts';

type P3 = [number, number, number];

const legBox = new THREE.BoxGeometry(0.05, 0.04, 0.4);
const chairLegs = mergeStaticParts(legBox, Array.from({ length: 5 }, (_, i) => ({
  position: [Math.sin(i / 5 * Math.PI * 2) * 0.2, 0.06, Math.cos(i / 5 * Math.PI * 2) * 0.2],
  rotation: [0, i / 5 * Math.PI * 2, 0],
})));
legBox.dispose();

export function Chair({ color = PALETTE.fabricBlue, position = [0, 0, 0] as P3, rotation = 0, exec = false }) {
  const fabric = std(color, 0.85);
  const metal = std(PALETTE.metal, 0.4, 0.6);
  const back = exec ? 0.85 : 0.55;
  return (
    <group position={position} rotation-y={rotation}>
      {/* 五星脚 */}
      {chairLegs && <mesh geometry={chairLegs} material={metal} castShadow dispose={null} />}
      <mesh position={[0, 0.22, 0]} material={metal}>
        <cylinderGeometry args={[0.03, 0.03, 0.34, 8]} />
      </mesh>
      <RoundedBox args={[0.56, 0.1, 0.52]} radius={0.04} position={[0, 0.43, 0]} material={fabric} castShadow receiveShadow />
      <RoundedBox args={[0.54, back, 0.1]} radius={0.05} position={[0, 0.48 + back / 2, -0.27]} rotation-x={-0.08} material={fabric} castShadow />
      {exec && <RoundedBox args={[0.3, 0.16, 0.08]} radius={0.04} position={[0, 0.48 + back + 0.1, -0.3]} material={fabric} />}
    </group>
  );
}

export function Plant({ position = [0, 0, 0] as P3, scale = 1, seed = 1, pot = PALETTE.pot }) {
  const leaves = useMemo(() => {
    const r = rng(seed);
    return Array.from({ length: 9 }, (_, i) => ({
      y: 0.55 + r() * 0.75,
      a: (i / 9) * Math.PI * 2 + r() * 0.5,
      tilt: 0.5 + r() * 0.6,
      s: 0.22 + r() * 0.16,
      dark: r() > 0.5,
    }));
  }, [seed]);
  const foliage = useMemo(() => {
    const sphere = new THREE.SphereGeometry(1, 10, 8);
    const merged = [false, true].map((dark) => mergeStaticParts(sphere, leaves.filter(l => l.dark === dark).map(l => ({
      position: [Math.sin(l.a) * 0.16, l.y, Math.cos(l.a) * 0.16],
      rotation: [l.tilt * Math.cos(l.a), l.a, -l.tilt * Math.sin(l.a) * 0.3],
      scale: [l.s, l.s * 0.25, l.s * 1.8],
    }))));
    sphere.dispose();
    return merged;
  }, [leaves]);
  useEffect(() => () => foliage.forEach(g => g?.dispose()), [foliage]);
  const potMat = std(pot, 0.5);
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.22, 0]} material={potMat} castShadow receiveShadow>
        <cylinderGeometry args={[0.24, 0.18, 0.44, 20]} />
      </mesh>
      <mesh position={[0, 0.44, 0]} material={std('#3a2a1e', 0.95)}>
        <cylinderGeometry args={[0.22, 0.22, 0.02, 20]} />
      </mesh>
      <mesh position={[0, 0.7, 0]} material={std('#5b3b22', 0.9)}>
        <cylinderGeometry args={[0.025, 0.03, 0.6, 6]} />
      </mesh>
      {foliage.map((geometry, i) => geometry && <mesh key={i} geometry={geometry}
        material={std(i ? PALETTE.leafDark : PALETTE.leaf, 0.7)} castShadow />)}
    </group>
  );
}

export function TallPlant({ position = [0, 0, 0] as P3, seed = 3 }) {
  const foliage = useMemo(() => {
    const r = rng(seed);
    const blobs = Array.from({ length: 6 }, () => [(r() - 0.5) * 0.5, 1.1 + r() * 1.0, (r() - 0.5) * 0.5, 0.28 + r() * 0.18] as const);
    const source = new THREE.IcosahedronGeometry(1, 1);
    const merged = [0, 1].map(parity => mergeStaticParts(source, blobs.filter((_, i) => i % 2 === parity).map(([x, y, z, s]) => ({ position: [x, y, z], scale: [s, s, s] }))));
    source.dispose();
    return merged;
  }, [seed]);
  useEffect(() => () => foliage.forEach(g => g?.dispose()), [foliage]);
  return (
    <group position={position}>
      <mesh position={[0, 0.3, 0]} material={std(PALETTE.terracotta, 0.6)} castShadow receiveShadow>
        <cylinderGeometry args={[0.32, 0.26, 0.6, 20]} />
      </mesh>
      <mesh position={[0, 1.0, 0]} material={std('#5b3b22', 0.9)}>
        <cylinderGeometry args={[0.04, 0.05, 1.2, 6]} />
      </mesh>
      {foliage.map((geometry, i) => geometry && <mesh key={i} geometry={geometry}
        material={std(i ? PALETTE.leaf : PALETTE.leafDark, 0.75)} castShadow />)}
    </group>
  );
}

export interface DeskLive {
  itemsScale: number; // 桌面私人物品（收拾/布置动画）
  screenOn: number; // 0..1
  typing: number; // 打字强度
}

/** 每个工位的实时状态（由角色动画写入，桌子读出），避免 React 重渲染 */
export const deskLive: DeskLive[] = [0, 1, 2].map(() => ({ itemsScale: 0, screenOn: 0, typing: 0 }));

export function Desk({ position = [0, 0, 0] as P3, slot, accent = '#5ee1ff' }: { position?: P3; slot: number; accent?: string }) {
  const top = std(PALETTE.oak, 0.45);
  const leg = std(PALETTE.metal, 0.35, 0.6);
  const items = useRef<THREE.Group>(null);
  const screen = useRef<THREE.MeshStandardMaterial>(null);
  const lamp = useRef<THREE.PointLight>(null);
  const scr = monitorScreen(11 + slot, [200, 160, 280][slot] ?? 200);
  useFrame(({ clock }) => {
    const live = deskLive[slot];
    if (items.current) {
      const s = THREE.MathUtils.clamp(live.itemsScale, 0.0001, 1);
      items.current.scale.setScalar(s);
      items.current.visible = live.itemsScale > 0.01;
    }
    if (screen.current) {
      const flicker = live.typing > 0 ? 0.15 * Math.sin(clock.elapsedTime * 18) : 0;
      screen.current.emissiveIntensity = 0.15 + live.screenOn * (1.25 + flicker);
    }
    if (lamp.current) lamp.current.intensity = 0.3 + live.screenOn * 0.9;
  });
  return (
    <group position={position}>
      <RoundedBox args={[1.9, 0.07, 0.95]} radius={0.025} position={[0, 0.75, 0]} material={top} castShadow receiveShadow />
      {[-0.85, 0.85].map((x) => (
        <group key={x}>
          <mesh position={[x, 0.37, 0]} material={leg} castShadow>
            <boxGeometry args={[0.06, 0.74, 0.8]} />
          </mesh>
        </group>
      ))}
      {/* 抽屉柜 */}
      <RoundedBox args={[0.42, 0.55, 0.7]} radius={0.03} position={[0.6, 0.3, -0.05]} material={std('#f0ebe3', 0.5)} castShadow receiveShadow />
      <mesh position={[0.6, 0.45, -0.41]} material={std(accent, 0.4)}>
        <boxGeometry args={[0.2, 0.025, 0.02]} />
      </mesh>
      {/* 显示器（屏幕朝向座位 -z 方向） */}
      <group position={[-0.52, 0.79, 0.12]} rotation-y={0.35}>
        <mesh position={[0, 0.02, 0]} material={leg}>
          <boxGeometry args={[0.24, 0.02, 0.16]} />
        </mesh>
        <mesh position={[0, 0.16, 0]} material={leg}>
          <boxGeometry args={[0.04, 0.28, 0.04]} />
        </mesh>
        <RoundedBox args={[0.8, 0.46, 0.04]} radius={0.015} position={[0, 0.4, 0]} material={std('#1a1d26', 0.3, 0.5)} castShadow />
        <mesh position={[0, 0.4, -0.022]} rotation-y={Math.PI}>
          <planeGeometry args={[0.74, 0.4]} />
          <meshStandardMaterial ref={screen} color="#111" emissive="#ffffff" emissiveMap={scr} emissiveIntensity={0.2} roughness={0.2} />
        </mesh>
        <LocalPointLight ref={lamp} position={[0, 0.4, -0.35]} color={accent} intensity={0.6} distance={1.8} decay={2} />
      </group>
      {/* 键盘鼠标 */}
      <RoundedBox args={[0.5, 0.025, 0.16]} radius={0.01} position={[-0.05, 0.8, -0.22]} material={std('#e9e9ef', 0.5)} />
      <mesh position={[0.3, 0.8, -0.22]} material={std('#e9e9ef', 0.5)}>
        <sphereGeometry args={[0.04, 12, 8]} />
      </mesh>
      {/* 私人物品：收拾时被装进纸箱 */}
      <group ref={items} position={[0, 0.785, 0]}>
        <mesh position={[0.68, 0.06, 0.12]} material={std('#ffffff', 0.3)} castShadow>
          <cylinderGeometry args={[0.05, 0.045, 0.12, 14]} />
        </mesh>
        <mesh position={[0.735, 0.07, 0.12]} rotation-z={Math.PI / 2} material={std('#ffffff', 0.3)}>
          <torusGeometry args={[0.03, 0.01, 6, 12]} />
        </mesh>
        <group position={[-0.82, 0, -0.3]}>
          <Plant scale={0.28} seed={slot + 20} pot={accent} />
        </group>
        <group position={[0.42, 0, 0.22]} rotation-y={Math.PI + 0.4}>
          <RoundedBox args={[0.18, 0.22, 0.02]} radius={0.01} position={[0, 0.11, 0]} material={std(PALETTE.walnut, 0.5)} />
          <mesh position={[0, 0.11, 0.012]}>
            <planeGeometry args={[0.13, 0.16]} />
            <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.3} />
          </mesh>
        </group>
        <mesh position={[-0.45, 0.02, -0.05]} rotation-y={0.3} material={std('#fff3c4', 0.8)}>
          <boxGeometry args={[0.2, 0.03, 0.28]} />
        </mesh>
      </group>
      {/* 桌前隔板（带品牌色灯条） */}
      <RoundedBox args={[1.9, 0.16, 0.05]} radius={0.02} position={[0, 0.86, 0.47]} material={std('#e8e2d8', 0.7)} castShadow />
      <mesh position={[0, 0.945, 0.47]} material={glow(accent, 1.6)}>
        <boxGeometry args={[1.86, 0.015, 0.055]} />
      </mesh>
    </group>
  );
}

export function BossDesk({ position = [0, 0, 0] as P3 }) {
  const wood = std(PALETTE.walnut, 0.4);
  return (
    <group position={position}>
      <RoundedBox args={[2.3, 0.09, 1.1]} radius={0.03} position={[0, 0.78, 0]} material={wood} castShadow receiveShadow />
      <RoundedBox args={[2.2, 0.72, 0.08]} radius={0.03} position={[0, 0.38, 0.48]} material={wood} castShadow />
      <RoundedBox args={[0.08, 0.72, 1.0]} radius={0.03} position={[-1.08, 0.38, 0]} material={wood} castShadow />
      <RoundedBox args={[0.08, 0.72, 1.0]} radius={0.03} position={[1.08, 0.38, 0]} material={wood} castShadow />
      <mesh position={[0, 0.5, 0.53]} material={glow('#ffc94d', 1.4)}>
        <boxGeometry args={[1.6, 0.03, 0.01]} />
      </mesh>
      {/* 笔记本电脑 */}
      <group position={[0.2, 0.83, 0.05]}>
        <RoundedBox args={[0.5, 0.02, 0.34]} radius={0.008} material={std(PALETTE.steel, 0.3, 0.7)} />
        <group position={[0, 0.01, 0.16]} rotation-x={0.35}>
          <RoundedBox args={[0.5, 0.33, 0.015]} radius={0.008} position={[0, 0.165, 0]} material={std(PALETTE.steel, 0.3, 0.7)} />
          <mesh position={[0, 0.165, -0.009]} rotation-y={Math.PI}>
            <planeGeometry args={[0.46, 0.29]} />
            <meshBasicMaterial map={chartScreen()} toneMapped={false} />
          </mesh>
        </group>
      </group>
      {/* 金色招财猫 + 咖啡 */}
      <group position={[-0.75, 0.83, 0.15]}>
        <mesh position={[0, 0.1, 0]} material={std('#ffc94d', 0.25, 0.8)} castShadow>
          <sphereGeometry args={[0.1, 16, 12]} />
        </mesh>
        <mesh position={[0, 0.24, 0]} material={std('#ffc94d', 0.25, 0.8)} castShadow>
          <sphereGeometry args={[0.08, 16, 12]} />
        </mesh>
        <mesh position={[0.08, 0.22, 0.02]} rotation-z={-0.4} material={std('#ffc94d', 0.25, 0.8)}>
          <capsuleGeometry args={[0.025, 0.08, 4, 8]} />
        </mesh>
      </group>
      <mesh position={[0.85, 0.89, -0.15]} material={std('#2d2d2d', 0.4)}>
        <cylinderGeometry args={[0.05, 0.045, 0.12, 14]} />
      </mesh>
    </group>
  );
}

export function Sofa({ position = [0, 0, 0] as P3, rotation = 0, color = PALETTE.fabricTeal }) {
  const f = std(color, 0.9);
  return (
    <group position={position} rotation-y={rotation}>
      <RoundedBox args={[2.2, 0.38, 0.9]} radius={0.12} position={[0, 0.3, 0]} material={f} castShadow receiveShadow />
      <RoundedBox args={[2.2, 0.6, 0.25]} radius={0.12} position={[0, 0.65, -0.35]} material={f} castShadow />
      <RoundedBox args={[0.25, 0.5, 0.9]} radius={0.1} position={[-1.05, 0.5, 0]} material={f} castShadow />
      <RoundedBox args={[0.25, 0.5, 0.9]} radius={0.1} position={[1.05, 0.5, 0]} material={f} castShadow />
      <RoundedBox args={[0.42, 0.36, 0.14]} radius={0.06} position={[-0.6, 0.65, -0.18]} rotation-x={-0.2} material={std(PALETTE.fabricMustard, 0.9)} castShadow />
      <RoundedBox args={[0.42, 0.36, 0.14]} radius={0.06} position={[0.5, 0.65, -0.18]} rotation={[-0.2, 0, 0.15]} material={std(PALETTE.neonPink, 0.9)} castShadow />
      {[-0.95, 0.95].map((x) => (
        <mesh key={x} position={[x, 0.05, 0.3]} material={std(PALETTE.walnut, 0.5)}>
          <cylinderGeometry args={[0.03, 0.03, 0.1, 8]} />
        </mesh>
      ))}
    </group>
  );
}

/** 沙发上睡觉的办公室猫（氛围） */
export function OfficeCat({ position = [0, 0, 0] as P3 }) {
  const body = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (body.current) body.current.scale.y = 1 + Math.sin(clock.elapsedTime * 1.6) * 0.04;
  });
  const fur = std('#f2a65a', 0.9);
  return (
    <group position={position}>
      <group ref={body}>
        <mesh position={[0, 0.1, 0]} scale={[1.3, 0.75, 0.9]} material={fur} castShadow>
          <sphereGeometry args={[0.16, 16, 12]} />
        </mesh>
        <mesh position={[0.2, 0.12, 0.05]} material={fur} castShadow>
          <sphereGeometry args={[0.1, 16, 12]} />
        </mesh>
        {[-0.05, 0.05].map((z) => (
          <mesh key={z} position={[0.24, 0.21, 0.05 + z]} rotation-x={z * 4} material={fur}>
            <coneGeometry args={[0.035, 0.07, 6]} />
          </mesh>
        ))}
        <mesh position={[-0.18, 0.06, 0.14]} rotation={[0, 0.6, Math.PI / 2]} material={fur}>
          <capsuleGeometry args={[0.03, 0.22, 4, 8]} />
        </mesh>
      </group>
    </group>
  );
}

export function MeetingArea({ position = [0, 0, 0] as P3 }) {
  const top = std('#f5f1ea', 0.35);
  const chairs = [0, 1, 2, 3, 4, 5];
  return (
    <group position={position}>
      <mesh position={[0, 0.74, 0]} material={top} castShadow receiveShadow>
        <cylinderGeometry args={[1.0, 1.0, 0.06, 40]} />
      </mesh>
      <mesh position={[0, 0.37, 0]} material={std(PALETTE.metal, 0.35, 0.6)} castShadow>
        <cylinderGeometry args={[0.08, 0.3, 0.74, 16]} />
      </mesh>
      {chairs.map((i) => {
        const a = (i / chairs.length) * Math.PI * 2 + 0.3;
        return <Chair key={i} position={[Math.sin(a) * 1.45, 0, Math.cos(a) * 1.45]} rotation={a + Math.PI} color={i % 2 ? PALETTE.fabricMustard : PALETTE.fabricTeal} />;
      })}
      {/* 桌面道具 */}
      <mesh position={[0.2, 0.8, 0.1]} material={std('#ffffff', 0.4)}>
        <boxGeometry args={[0.3, 0.02, 0.22]} />
      </mesh>
      <mesh position={[-0.3, 0.82, -0.2]} material={std(PALETTE.terracotta, 0.4)}>
        <cylinderGeometry args={[0.05, 0.04, 0.1, 12]} />
      </mesh>
      {/* 吊灯 */}
      <group position={[0, 2.55, 0]}>
        <mesh position={[0, 0.4, 0]} material={std(PALETTE.metal, 0.4)}>
          <cylinderGeometry args={[0.008, 0.008, 0.8, 4]} />
        </mesh>
        <mesh material={std('#2b2f3a', 0.4, 0.4, { side: THREE.DoubleSide })}>
          <coneGeometry args={[0.45, 0.32, 24, 1, true]} />
        </mesh>
        <mesh position={[0, -0.12, 0]} material={glow(PALETTE.warmLight, 2.2)}>
          <sphereGeometry args={[0.1, 12, 8]} />
        </mesh>
        <LocalPointLight position={[0, -0.3, 0]} color={PALETTE.warmLight} intensity={9} distance={5} decay={2} />
      </group>
    </group>
  );
}

export function Whiteboard({ position = [0, 0, 0] as P3, rotation = 0 }) {
  return (
    <group position={position} rotation-y={rotation}>
      <RoundedBox args={[2.0, 1.25, 0.05]} radius={0.02} position={[0, 1.55, 0]} material={std('#cfd5df', 0.3, 0.5)} castShadow />
      <mesh position={[0, 1.55, 0.03]}>
        <planeGeometry args={[1.9, 1.15]} />
        <meshStandardMaterial map={whiteboard()} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.9, 0.06]} material={std(PALETTE.metal, 0.4)}>
        <boxGeometry args={[1.6, 0.04, 0.08]} />
      </mesh>
    </group>
  );
}

export function CoffeeBar({ position = [0, 0, 0] as P3, rotation = 0 }) {
  return (
    <group position={position} rotation-y={rotation}>
      <RoundedBox args={[2.4, 0.95, 0.65]} radius={0.04} position={[0, 0.475, 0]} material={std(PALETTE.walnut, 0.5)} castShadow receiveShadow />
      <RoundedBox args={[2.5, 0.05, 0.72]} radius={0.02} position={[0, 0.97, 0]} material={std('#f4f1ec', 0.25)} castShadow receiveShadow />
      <mesh position={[0, 0.5, 0.33]} material={glow(PALETTE.warmLight, 1.2)}>
        <boxGeometry args={[2.3, 0.02, 0.01]} />
      </mesh>
      {/* 咖啡机 */}
      <group position={[-0.6, 1.0, -0.05]}>
        <RoundedBox args={[0.5, 0.55, 0.42]} radius={0.04} position={[0, 0.275, 0]} material={std('#c0392b', 0.3, 0.3)} castShadow />
        <mesh position={[0, 0.38, 0.22]} material={glow('#7dffa8', 1.8)}>
          <boxGeometry args={[0.18, 0.06, 0.01]} />
        </mesh>
        <mesh position={[0, 0.1, 0.18]} material={std('#ffffff', 0.3)}>
          <cylinderGeometry args={[0.045, 0.04, 0.09, 12]} />
        </mesh>
      </group>
      {/* 甜甜圈 */}
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[0.3 + i * 0.2, 1.03, 0.05]} rotation-x={Math.PI / 2} material={std(['#ff8fb8', '#ffd166', '#8bd3ff'][i], 0.5)}>
          <torusGeometry args={[0.07, 0.035, 8, 16]} />
        </mesh>
      ))}
    </group>
  );
}

export function VendingMachine({ position = [0, 0, 0] as P3, rotation = 0 }) {
  const panel = useMemo(() => new THREE.Color('#9fe8ff').multiplyScalar(1.6), []);
  return (
    <group position={position} rotation-y={rotation}>
      <RoundedBox args={[1.0, 2.0, 0.8]} radius={0.05} position={[0, 1.0, 0]} material={std('#2364d2', 0.35, 0.2)} castShadow receiveShadow />
      <mesh position={[-0.1, 1.15, 0.41]}>
        <planeGeometry args={[0.66, 1.3]} />
        <meshBasicMaterial color={panel} toneMapped={false} />
      </mesh>
      {Array.from({ length: 12 }, (_, i) => (
        <mesh key={i} position={[-0.32 + (i % 4) * 0.15, 0.6 + Math.floor(i / 4) * 0.4, 0.43]} material={std(['#ff5a4f', '#ffd166', '#7dffa8', '#ff8fb8'][i % 4], 0.4)}>
          <cylinderGeometry args={[0.04, 0.04, 0.16, 10]} />
        </mesh>
      ))}
      <LocalPointLight position={[0, 1.2, 0.8]} color="#7fd8ff" intensity={4} distance={3.5} decay={2} />
    </group>
  );
}

export function FloorLamp({ position = [0, 0, 0] as P3 }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.02, 0]} material={std(PALETTE.metal, 0.4, 0.6)}>
        <cylinderGeometry args={[0.18, 0.2, 0.04, 20]} />
      </mesh>
      <mesh position={[0, 0.85, 0]} material={std(PALETTE.metal, 0.4, 0.6)}>
        <cylinderGeometry args={[0.015, 0.015, 1.7, 6]} />
      </mesh>
      <mesh position={[0, 1.75, 0]} material={std('#f6e3c4', 0.7, 0, { emissive: '#ffcf8a', emissiveIntensity: 0.9 })}>
        <cylinderGeometry args={[0.18, 0.24, 0.3, 20, 1, true]} />
      </mesh>
      <LocalPointLight position={[0, 1.6, 0]} color={PALETTE.warmLight} intensity={5} distance={4} decay={2} />
    </group>
  );
}

export function Printer({ position = [0, 0, 0] as P3, rotation = 0 }) {
  return (
    <group position={position} rotation-y={rotation}>
      <RoundedBox args={[0.8, 0.8, 0.6]} radius={0.04} position={[0, 0.4, 0]} material={std('#e8e8ee', 0.5)} castShadow receiveShadow />
      <RoundedBox args={[0.7, 0.18, 0.55]} radius={0.03} position={[0, 0.89, 0]} material={std('#cfd3dc', 0.5)} castShadow />
      <mesh position={[0.25, 0.92, 0.28]} material={glow('#7dffa8', 2)}>
        <boxGeometry args={[0.06, 0.03, 0.01]} />
      </mesh>
      <mesh position={[-0.05, 1.0, 0.0]} rotation-x={-0.2} material={std('#ffffff', 0.9)}>
        <boxGeometry args={[0.4, 0.01, 0.3]} />
      </mesh>
    </group>
  );
}

/** 扫地机器人（氛围动画） */
export function RoboVac() {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 0.25;
    if (!ref.current) return;
    const x = Math.sin(t) * 2.6 - 0.5;
    const z = 3.6 + Math.sin(t * 2) * 0.9;
    const dx = Math.cos(t) * 2.6;
    const dz = Math.cos(t * 2) * 1.8;
    ref.current.position.set(x, 0, z);
    ref.current.rotation.y = Math.atan2(dx, dz);
  });
  return (
    <group ref={ref}>
      <mesh position={[0, 0.05, 0]} material={std('#f4f4f6', 0.3)} castShadow>
        <cylinderGeometry args={[0.2, 0.2, 0.08, 24]} />
      </mesh>
      <mesh position={[0, 0.095, 0.1]} material={glow('#3ef0ff', 2.5)}>
        <boxGeometry args={[0.08, 0.01, 0.02]} />
      </mesh>
    </group>
  );
}
