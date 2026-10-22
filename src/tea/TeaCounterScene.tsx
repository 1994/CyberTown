import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import type { TeaRole, TeaWorker } from '../../shared/tea.ts';
import type { TeaLiveCustomer, TeaLiveFrame, TeaWorkRole } from '../../shared/teaLive.ts';
import { Character, type Rig } from '../scene/Character.tsx';
import { LOW_FX } from '../scene/Office.tsx';
import { glow, std } from '../scene/materials.ts';
import { neonText } from '../scene/textures.ts';
import { Label3D } from './Label3D.tsx';
import { STILL, lookOf, type ShopProps } from './TeaScene.tsx';
import { shopFloorTexture } from './TeaDecor.tsx';

// 剖面奶茶店：左侧暖色制作台、右侧青色取餐/端送台、前场座位区、左前入口。
// 只读实时帧：顾客 maker→making→ready→delivering→served/lost 的位置和杯子全部由状态决定，不做模拟。

type P3 = [number, number, number];
type Spot = { pos: P3; rot: number };
const v = new THREE.Vector3();

// ───────── 布局（世界坐标，镜头从前上方斜看） ─────────
const FLOOR = { minX: -7.2, maxX: 7.2, minZ: -3.4, maxZ: 4.6 };
const DOOR: P3 = [-6.9, 0, 3.9];
const KIOSK: P3 = [-4.9, 0, 2.7];
const MAKE_COUNTER = { x: -3.7, z: -0.55, w: 4.2 };
const PICK_COUNTER = { x: 3.8, z: -0.45, w: 3.4 };
const MAKER_SPOTS: Spot[] = [{ pos: [-4.7, 0, -1.5], rot: 0 }, { pos: [-3.3, 0, -1.5], rot: 0 }, { pos: [-2.1, 0, -1.4], rot: 0 }];
const PICK_SPOTS: Spot[] = [{ pos: [3.2, 0, -1.4], rot: 0 }, { pos: [4.5, 0, -1.4], rot: 0 }];
const SUPPORT_SPOT: Spot = { pos: [0.2, 0, -1.3], rot: 0 };
/** 服务端座位 0..7（4 桌 × 2 座）；-1 = 门口等位 */
const TABLES: [number, number][] = [[-1.0, 1.4], [2.0, 1.4], [0.5, 3.3], [3.5, 3.3]];
/** 每桌两座（桌左右），面朝桌子 */
const SEATS: Spot[] = TABLES.flatMap(([x, z]) => [{ pos: [x - 0.72, 0, z] as P3, rot: Math.PI / 2 }, { pos: [x + 0.72, 0, z] as P3, rot: -Math.PI / 2 }]);
const QUEUE: P3[] = [[-4.6, 0, 3.5], [-5.3, 0, 3.9], [-6.0, 0, 4.3], [-5.6, 0, 3.0], [-6.3, 0, 3.4]];

const ROLE_SHORT: Record<string, string> = { maker: '制作', cashier: '端送', support: '补位', idle: '待命' };

// ───────── 小部件 ─────────
function Neon({ text, color, w, h, position, rotation, size = 150 }: { text: string; color: string; w: number; h: number; position: P3; rotation?: P3; size?: number }) {
  return <mesh position={position} rotation={rotation}>
    <planeGeometry args={[w, h]} />
    <meshBasicMaterial map={neonText([{ text, color, size }])} transparent toneMapped={false} color={new THREE.Color(1.8, 1.8, 1.8)} depthWrite={false} />
  </mesh>;
}

function Cup({ position, color = '#f4e6d0', tea = '#a8693f', scale = 1, lid = true }: { position: P3; color?: string; tea?: string; scale?: number; lid?: boolean }) {
  return <group position={position} scale={scale}>
    <mesh position-y={0.13} material={std(color, 0.35, 0, { transparent: true, opacity: 0.9 })}><cylinderGeometry args={[0.085, 0.065, 0.26, 12]} /></mesh>
    <mesh position-y={0.09} material={std(tea, 0.6)}><cylinderGeometry args={[0.075, 0.064, 0.16, 12]} /></mesh>
    {[-0.03, 0.02, 0.04].map((x, i) => <mesh key={i} position={[x, 0.03, (i - 1) * 0.025]} material={std('#2a1a14', 0.5)}><sphereGeometry args={[0.018, 6, 5]} /></mesh>)}
    {lid && <mesh position-y={0.27} material={std('#ff7ab8', 0.4)}><cylinderGeometry args={[0.09, 0.09, 0.02, 12]} /></mesh>}
    <mesh position={[0.02, 0.36, 0]} rotation-z={-0.2} material={glow('#3ef0ff', 1.4)}><cylinderGeometry args={[0.012, 0.012, 0.22, 6]} /></mesh>
  </group>;
}

