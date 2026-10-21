import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { PATHS, STREET_BUILDINGS, STREET_LAMP_POLES, WORLD_BOUNDS } from '../../shared/world.ts';
import { LocalPointLight } from './LocalLights.tsx';
import { StaticBatch } from './StaticBatch.tsx';
import { PALETTE, glow, std } from './materials.ts';
import { wetRoughness, neonText } from './textures.ts';

// 外环霓虹街区：只做视觉。可碰撞体全部来自 shared/world.ts（STREET_BUILDINGS / STREET_BENCHES），
// 地面贴花与头顶装饰不挡路；细杆碰撞也收录到 STREET_POLES。

const B = WORLD_BOUNDS;
type P3 = [number, number, number];
type Street = (typeof STREET_BUILDINGS)[number];

// 外环几何取自 PATHS[8..11]（西/东/北/南），连接路为其后的条目。
const RING = {
  inX: -PATHS[8].maxX,
  outX: -PATHS[8].minX,
  inZ: -PATHS[10].maxZ,
  outZ: -PATHS[10].minZ,
};
const MID_X = (RING.inX + RING.outX) / 2;
const MID_Z = (RING.inZ + RING.outZ) / 2;
const CONNECTORS = PATHS.slice(12);

let tileTex: THREE.CanvasTexture | null = null;
/** 深色街砖 + 细青色缝，一张贴图供所有外环地面共用（UV 按米缩放）。 */
function streetTile() {
  if (tileTex) return tileTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#202b33';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#29373e';
  g.fillRect(3, 3, 58, 58);
  g.fillRect(67, 67, 58, 58);
  g.strokeStyle = 'rgba(105,149,151,0.12)';
  g.lineWidth = 2;
  g.strokeRect(1, 1, 126, 126);
  g.fillStyle = 'rgba(255,79,202,0.5)';
  g.fillRect(62, 62, 4, 4);
  tileTex = new THREE.CanvasTexture(c);
  tileTex.colorSpace = THREE.SRGBColorSpace;
  tileTex.wrapS = tileTex.wrapT = THREE.RepeatWrapping;
  tileTex.anisotropy = 4;
  return tileTex;
}

function FloorStrip({ minX, maxX, minZ, maxZ }: { minX: number; maxX: number; minZ: number; maxZ: number }) {
  const w = maxX - minX;
  const d = maxZ - minZ;
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(w, d);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / 4, (uv.getY(i) * d) / 4);
    return g;
  }, [w, d]);
  const material = useMemo(() => new THREE.MeshStandardMaterial({ map: streetTile(), roughness: 0.5, metalness: 0.3, roughnessMap: wetRoughness() }), []);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);
  return <mesh geometry={geometry} material={material} rotation-x={-Math.PI / 2}
    position={[(minX + maxX) / 2, -0.04, (minZ + maxZ) / 2]} receiveShadow />;
}

/** 环街以外的整圈地面：替代原来的空草坪。 */
function DistrictFloor() {
  return <group>
    <FloorStrip minX={B.minX} maxX={B.maxX} minZ={B.minZ} maxZ={-RING.inZ} />
    <FloorStrip minX={B.minX} maxX={B.maxX} minZ={RING.inZ} maxZ={B.maxZ} />
    <FloorStrip minX={B.minX} maxX={-RING.inX} minZ={-RING.inZ} maxZ={RING.inZ} />
    <FloorStrip minX={RING.inX} maxX={B.maxX} minZ={-RING.inZ} maxZ={RING.inZ} />
  </group>;
}

/** Split [from,to] around connector openings. */
function openings(from: number, to: number, cuts: [number, number][]) {
  const out: [number, number][] = [];
  let at = from;
  for (const [a, b] of [...cuts].sort((p, q) => p[0] - q[0])) {
    if (a > at) out.push([at, Math.min(a, to)]);
    at = Math.max(at, b);
  }
  if (at < to) out.push([at, to]);
  return out;
}

