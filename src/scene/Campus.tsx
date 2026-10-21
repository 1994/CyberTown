import { LocalPointLight } from './LocalLights.tsx';
import { memo, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { StaticBatch } from './StaticBatch.tsx';
import type { ThreeEvent } from '@react-three/fiber';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import {
  BOOTHS,
  LAMPS,
  PATHS,
  PODS,
  POD_DESK_DX,
  POD_ORDER,
  PROJECT_TERMINAL,
  STREET_BENCHES,
  TREES,
  WORLD_BOUNDS,
} from '../../shared/world.ts';
import { rng } from '../../shared/rules.ts';
import { PALETTE, glow, std } from './materials.ts';
import {
  chartScreen,
  lawnTexture,
  monitorScreen,
  neonText,
  paverTexture,
  signTexture,
} from './textures.ts';
import { Chair, FloorLamp, Plant } from './Furniture.tsx';
import { useGame } from '../store.ts';
import { StreetDistrict } from './StreetDistrict.tsx';

const B = WORLD_BOUNDS;
const W = B.maxX - B.minX;
const D = B.maxZ - B.minZ;

type P3 = [number, number, number];

// ───────────────────── 地面 / 平台 / 栏杆 ─────────────────────

function PathTile({
  minX,
  maxX,
  minZ,
  maxZ,
  y,
  color,
}: {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  y: number;
  color: string;
}) {
  const w = maxX - minX;
  const d = maxZ - minZ;
  const map = useMemo(() => {
    const t = paverTexture().clone();
    t.needsUpdate = true;
    t.repeat.set(w / 2.4, d / 2.4);
    return t;
  }, [w, d]);
  return (
    <mesh
      rotation-x={-Math.PI / 2}
      position={[(minX + maxX) / 2, y, (minZ + maxZ) / 2]}
      receiveShadow
    >
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial color={color} roughness={0.8} map={map} />
    </mesh>
  );
}

function Ground({
  onGround,
}: {
  onGround: (e: ThreeEvent<MouseEvent>) => void;
}) {
  // The shared lawn texture is tuned for the original 60×44 core; keep its texel scale.
  const lawn = useMemo(() => {
    const t = lawnTexture().clone();
    t.needsUpdate = true;
    t.repeat.set((14 * W) / 60, (10 * D) / 44);
    return t;
  }, []);
  return (
    <group>
      {/* 空中园区平台 */}
      <mesh
        position={[0, -0.82, 0]}
        receiveShadow
        material={std('#17213a', 0.85, 0)}
      >
        <boxGeometry args={[W + 1.2, 1.5, D + 1.2]} />
      </mesh>
      <mesh
        rotation-x={-Math.PI / 2}
        position={[0, -0.055, 0]}
        receiveShadow
        onClick={onGround}
      >
        <planeGeometry args={[W + 1, D + 1]} />
        <meshStandardMaterial map={lawn} roughness={0.95} />
      </mesh>
      {PATHS.map((p, i) => (
        <PathTile key={i} {...p} y={-0.045 + i * 0.003} color={i >= 8 ? '#5f6d92' : '#889dbb'} />
      ))}
      {/* 广场圆形铺装 */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.015, 13]} receiveShadow>
        <circleGeometry args={[7.2, 64]} />
        <meshStandardMaterial color="#303f5d" roughness={0.75} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, 13]}>
        <ringGeometry args={[6.58, 6.66, 64]} />
        <meshBasicMaterial color="#48eeff" toneMapped={false} />
      </mesh>
      {/* 项目区深色地台 */}
      <mesh
        rotation-x={-Math.PI / 2}
        position={[18.4, -0.015, 0.2]}
        receiveShadow
      >
        <planeGeometry args={[19, 13]} />
        <meshStandardMaterial color="#26354f" roughness={0.85} />
      </mesh>
      {/* 咖啡区木平台 */}
      <mesh
        rotation-x={-Math.PI / 2}
        position={[-17.5, -0.015, 0]}
        receiveShadow
      >
        <planeGeometry args={[14, 11]} />
        <meshStandardMaterial color="#34415c" roughness={0.7} />
      </mesh>
    </group>
  );
}