function Stool({ position }: { position: P3 }) {
  return <group position={position}>
    <mesh position-y={0.44} material={std('#ffb347', 0.5)}><cylinderGeometry args={[0.22, 0.22, 0.07, 14]} /></mesh>
    <mesh position-y={0.22} material={std('#2a313d', 0.4, 0.6)}><cylinderGeometry args={[0.04, 0.06, 0.44, 8]} /></mesh>
    <mesh position-y={0.01} material={std('#2a313d', 0.4, 0.6)}><cylinderGeometry args={[0.18, 0.18, 0.02, 12]} /></mesh>
  </group>;
}

function Table({ x, z }: { x: number; z: number }) {
  return <group position={[x, 0, z]}>
    <mesh position-y={0.74} material={std('#d9c7a6', 0.45)} castShadow receiveShadow><cylinderGeometry args={[0.46, 0.46, 0.05, 20]} /></mesh>
    <mesh position-y={0.765} material={glow('#3ef0ff', 0.8)}><torusGeometry args={[0.46, 0.012, 4, 28]} /></mesh>
    <mesh position-y={0.37} material={std('#2a313d', 0.4, 0.6)}><cylinderGeometry args={[0.05, 0.05, 0.72, 8]} /></mesh>
    <mesh position-y={0.01} material={std('#2a313d', 0.4, 0.6)}><cylinderGeometry args={[0.28, 0.28, 0.02, 14]} /></mesh>
    <mesh position={[0, 0.82, 0]} material={std('#3f8f5a', 0.7)}><sphereGeometry args={[0.07, 8, 6]} /></mesh>
  </group>;
}

/** 可点的岗位牌：真实可见网格，点击 = 指派主角下一批 */
function StationSign({ position, text, color, hot, can, count, onClick }: { position: P3; text: string; color: string; hot: boolean; can: boolean; count: number; onClick?: () => void }) {
  const ring = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => { if (!STILL && ring.current) ring.current.scale.setScalar(hot && can ? 1 + Math.sin(clock.elapsedTime * 5) * 0.05 : 1); });
  const active = !!onClick && can;
  return <group position={position}>
    <mesh ref={ring} onClick={active ? (e) => { e.stopPropagation(); onClick!(); } : undefined}
      onPointerOver={active ? () => { document.body.style.cursor = 'pointer'; } : undefined} onPointerOut={() => { document.body.style.cursor = ''; }}
      material={std(active ? (hot ? '#3a2f12' : '#0f2630') : '#141a26', 0.5, 0.3)}>
      <boxGeometry args={[1.5, 0.52, 0.08]} />
    </mesh>
    <mesh position-z={0.045} material={glow(active ? (hot ? '#ffd400' : color) : '#5a6478', active ? 1.6 : 0.6)}><boxGeometry args={[1.52, 0.04, 0.02]} /></mesh>
    <Neon text={`${text}${count ? ` ×${count}` : ''}`} color={active ? (hot ? '#ffd400' : color) : '#8d9bb8'} w={1.4} h={0.44} position={[0, 0.02, 0.05]} />
  </group>;
}

