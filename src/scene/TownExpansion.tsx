import { useMemo } from 'react';
import * as THREE from 'three';
import {
  BRIDGES, EXPANSION_PLOTS, POCKET_GARDENS, RIVER, TOWN_KIOSKS, TOWN_LANDMARK_BOXES, TOWN_LANDMARK_CIRCLES, TOWN_POSTS, TOWN_ROADS, type DistrictId,
} from '../../shared/townPlan.ts';
import { WORLD_BOUNDS } from '../../shared/world.ts';
import { glow, std } from './materials.ts';
import { StaticBatch } from './StaticBatch.tsx';
import { neonText } from './textures.ts';
import { Neon, PALETTE, stripes } from './TownDistricts.tsx';

// 扩展外区：道路、河道与三座桥、摊亭、河港/乐园/滨河地标、北区规划地块。
// 实心物体占地全部来自 shared/townPlan.ts（同步进 world.ts 碰撞）；纯地面/水面/高处构件不挡路。

/** 双面招牌：两张单面字牌背对背，从街两侧看都正向可读 */
function Sign2({ text, color, w, h, position, rotY = 0, size = 150 }: { text: string; color: string; w: number; h: number; position: [number, number, number]; rotY?: number; size?: number }) {
  return <group position={position} rotation-y={rotY}>
    <mesh material={std('#0b1016', 0.5, 0.4)}><boxGeometry args={[w + 0.2, h + 0.1, 0.08]} /></mesh>
    <Neon text={text} color={color} w={w} h={h} size={size} position={[0, 0, 0.05]} single />
    <Neon text={text} color={color} w={w} h={h} size={size} position={[0, 0, -0.05]} rotation={[0, Math.PI, 0]} single />
  </group>;
}

const ROAD_TINT: Record<DistrictId, string> = { commerce: '#ffb347', leisure: '#b18bff', plaza: '#ffd166', expansion: '#6f7d99' };
const lm = (kind: string) => TOWN_LANDMARK_BOXES.find(b => b.kind === kind)!;
const lc = (kind: string) => TOWN_LANDMARK_CIRCLES.find(c => c.kind === kind)!;

function Roads() {
  return <group>
    {TOWN_ROADS.map((r, i) => {
      const w = r.maxX - r.minX, d = r.maxZ - r.minZ, cx = (r.minX + r.maxX) / 2, cz = (r.minZ + r.maxZ) / 2;
      const plan = r.district === 'expansion';
      return <group key={i}>
        <mesh rotation-x={-Math.PI / 2} position={[cx, -0.03 + i * 0.0005, cz]} receiveShadow>
          <planeGeometry args={[w, d]} />
          <meshStandardMaterial color={plan ? '#2a3142' : '#3a4562'} roughness={0.75} metalness={0.15} />
        </mesh>
        {/* 道路两侧细灯线：分区色 */}
        {(w > d ? [r.minZ + 0.1, r.maxZ - 0.1].map(z => [cx, z, w, 0.04] as const) : [r.minX + 0.1, r.maxX - 0.1].map(x => [x, cz, 0.04, d] as const))
          .map(([x, z, sw, sd], k) => <mesh key={k} position={[x, 0.012, z]} material={glow(ROAD_TINT[r.district], plan ? 0.6 : 1.1)}>
            <boxGeometry args={[sw, 0.012, sd]} />
          </mesh>)}
      </group>;
    })}
  </group>;
}

