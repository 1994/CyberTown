import { useMemo } from 'react';
import * as THREE from 'three';
import {
  CIVIC_POSTS, EXPANSION_FENCE, GATE_POST_Z, TOWN_GATES, TOWN_SHOPHOUSES, TOWN_STREETS, type DistrictId, type Shophouse,
} from '../../shared/townPlan.ts';
import { WORLD_BOUNDS } from '../../shared/world.ts';
import { useGame } from '../store.ts';
import { glow, std } from './materials.ts';
import { StaticBatch } from './StaticBatch.tsx';
import { neonText } from './textures.ts';

// 小镇街区美术：街屋围合、区界门楼、街面色调、社区中心凉棚、北区围挡、外围低层屋顶。
// 全部静态合批，不加实时灯；占地与 shared/townPlan.ts 一致（碰撞在 world.ts）。

/** 当前是否小镇游戏（登录背景保持旧园区）。 */
export const useTownMode = () => useGame(s => s.phase === 'game');

const PALETTE: Record<DistrictId, { walls: string[]; awning: [string, string]; window: string; sign: string; trim: string }> = {
  commerce: { walls: ['#3a2f36', '#33333f', '#3b3130', '#2f3442'], awning: ['#ffb347', '#ff5f8f'], window: '#ffcf8a', sign: '#ffd08a', trim: '#ff9f43' },
  leisure: { walls: ['#2b2a46', '#24324a', '#302848', '#22303f'], awning: ['#b18bff', '#3ef0ff'], window: '#c9b6ff', sign: '#9ef8ff', trim: '#b18bff' },
  plaza: { walls: ['#2d3a44'], awning: ['#ffd166', '#fff3e6'], window: '#ffe2b0', sign: '#ffd166', trim: '#ffd166' },
  expansion: { walls: ['#2a2f3a'], awning: ['#6f7d99', '#2a2f3a'], window: '#8d9bb8', sign: '#8d9bb8', trim: '#6f7d99' },
};

const stripeCache = new Map<string, THREE.CanvasTexture>();
function stripes(a: string, b: string) {
  const key = a + b;
  let t = stripeCache.get(key);
  if (!t) {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 16;
    const g = c.getContext('2d')!;
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? b : a; g.fillRect(i * 16, 0, 16, 16); }
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    stripeCache.set(key, t);
  }
  return t;
}

function Neon({ text, color, w, h, size = 150, position, rotation, single = false }: { text: string; color: string; w: number; h: number; size?: number; position: [number, number, number]; rotation?: [number, number, number]; single?: boolean }) {
  return <mesh position={position} rotation={rotation}>
    <planeGeometry args={[w, h]} />
    <meshBasicMaterial map={neonText([{ text, color, size }])} transparent toneMapped={false} color={new THREE.Color(1.8, 1.8, 1.8)} depthWrite={false} side={single ? THREE.FrontSide : THREE.DoubleSide} />
  </mesh>;
}