// ───────── 店面结构 ─────────
function Shell({ level, makerBusy, ready }: { level: number; makerBusy: number; ready: number }) {
  const floorTex = useMemo(() => { const t = shopFloorTexture().clone(); t.needsUpdate = true; t.repeat.set(7, 4); return t; }, []);
  const accent = ['#ff7ab8', '#3ef0ff', '#ffd166'][Math.max(0, Math.min(2, level - 1))];
  const name = ['街角奶茶', '霓虹奶茶', '夜城茶饮旗舰'][Math.max(0, Math.min(2, level - 1))];
  const W = FLOOR.maxX - FLOOR.minX, D = FLOOR.maxZ - FLOOR.minZ;
  const awning = useMemo(() => {
    const c = document.createElement('canvas'); c.width = 128; c.height = 16;
    const g = c.getContext('2d')!;
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#fff3e6' : accent; g.fillRect(i * 16, 0, 16, 16); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.repeat.set(4, 1); return t;
  }, [accent]);
  return <group>
    {/* 地面：店内地砖 + 门外人行道 */}
    <mesh rotation-x={-Math.PI / 2} position={[0, 0, (FLOOR.minZ + FLOOR.maxZ) / 2]} receiveShadow>
      <planeGeometry args={[W, D]} /><meshStandardMaterial map={floorTex} roughness={0.55} metalness={0.15} />
    </mesh>
    <mesh rotation-x={-Math.PI / 2} position={[0, -0.01, FLOOR.maxZ + 1.4]}><planeGeometry args={[W + 4, 2.8]} /><meshStandardMaterial color="#2a3142" roughness={0.8} /></mesh>
    <mesh position={[0, 0.02, FLOOR.maxZ]} material={glow(accent, 1.1)}><boxGeometry args={[W, 0.02, 0.05]} /></mesh>
    {/* 后墙：护墙板 + 墙面 + 窗外夜景 */}
    <mesh position={[0, 1.9, FLOOR.minZ]} material={std('#2a3346', 0.8)} receiveShadow><boxGeometry args={[W, 3.8, 0.2]} /></mesh>
    <mesh position={[0, 0.5, FLOOR.minZ + 0.11]} material={std('#5a4a3a', 0.7)}><boxGeometry args={[W, 1.0, 0.02]} /></mesh>
    <mesh position={[0, 1.02, FLOOR.minZ + 0.12]} material={glow(accent, 0.9)}><boxGeometry args={[W, 0.03, 0.02]} /></mesh>
    <group position={[4.6, 2.3, FLOOR.minZ + 0.12]}>
      <mesh material={std('#141b22', 0.4, 0.6)}><boxGeometry args={[3.4, 1.7, 0.04]} /></mesh>
      <mesh position-z={0.025}><planeGeometry args={[3.2, 1.5]} /><meshBasicMaterial color={new THREE.Color('#1a2a5a')} toneMapped={false} /></mesh>
      {[[-1.1, -0.3, 0.6], [-0.3, -0.1, 0.9], [0.6, -0.25, 0.7], [1.2, -0.05, 1.0]].map(([x, y, h], i) =>
        <mesh key={i} position={[x as number, (y as number) - 0.15, 0.03]}><planeGeometry args={[0.45, h as number]} /><meshBasicMaterial color={new THREE.Color('#0b1020')} /></mesh>)}
      {Array.from({ length: 10 }, (_, i) => <mesh key={'w' + i} position={[-1.3 + (i % 5) * 0.62, -0.35 + Math.floor(i / 5) * 0.3, 0.035]}><planeGeometry args={[0.06, 0.08]} />
        <meshBasicMaterial color={new THREE.Color(i % 3 ? '#ffd166' : '#3ef0ff').multiplyScalar(1.4)} toneMapped={false} /></mesh>)}
      <mesh position-y={0} material={std('#141b22', 0.4, 0.6)}><boxGeometry args={[0.05, 1.6, 0.06]} /></mesh>
    </group>
    {/* 后墙菜单板 */}
    <group position={[-0.6, 2.55, FLOOR.minZ + 0.13]}>
      <mesh material={std('#0b1016', 0.5, 0.4)}><boxGeometry args={[3.0, 1.35, 0.05]} /></mesh>
      <mesh position-z={0.03} material={glow('#ffd400', 1.2)}><boxGeometry args={[3.0, 0.03, 0.01]} /></mesh>
      <Neon text="MENU" color="#ffd400" w={1.2} h={0.32} position={[0, 0.45, 0.03]} size={170} />
      {['招牌珍珠奶茶', '现点 · 现做', '温暖每一天'].map((t, i) =>
        <Neon key={t} text={t} color={['#ffe2b0', '#d6c6ff', '#9ef8ff'][i]} w={2.4} h={0.26} position={[0, 0.08 - i * 0.3, 0.03]} size={120} />)}
    </group>
    {/* 门头招牌与雨棚（剖面上沿） */}
    <mesh position={[0, 3.85, FLOOR.minZ + 0.25]} material={std('#0b1016', 0.5, 0.4)}><boxGeometry args={[6.4, 0.7, 0.14]} /></mesh>
    <Neon text={name} color={accent} w={5.8} h={0.66} position={[0, 3.85, FLOOR.minZ + 0.33]} size={130} />
    <mesh position={[0, 3.35, FLOOR.minZ + 0.7]} rotation-x={0.5}><boxGeometry args={[W - 0.4, 0.04, 1.0]} /><meshStandardMaterial map={awning} roughness={0.7} /></mesh>
    {/* 左侧矮墙（剖开，不挡人）与入口门框 */}
    <mesh position={[FLOOR.minX, 0.6, 0.2]} material={std('#2a3346', 0.8)}><boxGeometry args={[0.2, 1.2, 7.2]} /></mesh>
    <group position={DOOR}>
      {[-0.65, 0.65].map(z => <mesh key={z} position={[0, 1.2, z]} material={std('#1a232b', 0.4, 0.6)}><boxGeometry args={[0.16, 2.4, 0.12]} /></mesh>)}
      <mesh position={[0, 2.42, 0]} material={glow(accent, 1.6)}><boxGeometry args={[0.18, 0.08, 1.42]} /></mesh>
      <Label3D text="入口" tone="tag" position={[0.3, 2.75, 0]} height={0.24} />
    </group>
    {/* 吊灯：发光球，无实时灯 */}
    {[-4.2, -1.4, 1.4, 4.2].map(x => <group key={x} position={[x, 3.0, 0.4]}>
      <mesh position-y={0.35} material={std('#2a313d', 0.4, 0.6)}><cylinderGeometry args={[0.01, 0.01, 0.7, 4]} /></mesh>
      <mesh material={std('#1a1f2b', 0.4, 0.6)}><coneGeometry args={[0.28, 0.24, 14, 1, true]} /></mesh>
      <mesh position-y={-0.08} material={glow('#ffe2b0', 2.2)}><sphereGeometry args={[0.1, 10, 8]} /></mesh>
    </group>)}
    <MakeStation busy={makerBusy} />
    <PickStation ready={ready} />
    {TABLES.map(([x, z], i) => <Table key={i} x={x} z={z} />)}
    {SEATS.map((s, i) => <Stool key={i} position={s.pos} />)}
    {/* 点单屏（入口旁自动下单） */}
    <group position={KIOSK} rotation-y={Math.PI / 5}>
      <mesh position-y={0.7} material={std('#1a2230', 0.4, 0.5)}><boxGeometry args={[0.5, 1.4, 0.3]} /></mesh>
      <mesh position={[0, 1.15, 0.16]} rotation-x={-0.25}><planeGeometry args={[0.42, 0.5]} /><meshBasicMaterial color={new THREE.Color('#3ef0ff').multiplyScalar(1.3)} toneMapped={false} /></mesh>
      <Label3D text="自助点单" tone="tag" position={[0, 1.75, 0]} height={0.22} />
    </group>
    {/* 绿植与杂物，让店里有人气 */}
    {[[-6.6, -2.9], [6.7, -2.9], [6.7, 4.1]].map(([x, z], i) => <group key={i} position={[x, 0, z]}>
      <mesh position-y={0.25} material={std('#8a5a3a', 0.7)}><cylinderGeometry args={[0.24, 0.2, 0.5, 12]} /></mesh>
      <mesh position-y={0.75} material={std('#3f8f5a', 0.7)}><icosahedronGeometry args={[0.42, 0]} /></mesh>
    </group>)}
  </group>;
}