/** 环街路缘：外圈连续霓虹线，内圈在连接路口断开；中线虚线。 */
function RingCurbs() {
  const lines: { pos: P3; size: P3; pink: boolean }[] = [];
  const line = (x0: number, z0: number, x1: number, z1: number, pink: boolean) =>
    lines.push({ pos: [(x0 + x1) / 2, 0.02, (z0 + z1) / 2], size: [Math.max(0.05, x1 - x0), 0.02, Math.max(0.05, z1 - z0)], pink });
  for (const s of [-1, 1]) {
    line(s * RING.outX, -RING.outZ, s * RING.outX, RING.outZ, s > 0);
    line(-RING.outX, s * RING.outZ, RING.outX, s * RING.outZ, s < 0);
    const xCuts = CONNECTORS.filter(p => p.minX <= s * RING.inX && p.maxX >= s * RING.inX).map(p => [p.minZ, p.maxZ] as [number, number]);
    for (const [a, b] of openings(-RING.inZ, RING.inZ, xCuts)) line(s * RING.inX, a, s * RING.inX, b, s > 0);
    const zCuts = CONNECTORS.filter(p => p.minZ <= s * RING.inZ && p.maxZ >= s * RING.inZ).map(p => [p.minX, p.maxX] as [number, number]);
    for (const [a, b] of openings(-RING.inX, RING.inX, zCuts)) line(a, s * RING.inZ, b, s * RING.inZ, s < 0);
  }
  const dashes: P3[] = [];
  for (let z = -RING.inZ + 1.5; z < RING.inZ - 1; z += 3) dashes.push([-MID_X, 0.016, z], [MID_X, 0.016, z]);
  for (let x = -RING.inX + 1.5; x < RING.inX - 1; x += 3) dashes.push([x, 0.016, -MID_Z], [x, 0.016, MID_Z]);
  const dash = glow('#ffd166', 0.9);
  return <group>
    {lines.map((l, i) => <mesh key={i} position={l.pos} material={glow(l.pink ? PALETTE.neonPink : PALETTE.neonCyan, 1.5)}>
      <boxGeometry args={l.size} />
    </mesh>)}
    {dashes.map((p, i) => {
      const alongZ = Math.abs(Math.abs(p[0]) - MID_X) < 0.01;
      return <mesh key={'d' + i} position={p} material={dash}>
        <boxGeometry args={alongZ ? [0.12, 0.012, 1.2] : [1.2, 0.012, 0.12]} />
      </mesh>;
    })}
  </group>;
}

/** 霓虹细灯柱，沿环街外侧排布；避开街边建筑立面。 */
function RingPosts() {
  const posts = STREET_LAMP_POLES.map(p => [p.x, 0, p.z] as P3);
  const pole = std('#2c313d', 0.4, 0.6);
  return <group>
    {posts.map((p, i) => <group key={i} position={p}>
      <mesh position={[0, 1.7, 0]} material={pole}><cylinderGeometry args={[0.05, 0.07, 3.4, 6]} /></mesh>
      <mesh position={[0, 2.9, 0]} material={glow(i % 2 ? PALETTE.neonPink : PALETTE.neonCyan, 1.5)}>
        <boxGeometry args={[0.09, 0.9, 0.09]} />
      </mesh>
      <mesh position={[0, 3.45, 0]} material={glow(PALETTE.warmLight, 2.4)}><sphereGeometry args={[0.16, 10, 8]} /></mesh>
    </group>)}
  </group>;
}

function NeonPanel({ text, color, width, position, rotation = 0, double = false }: {
  text: string; color: string; width: number; position: P3; rotation?: number; double?: boolean;
}) {
  return <mesh position={position} rotation-y={rotation}>
    <planeGeometry args={[width, width / 4]} />
    <meshBasicMaterial map={neonText([{ text, color, size: 150 }])} transparent toneMapped={false}
      color={new THREE.Color(2, 2, 2)} depthWrite={false} side={double ? THREE.DoubleSide : THREE.FrontSide} />
  </mesh>;
}

// 每栋店的灯色语言：main 只用于招牌/灯条，hot 为局部点缀，glass/inner 控制橱窗不过曝。
const SHOP_THEMES = [
  { main: '#ffb347', hot: '#ff3b30', glass: '#26170f', inner: '#ffcf8a' }, // 夜市：琥珀 + 红
  { main: '#3ef0ff', hot: '#ff3b5c', glass: '#0b222c', inner: '#bff6ff' }, // 相馆：冷青 + 少量红
  { main: '#5ab8ff', hot: '#d6ecff', glass: '#0d182b', inner: '#d6ecff' }, // 北西：冷蓝
  { main: '#ffd400', hot: '#ff8a1f', glass: '#211c0b', inner: '#fff1b8' }, // 北东：公司黄
];