/** 一栋街屋：主体 + 错落屋顶 + 门脸（窗、门、雨棚/灯带、招牌）。门脸朝 face 方向。 */
function House({ h, i }: { h: Shophouse; i: number }) {
  const P = PALETTE[h.district];
  const wall = P.walls[i % P.walls.length];
  const awning = useMemo(() => stripes(P.awning[0], P.awning[1]), [P]);
  const f = h.face;
  const front = (h.d / 2) * f;
  const step = i % 2 ? 0.5 : 0.9;
  const commerce = h.district === 'commerce';
  return <group position={[h.x, 0, h.z]}>
    <mesh position={[0, h.h / 2, 0]} material={std(wall, 0.75, 0.15)} castShadow receiveShadow><boxGeometry args={[h.w, h.h, h.d]} /></mesh>
    {/* 错落屋顶：檐口 + 后退的小阁楼/水箱 */}
    <mesh position={[0, h.h + 0.06, 0]} material={std('#151b24', 0.5, 0.5)}><boxGeometry args={[h.w + 0.16, 0.12, h.d + 0.16]} /></mesh>
    <mesh position={[(i % 3 - 1) * h.w * 0.2, h.h + step / 2 + 0.1, -f * h.d * 0.18]} material={std('#222a36', 0.7, 0.2)}><boxGeometry args={[h.w * 0.45, step, h.d * 0.45]} /></mesh>
    {i % 2 === 0 && <mesh position={[h.w * 0.32, h.h + 0.45, -f * h.d * 0.25]} material={std('#3c4654', 0.5, 0.6)}><cylinderGeometry args={[0.28, 0.28, 0.7, 10]} /></mesh>}
    {/* 门脸：暖窗 + 门 */}
    <mesh position={[-h.w * 0.18, 1.15, front + f * 0.011]} rotation-y={f > 0 ? 0 : Math.PI}>
      <planeGeometry args={[h.w * 0.5, 1.1]} />
      <meshBasicMaterial color={new THREE.Color(P.window).multiplyScalar(1.15)} toneMapped={false} />
    </mesh>
    <mesh position={[h.w * 0.3, 0.95, front + f * 0.02]} material={std('#0e151b', 0.4, 0.5)}><boxGeometry args={[0.8, 1.9, 0.04]} /></mesh>
    {/* 商业：条纹雨棚；娱乐：门楣灯带 */}
    {commerce
      ? <mesh position={[0, 2.1, front + f * 0.42]} rotation-x={f * 0.42}><boxGeometry args={[h.w * 0.92, 0.04, 0.9]} /><meshStandardMaterial map={awning} roughness={0.7} /></mesh>
      : <mesh position={[0, 2.05, front + f * 0.05]} material={glow(i % 2 ? P.awning[0] : P.awning[1], 1.8)}><boxGeometry args={[h.w * 0.92, 0.06, 0.06]} /></mesh>}
    {/* 招牌 */}
    <mesh position={[0, Math.min(h.h - 0.35, 2.55), front + f * 0.03]} material={std('#0b1016', 0.5, 0.4)}><boxGeometry args={[Math.min(h.w * 0.7, 2.4), 0.42, 0.06]} /></mesh>
    <Neon text={h.sign} color={P.sign} w={Math.min(h.w * 0.68, 2.3)} h={0.4} size={150} position={[0, Math.min(h.h - 0.35, 2.55), front + f * 0.07]} rotation={[0, f > 0 ? 0 : Math.PI, 0]} />
    {/* 背墙空调与管线：生活细节（不外伸进巷道） */}
    <mesh position={[h.w * 0.25, 1.9, -front - f * 0.13]} material={std('#5a6370', 0.5, 0.4)}><boxGeometry args={[0.6, 0.4, 0.24]} /></mesh>
    <mesh position={[-h.w / 2 + 0.06, h.h / 2, -front - f * 0.04]} material={std('#3a4350', 0.4, 0.6)}><boxGeometry args={[0.06, h.h, 0.06]} /></mesh>
  </group>;
}

/** 区界门楼：一侧借用既有路灯杆（x, 9.4），另一侧新柱（x, GATE_POST_Z）。 */
function Gate({ x, text, district }: { x: number; text: string; district: DistrictId }) {
  const c = PALETTE[district].trim;
  const mid = (9.4 + GATE_POST_Z) / 2;
  return <group>
    <mesh position={[x, 2, GATE_POST_Z]} material={std('#1a232b', 0.5, 0.5)}><cylinderGeometry args={[0.09, 0.09, 4, 8]} /></mesh>
    <mesh position={[x, 3.9, mid]} material={std('#141b22', 0.4, 0.6)}><boxGeometry args={[0.14, 0.14, GATE_POST_Z - 9.4 + 0.3]} /></mesh>
    <mesh position={[x, 4.25, mid]} material={std('#0b1016', 0.5, 0.4)}><boxGeometry args={[0.08, 0.6, 2.6]} /></mesh>
    {/* 两面各一张单面字牌，从广场或街内看都不镜像 */}
    <Neon text={text} color={c} w={2.5} h={0.58} position={[x + 0.05, 4.25, mid]} rotation={[0, Math.PI / 2, 0]} single />
    <Neon text={text} color={c} w={2.5} h={0.58} position={[x - 0.05, 4.25, mid]} rotation={[0, -Math.PI / 2, 0]} single />
    <mesh position={[x, 3.82, mid]} material={glow(c, 1.6)}><boxGeometry args={[0.04, 0.03, GATE_POST_Z - 9.4]} /></mesh>
  </group>;
}