/** 左：暖色制作台（前台面 + 后台面设备/原料）。making 数决定封口机灯和台面上的半成品杯。 */
function MakeStation({ busy }: { busy: number }) {
  const { x, z, w } = MAKE_COUNTER;
  return <group>
    {/* 后操作台 */}
    <mesh position={[x, 0.48, -2.75]} material={std('#3a2f2a', 0.6, 0.2)} castShadow><boxGeometry args={[w + 0.6, 0.96, 0.7]} /></mesh>
    <mesh position={[x, 0.98, -2.75]} material={std('#c9b48f', 0.4, 0.2)}><boxGeometry args={[w + 0.7, 0.05, 0.76]} /></mesh>
    {/* 茶桶、果糖机、封口机、冰柜 */}
    {[-1.9, -1.4].map((dx, i) => <group key={i} position={[x + dx, 1.0, -2.8]}>
      <mesh position-y={0.32} material={std('#c0c8d4', 0.25, 0.85)}><cylinderGeometry args={[0.2, 0.2, 0.64, 16]} /></mesh>
      <mesh position-y={0.66} material={std('#2a313d', 0.4, 0.6)}><cylinderGeometry args={[0.21, 0.21, 0.04, 16]} /></mesh>
      <mesh position={[0, 0.12, 0.2]} material={std('#2a313d', 0.4, 0.6)}><boxGeometry args={[0.06, 0.06, 0.1]} /></mesh>
      <Label3D text={i ? '乌龙' : '红茶'} tone="tag" position={[0, 0.9, 0]} height={0.16} />
    </group>)}
    <group position={[x - 0.4, 1.0, -2.8]}>
      <mesh position-y={0.28} material={std('#e8eef6', 0.4, 0.3)}><boxGeometry args={[0.5, 0.56, 0.45]} /></mesh>
      <mesh position={[0, 0.36, 0.23]} material={glow(busy ? '#ff9a3d' : '#5a6478', busy ? 2 : 0.6)}><boxGeometry args={[0.3, 0.08, 0.01]} /></mesh>
      <Label3D text="封口" tone={busy ? 'hot' : 'tag'} position={[0, 0.8, 0]} height={0.16} />
    </group>
    <group position={[x + 0.5, 1.0, -2.8]}>
      {[0, 1, 2, 3].map(k => <mesh key={k} position={[(k % 2) * 0.24 - 0.12, 0.15 + Math.floor(k / 2) * 0.32, 0]} material={std(['#ffcf8a', '#d6c6ff', '#9ef8ff', '#ff9aa2'][k], 0.3, 0, { transparent: true, opacity: 0.85 })}>
        <cylinderGeometry args={[0.1, 0.1, 0.28, 10]} /></mesh>)}
    </group>
    <group position={[x + 1.6, 0, -2.75]}>
      <mesh position-y={0.95} material={std('#9aa4b8', 0.3, 0.7)}><boxGeometry args={[0.9, 1.9, 0.7]} /></mesh>
      <mesh position={[0, 1.2, 0.36]}><planeGeometry args={[0.7, 1.2]} /><meshBasicMaterial color={new THREE.Color('#bfe8ff').multiplyScalar(0.9)} /></mesh>
    </group>
    {/* 墙上原料架 */}
    {[0, 1].map(r => <group key={r} position={[x, 1.9 + r * 0.55, -3.25]}>
      <mesh material={std('#5a4a3a', 0.6)}><boxGeometry args={[w, 0.05, 0.28]} /></mesh>
      {Array.from({ length: 7 }, (_, k) => <mesh key={k} position={[-w / 2 + 0.35 + k * ((w - 0.7) / 6), 0.17, 0]}
        material={std(['#ffcf8a', '#a8693f', '#7dd36a', '#e84a5f', '#d6c6ff', '#ffd166', '#2a1a14'][(k + r * 3) % 7], 0.4, 0, { transparent: true, opacity: 0.88 })}>
        <cylinderGeometry args={[0.09, 0.09, 0.28, 10]} /></mesh>)}
    </group>)}
    {/* 前制作台面 */}
    <mesh position={[x, 0.5, z]} material={std('#4a2f22', 0.55, 0.15)} castShadow><boxGeometry args={[w, 1.0, 0.7]} /></mesh>
    <mesh position={[x, 1.02, z]} material={std('#e6d3b0', 0.35, 0.1)}><boxGeometry args={[w + 0.1, 0.05, 0.76]} /></mesh>
    <mesh position={[x, 0.55, z + 0.36]} material={glow('#ff9a3d', 1.3)}><boxGeometry args={[w * 0.95, 0.05, 0.01]} /></mesh>
    {/* 摇杯与正在做的杯子 */}
    {Array.from({ length: Math.min(4, busy) }, (_, k) => <Cup key={k} position={[x - 1.4 + k * 0.5, 1.04, z]} lid={false} />)}
    {Array.from({ length: 5 }, (_, k) => <mesh key={'s' + k} position={[x + 1.6, 1.08 + k * 0.05, z - 0.15]} material={std('#f4e6d0', 0.35, 0, { transparent: true, opacity: 0.8 })}>
      <cylinderGeometry args={[0.085, 0.07, 0.06, 10]} /></mesh>)}
    <mesh position={[x + 1.1, 1.18, z + 0.05]} material={std('#c0c8d4', 0.25, 0.85)}><cylinderGeometry args={[0.07, 0.09, 0.3, 10]} /></mesh>
  </group>;
}