function box(key: string | number, pos: P3, size: P3, mat: THREE.Material, rx = 0) {
  return <mesh key={key} position={pos} material={mat} rotation-x={rx}><boxGeometry args={size} /></mesh>;
}

/** 街边工业店：本地 +z 朝向环街。人体高度以下实体都在 STREET_BUILDINGS 碰撞框内（窗框只外伸 ≤.08m），
 *  2.6m 以上的硬棚/灯箱/拉杆才出挑。 */
function Storefront({ b, index }: { b: Street; index: number }) {
  const side = Math.abs(b.x) > RING.inX;
  const yaw = side ? (b.x < 0 ? Math.PI / 2 : -Math.PI / 2) : b.z < 0 ? 0 : Math.PI;
  const W = side ? b.d : b.w;
  const D = side ? b.w : b.d;
  const f = D / 2;
  const t = SHOP_THEMES[index % SHOP_THEMES.length];
  const shell = std('#1a1f2e', 0.8, 0.2);
  const metal = std('#4a5263', 0.35, 0.85);
  const roofMetal = std('#1b2130', 0.45, 0.75);
  const dark = std('#07090f', 0.9, 0.1);
  const frame = std('#11162a', 0.5, 0.6);
  const glass = std(t.glass, 0.15, 0.7);
  const main = glow(t.main, 1.8);
  const mainSoft = glow(t.main, 0.9);
  const hot = glow(t.hot, 1.6);
  const inner = glow(t.inner, 0.8);
  const innerDim = glow(t.inner, 0.35);
  const hazY = std('#e8b400', 0.6, 0.2);
  const hazK = std('#15171c', 0.6, 0.2);
  const winL = -W / 2 + 0.5, winR = W / 2 - 2.1;
  const winW = winR - winL, winX = (winL + winR) / 2;
  const doorX = W / 2 - 1.15;
  const signW = Math.min(W - 0.6, 7);
  const rod = Math.atan2(1.05, -0.67);
  const bladeX = -W / 2 + 0.45;
  return <group position={[b.x, 0, b.z]} rotation-y={yaw}>
    {box('body', [0, b.h / 2, 0], [W, b.h, D], shell)}
    {/* 深窗洞：黑色凹底 + 暗玻璃 + 局部内光，上方半落百叶 */}
    {box('rec', [winX, 1.3, f + 0.01], [winW, 2.0, 0.02], dark)}
    {box('gls', [winX, 1.2, f + 0.025], [winW - 0.1, 1.7, 0.01], glass)}
    {box('in1', [winX, 1.95, f + 0.03], [winW - 0.3, 0.06, 0.01], inner)}
    {box('in2', [winX - winW * 0.22, 1.0, f + 0.03], [winW * 0.3, 0.5, 0.01], innerDim)}
    {[0, 1, 2, 3, 4].map(k => box('sl' + k, [winX, 2.12 - k * 0.11, f + 0.05], [winW, 0.08, 0.03], metal))}
    {box('shh', [winX, 2.3, f + 0.04], [winW + 0.2, 0.2, 0.08], frame)}
    {[0, 1, 2, 3].map(k => box('mu' + k, [winL + (k * winW) / 3, 1.3, f + 0.04], [0.12, 2.1, 0.08], frame))}
    {box('sill', [winX, 0.28, f + 0.04], [winW + 0.12, 0.12, 0.08], metal)}
    {box('kick', [winX, 0.12, f + 0.02], [winW, 0.24, 0.04], frame)}
    {/* 门：双门片 + 中横档 + 门楣灯条 */}
    {[-1, 1].map(s => box('dp' + s, [doorX + s * 0.62, 1.2, f + 0.04], [0.1, 2.4, 0.08], metal))}
    {box('dh', [doorX, 2.35, f + 0.04], [1.34, 0.1, 0.08], metal)}
    {[-1, 1].map(s => box('dl' + s, [doorX + s * 0.29, 1.05, f + 0.02], [0.56, 2.1, 0.03], frame))}
    {[-1, 1].map(s => box('dg' + s, [doorX + s * 0.29, 1.45, f + 0.04], [0.36, 0.8, 0.01], glass))}
    {box('dr', [doorX, 0.9, f + 0.045], [1.12, 0.06, 0.02], metal)}
    {box('dls', [doorX, 2.24, f + 0.065], [1.1, 0.03, 0.02], main)}
    {/* 护角 + 底部黄黑警示 + 上段细侧灯条（主次轮廓） */}
    {[-1, 1].flatMap(s => [
      box('cg' + s, [s * (W / 2 - 0.06), (0.8 + b.h) / 2, f + 0.04], [0.12, b.h - 0.8, 0.08], metal),
      ...[0, 1, 2, 3].map(k => box(`hz${s}${k}`, [s * (W / 2 - 0.07), 0.1 + k * 0.2, f + 0.04], [0.14, 0.2, 0.08], k % 2 ? hazK : hazY)),
      box('sl' + s, [s * (W / 2 - 0.15), (2.9 + b.h) / 2, f + 0.075], [0.03, b.h - 2.9, 0.01], mainSoft),
    ])}
    {box('top', [0, b.h - 0.08, f + 0.05], [W + 0.04, 0.12, 0.1], main)}
    {/* 深色金属硬棚 + 前唇灯条 + 上拉杆（全部 ≥2.6m） */}
    {box('cn', [0, 2.8, f + 0.55], [W - 0.6, 0.1, 1.1], roofMetal)}
    {box('lip', [0, 2.73, f + 1.1], [W - 0.6, 0.22, 0.06], frame)}
    {box('lls', [0, 2.63, f + 1.08], [W - 0.8, 0.03, 0.03], main)}
    {[-1, 1].map(s => box('ht' + s, [s * (W / 2 - 0.5), 2.73, f + 1.14], [0.3, 0.16, 0.02], hot))}
    {[-1, 1].map(s => box('rd' + s, [s * (W / 2 - 0.8), 3.17, f + 0.53], [0.04, 1.245, 0.04], metal, rod))}
    {index === 0 && [-3, -1.5, 0, 1.5, 3].map((x, i) => <mesh key={'lt' + x} position={[x, 2.72, f + 1.2]}
      material={glow(i % 2 ? '#ffb347' : '#ff3b30', 1.8)}><sphereGeometry args={[0.09, 8, 6]} /></mesh>)}
    {/* 分层灯箱：硬棚上横向灯箱 + 角部竖向刀片灯箱 */}
    {box('fx', [0.6, 3.3, f + 0.06], [W * 0.5, 0.55, 0.12], dark)}
    {[-1, 1].map(s => box('fxs' + s, [0.6, 3.3 + s * 0.24, f + 0.125], [W * 0.5 - 0.1, 0.03, 0.01], main))}
    {box('fxc', [0.6, 3.3, f + 0.125], [W * 0.46, 0.3, 0.01], glow(t.inner, 0.5))}
    {box('bl', [bladeX, 3.45, f + 0.45], [0.14, 1.0, 0.7], dark)}
    {[-1, 1].map(s => box('bls' + s, [bladeX + s * 0.075, 3.45, f + 0.45], [0.01, 0.86, 0.56], hot))}
    {box('blc', [bladeX, 3.97, f + 0.45], [0.18, 0.04, 0.74], main)}
    {box('bla', [bladeX, 3.88, f + 0.12], [0.06, 0.06, 0.24], metal)}
    {/* 二层深窗：凹洞 + 厚窗台 + 下半亮、上半百叶 */}
    {b.h > 4.5 && [-W * 0.3, 0, W * 0.3].flatMap(x => [
      box('uw' + x, [x, 4.15, f + 0.01], [W * 0.2, 0.6, 0.02], dark),
      box('ul' + x, [x, 4.02, f + 0.025], [W * 0.2 - 0.1, 0.24, 0.01], glow(t.inner, 0.7)),
      box('ub' + x, [x, 4.3, f + 0.04], [W * 0.2 - 0.1, 0.05, 0.03], metal),
      box('us' + x, [x, 3.82, f + 0.05], [W * 0.2 + 0.16, 0.08, 0.1], metal),
      ...[-1, 1].map(s => box(`uj${x}${s}`, [x + s * W * 0.1, 4.15, f + 0.04], [0.08, 0.66, 0.08], frame)),
    ])}
    {/* 屋顶：女儿墙、空调（风扇叶片）、通风管、招牌钢架 */}
    {[-1, 1].map(s => box('pz' + s, [0, b.h + 0.2, s * (D / 2 - 0.08)], [W, 0.4, 0.16], shell))}
    {[-1, 1].map(s => box('px' + s, [s * (W / 2 - 0.08), b.h + 0.2, 0], [0.16, 0.4, D], shell))}
    {box('cap', [0, b.h + 0.41, f - 0.08], [W, 0.03, 0.2], metal)}
    {[[-W / 4, -D / 5], [W / 5, -D / 4]].map(([x, z]) => <group key={'ac' + x} position={[x, b.h, z]}>
      {box('u', [0, 0.35, 0], [1.1, 0.7, 0.8], std('#39424f', 0.5, 0.6))}
      <mesh position={[0, 0.73, 0]} material={dark}><cylinderGeometry args={[0.32, 0.32, 0.06, 16]} /></mesh>
      {[0.4, 0.4 + Math.PI / 2].map(r => <mesh key={r} position={[0, 0.77, 0]} rotation-y={r} material={metal}>
        <boxGeometry args={[0.56, 0.02, 0.08]} />
      </mesh>)}
    </group>)}
    {[[W / 2 - 1.2, -D / 2 + 1], [W / 2 - 1.7, -D / 2 + 1.1]].map(([x, z], i) => <group key={'vt' + i} position={[x, b.h, z]}>
      <mesh position={[0, 0.45 + i * 0.15, 0]} material={metal}><cylinderGeometry args={[0.12, 0.12, 0.9 + i * 0.3, 10]} /></mesh>
      <mesh position={[0, 0.95 + i * 0.3, 0]} material={frame}><cylinderGeometry args={[0.2, 0.14, 0.08, 10]} /></mesh>
    </group>)}
    {box('duct', [-W / 4, b.h + 0.18, D / 6], [0.32, 0.3, D * 0.35], metal)}
    {[-1, 1].map(s => box('p' + s, [s * (W / 2 - 1), b.h + 0.8, f - 0.4], [0.08, 1.6, 0.08], frame))}
    {[0.55, 1.7].map(y => box('tb' + y, [0, b.h + y, f - 0.42], [W - 1.6, 0.06, 0.06], frame))}
    {box('su', [0, b.h + 0.18, f - 0.28], [signW * 0.8, 0.03, 0.03], hot)}
    <NeonPanel text={b.sign} color={t.main} width={signW} position={[0, b.h + 1.1, f - 0.3]} />
    <LocalPointLight position={[0, 2.3, f + 1.8]} color={t.main} intensity={10} distance={8} decay={2} />
  </group>;
}