/** 街面色调：主街分区着色 + 人行道 + 斑马线 + 地面街名。 */
function StreetFloor() {
  const lane = (minX: number, maxX: number, color: string) => <group>
    <mesh rotation-x={-Math.PI / 2} position={[(minX + maxX) / 2, 0.006, 11.2]}>
      <planeGeometry args={[maxX - minX, 2.8]} />
      <meshBasicMaterial color={color} transparent opacity={0.07} depthWrite={false} />
    </mesh>
    {[9.86, 12.54].map(z => <mesh key={z} position={[(minX + maxX) / 2, 0.02, z]} material={glow(color, 1.3)}><boxGeometry args={[maxX - minX, 0.02, 0.05]} /></mesh>)}
  </group>;
  const walk = (minX: number, maxX: number, z: number, d: number) => <mesh rotation-x={-Math.PI / 2} position={[(minX + maxX) / 2, 0.004, z]} receiveShadow>
    <planeGeometry args={[maxX - minX, d]} />
    <meshStandardMaterial color="#3d4a63" roughness={0.8} />
  </mesh>;
  const zebra = (x: number) => <group>
    {Array.from({ length: 6 }, (_, k) => <mesh key={k} rotation-x={-Math.PI / 2} position={[x - 1.25 + k * 0.5, 0.012, 11.2]}>
      <planeGeometry args={[0.28, 2.4]} />
      <meshBasicMaterial color="#d9e4f2" transparent opacity={0.55} depthWrite={false} />
    </mesh>)}
  </group>;
  // 大区地面淡色：商业暖、娱乐紫，避免整块同色地台
  const tint = (minX: number, maxX: number, color: string) => <mesh rotation-x={-Math.PI / 2} position={[(minX + maxX) / 2, 0.002, 0]}>
    <planeGeometry args={[maxX - minX, 64]} />
    <meshBasicMaterial color={color} transparent opacity={0.05} depthWrite={false} />
  </mesh>;
  return <group>
    {tint(-44.5, -9, PALETTE.commerce.trim)}
    {tint(9, 44.5, PALETTE.leisure.trim)}
    {lane(-29, -9, PALETTE.commerce.trim)}
    {lane(9, 29, PALETTE.leisure.trim)}
    {walk(-28.4, -9, 13.2, 1.2)}{walk(-29, -19.6, 9.2, 1.2)}
    {walk(9.4, 17.6, 13.2, 1.2)}{walk(20, 28.2, 9.2, 1.2)}
    {zebra(-17)}{zebra(18)}
    {TOWN_STREETS.filter(s => s.name === '商业街' || s.name === '娱乐街').map(s =>
      <mesh key={s.name} rotation-x={-Math.PI / 2} position={[s.x + (s.x < 0 ? -5 : 5), 0.016, s.z]}>
        <planeGeometry args={[4.2, 1.05]} />
        <meshBasicMaterial map={neonText([{ text: s.name, color: PALETTE[s.district].trim, size: 170 }])} transparent opacity={0.55} toneMapped={false} depthWrite={false} />
      </mesh>)}
  </group>;
}

/** 社区中心：在原开放办公室占地上加凉棚格栅与门头（碰撞不变，格栅镂空不挡视线）。 */
function CivicCenter() {
  const beam = std('#1b2530', 0.45, 0.55);
  return <group>
    {CIVIC_POSTS.map(([x, z]) => <mesh key={x} position={[x, 1.85, z]} material={beam}><cylinderGeometry args={[0.1, 0.1, 3.7, 8]} /></mesh>)}
    <mesh position={[0, 3.7, 6.1]} material={beam}><boxGeometry args={[16.8, 0.22, 0.22]} /></mesh>
    <mesh position={[0, 3.7, -5.95]} material={beam}><boxGeometry args={[16.8, 0.16, 0.16]} /></mesh>
    {[-6, -3, 0, 3, 6].map(x => <mesh key={x} position={[x, 3.78, 0.08]} material={beam}><boxGeometry args={[0.1, 0.1, 12.1]} /></mesh>)}
    {[-8.3, 8.3].map(x => <mesh key={x} position={[x, 3.7, 0.08]} material={beam}><boxGeometry args={[0.16, 0.16, 12.1]} /></mesh>)}
    <mesh position={[0, 3.62, 6.22]} material={glow('#ffd166', 1.5)}><boxGeometry args={[16.4, 0.04, 0.04]} /></mesh>
    <mesh position={[0, 4.25, 6.12]} material={std('#0b1016', 0.5, 0.4)}><boxGeometry args={[3.6, 0.7, 0.1]} /></mesh>
    <Neon text="社区中心" color="#ffd166" w={3.4} h={0.66} position={[0, 4.25, 6.2]} />
    {/* 原办公家具保留碰撞，改作社区用途的吊牌 */}
    {([['议事厅', -5.1, 2.55]] as const).map(([t, x, z]) =>
      <group key={t}>
        <mesh position={[x, 3.2, z]} material={std('#0b1016', 0.5, 0.4)}><boxGeometry args={[1.3, 0.36, 0.05]} /></mesh>
        <Neon text={t} color="#9ef8ff" w={1.2} h={0.32} size={150} position={[x, 3.2, z + 0.04]} />
        <mesh position={[x, 3.5, z]} material={beam}><boxGeometry args={[0.02, 0.28, 0.02]} /></mesh>
      </group>)}
  </group>;
}