/** 右：青色取餐台。台面杯子数 = 真实 ready 顾客数（cashierQueue）。 */
function PickStation({ ready }: { ready: number }) {
  const { x, z, w } = PICK_COUNTER;
  const shown = Math.min(8, ready);
  return <group>
    <mesh position={[x, 0.5, z]} material={std('#18303a', 0.5, 0.25)} castShadow><boxGeometry args={[w, 1.0, 0.7]} /></mesh>
    <mesh position={[x, 1.02, z]} material={std('#dfe8ee', 0.3, 0.2)}><boxGeometry args={[w + 0.1, 0.05, 0.76]} /></mesh>
    <mesh position={[x, 0.55, z + 0.36]} material={glow('#3ef0ff', 1.4)}><boxGeometry args={[w * 0.95, 0.05, 0.01]} /></mesh>
    {/* 托盘 + 待送杯 */}
    {[-1, 0, 1].map(k => <mesh key={k} position={[x + k * 1.0, 1.06, z]} material={std('#2a313d', 0.4, 0.4)}><boxGeometry args={[0.8, 0.02, 0.5]} /></mesh>)}
    {Array.from({ length: shown }, (_, k) => <Cup key={k} position={[x - 1.3 + (k % 4) * 0.36 + Math.floor(k / 4) * 0.18, 1.07, z - 0.12 + Math.floor(k / 4) * 0.24]}
      tea={['#a8693f', '#c9a0dc', '#ffb347'][k % 3]} />)}
    {ready > shown && <Label3D text={`+${ready - shown}`} tone="hot" position={[x + 1.3, 1.5, z]} height={0.2} />}
    {/* 叫号屏 */}
    <group position={[x, 2.2, -2.9]}>
      <mesh material={std('#0b1016', 0.5, 0.4)}><boxGeometry args={[2.0, 0.8, 0.05]} /></mesh>
      <Neon text={ready ? `取餐 ${ready}` : '取餐区'} color="#3ef0ff" w={1.8} h={0.5} position={[0, 0, 0.03]} size={150} />
    </group>
    <mesh position={[x, 0.98, -2.75]} material={std('#2a3346', 0.6, 0.2)}><boxGeometry args={[w + 0.4, 1.96, 0.6]} /></mesh>
  </group>;
}