/** Emissive geometry stays legible with lowfx=1 and adds no dynamic lights. */
function Wayfinding() {
  return <group>
    {PATHS.flatMap((path, index) => {
      // The front connector already lies inside the circular plaza.
      // Outer ring streets (8+) get their own curbs in StreetDistrict.
      if (index >= 7) return [];
      const w = path.maxX - path.minX;
      const d = path.maxZ - path.minZ;
      const horizontal = w > d;
      const sections = index === 0 ? [[path.minX, -6.8], [6.8, path.maxX]] : [[horizontal ? path.minX : path.minZ, horizontal ? path.maxX : path.maxZ]];
      return sections.flatMap(([from, to], section) => [-1, 1].map(side => <mesh
        key={`${index}-${section}-${side}`}
        position={horizontal
          ? [(from + to) / 2, 0.018, (path.minZ + path.maxZ) / 2 + side * (d / 2 - 0.13)]
          : [(path.minX + path.maxX) / 2 + side * (w / 2 - 0.13), 0.018, (from + to) / 2]}
        material={glow(index === 3 ? PALETTE.neonPink : PALETTE.neonCyan, 1.35)}
      ><boxGeometry args={horizontal ? [to - from, 0.018, 0.035] : [0.035, 0.018, to - from]}/></mesh>));
    })}
  </group>;
}