function River() {
  const W = WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX;
  const mid = (RIVER.minZ + RIVER.maxZ) / 2;
  const banks = useMemo(() => {
    const cuts = [WORLD_BOUNDS.minX, ...BRIDGES.flat(), WORLD_BOUNDS.maxX];
    const out: [number, number][] = [];
    for (let i = 0; i < cuts.length; i += 2) out.push([cuts[i], cuts[i + 1]]);
    return out;
  }, []);
  return <group>
    {/* 水面略高于底层地面（-0.055），桥面与堤岸在其上 */}
    <mesh rotation-x={-Math.PI / 2} position={[0, -0.02, mid]}>
      <planeGeometry args={[W, RIVER.maxZ - RIVER.minZ]} />
      <meshStandardMaterial color="#0a2236" roughness={0.12} metalness={0.7} />
    </mesh>
    {/* 堤岸石沿 + 水边灯线（桥位断开） */}
    {banks.flatMap(([a, b]) => [RIVER.minZ, RIVER.maxZ].map(z => <group key={`${a}${z}`}>
      <mesh position={[(a + b) / 2, -0.02, z]} material={std('#4a5568', 0.8, 0.1)}><boxGeometry args={[b - a, 0.18, 0.5]} /></mesh>
      <mesh position={[(a + b) / 2, 0.09, z + (z === RIVER.minZ ? 0.26 : -0.26)]} material={glow('#3ef0ff', 1)}><boxGeometry args={[b - a, 0.02, 0.03]} /></mesh>
    </group>))}
    {BRIDGES.map(([a, b]) => <group key={a}>
      <mesh position={[(a + b) / 2, 0.06, mid]} material={std('#6b5a48', 0.7, 0.1)} receiveShadow><boxGeometry args={[b - a, 0.14, RIVER.maxZ - RIVER.minZ + 0.9]} /></mesh>
      {[a + 0.06, b - 0.06].map(x => <group key={x}>
        <mesh position={[x, 0.55, mid]} material={std('#2a313d', 0.4, 0.6)}><boxGeometry args={[0.08, 0.06, RIVER.maxZ - RIVER.minZ + 0.8]} /></mesh>
        <mesh position={[x, 0.3, mid]} material={glow('#ffd166', 1.2)}><boxGeometry args={[0.03, 0.03, RIVER.maxZ - RIVER.minZ + 0.8]} /></mesh>
        {[RIVER.minZ, mid, RIVER.maxZ].map(z => <mesh key={z} position={[x, 0.3, z]} material={std('#2a313d', 0.4, 0.6)}><boxGeometry args={[0.08, 0.5, 0.08]} /></mesh>)}
      </group>)}
    </group>)}
    {/* 河港停泊的货船（水面上，不可走） */}
    <group position={[-62, -0.1, 51]}>
      <mesh position={[0, 0.35, 0]} material={std('#2b3a4f', 0.5, 0.4)}><boxGeometry args={[7, 0.8, 2.2]} /></mesh>
      <mesh position={[-1.8, 1.2, 0]} material={std('#e8eef6', 0.6)}><boxGeometry args={[2, 1, 1.6]} /></mesh>
      {[0.6, 2.1].map(x => <mesh key={x} position={[x, 1.0, 0]} material={std(x > 1 ? '#ff7a3d' : '#3ef0ff', 0.6)}><boxGeometry args={[1.3, 0.6, 1.6]} /></mesh>)}
    </group>
    <group position={[62, -0.1, 51]}>
      <mesh position={[0, 0.25, 0]} material={std('#3a2e52', 0.5, 0.3)}><boxGeometry args={[4.5, 0.5, 1.6]} /></mesh>
      <mesh position={[0, 0.9, 0]} material={glow('#b18bff', 1.2)}><boxGeometry args={[3.6, 0.05, 1.3]} /></mesh>
    </group>
  </group>;
}