// ───────── 人物 ─────────
/** 平滑走向目标；移动时摆腿，坐下时屈腿；carry=手上拿杯 */
function Actor({ look, target, sit = false, act = false, carry = false, label, tone = 'tag', fade = false, dots, patience = null, pop, spawn, frozen = false, staff = false }: {
  look: ReturnType<typeof lookOf>; target: Spot; sit?: boolean; act?: boolean; carry?: boolean; label?: string; tone?: Parameters<typeof Label3D>[0]['tone'];
  fade?: boolean; dots?: { done: number; total: number } | null; patience?: number | null; pop?: string;
  /** 首次出现的位置（顾客从门口进来）；frozen=暂停时原地定格 */ spawn?: P3; frozen?: boolean; staff?: boolean;
}) {
  const g = useRef<THREE.Group>(null);
  const rig = useRef<Rig>(null);
  const first = useRef(true);
  useFrame(({ clock }, dt) => {
    const o = g.current;
    if (!o) return;
    v.set(target.pos[0], 0, target.pos[2]);
    if (first.current) {
      if (spawn) o.position.set(spawn[0], 0, spawn[2]); else o.position.copy(v);
      o.rotation.y = target.rot;
      // Restoring a paused session must initialize seated poses before freezing.
      if (rig.current && sit && o.position.distanceTo(v) < 0.06) {
        rig.current.legL.rotation.x = -1.45;
        rig.current.legR.rotation.x = -1.45;
        rig.current.body.position.y = -0.32;
      }
      first.current = false;
    }
    if (frozen) return;
    // Staff cross the central opening instead of walking through either counter.
    if (staff && o.position.z < 0.1 && target.pos[2] > 0.1) {
      if (o.position.z < -0.95 && Math.abs(o.position.x - 0.25) > 0.12) v.set(0.25, 0, -1.15);
      else v.set(0.25, 0, 0.2);
    } else if (staff && o.position.z > -0.95 && target.pos[2] < -0.95) {
      if (o.position.z > 0.1 && Math.abs(o.position.x - 0.25) > 0.12) v.set(0.25, 0, 0.3);
      else v.set(0.25, 0, -1.15);
    }
    const dist = o.position.distanceTo(v);
    const moving = dist > 0.06;
    if (moving) {
      const step = Math.min(dist, dt * (staff ? 5.5 : 2.6));
      o.position.lerp(v, step / dist);
      o.rotation.y = Math.atan2(v.x - o.position.x, v.z - o.position.z);
    } else o.rotation.y += (target.rot - o.rotation.y) * Math.min(1, dt * 8);
    const t = clock.elapsedTime;
    const r = rig.current;
    if (r) {
      const seated = sit && !moving;
      const swing = moving && !STILL ? Math.sin(t * 10) * 0.6 : 0;
      r.legL.rotation.x = seated ? -1.45 : swing;
      r.legR.rotation.x = seated ? -1.45 : -swing;
      r.body.position.y = seated ? -0.32 : 0;
      r.armR.rotation.x = carry ? -1.3 : act ? -1.1 + (STILL ? 0 : Math.sin(t * 14) * 0.45) : moving ? -swing * 0.6 : 0;
      r.armL.rotation.x = carry ? -1.3 : act ? -0.7 + (STILL ? 0 : Math.cos(t * 14) * 0.3) : moving ? swing * 0.6 : 0;
    }
    o.visible = !fade || moving;
  });
  return <group ref={g}>
    <Character ref={rig} look={look} scale={0.92} />
    {carry && <group position={[0, 0.95, 0.42]}><mesh material={std('#2a313d', 0.4, 0.4)}><boxGeometry args={[0.46, 0.03, 0.32]} /></mesh><Cup position={[0, 0.02, 0]} /></group>}
    {label && <Label3D text={label} tone={tone} position={[0, 2.0, 0]} height={0.22} />}
    {/* 耐心：头顶短条，绿→黄→红 */}
    {patience != null && <group position={[0, 2.26, 0]}>
      <mesh material={std('#1a1f2b', 0.6)}><boxGeometry args={[0.5, 0.06, 0.02]} /></mesh>
      <mesh position={[-0.25 + 0.25 * Math.max(0.04, patience), 0, 0.012]} scale={[Math.max(0.04, patience), 1, 1]}
        material={glow(patience > 0.66 ? '#7dffb0' : patience > 0.33 ? '#ffd166' : '#ff3b5c', 1.6)}><boxGeometry args={[0.5, 0.06, 0.01]} /></mesh>
    </group>}
    {pop && <Label3D key={pop} text={pop} tone="ok" position={[0, 2.55, 0]} height={0.26} float />}
    {dots && Array.from({ length: 3 }, (_, k) => <mesh key={k} position={[(k - 1) * 0.15, 2.3, 0]}
      material={k < dots.done ? glow('#ffd400', 2) : k < dots.total ? std('#8d9bb8', 0.5) : std('#2a2f3e', 0.6)}><sphereGeometry args={[0.045, 8, 6]} /></mesh>)}
  </group>;
}