/** 北区规划边界：施工围挡 + 规划中牌。 */
function ExpansionFence() {
  const f = EXPANSION_FENCE;
  const board = useMemo(() => stripes('#ffd166', '#1a1d26'), []);
  const w = f.maxX - f.minX;
  return <group>
    <mesh position={[(f.minX + f.maxX) / 2, 0.55, (f.minZ + f.maxZ) / 2]}><boxGeometry args={[w, 1.1, 0.12]} /><meshStandardMaterial map={board} roughness={0.8} /></mesh>
    {[f.minX, f.maxX].map(x => <mesh key={x} position={[x, 0.3, f.maxZ + 0.25]} material={std('#ff7a3d', 0.6)}><coneGeometry args={[0.18, 0.6, 8]} /></mesh>)}
    <mesh position={[0, 1.7, f.minZ]} material={std('#0b1016', 0.5, 0.4)}><boxGeometry args={[3.2, 0.6, 0.08]} /></mesh>
    <Neon text="北区 · 规划中" color="#c7d2e6" w={3} h={0.5} size={130} position={[0, 1.7, f.maxZ - 0.22]} rotation={[0, 0, 0]} />
  </group>;
}

/** 外围连续低层屋顶 + 承托地面：让平台外看起来是延续的街区，而不是悬空大地台。 */
function OuterBlocks() {
  const { mesh, roofs } = useMemo(() => {
    const B = WORLD_BOUNDS;
    const items: { x: number; z: number; w: number; d: number; h: number }[] = [];
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let x = -96; x <= 96; x += 7) for (let z = -84; z <= 84; z += 7) {
      if (Math.abs(x) < B.maxX + 5 && Math.abs(z) < B.maxZ + 5) continue;
      if (rnd() < 0.18) continue; // 留出街巷
      items.push({ x: x + (rnd() - 0.5) * 1.5, z: z + (rnd() - 0.5) * 1.5, w: 4 + rnd() * 2.2, d: 4 + rnd() * 2.2, h: 1.6 + rnd() * rnd() * 7 });
    }
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const m = new THREE.InstancedMesh(geo, std('#1e2533', 0.8, 0.2), items.length);
    const r = new THREE.InstancedMesh(geo, glow('#ffcf8a', 0.9), items.length);
    const o = new THREE.Object3D();
    items.forEach((it, i) => {
      o.position.set(it.x, -0.9 + it.h / 2, it.z); o.scale.set(it.w, it.h, it.d); o.updateMatrix(); m.setMatrixAt(i, o.matrix);
      // 每栋一条窗带
      o.position.set(it.x, -0.9 + it.h * 0.6, it.z + it.d / 2 + 0.01); o.scale.set(it.w * 0.7, 0.18, 0.02); o.updateMatrix(); r.setMatrixAt(i, o.matrix);
    });
    return { mesh: m, roofs: r };
  }, []);
  return <group>
    <mesh rotation-x={-Math.PI / 2} position={[0, -0.92, 0]} receiveShadow>
      <planeGeometry args={[220, 200]} />
      <meshStandardMaterial color="#121826" roughness={0.9} />
    </mesh>
    <primitive object={mesh} />
    <primitive object={roofs} />
  </group>;
}

export function TownDistricts() {
  const town = useTownMode();
  if (!town) return null;
  return <group name="town-districts">
    <StaticBatch worldStatic>
      {TOWN_SHOPHOUSES.map((h, i) => <House key={`${h.x},${h.z}`} h={h} i={i} />)}
      {TOWN_GATES.map(g => <Gate key={g.x} {...g} />)}
      <StreetFloor />
      <CivicCenter />
      <ExpansionFence />
    </StaticBatch>
    <OuterBlocks />
  </group>;
}