/** 两根细杆 + 横梁 + 双面霓虹字：用于夜市与漫步道入口（杆在路外，横梁 4m 高）。 */
function Gate({ a, b, text, color }: { a: [number, number]; b: [number, number]; text: string; color: string }) {
  const cx = (a[0] + b[0]) / 2;
  const cz = (a[1] + b[1]) / 2;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const yaw = -Math.atan2(b[1] - a[1], b[0] - a[0]);
  const pole = std('#2c313d', 0.4, 0.6);
  return <group position={[cx, 0, cz]} rotation-y={yaw}>
    {[-len / 2, len / 2].map(x => <mesh key={x} position={[x, 2.1, 0]} material={pole}>
      <cylinderGeometry args={[0.11, 0.14, 4.2, 8]} />
    </mesh>)}
    <mesh position={[0, 4.15, 0]} material={glow(color, 1.6)}><boxGeometry args={[len + 0.3, 0.12, 0.12]} /></mesh>
    <NeonPanel text={text} color={color} width={Math.min(len, 5.4)} position={[0, 4.9, 0]} double />
  </group>;
}

/** 摸鱼夜市：西街入口拱门 + 横跨街道的灯笼串。 */
function NightMarket() {
  const strings = [-19, -16, 3, 6, 15, 18];
  const bulbs: { p: P3; warm: boolean }[] = [];
  for (const z of strings) for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    bulbs.push({ p: [-RING.outX - 0.4 + t * (RING.outX - RING.inX + 0.8), 3.6 - Math.sin(t * Math.PI) * 0.5, z], warm: i % 2 === 0 });
  }
  return <group>
    <Gate a={[-RING.outX - 0.5, 0]} b={[-RING.inX + 0.5, 0]} text="摸鱼夜市" color={SHOP_THEMES[0].main} />
    {strings.flatMap(z => [-RING.outX - 0.4, -RING.inX + 0.4].map(x => <mesh key={`${x}${z}`} position={[x, 1.85, z]} material={std('#2c313d', 0.4, 0.6)}>
      <cylinderGeometry args={[0.05, 0.05, 3.7, 6]} />
    </mesh>))}
    {bulbs.map((b, i) => <mesh key={i} position={b.p} material={glow(b.warm ? '#ff6b4a' : '#ffd166', 2.2)}>
      <sphereGeometry args={[0.11, 8, 6]} />
    </mesh>)}
  </group>;
}