const seatOf = (c: TeaLiveCustomer): Spot | null => (c.seat != null && c.seat >= 0 && c.seat < SEATS.length ? SEATS[c.seat] : null);
/** 送餐站位：座位朝桌一侧 */
const serveSpot = (c: TeaLiveCustomer): Spot => {
  const s = seatOf(c);
  return s ? { pos: [s.pos[0] + (s.rot > 0 ? 0.35 : -0.35), 0, s.pos[2] + 0.7], rot: Math.PI } : { pos: [PICK_COUNTER.x, 0, PICK_COUNTER.z + 0.9], rot: 0 };
};
const guestLook = (id: number) => lookOf('guest-' + id, '顾客', ['#5ab8ff', '#ff6b4a', '#7dffa8', '#b18bff', '#ffd166', '#e8f4ff'][id % 6]);
const BUBBLE: Partial<Record<TeaLiveCustomer['state'], string>> = {
  waiting: '等位', cashier: '点单', ordering: '点单中', maker: '已下单', making: '制作中', ready: '杯好了·待送', delivering: '送来了', served: '收到',
};
const SERVED_STAY = 2; // 收到杯后坐约 2 秒再走向门口

function Customers({ frame, frozen }: { frame: TeaLiveFrame; frozen: boolean }) {
  // 一个 id 一个演员，跨所有状态不重挂载：门口进场 → 等位/点单 → 座位 → 收杯付款 → 走向门口消失；流失从当前位置走出
  const restoredAt = useRef(frame.t).current;
  const list = frame.customersState.filter(c => !(c.state === 'served' && frame.t - c.at > 8) && !(c.state === 'lost' && frame.t - c.at > 6));
  const queued = list.filter(c => !seatOf(c) && c.state !== 'served' && c.state !== 'lost');
  const qIndex = new Map(queued.slice(0, QUEUE.length).map((c, i) => [c.id, i]));
  const overflow = queued.length - qIndex.size;
  return <group>
    {list.map(c => {
      const seat = seatOf(c);
      const qi = qIndex.get(c.id);
      const leaving = c.state === 'lost' || (c.state === 'served' && frame.t - c.at > SERVED_STAY);
      if (!seat && qi === undefined && !leaving) return null; // 超出可见上限：门口计数
      let target: Spot;
      if (leaving) target = { pos: DOOR, rot: -Math.PI / 2 };
      else if (seat) target = seat;
      else target = { pos: (c.state === 'ordering' || c.state === 'cashier') && qi === 0 ? [KIOSK[0] + 0.1, 0, KIOSK[2] + 0.55] : QUEUE[qi!], rot: Math.PI * 0.75 };
      const sitting = !!seat && !leaving;
      const tone = c.state === 'lost' ? 'bad' : c.state === 'served' ? 'ok' : c.state === 'ready' || c.state === 'delivering' ? 'hot' : c.patience != null && c.patience < 0.33 ? 'bad' : 'tag';
      const label = c.state === 'lost' ? `#${c.id} 等太久离开` : leaving ? `#${c.id} 谢谢！` : `#${c.id} ${BUBBLE[c.state] ?? ''}`;
      return <group key={c.id}>
        <Actor look={guestLook(c.id)} target={target} spawn={restoredAt > 0 && c.at <= restoredAt ? target.pos : DOOR} sit={sitting} fade={leaving} frozen={frozen}
          label={label} tone={tone} patience={leaving || c.state === 'served' ? null : c.patience ?? null}
          pop={c.state === 'served' && !leaving ? '付款 ✓' : undefined} />
        {c.state === 'served' && seat && !leaving && <Cup position={[seat.pos[0] + (seat.rot > 0 ? 0.42 : -0.42), 0.77, seat.pos[2]]} />}
      </group>;
    })}
    {overflow > 0 && <Label3D text={`+${overflow} 位等位`} tone="hot" position={[DOOR[0] + 0.6, 2.2, DOOR[2] - 1.2]} height={0.24} />}
  </group>;
}

function Staff({ team, roles, frame, selfId, selfAvatar, frozen }: { team: TeaWorker[]; roles: Record<string, TeaRole>; frame: TeaLiveFrame | null; selfId?: string; selfAvatar?: string; frozen: boolean }) {
  const used = { maker: 0, cashier: 0 };
  return <group>
    {team.map(w => {
      const isSelf = w.id === selfId || w.id === 'self';
      const ws = frame?.workersState.find(x => x.id === w.id);
      // 主角跟随自己的批次岗位；同事按实时岗位，筹备时按计划岗位
      const role: TeaRole | 'idle' = isSelf && frame ? (frame.selfTask.role === 'idle' ? 'idle' : frame.selfTask.role) : ws?.role ?? roles[w.id] ?? 'support';
      const cust = ws?.customerId != null ? frame?.customersState.find(c => c.id === ws.customerId) : undefined;
      const delivering = cust?.state === 'delivering';
      let spot: Spot;
      if (delivering) spot = serveSpot(cust!);
      else if (role === 'maker') spot = MAKER_SPOTS[used.maker++ % MAKER_SPOTS.length];
      else if (role === 'cashier') spot = PICK_SPOTS[used.cashier++ % PICK_SPOTS.length];
      else spot = SUPPORT_SPOT;
      const working = !!frame && (role === 'maker' || role === 'cashier') && (ws ? ws.progress > 0 || ws.customerId != null : true);
      const st = isSelf && frame ? frame.selfTask : null;
      const label = isSelf ? `你 · ${ROLE_SHORT[role]}` : `${w.name} · ${ROLE_SHORT[role]}`;
      return <Actor key={w.id} look={lookOf(w.id, w.name, w.color, isSelf ? selfAvatar : undefined)} target={spot}
        staff act={working && !delivering && !frozen} carry={delivering} frozen={frozen} label={label} tone={isSelf ? 'self' : working ? 'on' : 'tag'}
        dots={st && st.role !== 'idle' ? { done: st.done, total: Math.min(3, st.done + st.remaining) } : null} />;
    })}
  </group>;
}