function Railing() {
  const post = std('#2c313d', 0.4, 0.6);
  const segs: { x: number; z: number; len: number; rot: number }[] = [
    { x: 0, z: B.minZ, len: W, rot: 0 },
    { x: 0, z: B.maxZ, len: W, rot: 0 },
    { x: B.minX, z: 0, len: D, rot: Math.PI / 2 },
    { x: B.maxX, z: 0, len: D, rot: Math.PI / 2 },
  ];
  return (
    <group>
      {segs.map((s, i) => (
        <group key={i} position={[s.x, 0, s.z]} rotation-y={s.rot}>
          <mesh position={[0, 0.55, 0]}>
            <boxGeometry args={[s.len, 1.1, 0.04]} />
            <meshPhysicalMaterial
              color="#bfe6ff"
              transparent
              opacity={0.18}
              roughness={0.1}
              depthWrite={false}
            />
          </mesh>
          <mesh position={[0, 1.12, 0]} material={post}>
            <boxGeometry args={[s.len, 0.06, 0.1]} />
          </mesh>
          <mesh
            position={[0, 0.02, 0.06]}
            material={glow(i % 2 ? PALETTE.neonPink : PALETTE.neonCyan, 1.5)}
          >
            <boxGeometry args={[s.len, 0.03, 0.02]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ───────────────────── 通用道具 ─────────────────────

function Tree({ position, seed }: { position: P3; seed: number }) {
  const r = rng(seed * 13 + 1);
  const h = 2.2 + r() * 1.2;
  const tint = r() > 0.5 ? '#3f8a45' : '#4e9c3e';
  return (
    <group position={position}>
      <mesh position={[0, h / 2, 0]} material={std('#6b4428', 0.9)} castShadow>
        <cylinderGeometry args={[0.1, 0.16, h, 7]} />
      </mesh>
      <mesh position={[0, h + 0.4, 0]} material={std(tint, 0.8)} castShadow>
        <icosahedronGeometry args={[1.05, 1]} />
      </mesh>
      <mesh
        position={[0.45, h - 0.1, 0.2]}
        material={std('#2f6b3a', 0.8)}
        castShadow
      >
        <icosahedronGeometry args={[0.65, 1]} />
      </mesh>
      <mesh
        position={[-0.4, h + 0.05, -0.3]}
        material={std('#5aa14a', 0.8)}
        castShadow
      >
        <icosahedronGeometry args={[0.6, 1]} />
      </mesh>
    </group>
  );
}

function StreetLamp({ position, light }: { position: P3; light?: boolean }) {
  return (
    <group position={position}>
      <mesh position={[0, 1.6, 0]} material={std('#2c313d', 0.4, 0.6)}>
        <cylinderGeometry args={[0.05, 0.08, 3.2, 8]} />
      </mesh>
      <mesh position={[0, 3.25, 0]} material={glow(PALETTE.warmLight, 2.6)}>
        <sphereGeometry args={[0.2, 12, 8]} />
      </mesh>
      {light && (
        <LocalPointLight
          position={[0, 3, 0]}
          color={PALETTE.warmLight}
          intensity={14}
          distance={9}
          decay={2}
        />
      )}
    </group>
  );
}

function Bench({
  position,
  rotation = 0,
}: {
  position: P3;
  rotation?: number;
}) {
  const wood = std('#3c506b', 0.6);
  const metal = std('#2c313d', 0.4, 0.6);
  return (
    <group position={position} rotation-y={rotation}>
      {[0, 1, 2].map((i) => (
        <mesh
          key={i}
          position={[0, 0.45, -0.18 + i * 0.16]}
          material={wood}
          castShadow
        >
          <boxGeometry args={[1.9, 0.05, 0.12]} />
        </mesh>
      ))}
      <mesh
        position={[0, 0.75, -0.3]}
        rotation-x={-0.2}
        material={wood}
        castShadow
      >
        <boxGeometry args={[1.9, 0.3, 0.05]} />
      </mesh>
      {[-0.8, 0.8].map((x) => (
        <mesh key={x} position={[x, 0.22, 0]} material={metal}>
          <boxGeometry args={[0.06, 0.45, 0.5]} />
        </mesh>
      ))}
    </group>
  );
}

function Sign({
  position,
  text,
  color,
  rotation = 0,
  width = 3.2,
}: {
  position: P3;
  text: string;
  color: string;
  rotation?: number;
  width?: number;
}) {
  const tex = signTexture(text, color);
  return (
    <group position={position} rotation-y={rotation}>
      {[-width / 2 + 0.15, width / 2 - 0.15].map((x) => (
        <mesh
          key={x}
          position={[x, 1.2, 0]}
          material={std('#2c313d', 0.4, 0.6)}
        >
          <cylinderGeometry args={[0.05, 0.05, 2.4, 6]} />
        </mesh>
      ))}
      <mesh position={[0, 2.3, 0]}>
        <planeGeometry args={[width, width / 4]} />
        <meshBasicMaterial
          map={tex}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

// ───────────────────── 共享广场 ─────────────────────

function Plaza() {
  const water = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    if (water.current)
      water.current.emissiveIntensity =
        0.5 + Math.sin(clock.elapsedTime * 2) * 0.12;
  });
  return (
    <group>
      <group position={[0, 0, 16]}>
        <mesh
          position={[0, 0.25, 0]}
          material={std('#5a6f89', 0.5)}
          castShadow
          receiveShadow
        >
          <cylinderGeometry args={[2.1, 2.2, 0.5, 40]} />
        </mesh>
        <mesh position={[0, 0.46, 0]} rotation-x={-Math.PI / 2}>
          <circleGeometry args={[1.85, 40]} />
          <meshStandardMaterial
            ref={water}
            color="#67c5c0"
            emissive="#7fcfcb"
            emissiveIntensity={0.1}
            roughness={0.2}
            metalness={0.15}
          />
        </mesh>
        <mesh position={[0, 1.0, 0]} material={std('#5a6f89', 0.5)} castShadow>
          <cylinderGeometry args={[0.25, 0.4, 1.1, 16]} />
        </mesh>
        <mesh position={[0, 1.7, 0]} material={std('#e9bf65', 0.3, 0.5)}>
          <sphereGeometry args={[0.35, 16, 12]} />
        </mesh>
        <LocalPointLight
          position={[0, 1.6, 0]}
          color="#7fe8ff"
          intensity={10}
          distance={8}
          decay={2}
        />
      </group>
      <Bench position={[-5.2, 0, 16.6]} rotation={Math.PI / 2 - 0.4} />
      <Bench position={[5.2, 0, 16.6]} rotation={-Math.PI / 2 + 0.4} />
      <Bench position={[-5.2, 0, 9.0]} rotation={0} />
      <Bench position={[5.6, 0, 8.6]} rotation={0} />
      <Plant position={[-3.4, 0, 19]} seed={41} pot={PALETTE.terracotta} />
      <Plant position={[3.4, 0, 19]} seed={42} pot={PALETTE.terracotta} />
      <mesh position={[0, 3.2, 21.3]}>
        <planeGeometry args={[12, 3]} />
        <meshBasicMaterial
          map={neonText([
            { text: '今天老板给我打工', color: '#66f4ff', size: 104 },
            { text: '工作交给老板，快乐留给自己', color: '#ffa0e0', size: 46 },
          ])}
          transparent
          toneMapped={false}
          color={new THREE.Color(1.8, 1.8, 1.8)}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

// ───────────────────── 咖啡社交区 ─────────────────────

function CafeTable({ position }: { position: P3 }) {
  const r = rng(Math.round(position[0] * 10 + position[2]));
  const umb = ['#ff8fb8', '#ffd166', '#5ec8ff', '#7dffa8'][Math.floor(r() * 4)];
  return (
    <group position={position}>
      <mesh
        position={[0, 0.72, 0]}
        material={std('#61738b', 0.35)}
        castShadow
        receiveShadow
      >
        <cylinderGeometry args={[0.5, 0.5, 0.05, 24]} />
      </mesh>
      <mesh position={[0, 0.36, 0]} material={std('#2c313d', 0.4, 0.6)}>
        <cylinderGeometry args={[0.04, 0.2, 0.72, 10]} />
      </mesh>
      <mesh position={[0, 1.4, 0]} material={std('#2c313d', 0.4, 0.6)}>
        <cylinderGeometry args={[0.025, 0.025, 1.4, 6]} />
      </mesh>
      <mesh
        position={[0, 2.15, 0]}
        material={std(umb, 0.7, 0, { side: THREE.DoubleSide })}
        castShadow
      >
        <coneGeometry args={[1.25, 0.45, 8, 1, true]} />
      </mesh>
      {[0, 1, 2].map((i) => {
        const a = (i / 3) * Math.PI * 2 + 0.4;
        return (
          <Chair
            key={i}
            position={[Math.sin(a) * 0.85, 0, Math.cos(a) * 0.85]}
            rotation={a + Math.PI}
            color={PALETTE.fabricMustard}
          />
        );
      })}
      <mesh position={[0.1, 0.8, 0.1]} material={std('#ffffff', 0.3)}>
        <cylinderGeometry args={[0.05, 0.04, 0.1, 10]} />
      </mesh>
    </group>
  );
}

function StringLights({ from, to }: { from: P3; to: P3 }) {
  const bulbs = useMemo(() => {
    const n = 14;
    return Array.from({ length: n + 1 }, (_, i) => {
      const t = i / n;
      return [
        from[0] + (to[0] - from[0]) * t,
        from[1] + (to[1] - from[1]) * t - Math.sin(t * Math.PI) * 0.6,
        from[2] + (to[2] - from[2]) * t,
      ] as P3;
    });
  }, [from, to]);
  return (
    <group>
      {bulbs.map((p, i) => (
        <mesh
          key={i}
          position={p}
          material={glow(i % 2 ? '#ffd166' : '#ff8fb8', 2.4)}
        >
          <sphereGeometry args={[0.07, 8, 6]} />
        </mesh>
      ))}
    </group>
  );
}

function CoffeeZone() {
  const stripe = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 16;
    const g = c.getContext('2d')!;
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? '#ffffff' : '#ff6fa8';
      g.fillRect(i * 16, 0, 16, 16);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  return (
    <group>
      {/* 咖啡亭 */}
      <group position={[-22.5, 0, -1]}>
        <RoundedBox
          args={[4.2, 2.6, 3.2]}
          radius={0.08}
          position={[0, 1.3, 0]}
          material={std('#35435e', 0.7)}
          castShadow
          receiveShadow
        />
        <mesh position={[0, 2.75, 1.85]} rotation-x={0.45}>
          <boxGeometry args={[4.4, 0.05, 1.3]} />
          <meshStandardMaterial map={stripe} roughness={0.7} />
        </mesh>
        <RoundedBox
          args={[3.6, 1.0, 0.5]}
          radius={0.04}
          position={[0, 0.5, 1.7]}
          material={std(PALETTE.walnut, 0.5)}
          castShadow
        />
        <mesh position={[0, 1.6, 1.61]}>
          <planeGeometry args={[3.2, 0.9]} />
          <meshBasicMaterial
            color={new THREE.Color('#ffe2b0').multiplyScalar(1.3)}
            toneMapped={false}
          />
        </mesh>
        <mesh position={[0, 3.35, 0.4]}>
          <planeGeometry args={[4, 1]} />
          <meshBasicMaterial
            map={neonText([
              { text: '续命咖啡', color: PALETTE.neonPink, size: 150 },
            ])}
            transparent
            toneMapped={false}
            color={new THREE.Color(2, 2, 2)}
            depthWrite={false}
          />
        </mesh>
        <LocalPointLight
          position={[0, 2.2, 3]}
          color="#ffb38a"
          intensity={12}
          distance={9}
          decay={2}
        />
      </group>
      <CafeTable position={[-15, 0, 2.6]} />
      <CafeTable position={[-18.4, 0, 3.8]} />
      <CafeTable position={[-14.2, 0, -2.6]} />
      <CafeTable position={[-17.6, 0, -3.6]} />
      <StringLights from={[-24.4, 3.2, 4.8]} to={[-11, 3.2, 4.8]} />
      <StringLights from={[-24.4, 3.2, -4.8]} to={[-11, 3.2, -4.8]} />
      {[-24.4, -11].flatMap((x) =>
        [4.8, -4.8].map((z) => (
          <mesh
            key={`${x}${z}`}
            position={[x, 1.6, z]}
            material={std('#2c313d', 0.4, 0.6)}
          >
            <cylinderGeometry args={[0.05, 0.05, 3.2, 6]} />
          </mesh>
        )),
      )}
      <Sign
        position={[-11.6, 0, 7.4]}
        text="午后咖啡馆"
        color="#e57bd1"
        rotation={0.3}
      />
    </group>
  );
}

// ───────────────────── 人才街 ─────────────────────

const BOOTH_COLORS = [
  '#ff7a3d',
  '#3db8ff',
  '#ff5fa2',
  '#7ad151',
  '#b18cff',
  '#ffd166',
  '#5ee1ff',
  '#ff6b6b',
  '#9be26a',
  '#ff8fb8',
];

function Booth({
  position,
  rotation,
  color,
  index,
}: {
  position: P3;
  rotation: number;
  color: string;
  index: number;
}) {
  return (
    <group position={position} rotation-y={rotation}>
      <RoundedBox
        args={[2.6, 0.95, 1.2]}
        radius={0.05}
        position={[0, 0.475, 0]}
        material={std('#3a4b65', 0.6)}
        castShadow
        receiveShadow
      />
      <mesh position={[0, 0.5, 0.61]} material={std(color, 0.6)}>
        <boxGeometry args={[2.5, 0.5, 0.02]} />
      </mesh>
      {[-1.2, 1.2].map((x) => (
        <mesh
          key={x}
          position={[x, 1.4, -0.45]}
          material={std('#2c313d', 0.4, 0.6)}
        >
          <cylinderGeometry args={[0.04, 0.04, 2.8, 6]} />
        </mesh>
      ))}
      <mesh
        position={[0, 2.6, 0.1]}
        rotation-x={0.35}
        material={std(color, 0.7, 0, { side: THREE.DoubleSide })}
        castShadow
      >
        <boxGeometry args={[2.8, 0.06, 1.5]} />
      </mesh>
      <mesh position={[0, 2.05, -0.44]}>
        <planeGeometry args={[2.3, 0.55]} />
        <meshBasicMaterial
          map={signTexture(`人才 ${index + 1} 号摊`, color)}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

function TalentStreet() {
  const north = [-25, -21, -17, -13, -9.5];
  const bossAway = useGame(
    (s) => !!s.snapshot?.colleagues.find((c) => c.id === 'c-zhang')?.ownerId,
  );
  return (
    <StaticBatch worldStatic>
      {north.map((x, i) => (
        <Booth
          key={'n' + x}
          position={[x, 0, -9.6]}
          rotation={0}
          color={BOOTH_COLORS[i]}
          index={i}
        />
      ))}
      {north.map((x, i) => (
        <Booth
          key={'s' + x}
          position={[x + 1.6, 0, -16.4]}
          rotation={Math.PI}
          color={BOOTH_COLORS[i + 5]}
          index={i + 5}
        />
      ))}
      {/* 街口拱门 */}
      <group position={[-5.4, 0, -13]} rotation-y={Math.PI / 2}>
        {[-1.7, 1.7].map((x) => (
          <mesh
            key={x}
            position={[x, 1.7, 0]}
            material={std('#2c313d', 0.4, 0.6)}
          >
            <boxGeometry args={[0.2, 3.4, 0.2]} />
          </mesh>
        ))}
        <mesh position={[0, 3.5, 0]}>
          <planeGeometry args={[4, 1]} />
          <meshBasicMaterial
            map={neonText([
              { text: '人才街 · 自愿挂牌', color: '#7dffa8', size: 120 },
            ])}
            transparent
            toneMapped={false}
            color={new THREE.Color(2, 2, 2)}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>
      {BOOTHS.map((b, i) => (
        <mesh
          key={i}
          visible={i !== 0 || !bossAway}
          rotation-x={-Math.PI / 2}
          position={[b.x, 0.004, b.z]}
        >
          <ringGeometry args={[0.45, 0.55, 28]} />
          <meshBasicMaterial
            color={new THREE.Color('#7dffa8').multiplyScalar(1.4)}
            toneMapped={false}
            transparent
            opacity={0.7}
          />
        </mesh>
      ))}
    </StaticBatch>
  );
}

// ───────────────────── 项目区 ─────────────────────

function PodDesk({
  position,
  hue,
  seed,
}: {
  position: P3;
  hue: number;
  seed: number;
}) {
  const scr = monitorScreen(seed, hue);
  return (
    <group position={position}>
      <RoundedBox
        args={[1.9, 0.07, 0.95]}
        radius={0.025}
        position={[0, 0.75, 0]}
        material={std(PALETTE.oak, 0.45)}
        castShadow
        receiveShadow
      />
      {[-0.85, 0.85].map((x) => (
        <mesh
          key={x}
          position={[x, 0.37, 0]}
          material={std(PALETTE.metal, 0.35, 0.6)}
        >
          <boxGeometry args={[0.06, 0.74, 0.8]} />
        </mesh>
      ))}
      <group position={[-0.5, 0.79, 0.12]} rotation-y={0.3}>
        <RoundedBox
          args={[0.8, 0.46, 0.04]}
          radius={0.015}
          position={[0, 0.4, 0]}
          material={std('#1a1d26', 0.3, 0.5)}
          castShadow
        />
        <mesh position={[0, 0.4, -0.022]} rotation-y={Math.PI}>
          <planeGeometry args={[0.74, 0.4]} />
          <meshStandardMaterial
            color="#111"
            emissive="#ffffff"
            emissiveMap={scr}
            emissiveIntensity={1.1}
          />
        </mesh>
        <mesh position={[0, 0.12, 0]} material={std(PALETTE.metal, 0.35, 0.6)}>
          <boxGeometry args={[0.04, 0.24, 0.04]} />
        </mesh>
      </group>
      <Chair position={[0, 0, -0.8]} color={PALETTE.fabricBlue} />
    </group>
  );
}

function ProjectZone() {
  const owners = useGame(useShallow(s => POD_ORDER.flatMap(id => {
    const p = s.snapshot?.players.find(player => player.id === id);
    return [p?.name ?? id, p?.color ?? '#5ee1ff'];
  })));
  return (
    <StaticBatch worldStatic>
      {PODS.map((p, i) => {
        const name = owners[i * 2];
        const color = owners[i * 2 + 1];
        return (
          <group key={i}>
            {POD_DESK_DX.map((dx, k) => (
              <PodDesk
                key={k}
                position={[p.x + dx, 0, p.z]}
                hue={[200, 160, 280, 30][i]}
                seed={60 + i * 3 + k}
              />
            ))}
            <mesh position={[p.x, 1.3, p.z + 0.5]} material={glow(color, 1.4)}>
              <boxGeometry args={[6.4, 0.03, 0.03]} />
            </mesh>
            <mesh position={[p.x - 3.6, 1.0, p.z]} rotation-y={Math.PI / 2}>
              <planeGeometry args={[1.6, 0.4]} />
              <meshBasicMaterial
                map={signTexture(
                  `${name}的工位组`,
                  color,
                )}
                toneMapped={false}
                side={THREE.DoubleSide}
              />
            </mesh>
          </group>
        );
      })}
      {/* 项目终端 */}
      <group position={[PROJECT_TERMINAL.x, 0, PROJECT_TERMINAL.z]}>
        <RoundedBox
          args={[1.4, 1.1, 0.9]}
          radius={0.06}
          position={[0, 0.55, 0]}
          material={std('#1f2433', 0.4, 0.4)}
          castShadow
        />
        <mesh position={[0, 1.35, 0.1]} rotation-x={-0.5}>
          <planeGeometry args={[1.2, 0.7]} />
          <meshBasicMaterial
            color={new THREE.Color('#ff6b6b').multiplyScalar(1.6)}
            toneMapped={false}
          />
        </mesh>
        <mesh position={[0, 2.5, 0]}>
          <planeGeometry args={[3.2, 0.8]} />
          <meshBasicMaterial
            map={neonText([
              { text: '老板来接招', color: '#f4bd67', size: 130 },
            ])}
            transparent
            toneMapped={false}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.005, 0]}>
          <ringGeometry args={[1.3, 1.45, 40]} />
          <meshBasicMaterial
            color={new THREE.Color('#ff6b6b').multiplyScalar(1.5)}
            toneMapped={false}
          />
        </mesh>
        <LocalPointLight
          position={[0, 2, 1]}
          color="#ff6b6b"
          intensity={10}
          distance={7}
          decay={2}
        />
      </group>
      {/* LED 大屏 */}
      <group position={[28, 0, 0]}>
        <mesh position={[0, 2.2, 0]} material={std('#1a1d26', 0.4, 0.5)}>
          <boxGeometry args={[0.6, 4.4, 10]} />
        </mesh>
        <mesh position={[-0.31, 2.4, 0]} rotation-y={-Math.PI / 2}>
          <planeGeometry args={[9.4, 3.8]} />
          <meshBasicMaterial map={chartScreen()} toneMapped={false} />
        </mesh>
      </group>
      <Sign
        position={[11.4, 0, 7.6]}
        text="小游戏俱乐部"
        color="#dc9bfc"
        rotation={-0.3}
      />
    </StaticBatch>
  );
}

// ───────────────────── 露台花园 / 路演台 / 野餐草坪 ─────────────────────

function Garden() {
  const flowers = useMemo(() => {
    const r = rng(88);
    return Array.from({ length: 70 }, () => ({
      x: (r() - 0.5) * 3,
      z: (r() - 0.5) * 1.2,
      c: ['#ff8fb8', '#ffd166', '#ffffff', '#b18cff', '#ff6b6b'][
        Math.floor(r() * 5)
      ],
    }));
  }, []);
  return (
    <group>
      <mesh
        rotation-x={-Math.PI / 2}
        position={[18.5, -0.015, -14]}
        receiveShadow
      >
        <planeGeometry args={[18, 13]} />
        <meshStandardMaterial color="#4f8a45" roughness={0.95} />
      </mesh>
      {/* 水池 */}
      <group position={[18, 0, -13.2]}>
        <mesh
          position={[0, 0.12, 0]}
          material={std('#4c6080', 0.6)}
          receiveShadow
        >
          <cylinderGeometry args={[2.5, 2.6, 0.24, 40]} />
        </mesh>
        <mesh position={[0, 0.25, 0]} rotation-x={-Math.PI / 2}>
          <circleGeometry args={[2.25, 40]} />
          <meshStandardMaterial
            color="#1d6f9a"
            emissive="#2a9fd6"
            emissiveIntensity={0.35}
            roughness={0.08}
            metalness={0.4}
          />
        </mesh>
        {[0, 1, 2].map((i) => (
          <mesh
            key={i}
            position={[Math.cos(i * 2.1) * 1.2, 0.28, Math.sin(i * 2.1) * 1.2]}
            rotation-x={-Math.PI / 2}
            material={std('#5aa14a', 0.7)}
          >
            <circleGeometry args={[0.28, 12]} />
          </mesh>
        ))}
      </group>
      {/* 花坛 */}
      {[13, 23.5].map((x) => (
        <group key={x} position={[x, 0, -10]}>
          <RoundedBox
            args={[3.2, 0.45, 1.4]}
            radius={0.06}
            position={[0, 0.22, 0]}
            material={std('#4c335d', 0.7)}
            castShadow
            receiveShadow
          />
          {flowers.map((f, i) => (
            <mesh key={i} position={[f.x, 0.52, f.z]} material={std(f.c, 0.6)}>
              <sphereGeometry args={[0.08, 6, 5]} />
            </mesh>
          ))}
        </group>
      ))}
      {/* 花廊 */}
      <group position={[18, 0, -17.6]}>
        {[-3, -1, 1, 3].map((x) => (
          <mesh
            key={x}
            position={[x, 1.4, 0.5]}
            material={std('#35435e', 0.7)}
            castShadow
          >
            <boxGeometry args={[0.14, 2.8, 0.14]} />
          </mesh>
        ))}
        {[-0.9, -0.3, 0.3, 0.9].map((z) => (
          <mesh key={z} position={[0, 2.85, z]} material={std('#35435e', 0.7)}>
            <boxGeometry args={[7, 0.1, 0.1]} />
          </mesh>
        ))}
        {[-2.5, -0.8, 0.8, 2.5].map((x) => (
          <mesh key={x} position={[x, 2.95, 0]} material={std('#5aa14a', 0.8)}>
            <icosahedronGeometry args={[0.55, 1]} />
          </mesh>
        ))}
        <Bench position={[-1.6, 0, 0]} rotation={Math.PI} />
        <Bench position={[1.6, 0, 0]} rotation={Math.PI} />
      </group>
      <Sign
        position={[20.6, 0, -7.6]}
        text="🌿 露台花园"
        color="#3f7f3a"
        rotation={-0.2}
      />
    </group>
  );
}

function Stage() {
  return (
    <group position={[22, 0, 16.5]}>
      <RoundedBox
        args={[7, 0.5, 3]}
        radius={0.08}
        position={[0, 0.25, 0]}
        material={std('#2a2f45', 0.5, 0.2)}
        castShadow
        receiveShadow
      />
      <mesh position={[0, 0.52, 1.51]} material={glow(PALETTE.neonPink, 1.6)}>
        <boxGeometry args={[7, 0.04, 0.02]} />
      </mesh>
      <mesh position={[0, 2.6, -1.4]}>
        <planeGeometry args={[6, 1.5]} />
        <meshBasicMaterial
          map={neonText([
            { text: '年终派对 · 今天你最大', color: '#ffd166', size: 110 },
          ])}
          transparent
          toneMapped={false}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <FloorLamp position={[-3.8, 0, -1]} />
      <FloorLamp position={[3.8, 0, -1]} />
    </group>
  );
}

function Picnic() {
  return (
    <group>
      {[
        [-19, 16, '#ff8fb8'],
        [-24, 13.5, '#ffd166'],
        [-14.5, 16.5, '#5ec8ff'],
      ].map(([x, z, c]) => (
        <group key={String(x)} position={[x as number, 0.006, z as number]}>
          <mesh rotation-x={-Math.PI / 2}>
            <planeGeometry args={[2.2, 1.6]} />
            <meshStandardMaterial color={c as string} roughness={0.95} />
          </mesh>
          <mesh position={[0.4, 0.1, 0.2]} material={std('#a0522d', 0.7)}>
            <boxGeometry args={[0.4, 0.2, 0.3]} />
          </mesh>
        </group>
      ))}
      <Sign
        position={[-9.6, 0, 18.8]}
        text="🧺 野餐草坪"
        color="#6a8f2f"
        rotation={0.4}
        width={2.8}
      />
    </group>
  );
}

// ───────────────────── 汇总 ─────────────────────

export const Campus = memo(function Campus({
  onGround,
}: {
  onGround: (e: ThreeEvent<MouseEvent>) => void;
}) {
  return (
    <group>
      <Ground onGround={onGround} />
      <StaticBatch worldStatic>
        <Wayfinding />
        <Railing />
        <Plaza />
        <CoffeeZone />
        <Garden />
        <Stage />
        <Picnic />
        {TREES.map(([x, z], i) => (
          <Tree key={i} position={[x, 0, z]} seed={i} />
        ))}
        {STREET_BENCHES.map(([x, z]) => (
          <Bench key={`${x},${z}`} position={[x, 0, z]} rotation={z > 0 && Math.abs(x) < 20 ? Math.PI : 0} />
        ))}
        {LAMPS.map(([x, z], i) => (
          <StreetLamp key={i} position={[x, 0, z]} light={i % 4 === 0} />
        ))}
      </StaticBatch>
      <StreetDistrict />
      <TalentStreet />
      <ProjectZone />
    </group>
  );
});