/** 天台步道：两栋店之间的木甲板、灯串、月亮招牌（招牌立在北侧栏杆外沿）。 */
function Rooftop() {
  const deck = { minX: -5.6, maxX: 5.6, minZ: B.minZ + 1.2, maxZ: -RING.outZ };
  const planks: number[] = [];
  for (let x = deck.minX + 0.8; x < deck.maxX; x += 0.8) planks.push(x);
  const bulbs: P3[] = Array.from({ length: 15 }, (_, i) => {
    const t = i / 14;
    return [-5.8 + t * 11.6, 4 - Math.sin(t * Math.PI) * 0.7, -RING.outZ - 0.4];
  });
  return <group>
    <mesh rotation-x={-Math.PI / 2} position={[0, -0.03, (deck.minZ + deck.maxZ) / 2]} material={std('#3a2f4f', 0.75)}>
      <planeGeometry args={[deck.maxX - deck.minX, deck.maxZ - deck.minZ]} />
    </mesh>
    {planks.map(x => <mesh key={x} position={[x, -0.02, (deck.minZ + deck.maxZ) / 2]} material={glow('#b18bff', 0.7)}>
      <boxGeometry args={[0.03, 0.01, deck.maxZ - deck.minZ]} />
    </mesh>)}
    {bulbs.map((p, i) => <mesh key={i} position={p} material={glow(i % 2 ? '#ffd166' : '#b18bff', 2.2)}>
      <sphereGeometry args={[0.08, 8, 6]} />
    </mesh>)}
    <group position={[0, 0, B.minZ + 0.35]}>
      {[-3.4, 3.4].map(x => <mesh key={x} position={[x, 2.8, 0]} material={std('#2c313d', 0.4, 0.6)}>
        <cylinderGeometry args={[0.09, 0.12, 5.6, 8]} />
      </mesh>)}
      <mesh position={[2.2, 6.4, -0.05]} material={glow('#ffe9a8', 1.6)}><circleGeometry args={[1.1, 32]} /></mesh>
      <NeonPanel text="天台放空" color="#b18bff" width={6.4} position={[-0.6, 5.2, 0]} />
      <LocalPointLight position={[0, 3.5, 2.5]} color="#b18bff" intensity={8} distance={9} decay={2} />
    </group>
  </group>;
}