// ───────── 正交镜头取景 ─────────
function OrthoFit({ portrait }: { portrait: boolean }) {
  const { camera, size } = useThree();
  useEffect(() => {
    const cam = camera as THREE.OrthographicCamera;
    // 店面占 ~15×8 米；竖屏时视角更高、更靠近中间
    cam.position.set(portrait ? 4 : 7, portrait ? 13 : 10, portrait ? 12 : 13);
    cam.lookAt(0, 0.9, 0.6);
    const spanX = portrait ? 18 : 16.5;
    const spanY = portrait ? 14 : 11.5;
    cam.zoom = Math.max(10, Math.min(size.width / spanX, size.height / spanY));
    cam.updateProjectionMatrix();
  }, [camera, size, portrait]);
  return null;
}

/** 新版剖面奶茶店。props 与旧 TeaScene 的 ShopProps 相同；指派只经可见岗位牌 onAssign。 */
export function TeaCounterScene(props: ShopProps) {
  const { level, team, roles, live, liveFrame, onAssign, canAssign, selfId, selfAvatar } = props;
  // 暂停时 live=false 但保留最后一帧并定格，不删人
  const frame = liveFrame ?? null;
  const frozen = !live;
  const making = frame ? frame.customersState.filter(c => c.state === 'making').length : 0;
  const ready = frame ? frame.customersState.filter(c => c.state === 'ready').length : 0;
  const makerQ = frame?.makerQueue ?? 0;
  const cashQ = frame?.cashierQueue ?? 0;
  const coveredBy = (r: TeaWorkRole) => !!frame?.workersState.some(w => w.id !== selfId && w.id !== 'self' && w.role === r);
  const hot = (r: TeaWorkRole, q: number) => q > 0 && (!coveredBy(r) || q >= 6);
  const portrait = typeof window !== 'undefined' && window.innerHeight > window.innerWidth;
  const low = LOW_FX || (typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 560);
  const can = !!live && !!canAssign && !!onAssign;
  return <Canvas className="tea-canvas" orthographic dpr={low ? 1 : [1, 1.75]} camera={{ position: [7, 10, 13], zoom: 50, near: 0.1, far: 100 }}
    gl={{ antialias: !low, powerPreference: low ? 'low-power' : 'high-performance' }}
    onPointerMissed={() => { document.body.style.cursor = ''; }}>
    <color attach="background" args={['#0a0d1a']} />
    <ambientLight intensity={1.15} color="#c8d2ff" />
    <hemisphereLight args={['#bfe8ff', '#3a2a1c', 1.0]} />
    <directionalLight position={[5, 9, 7]} intensity={2.3} color="#fff2dc" />
    <directionalLight position={[-6, 5, 4]} intensity={0.8} color="#ffb070" />
    <Environment resolution={64} frames={1}>
      <Lightformer form="rect" intensity={2.2} color="#ffe2b0" position={[0, 6, 4]} scale={[12, 4, 1]} />
      <Lightformer form="rect" intensity={1.3} color="#3ef0ff" position={[8, 3, 0]} rotation-y={-Math.PI / 2} scale={[10, 3, 1]} />
      <Lightformer form="rect" intensity={1.2} color="#ff9a3d" position={[-8, 3, 0]} rotation-y={Math.PI / 2} scale={[10, 3, 1]} />
    </Environment>
    <Shell level={level} makerBusy={making} ready={ready} />
    <StationSign position={[MAKE_COUNTER.x, 1.75, MAKE_COUNTER.z + 0.1]} text="制作" color="#ff9a3d" hot={hot('maker', makerQ)} can={can} count={frame ? makerQ : 0}
      onClick={onAssign ? () => onAssign('maker') : undefined} />
    <StationSign position={[PICK_COUNTER.x, 1.75, PICK_COUNTER.z + 0.1]} text="端送" color="#3ef0ff" hot={hot('cashier', cashQ)} can={can} count={frame ? cashQ : 0}
      onClick={onAssign ? () => onAssign('cashier') : undefined} />
    <Staff team={team} roles={roles} frame={frame} selfId={selfId} selfAvatar={selfAvatar} frozen={frozen} />
    {frame && <Customers frame={frame} frozen={frozen} />}
    <OrthoFit portrait={portrait} />
  </Canvas>;
}