function Kiosk({ x, z, w, d, color, label }: { x: number; z: number; w: number; d: number; color: string; label?: string }) {
  const canopy = useMemo(() => stripes(color, '#f4ede2'), [color]);
  return <group position={[x, 0, z]}>
    <mesh position={[0, 0.5, 0]} material={std('#2a2f3a', 0.7, 0.2)} castShadow><boxGeometry args={[w, 1, d]} /></mesh>
    <mesh position={[0, 1.04, 0]} material={std('#c9b48f', 0.5)}><boxGeometry args={[w + 0.08, 0.06, d + 0.08]} /></mesh>
    {[-1, 1].map(s => <mesh key={s} position={[s * (w / 2 - 0.06), 1.5, 0]} material={std('#1a232b', 0.4, 0.5)}><boxGeometry args={[0.06, 1, 0.06]} /></mesh>)}
    <mesh position={[0, 2.05, 0]} rotation-x={-0.12}><boxGeometry args={[w + 0.3, 0.05, d + 0.5]} /><meshStandardMaterial map={canopy} roughness={0.7} /></mesh>
    <mesh position={[0, 1.25, d / 2 - 0.1]} material={glow(color, 1.4)}><boxGeometry args={[w * 0.8, 0.04, 0.02]} /></mesh>
    {/* 台面货品：果蔬、小木箱、瓶罐（都在摊位占地内） */}
    {Array.from({ length: 5 }, (_, i) => <mesh key={i} position={[-w / 2 + 0.3 + i * ((w - 0.6) / 4), 1.16, -0.15 + (i % 2) * 0.25]}
      material={std(['#ff7a3d', '#7dd36a', '#ffd166', '#e84a5f', '#9ad0ff'][i], 0.6)}><sphereGeometry args={[0.1 + (i % 3) * 0.02, 8, 6]} /></mesh>)}
    <mesh position={[w / 2 - 0.35, 1.22, d / 2 - 0.35]} material={std('#8a6a44', 0.8)}><boxGeometry args={[0.45, 0.3, 0.35]} /></mesh>
    <mesh position={[-w / 2 + 0.35, 1.2, d / 2 - 0.35]} material={std('#6b8f9e', 0.3, 0.2)}><cylinderGeometry args={[0.07, 0.07, 0.26, 8]} /></mesh>
    <mesh position={[0, 0.25, -d / 2 + 0.25]} material={std('#8a6a44', 0.8)}><boxGeometry args={[w * 0.6, 0.4, 0.4]} /></mesh>
    {label && <Sign2 text={label} color={color} w={2.6} h={0.55} position={[0, 2.75, 0]} />}
  </group>;
}

/** 西街集市：三座摊亭围出口袋广场，头顶灯串，中间摊上方立招牌。 */
function WestMarket() {
  const k = TOWN_KIOSKS.slice(0, 3);
  return <group>
    {k.map((s, i) => <Kiosk key={i} {...s} label={i === 1 ? '西街集市' : undefined} />)}
    {TOWN_POSTS.slice(0, 2).map(p => <mesh key={p.x} position={[p.x, 1.7, p.z]} material={std('#1a232b', 0.4, 0.5)}><cylinderGeometry args={[p.r, p.r, 3.4, 6]} /></mesh>)}
    {Array.from({ length: 15 }, (_, i) => <mesh key={i} position={[-71 + i, 3.25 - Math.sin((i / 14) * Math.PI) * 0.4, -4.6]} material={glow(i % 2 ? '#ffd166' : '#ff8fb8', 2)}>
      <sphereGeometry args={[0.07, 6, 5]} />
    </mesh>)}
  </group>;
}