/** 霓虹合影街：东街一组跨街光拱 + 店前可站进去的合影光环。 */
function PhotoStreet() {
  const arches = [-20, -17, 2, 5, 16, 19];
  const span = RING.outX - RING.inX + 1.8;
  const spot: P3 = [RING.outX + 3.4, 0, 2.2];
  return <group>
    {arches.map((z, i) => <mesh key={z} position={[MID_X, 0, z]} material={glow(i % 2 ? PALETTE.neonPink : PALETTE.neonCyan, 1.5)}>
      <torusGeometry args={[span / 2, 0.06, 6, 28, Math.PI]} />
    </mesh>)}
    <group position={spot} rotation-y={-Math.PI / 2}>
      <mesh position={[0, 1.75, 0]} material={glow('#ff3b5c', 1.8)}><torusGeometry args={[1.55, 0.09, 8, 40]} /></mesh>
      <mesh position={[0, 1.75, -0.02]} material={glow('#3ef0ff', 1.6)}><torusGeometry args={[1.35, 0.04, 6, 40]} /></mesh>
      {[-1, 1].map(s => <mesh key={s} position={[s * 1.1, 0.06, 0]} material={std('#2c313d', 0.4, 0.6)}>
        <boxGeometry args={[0.3, 0.12, 0.4]} />
      </mesh>)}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.012, 0.9]} material={glow('#3ef0ff', 1.2)}>
        <ringGeometry args={[0.55, 0.65, 32]} />
      </mesh>
      <NeonPanel text="霓虹合影点" color="#3ef0ff" width={3.6} position={[0, 4.1, 0]} double />
      <LocalPointLight position={[0, 2.4, 1.6]} color="#ff4fb8" intensity={8} distance={7} decay={2} />
    </group>
  </group>;
}