/** 河港商埠：集装箱、木箱、吊机（底座即碰撞圆）。 */
function RiverDock() {
  const c = lm('containers'), cr = lm('crates'), crane = lc('crane');
  const colors = ['#c0392b', '#2e86de', '#f39c12', '#16a085', '#8e44ad', '#d35400'];
  return <group>
    {[0, 1, 2].flatMap(col => [0, 1].map(row => <mesh key={`${col}${row}`}
      position={[c.minX + 1 + col * 2, 0.65 + row * 1.3, (c.minZ + c.maxZ) / 2]} material={std(colors[(col * 2 + row) % colors.length], 0.6, 0.3)} castShadow>
      <boxGeometry args={[1.9, 1.28, c.maxZ - c.minZ]} />
    </mesh>))}
    {[0, 1, 2, 3].map(i => <mesh key={i} position={[cr.minX + 0.5 + i, 0.45 + (i % 2) * 0.1, (cr.minZ + cr.maxZ) / 2]} material={std('#8a6a44', 0.8)}>
      <boxGeometry args={[0.9, 0.9 + (i % 2) * 0.2, cr.maxZ - cr.minZ]} />
    </mesh>)}
    <mesh position={[crane.x, 3.5, crane.z]} material={std('#e0a526', 0.5, 0.5)}><boxGeometry args={[0.7, 7, 0.7]} /></mesh>
    <mesh position={[crane.x, 7.2, crane.z + 7]} material={std('#e0a526', 0.5, 0.5)}><boxGeometry args={[0.5, 0.5, 16]} /></mesh>
    <mesh position={[crane.x, 5.2, crane.z + 13]} material={std('#2a313d', 0.4, 0.6)}><boxGeometry args={[0.04, 4, 0.04]} /></mesh>
    <mesh position={[crane.x, 7.6, crane.z + 14.5]} material={glow('#ff5f5f', 2)}><sphereGeometry args={[0.15, 8, 6]} /></mesh>
    <Sign2 text="河港商埠" color="#ffb347" w={4.2} h={0.66} position={[(c.minX + c.maxX) / 2, 3.3, c.maxZ + 0.05]} />
  </group>;
}

/** 星光乐园：摩天轮（底座占地）+ 旋转木马（碰撞圆）。静态造型，不加实时灯。 */
function StarPark() {
  const base = lm('wheel-base'), car = lc('carousel');
  const cx = (base.minX + base.maxX) / 2, cz = (base.minZ + base.maxZ) / 2;
  // 尺度收小：从星光乐园入口默认镜头能看到整圈
  const R = 4.2, cy = 5.6;
  const pods = Array.from({ length: 12 }, (_, i) => (i / 12) * Math.PI * 2);
  return <group>
    <mesh position={[cx, 0.4, cz]} material={std('#2b2350', 0.6, 0.3)}><boxGeometry args={[base.maxX - base.minX, 0.8, base.maxZ - base.minZ]} /></mesh>
    {[-1, 1].map(s => <mesh key={s} position={[cx + s * 1.3, cy / 2, cz]} rotation-z={s * -0.16} material={std('#cfd6e6', 0.4, 0.6)}><boxGeometry args={[0.25, cy + 0.6, 0.25]} /></mesh>)}
    <mesh position={[cx, cy, cz]} material={glow('#b18bff', 1.6)}><torusGeometry args={[R, 0.09, 6, 48]} /></mesh>
    <mesh position={[cx, cy, cz]} material={glow('#3ef0ff', 1.3)}><torusGeometry args={[R * 0.55, 0.05, 6, 32]} /></mesh>
    {pods.map((a, i) => <group key={i}>
      <mesh position={[cx + (Math.cos(a) * R) / 2, cy + (Math.sin(a) * R) / 2, cz]} rotation-z={a} material={std('#9aa4b8', 0.4, 0.6)}><boxGeometry args={[R, 0.05, 0.05]} /></mesh>
      <mesh position={[cx + Math.cos(a) * R, cy + Math.sin(a) * R - 0.45, cz]} material={std(i % 3 ? '#ff6fd8' : '#3ef0ff', 0.5, 0.2)}><boxGeometry args={[0.6, 0.55, 0.6]} /></mesh>
    </group>)}
    <Sign2 text="星光乐园" color="#d6c6ff" w={3.6} h={0.62} position={[cx, 1.4, base.maxZ + 0.05]} />
    <group position={[car.x, 0, car.z]}>
      <mesh position-y={0.15} material={std('#3a2e52', 0.6, 0.2)}><cylinderGeometry args={[car.r, car.r, 0.3, 24]} /></mesh>
      {Array.from({ length: 8 }, (_, i) => (i / 8) * Math.PI * 2).map(a => <group key={a}>
        <mesh position={[Math.cos(a) * car.r * 0.75, 1.5, Math.sin(a) * car.r * 0.75]} material={std('#d9c27a', 0.3, 0.7)}><cylinderGeometry args={[0.04, 0.04, 2.4, 6]} /></mesh>
        <mesh position={[Math.cos(a) * car.r * 0.75, 0.9, Math.sin(a) * car.r * 0.75]} material={std(['#ff8fb8', '#9ef8ff', '#ffd166'][Math.round(a * 2) % 3], 0.5)}><boxGeometry args={[0.25, 0.4, 0.6]} /></mesh>
      </group>)}
      <mesh position-y={1.5} material={std('#cfd6e6', 0.4, 0.5)}><cylinderGeometry args={[0.25, 0.25, 2.6, 10]} /></mesh>
      <mesh position-y={3.2} material={std('#7a4fd6', 0.5, 0.2)}><coneGeometry args={[car.r + 0.3, 1.2, 16]} /></mesh>
      <mesh position-y={2.62} rotation-x={Math.PI / 2} material={glow('#ffd166', 1.6)}><torusGeometry args={[car.r + 0.25, 0.04, 4, 32]} /></mesh>
    </group>
  </group>;
}