/** 下班漫步道：广场南口拱门 + 南侧贴地花带与矮光柱。 */
function Promenade() {
  const strips = [[-30, -16], [-8, 8], [16, 30]];
  const bollards: number[] = [];
  for (let x = -28; x <= 28; x += 4) if (Math.abs(x) > 3) bollards.push(x);
  const flowers = ['#ff8fb8', '#ffd166', '#b18bff', '#5ec8ff'];
  return <group>
    <Gate a={[-2.6, RING.inZ - 0.5]} b={[2.6, RING.inZ - 0.5]} text="下班漫步道" color="#ffd166" />
    {strips.map(([a, b], i) => <group key={a}>
      <mesh rotation-x={-Math.PI / 2} position={[(a + b) / 2, -0.02, B.maxZ - 2.2]} material={std('#2f5a3e', 0.9)}>
        <planeGeometry args={[b - a, 1.6]} />
      </mesh>
      {Array.from({ length: Math.round((b - a) / 0.7) }, (_, k) => <mesh key={k}
        position={[a + 0.35 + k * 0.7, 0.08, B.maxZ - 2.2 + ((k * 7) % 5 - 2) * 0.22]}
        material={std(flowers[(k + i) % 4], 0.6)}>
        <sphereGeometry args={[0.1, 6, 5]} />
      </mesh>)}
    </group>)}
    {bollards.map(x => <mesh key={x} position={[x, 0.35, RING.outZ + 0.5]} material={glow(x % 8 ? '#ffd166' : PALETTE.neonCyan, 1.4)}>
      <cylinderGeometry args={[0.07, 0.07, 0.7, 6]} />
    </mesh>)}
  </group>;
}

/** 外角广告牌：单杆、头顶高度，避开环街四角。 */
function CornerBillboards() {
  const boards: { x: number; z: number; text: string; color: string }[] = [
    { x: B.minX + 4, z: B.minZ + 3.5, text: '摸鱼使我快乐', color: '#ff4fb8' },
    { x: B.maxX - 4, z: B.minZ + 3.5, text: '老板在加班', color: '#3ef0ff' },
    { x: B.minX + 4, z: B.maxZ - 3.5, text: '今日不内卷', color: '#7dffa8' },
    { x: B.maxX - 4, z: B.maxZ - 3.5, text: '下班别回消息', color: '#ffd166' },
  ];
  const pole = std('#2c313d', 0.4, 0.6);
  return <group>
    {boards.map(b => <group key={b.text} position={[b.x, 0, b.z]} rotation-y={Math.atan2(-b.x, -b.z)}>
      <mesh position={[0, 3.2, 0]} material={pole}><cylinderGeometry args={[0.12, 0.15, 6.4, 8]} /></mesh>
      <mesh position={[0, 7.1, -0.08]} material={std('#11162a', 0.5, 0.4)}><boxGeometry args={[5.4, 1.5, 0.1]} /></mesh>
      <mesh position={[0, 6.32, 0]} material={glow(b.color, 1.6)}><boxGeometry args={[5.4, 0.06, 0.06]} /></mesh>
      <NeonPanel text={b.text} color={b.color} width={5.2} position={[0, 7.1, 0]} />
    </group>)}
  </group>;
}

export function StreetDistrict() {
  return <StaticBatch worldStatic>
    <DistrictFloor />
    <RingCurbs />
    <RingPosts />
    {STREET_BUILDINGS.map((b, i) => <Storefront key={b.sign} b={b} index={i} />)}
    <NightMarket />
    <Rooftop />
    <PhotoStreet />
    <Promenade />
    <CornerBillboards />
  </StaticBatch>;
}