/** 滨河步道：观景木台、长椅、灯笼串、喷泉。 */
function RiverWalk() {
  const bench = lm('pavilion-bench'), f = lc('fountain');
  return <group>
    <mesh rotation-x={-Math.PI / 2} position={[62, -0.02, 38]} receiveShadow><planeGeometry args={[12, 4]} /><meshStandardMaterial color="#5a4a3a" roughness={0.8} /></mesh>
    <mesh position={[(bench.minX + bench.maxX) / 2, 0.45, (bench.minZ + bench.maxZ) / 2]} material={std('#6b5a48', 0.7)}><boxGeometry args={[bench.maxX - bench.minX, 0.9, bench.maxZ - bench.minZ]} /></mesh>
    <Sign2 text="滨河步道" color="#9ef8ff" w={3.2} h={0.56} position={[(bench.minX + bench.maxX) / 2, 2.4, (bench.minZ + bench.maxZ) / 2]} />
    {Array.from({ length: 12 }, (_, i) => <mesh key={i} position={[56.5 + i, 3.1 - Math.sin((i / 11) * Math.PI) * 0.35, 36]} material={glow(i % 2 ? '#b18bff' : '#3ef0ff', 2)}>
      <sphereGeometry args={[0.09, 6, 5]} />
    </mesh>)}
    {TOWN_POSTS.slice(2, 4).map(p => <mesh key={p.x} position={[p.x, 1.6, p.z]} material={std('#1a232b', 0.4, 0.5)}><cylinderGeometry args={[p.r, p.r, 3.2, 6]} /></mesh>)}
    <group position={[f.x, 0, f.z]}>
      <mesh position-y={0.25} material={std('#4a5568', 0.6, 0.2)}><cylinderGeometry args={[f.r, f.r, 0.5, 24]} /></mesh>
      <mesh position-y={0.46} material={std('#1b4a6b', 0.1, 0.7)}><cylinderGeometry args={[f.r - 0.15, f.r - 0.15, 0.04, 24]} /></mesh>
      <mesh position-y={0.9} material={glow('#9ef8ff', 1.4)}><cylinderGeometry args={[0.12, 0.2, 0.9, 10]} /></mesh>
    </group>
  </group>;
}

function SouthPark() {
  return <group>
    {TOWN_KIOSKS.slice(3).map((k, i) => <Kiosk key={i} {...k} />)}
    <mesh rotation-x={-Math.PI / 2} position={[0, -0.03, 60]} receiveShadow><planeGeometry args={[176, 11]} /><meshStandardMaterial color="#1f3a2e" roughness={0.9} /></mesh>
  </group>;
}

/** 坊区口袋花园：草地 + 石沿（平面，不挡路；树木在共享 TREES 中带碰撞） */
function PocketGardens() {
  return <group>
    {POCKET_GARDENS.map((g, i) => {
      const w = g.maxX - g.minX, d = g.maxZ - g.minZ, cx = (g.minX + g.maxX) / 2, cz = (g.minZ + g.maxZ) / 2;
      return <group key={i}>
        <mesh rotation-x={-Math.PI / 2} position={[cx, -0.025, cz]} receiveShadow><planeGeometry args={[w, d]} /><meshStandardMaterial color={i % 2 ? '#24402f' : '#2b4a33'} roughness={0.95} /></mesh>
        {[[cx, g.minZ, w, 0.12], [cx, g.maxZ, w, 0.12], [g.minX, cz, 0.12, d], [g.maxX, cz, 0.12, d]].map(([x, z, sw, sd], k) =>
          <mesh key={k} position={[x, 0.03, z]} material={std('#6d7584', 0.8)}><boxGeometry args={[sw, 0.06, sd]} /></mesh>)}
        {/* 花圃：地面色块 */}
        {[0, 1, 2].map(k => <mesh key={k} rotation-x={-Math.PI / 2} position={[g.minX + 1 + k * (w - 2) / 2, -0.02, g.maxZ - 1]}>
          <circleGeometry args={[0.7, 12]} /><meshStandardMaterial color={['#e84a8f', '#ffd166', '#b18bff'][(k + i) % 3]} roughness={0.8} />
        </mesh>)}
      </group>;
    })}
  </group>;
}

function NorthPlots() {
  const c = PALETTE.expansion.trim;
  return <group>
    {/* 规划地块先做草地与碎石色块，打破整片铺装；仅供未来扩建 */}
    {EXPANSION_PLOTS.map((p, i) => <mesh key={`g${i}`} rotation-x={-Math.PI / 2} position={[(p.minX + p.maxX) / 2, -0.028, (p.minZ + p.maxZ) / 2]} receiveShadow>
      <planeGeometry args={[p.maxX - p.minX, p.maxZ - p.minZ]} />
      <meshStandardMaterial color={i % 2 ? '#2a3a2e' : '#3a3a34'} roughness={0.95} />
    </mesh>)}
    {EXPANSION_PLOTS.flatMap((p, i) => {
      const w = p.maxX - p.minX, d = p.maxZ - p.minZ;
      return [
        <mesh key={`${i}a`} position={[(p.minX + p.maxX) / 2, 0.01, p.minZ]} material={glow(c, 0.8)}><boxGeometry args={[w, 0.01, 0.06]} /></mesh>,
        <mesh key={`${i}b`} position={[(p.minX + p.maxX) / 2, 0.01, p.maxZ]} material={glow(c, 0.8)}><boxGeometry args={[w, 0.01, 0.06]} /></mesh>,
        <mesh key={`${i}c`} position={[p.minX, 0.01, (p.minZ + p.maxZ) / 2]} material={glow(c, 0.8)}><boxGeometry args={[0.06, 0.01, d]} /></mesh>,
        <mesh key={`${i}d`} position={[p.maxX, 0.01, (p.minZ + p.maxZ) / 2]} material={glow(c, 0.8)}><boxGeometry args={[0.06, 0.01, d]} /></mesh>,
        <mesh key={`${i}e`} rotation-x={-Math.PI / 2} position={[(p.minX + p.maxX) / 2, 0.008, (p.minZ + p.maxZ) / 2]}>
          <planeGeometry args={[Math.min(w, 9), 1.3]} />
          <meshBasicMaterial map={neonTextCached()} transparent opacity={0.5} toneMapped={false} depthWrite={false} />
        </mesh>,
      ];
    })}
  </group>;
}
let plotTex: THREE.Texture | null = null;
function neonTextCached() { return (plotTex ??= neonText([{ text: '规划地块', color: '#8d9bb8', size: 150 }])); }

export function TownExpansion() {
  return <group name="town-expansion">
    <StaticBatch worldStatic>
      <Roads />
      <River />
      <WestMarket />
      <RiverDock />
      <StarPark />
      <RiverWalk />
      <SouthPark />
      <PocketGardens />
      <NorthPlots />
    </StaticBatch>
  </group>;
}
