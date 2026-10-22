import { memo, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import type { TeaEvent, TeaFrame, TeaRole, TeaSkill, TeaWorker } from '../../shared/tea.ts';
import type { TeaLiveCustomer, TeaLiveFrame, TeaWorkRole } from '../../shared/teaLive.ts';
import type { Accessory, HairStyle, Look } from '../../shared/types.ts';
import { Character, type Rig } from '../scene/Character.tsx';
import { LOW_FX } from '../scene/Office.tsx';
import { glow, std } from '../scene/materials.ts';
import { neonText } from '../scene/textures.ts';
import { Label3D } from './Label3D.tsx';
import { CupStack, Frontage, JarShelf, MenuBoard, OrderTickets, Pendants, PickupCounter, Puddles, RecruitKiosk, StreetClutter, StringLights, shopFloorTexture } from './TeaDecor.tsx';

// 双场景 3D：招募街区（同事站位可点选）与霓虹奶茶店（排队/制作/库存/技能/升级外观都由回放帧驱动）。
// 场景只读传入数据，不做任何模拟；每秒随帧刷新一次即可。

type P3 = [number, number, number];
const HAIRS: HairStyle[] = ['short', 'bob', 'spiky', 'bun', 'long', 'cap'];
const ACCS: Accessory[] = ['none', 'glasses', 'headset', 'scarf', 'tie', 'sunglasses'];
const SKINS = ['#f2c9a0', '#e0ac7e', '#c98e62', '#f6d5b8', '#a8714d'];
const PANTS = ['#1d2233', '#2b2f3f', '#3a3046', '#1f2b2a'];

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const lookCache = new Map<string, Look>();
export function lookOf(id: string, name: string, color: string, avatarUrl?: string): Look {
  const key = `${id}|${color}|${avatarUrl ?? ''}`;
  let l = lookCache.get(key);
  if (!l) {
    const h = hash(id);
    l = {
      avatarUrl, avatarName: name, skin: SKINS[h % SKINS.length], hair: ['#1b1b22', '#3b2a20', '#6a3d2a', '#2c3550'][(h >> 3) % 4],
      hairStyle: HAIRS[(h >> 5) % HAIRS.length], shirt: color, pants: PANTS[(h >> 8) % PANTS.length], accessory: ACCS[(h >> 11) % ACCS.length],
    };
    lookCache.set(key, l);
  }
  return l;
}

const CUSTOMER_LOOKS = Array.from({ length: 12 }, (_, i) =>
  lookOf('guest-' + i, '顾客', ['#5ab8ff', '#ff6b4a', '#7dffa8', '#b18bff', '#ffd166', '#e8f4ff'][i % 6]));

function Bob({ children, position, rotation = 0, speed = 2, amp = 0.025, seed = 0 }: {
  children: React.ReactNode; position: P3; rotation?: number; speed?: number; amp?: number; seed?: number;
}) {
  const g = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (g.current) g.current.position.y = position[1] + (STILL ? 0 : Math.abs(Math.sin(clock.elapsedTime * speed + seed)) * amp);
  });
  return <group ref={g} position={position} rotation-y={rotation}>{children}</group>;
}

function Sign({ text, color, width, position, rotation = 0 }: { text: string; color: string; width: number; position: P3; rotation?: number }) {
  const map = useMemo(() => neonText([{ text, color, size: 150 }]), [text, color]);
  return <mesh position={position} rotation-y={rotation}>
    <planeGeometry args={[width, width / 4]} />
    <meshBasicMaterial map={map} transparent toneMapped={false} color={new THREE.Color(2, 2, 2)} depthWrite={false} />
  </mesh>;
}

function box(key: string | number, pos: P3, size: P3, mat: THREE.Material) {
  return <mesh key={key} position={pos} material={mat}><boxGeometry args={size} /></mesh>;
}

/** 脉冲光环：选中/技能触发时出现。 */
function Ring({ color, pulse = false, r = 0.55 }: { color: string; pulse?: boolean; r?: number }) {
  const m = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (m.current && pulse && !STILL) m.current.scale.setScalar(1 + (Math.sin(clock.elapsedTime * 8) + 1) * 0.12);
  });
  return <mesh ref={m} rotation-x={-Math.PI / 2} position={[0, 0.02, 0]} material={glow(color, pulse ? 2.6 : 1.6)}>
    <ringGeometry args={[r, r + 0.07, 40]} />
  </mesh>;
}

/** 工业店面立面：深窗洞 + 硬棚灯条 + 分层灯箱（与外环街区同一艺术语言）。 */
function Facade({ x, z, w, h, main, hot, sign, ry = 0 }: { x: number; z: number; w: number; h: number; main: string; hot: string; sign: string; ry?: number }) {
  const shell = std('#3a4156', 0.75, 0.15);
  const metal = std('#4a5263', 0.35, 0.85);
  const dark = std('#07090f', 0.9, 0.1);
  return <group position={[x, 0, z]} rotation-y={ry}>
    {box('b', [0, h / 2, -0.5], [w, h, 1], shell)}
    {box('w', [-0.6, 1.25, 0.01], [w - 2.4, 1.8, 0.02], dark)}
    {box('wi', [-0.6, 1.9, 0.03], [w - 2.8, 0.05, 0.01], glow(main, 0.8))}
    {box('wl', [-1.2, 1.0, 0.03], [(w - 2.4) * 0.3, 0.45, 0.01], glow(main, 0.3))}
    {[0, 1, 2, 3].map(k => box('m' + k, [-0.6 - (w - 2.4) / 2 + (k * (w - 2.4)) / 3, 1.25, 0.04], [0.1, 1.9, 0.08], metal))}
    {box('d', [w / 2 - 0.9, 1.1, 0.02], [1.1, 2.2, 0.04], std('#11162a', 0.5, 0.6))}
    {box('dl', [w / 2 - 0.9, 2.28, 0.06], [1.1, 0.03, 0.02], glow(main, 1.8))}
    {box('c', [0, 2.8, 0.5], [w - 0.4, 0.1, 1.0], std('#4a5266', 0.45, 0.5))}
    {box('cl', [0, 2.7, 1.0], [w - 0.6, 0.03, 0.03], glow(main, 1.8))}
    {[-1, 1].map(s => box('h' + s, [s * (w / 2 - 0.45), 2.72, 1.03], [0.28, 0.14, 0.02], glow(hot, 1.6)))}
    {[-1, 1].flatMap(s => [0, 1, 2, 3].map(k => box(`z${s}${k}`, [s * (w / 2 - 0.07), 0.1 + k * 0.2, 0.04], [0.14, 0.2, 0.08],
      std(k % 2 ? '#15171c' : '#e8b400', 0.6, 0.2))))}
    {box('t', [0, h - 0.08, 0.05], [w, 0.12, 0.1], glow(main, 1.8))}
    {box('fx', [0, 3.35, 0.06], [w * 0.55, 0.5, 0.12], dark)}
    {box('fxc', [0, 3.35, 0.13], [w * 0.5, 0.28, 0.01], glow(main, 0.55))}
    <Sign text={sign} color={main} width={Math.min(w - 1.2, 4.6)} position={[0, h + 0.65, -0.2]} />
    {box('ac', [-w / 4, h + 0.35, -0.6], [1.0, 0.7, 0.7], std('#39424f', 0.5, 0.6))}
  </group>;
}

export interface StreetProps {
  self: TeaWorker; candidates: TeaWorker[]; selected: string[]; focus: string | null;
  onPick: (id: string) => void; selfAvatar?: string;
}

/** 按真实窗口（非 canvas）判断竖屏：手机竖屏时 canvas 只剩上半屏、比例偏横，不能用它判断。resize/转屏时更新。 */
const isPortrait = () => typeof window !== 'undefined' && window.innerHeight > window.innerWidth;
function usePortrait() {
  const [portrait, setPortrait] = useState(isPortrait);
  useEffect(() => {
    const on = () => setPortrait(isPortrait());
    window.addEventListener('resize', on);
    window.addEventListener('orientationchange', on);
    return () => { window.removeEventListener('resize', on); window.removeEventListener('orientationchange', on); };
  }, []);
  return portrait;
}

/** 街区站位：桌面一排；竖屏两排错位（每排约一半），人物更大。 */
function streetSpots(n: number, narrow: boolean): P3[] {
  if (!narrow) {
    const sp = n > 7 ? 1.25 : 1.55;
    return Array.from({ length: n }, (_, i) => [(i - (n - 1) / 2) * sp, 0, 0.6]);
  }
  const per = Math.ceil(n / 2), sp = 1.2;
  return Array.from({ length: n }, (_, i) => {
    const row = i < per ? 0 : 1, k = row ? i - per : i, cnt = row ? n - per : per;
    return [(k - (cnt - 1) / 2) * sp + (row && cnt === per ? sp / 2 : 0), 0, row ? 1.9 : 0.5]; // 后排错位，不被前排挡住
  });
}

const Street = memo(function Street({ self, candidates, selected, focus, onPick, selfAvatar }: StreetProps) {
  const people = [self, ...candidates.slice(0, 9)];
  const spots = streetSpots(people.length, usePortrait());
  return <group>
    <mesh rotation-x={-Math.PI / 2} position={[0, 0, 2]} material={std('#2a2f3c', 0.24, 0.45)}>
      <planeGeometry args={[40, 26]} />
    </mesh>
    {box('sidewalk', [0, 0.04, -1.9], [26, 0.08, 2.4], std('#454b5c', 0.7, 0.1))}
    <Puddles />
    <StreetClutter />
    {[-1.4, 5.8].map(z => box('curb' + z, [0, 0.02, z], [40, 0.02, 0.06], glow(z < 0 ? '#3ef0ff' : '#ffd400', 1.3)))}
    {Array.from({ length: 12 }, (_, i) => box('dash' + i, [-16.5 + i * 3, 0.012, 3.4], [1.2, 0.01, 0.1], glow('#ffd166', 0.8)))}
    {/* 紧凑夜市角落：两侧店面向内收拢，中间招聘亭做视觉中心，上空灯串 */}
    <Facade x={-6.6} z={-2.6} w={6.2} h={5.2} ry={0.32} main="#ffb347" hot="#ff3b30" sign="夜班人才市场" />
    <Facade x={0} z={-4.6} w={5.4} h={4.8} main="#5ab8ff" hot="#ff3b5c" sign="打工人公寓" />
    <Facade x={6.6} z={-2.6} w={6.2} h={5.2} ry={-0.32} main="#ffd400" hot="#ff8a1f" sign="霓虹奶茶 →" />
    <RecruitKiosk position={[0, 0.08, -2.0]} />
    <StringLights from={[-4.2, 4.9, -1.6]} to={[4.2, 4.9, -1.6]} sag={0.9} count={14} />
    {!LOW_FX && <StringLights from={[-3.6, 4.4, -2.8]} to={[3.6, 5.6, -3.9]} sag={0.5} count={10} colors={['#3ef0ff', '#ff3b5c']} />}
    {people.map((w, i) => {
      const isSelf = w.id === self.id;
      const on = isSelf || selected.includes(w.id);
      const usable = isSelf || (w.enabled && w.remaining > 0);
      return <group key={w.id} position={spots[i]}
        onClick={e => { e.stopPropagation(); if (!isSelf) onPick(w.id); }}
        onPointerOver={() => { if (!isSelf) document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { document.body.style.cursor = ''; }}>
        <mesh position={[0, 0.03, 0]} material={std(usable ? '#4b5470' : '#2a2f3e', 0.45, 0.4)}>
          <cylinderGeometry args={[0.5, 0.56, 0.06, 28]} />
        </mesh>
        {on && <Ring color={isSelf ? '#ffd400' : '#3ef0ff'} pulse={focus === w.id} />}
        {!on && focus === w.id && <Ring color="#e8f4ff" r={0.48} />}
        <Bob position={[0, on ? 0.12 : 0.06, 0]} seed={i} amp={on ? 0.05 : 0.02}>
          <Character look={lookOf(w.id, w.name, w.color, isSelf ? selfAvatar : undefined)} scale={usable ? 1 : 0.92} />
        </Bob>
        <Label3D position={[0, 2.25, 0]} tone={isSelf ? 'self' : on ? 'on' : usable ? 'tag' : 'off'}
          text={`${w.name}${w.demo ? ' · 演示' : ''}${isSelf ? ' · 主角' : ''}`} />
      </group>;
    })}
    <pointLight position={[-6, 3.2, 2.5]} color="#ffb347" intensity={14} distance={11} decay={2} />
    <pointLight position={[6, 3.2, 2.5]} color="#3ef0ff" intensity={14} distance={11} decay={2} />
  </group>;
});

export interface ShopProps {
  level: number; team: TeaWorker[]; roles: Record<string, TeaRole>; frame: TeaFrame | null; stockMax: number;
  /** 当前帧附近（约 4 模拟秒）的已结算事件，只用于表现，不推导结果。 */
  events: TeaEvent[]; supportAt: TeaRole | null; selfAvatar?: string; live: boolean;
  /** 实时营业帧：稳定顾客/员工状态；有它时不再用队列索引或事件 Walker 拼人。 */
  liveFrame?: TeaLiveFrame | null; onAssign?: (r: TeaWorkRole) => void; canAssign?: boolean; selfId?: string;
}

const SKILL_FLOAT: Record<TeaSkill, string> = {
  none: '', batch_master: '批量大师！', golden_service: '金牌服务！', rescue_captain: '救场队长！', materials_saver: '省料达人！', steady_hand: '稳手！',
};
const DOOR: P3 = [-2.4, 0, 6.6];
const tmp = new THREE.Vector3();
/** 减少动态效果：关镜头漂移、Bob、技能跳动与闪烁；顾客走动（真实流程）保留。 */
export const STILL = LOW_FX || (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);

/** 员工：按岗位站位；接单/制作时挥臂，技能时跳起并飘中文字，机动支援随 support_moved 走到对应岗位旁。 */
function Worker({ w, i, role, moveTo, act, skill, live, avatar, spot, tag, dots }: {
  w: TeaWorker; i: number; role: TeaRole; moveTo: TeaRole | null; act: boolean; skill: { key: string; text: string } | null; live: boolean; avatar?: string;
  /** 实时模式：直接给出站位（覆盖 role/moveTo）、标签与自己批次的 3 格任务点 */
  spot?: { pos: P3; rot: number }; tag?: string; dots?: { done: number; total: number } | null;
}) {
  const g = useRef<THREE.Group>(null);
  const rig = useRef<Rig>(null);
  const home = spot ?? STATION[role];
  const dest = spot ?? (moveTo ? STATION[moveTo] : home);
  const dx = !spot && moveTo ? 0.95 : 0;
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    if (g.current) {
      tmp.set(dest.pos[0] + dx, 0, dest.pos[2] + (!spot && moveTo ? 0.25 : 0));
      g.current.position.lerp(tmp, Math.min(1, dt * 4));
      g.current.position.y = STILL ? 0 : skill ? Math.abs(Math.sin(t * 9)) * 0.22 : live ? Math.abs(Math.sin(t * 6 + i)) * 0.03 : 0;
      g.current.rotation.y = dest.rot;
    }
    if (rig.current) {
      rig.current.armR.rotation.x = act ? -1.1 + (STILL ? 0 : Math.sin(t * 14) * 0.45) : 0;
      rig.current.armL.rotation.x = act ? -0.7 + (STILL ? 0 : Math.cos(t * 14) * 0.3) : 0;
    }
  });
  return <group ref={g} position={home.pos} rotation-y={home.rot}>
    {skill && <Ring color="#ffd400" pulse />}
    <Character ref={rig} look={lookOf(w.id, w.name, w.color, avatar)} />
    <Label3D position={[0, 2.15, 0]} tone={skill ? 'on' : dots ? 'self' : 'tag'}
      text={tag ?? `${w.name}${moveTo ? ` · 支援${moveTo === 'cashier' ? '前台' : '制作'}` : ''}`} />
    {dots && Array.from({ length: 3 }, (_, k) => <mesh key={'dot' + k} position={[(k - 1) * 0.16, 2.45, 0]}
      material={k < dots.done ? glow('#ffd400', 2) : k < dots.total ? std('#8d9bb8', 0.5) : std('#2a2f3e', 0.6)}>
      <sphereGeometry args={[0.05, 8, 6]} />
    </mesh>)}
    {skill && <Label3D key={skill.key} position={[0, 2.6, 0]} tone="sk" height={0.36} text={skill.text} float />}
  </group>;
}

/** 顾客进店/离店：从起点走到终点后隐藏；key 绑定具体事件。 */
function Walker({ from, to, look, label, carry = false }: { from: P3; to: P3; look: Look; label?: string; carry?: boolean }) {
  const g = useRef<THREE.Group>(null);
  const t0 = useRef(-1);
  useFrame(({ clock }) => {
    if (!g.current) return;
    if (t0.current < 0) t0.current = clock.elapsedTime;
    const k = Math.min(1, (clock.elapsedTime - t0.current) / 0.95);
    g.current.position.set(from[0] + (to[0] - from[0]) * k, STILL ? 0 : Math.abs(Math.sin(k * 16)) * 0.05, from[2] + (to[2] - from[2]) * k);
    g.current.visible = k < 1;
  });
  return <group ref={g} position={from} rotation-y={Math.atan2(to[0] - from[0], to[2] - from[2])}>
    <Character look={look} scale={0.92} />
    {carry && <Cup position={[0.26, 0.82, 0.18]} color="#ffb347" />}
    {label && <Label3D position={[0, 2.1, 0]} tone="bad" height={0.26} text={label} float />}
  </group>;
}

const STATION: Record<TeaRole, { pos: P3; rot: number }> = {
  cashier: { pos: [-2.4, 0, -0.9], rot: 0 },
  maker: { pos: [0.6, 0, -1.6], rot: 0 },
  support: { pos: [3.3, 0, -1.2], rot: -0.6 },
};
const LEVEL_SIGN = ['街角奶茶', '霓虹奶茶', '夜城茶饮旗舰'];
const MACHINES = [-0.5, 1.35, 1.8];

function Cup({ position, color }: { position: P3; color: string }) {
  return <group position={position}>
    <mesh position={[0, 0.11, 0]} material={std('#dfe7ff', 0.2, 0.1)}><cylinderGeometry args={[0.07, 0.055, 0.22, 10]} /></mesh>
    <mesh position={[0, 0.17, 0]} material={glow(color, 1.1)}><cylinderGeometry args={[0.072, 0.07, 0.08, 10]} /></mesh>
  </group>;
}

/** 缺货警示：红色灯条闪烁。 */
function Alarm({ on }: { on: boolean }) {
  const m = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => { if (m.current) m.current.visible = on && (STILL || Math.sin(clock.elapsedTime * 10) > -0.2); });
  return <mesh ref={m} position={[3.6, 2.45, -2.62]} material={glow('#ff2a2a', 2.6)}><boxGeometry args={[1.9, 0.08, 0.04]} /></mesh>;
}

// ---------- 实时营业：稳定顾客、员工站位、自己的批次工位 ----------
const tc = new THREE.Vector3();
interface CustSpot { c: TeaLiveCustomer; pos: P3; leaving: boolean; carry: boolean; label?: string }
function layoutCustomers(list: TeaLiveCustomer[], now: number, cap: number): { spots: CustSpot[]; overflow: number } {
  const by = (st: TeaLiveCustomer['state']) => list.filter(c => c.state === st).sort((a, b) => a.at - b.at || a.id - b.id);
  const spots: CustSpot[] = [];
  const queue = by('cashier');
  queue.slice(0, cap).forEach((c, i) => spots.push({ c, pos: [-2.4 + (i % 2 ? 0.22 : -0.12), 0, 1.15 + i * 0.7], leaving: false, carry: false }));
  by('ordering').forEach((c, i) => spots.push({ c, pos: [-2.4 + i * 0.5, 0, 0.45], leaving: false, carry: false }));
  [...by('maker'), ...by('making')].slice(0, LOW_FX ? 4 : 8).forEach((c, i) =>
    spots.push({ c, pos: [1.9 + (i % 4) * 0.55, 0, 1.55 + Math.floor(i / 4) * 0.7], leaving: false, carry: false }));
  // 取杯：出杯后先到取饮口拿杯，再拿着走出门；流失直接离开
  by('served').filter(c => now - c.at < 6).forEach(c =>
    spots.push({ c, pos: now - c.at < 1.2 ? [2.6, 0, 1.05] : DOOR, leaving: now - c.at >= 1.2, carry: true }));
  by('lost').filter(c => now - c.at < 5).forEach(c => spots.push({ c, pos: DOOR, leaving: true, carry: false, label: '离开' }));
  return { spots, overflow: Math.max(0, queue.length - cap) };
}

function LiveCustomer({ spot }: { spot: CustSpot }) {
  const g = useRef<THREE.Group>(null);
  const { pos, leaving } = spot;
  useFrame(({ clock }, dt) => {
    const o = g.current;
    if (!o) return;
    tc.set(pos[0], 0, pos[2]);
    const dx = tc.x - o.position.x, dz = tc.z - o.position.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.04) o.rotation.y = Math.atan2(dx, dz);
    else if (!leaving) o.rotation.y = Math.PI;
    const k = Math.min(1, dt * 3.2);
    o.position.x += dx * k;
    o.position.z += dz * k;
    o.position.y = STILL || d < 0.04 ? 0 : Math.abs(Math.sin(clock.elapsedTime * 12)) * 0.05;
    o.visible = !(leaving && d < 0.35);
  });
  return <group ref={g} position={DOOR}>
    <Character look={CUSTOMER_LOOKS[spot.c.id % CUSTOMER_LOOKS.length]} scale={0.92} />
    {spot.carry && <Cup position={[0.26, 0.82, 0.18]} color="#ffb347" />}
    {spot.label && <Label3D position={[0, 2.1, 0]} tone="bad" height={0.26} text={spot.label} float />}
  </group>;
}

/** 可指派工位：只在能指派且该端有积压时发光，可点；与 UI 按钮同名兜底。 */
function AssignPad({ role, pos, can, hot, onAssign }: { role: TeaWorkRole; pos: P3; can: boolean; hot: boolean; onAssign?: (r: TeaWorkRole) => void }) {
  const m = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => { if (m.current) m.current.scale.setScalar(hot && !STILL ? 1 + Math.sin(clock.elapsedTime * 5) * 0.06 : 1); });
  return <group position={pos}>
    <mesh ref={m} rotation-x={-Math.PI / 2} position={[0, 0.03, 0]} material={glow(hot ? '#ffd400' : can ? '#3ef0ff' : '#3a4660', hot ? 2 : can ? 1 : 0.6)}>
      <ringGeometry args={[0.62, 0.72, 40]} />
    </mesh>
    {hot && <Label3D position={[0, 2.95, 0]} tone="self" height={0.3} text={role === 'cashier' ? '点此接待一批' : '点此制作一批'} />}
    <mesh position={[0, 0.8, 0.4]} visible={false}
      onClick={e => { e.stopPropagation(); if (can) onAssign?.(role); }}
      onPointerOver={() => { if (can) document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => { document.body.style.cursor = ''; }}>
      <boxGeometry args={[2.2, 1.8, 1.8]} />
    </mesh>
  </group>;
}

/** 实时营业层：员工按 workersState 站位（自己按 selfTask），顾客按 customersState 稳定 id 贯穿全流程。 */
function LiveFloor({ frame, team, events, selfId, selfAvatar, canAssign, onAssign, cap, skillOf, actOf }: {
  frame: TeaLiveFrame; team: TeaWorker[]; events: TeaEvent[]; selfId?: string; selfAvatar?: string; canAssign: boolean;
  onAssign?: (r: TeaWorkRole) => void; cap: number;
  skillOf: (id: string) => { key: string; text: string } | null; actOf: (id: string) => boolean;
}) {
  void events;
  const { spots, overflow } = layoutCustomers(frame.customersState, frame.t, cap);
  const st = frame.selfTask;
  const full = st.role !== 'idle' && st.queuedRole !== null;
  const count = (s: TeaLiveCustomer['state']) => frame.customersState.filter(c => c.state === s).length;
  const used: Record<string, number> = {};
  const spotFor = (role: TeaRole | 'idle', self: boolean) => {
    if (role === 'idle') return self ? { pos: [-0.9, 0, -1.9] as P3, rot: 0 } : { pos: [3.3, 0, -1.6] as P3, rot: -0.6 };
    const n = used[role] = (used[role] ?? 0) + 1;
    const base = STATION[role];
    return { pos: [base.pos[0] + (n - 1) * 0.75, 0, base.pos[2]] as P3, rot: base.rot };
  };
  // 员工先占岗位，自己后到（并排站）
  const ordered = [...team.filter(w => w.id !== selfId), ...team.filter(w => w.id === selfId)];
  return <>
    {ordered.map((w, i) => {
      const isSelf = w.id === selfId;
      const ws = frame.workersState.find(x => x.id === w.id);
      const role: TeaRole | 'idle' = isSelf ? st.role : ws?.role ?? 'idle';
      const busy = isSelf ? st.role !== 'idle' : !!ws && (ws.customerId !== undefined || ws.progress > 0);
      const tag = isSelf
        ? `你 · ${st.role === 'idle' ? '待命' : '执行一批'}${st.queuedRole ? ' · 下一批' : ''}`
        : `${w.name} · 自动`;
      return <Worker key={w.id} w={w} i={i} role={role === 'idle' ? 'support' : role} moveTo={null} live
        spot={spotFor(role, isSelf)} tag={tag} act={busy || actOf(w.id)} skill={skillOf(w.id)}
        dots={isSelf && st.role !== 'idle' ? { done: st.done, total: Math.min(3, st.done + st.remaining) } : null}
        avatar={isSelf ? selfAvatar : undefined} />;
    })}
    {spots.map(s => <LiveCustomer key={s.c.id} spot={s} />)}
    {overflow > 0 && <Label3D position={[-2.4, 1.6, 1.15 + cap * 0.7]} tone="hot" text={`+${overflow}`} />}
    {(['cashier', 'maker'] as const).map(r => {
      const can = canAssign && !full && count(r) > 0;
      // 有同事负责的岗位只在积压≥6 时强调
      const covered = frame.workersState.some(w => w.id !== selfId && w.role === r);
      return <AssignPad key={r} role={r} pos={r === 'cashier' ? [-2.4, 0, -0.9] : [0.6, 0, -1.6]} can={can}
        hot={can && (!covered || count(r) >= 6)} onAssign={onAssign} />;
    })}
  </>;
}

const Shop = memo(function Shop({ level, team, roles, frame, stockMax, events, supportAt, selfAvatar, live, liveFrame, onAssign, canAssign, selfId }: ShopProps) {
  const lv = Math.max(1, Math.min(3, level));
  const main = lv === 1 ? '#ffb347' : lv === 2 ? '#3ef0ff' : '#ffd400';
  const shell = std('#3a4258', 0.75, 0.15);
  const metal = std('#9aa4b8', 0.3, 0.6);
  const counter = std(lv === 3 ? '#7a6630' : '#4b5a78', 0.4, 0.35);
  const cap = LOW_FX ? 6 : 10;
  const cq = Math.min(frame?.cashierQueue ?? 0, cap);
  const stock = frame?.stock ?? stockMax;
  const crates = Math.ceil((Math.max(0, stock) / Math.max(1, stockMax)) * 10);
  // 不足一杯也算断货：省料达人每杯 0.9，其余 1 份
  const perCup = team.some(w => w.skill === 'materials_saver' && roles[w.id] === 'maker') ? 0.9 : 1;
  const out = !!frame && stock < perCup - 1e-6;
  // 只有还有顾客在等时才算断货告警；全部出完后原料为 0 只是“用完”
  const starving = out && ((frame?.cashierQueue ?? 0) + (frame?.makerQueue ?? 0) > 0);
  const now = frame?.t ?? 0;
  const near = (type: string, d = 2) => events.filter(e => e.type === type && e.t > now - d);
  // 动作绑定到事件里的 workerId：只有真正接单/制作的那个人挥臂
  const ACT_TYPES = ['order_started', 'making_started', 'order_fulfilled'];
  const actOf = (id: string) => events.some(e => ACT_TYPES.includes(e.type) && e.workerId === id && e.t > now - 2);
  const skillOf = (id: string) => {
    const e = events.filter(x => x.type === 'skill_triggered' && x.workerId === id && x.t > now - 3).pop();
    return e?.skill ? { key: `${e.t}-${id}`, text: SKILL_FLOAT[e.skill] } : null;
  };
  const queueEnd: P3 = [-2.4, 0, 0.6 + cq * 0.72];
  const arrivals = near('customer_arrived', 3).slice(-3);
  const losses = near('customer_lost', 3).slice(-3);
  const served = near('order_fulfilled', 3).slice(-3);
  const queue: P3[] = Array.from({ length: cq }, (_, i) => [-2.4 + (i % 2 ? 0.25 : -0.15), 0, 0.6 + i * 0.72]);
  const busy = live && (frame?.makerQueue ?? 0) > 0;
  const floorMat = useMemo(() => new THREE.MeshStandardMaterial({ map: shopFloorTexture(), roughness: 0.45, metalness: 0.1 }), []);
  // 等饮品的顾客 = 已接单待制作（makerQueue），站在取饮区
  const waiting: P3[] = Array.from({ length: Math.min(frame?.makerQueue ?? 0, LOW_FX ? 3 : 6) }, (_, i) =>
    [1.9 + (i % 3) * 0.62, 0, 1.55 + Math.floor(i / 3) * 0.7]);
  return <group>
    <mesh rotation-x={-Math.PI / 2} material={floorMat}><planeGeometry args={[14, 14]} /></mesh>
    {box('back', [0, 2, -2.8], [12, 4, 0.2], shell)}
    {/* 墙面分层：深色护墙板 + 制作区瓷砖背板 */}
    {box('wain', [0, 0.55, -2.68], [12, 1.1, 0.04], std('#253043', 0.6, 0.2))}
    {box('wainl', [0, 1.11, -2.65], [12, 0.04, 0.03], std('#9aa4b8', 0.3, 0.6))}
    {box('tile', [0.6, 1.75, -2.67], [3.4, 1.2, 0.02], std('#b9c4d6', 0.25, 0.1))}
    <MenuBoard position={[-2.4, 2.05, -2.64]} level={lv} />
    <JarShelf position={[-4.6, 1.25, -2.5]} fill={Math.max(0, stock) / Math.max(1, stockMax)} />
    <group position={[0, 0.25, -4.5]}><Frontage level={lv} main={main} /></group>
    <Pendants level={lv} />
    {[-1, 1].map(s => box('side' + s, [s * 6, 2, 0], [0.2, 4, 6], shell))}
    {box('trim', [0, 3.85, -2.68], [12, 0.1, 0.06], glow(main, 1.8))}
    {/* 前台 */}
    {box('cc', [-2.4, 0.5, -0.3], [1.8, 1.0, 0.6], counter)}
    {box('ccl', [-2.4, 1.0, 0.01], [1.8, 0.03, 0.02], glow(main, 1.8))}
    {box('ccf', [-2.4, 0.5, 0.005], [1.7, 0.85, 0.02], std('#2f7f95', 0.5, 0.1))}
    {box('pos', [-2.1, 1.14, -0.35], [0.4, 0.28, 0.06], glow('#5ab8ff', 0.8))}
    {/* 制作台 + 待出杯 */}
    {box('mc', [0.6, 0.5, -1.0], [2.6, 1.0, 0.6], counter)}
    {box('mcl', [0.6, 1.0, -0.69], [2.6, 0.03, 0.02], glow(main, 1.8))}
    {/* 制作设备排在台两侧，中间留出员工操作窗口（不挡脸） */}
    {MACHINES.map(x => box('mach' + x, [x, 1.3, -1.15], [0.4, 0.6, 0.35], metal))}
    {box('mcf', [0.6, 0.5, -0.695], [2.5, 0.85, 0.02], std('#a8613a', 0.5, 0.1))}
    {MACHINES.map((x, i) => box('mbody' + x, [x, 1.32, -0.96], [0.36, 0.5, 0.02], std(['#d94f6b', '#e8b400', '#3fb6d0'][i], 0.4, 0.1)))}
    {MACHINES.map(x => box('mled' + x, [x, 1.45, -0.94], [0.22, 0.05, 0.01], glow(busy ? '#7dffa8' : '#3a4660', busy ? 1.8 : 1)))}
    {/* 待制作 = 订单小票（真实 makerQueue），不再画成做好的杯子 */}
    <OrderTickets position={[0.6, 2.62, -2.6]} count={frame?.makerQueue ?? 0} />
    <CupStack position={[1.75, 1.0, -0.85]} />
    <CupStack position={[-0.55, 1.0, -0.85]} n={3} />
    {/* 取饮区：出杯后顾客在这里取走饮品再离店 */}
    <PickupCounter position={[2.6, 0, 0.5]} main={main} />
    {!liveFrame && live && served.length > 0 && <Cup position={[2.6, 1.0, 0.45]} color="#ffb347" />}
    {!liveFrame && waiting.map((p, i) => <Bob key={'wt' + i} position={p} rotation={Math.PI} seed={i + 3} speed={1.2} amp={0.015}>
      <Character look={CUSTOMER_LOOKS[(i + 4) % CUSTOMER_LOOKS.length]} scale={0.9} />
    </Bob>)}
    {/* 原料货架：箱数随库存减少，售罄红灯 */}
    {box('sh', [3.6, 1.2, -2.45], [2.0, 2.4, 0.5], std('#525a74', 0.55, 0.3))}
    {[0.45, 1.25, 2.05].map(y => box('sb' + y, [3.6, y, -2.2], [2.0, 0.04, 0.5], metal))}
    {Array.from({ length: crates }, (_, i) => box('cr' + i, [2.9 + (i % 4) * 0.46, 0.66 + Math.floor(i / 4) * 0.8, -2.3], [0.4, 0.38, 0.36],
      std(i % 2 ? '#c79a62' : '#b38550', 0.85)))}
    <Alarm on={starving} />
    {/* 升级外观：二档霓虹拱与吊灯，三档金色旗舰装饰（不加产能） */}
    <Sign text={LEVEL_SIGN[lv - 1]} color={main} width={lv === 3 ? 4.8 : 4.0} position={[1.0, 2.95, -2.64]} />
    {lv >= 2 && <mesh position={[1.0, 1.35, -2.65]} material={glow('#ff3b5c', 1.4)}><torusGeometry args={[2.3, 0.035, 6, 40, Math.PI]} /></mesh>}
    {lv >= 3 && [-5.85, 5.85].map(x => box('gold' + x, [x, 2, -1], [0.04, 3.8, 0.06], glow('#ffd400', 1.6)))}
    {lv >= 3 && box('vip', [-4.6, 0.45, 1.6], [1.4, 0.9, 0.8], std('#2a2414', 0.5, 0.6))}
    {liveFrame ? <LiveFloor frame={liveFrame} team={team} events={events} selfId={selfId ?? team[0]?.id} selfAvatar={selfAvatar}
      canAssign={!!canAssign} onAssign={onAssign} cap={cap} skillOf={skillOf} actOf={actOf} /> : <>
    {/* 员工：动作与技能浮字全部来自 run.result.events */}
    {team.map((w, i) => {
      const role = roles[w.id] ?? 'support';
      return <Worker key={w.id} w={w} i={i} role={role} moveTo={role === 'support' && live ? supportAt : null} live={live}
        act={live && actOf(w.id)} skill={live ? skillOf(w.id) : null}
        avatar={i === 0 ? selfAvatar : undefined} />;
    })}
    {/* 排队顾客：真实 cashierQueue 驱动 */}
    {queue.map((p, i) => <Bob key={i} position={p} rotation={Math.PI} seed={i} speed={1.4} amp={0.02}>
      <Character look={CUSTOMER_LOOKS[i % CUSTOMER_LOOKS.length]} scale={0.92} />
    </Bob>)}
    {(frame?.cashierQueue ?? 0) > cap && <Label3D position={[-2.4, 1.6, 0.6 + cap * 0.72]} tone="hot" text={`+${frame!.cashierQueue - cap}`} />}
    {live && arrivals.map((e, i) => <Walker key={`a${e.t}-${e.customerId ?? i}`} from={DOOR} to={queueEnd} look={CUSTOMER_LOOKS[(e.customerId ?? i) % CUSTOMER_LOOKS.length]} />)}
    {live && losses.map((e, i) => <Walker key={`l${e.t}-${e.customerId ?? i}`} from={e.reason === 'maker' ? [0.6, 0, 0.2] : [-2.4, 0, 0.6]} to={DOOR}
      look={CUSTOMER_LOOKS[(e.customerId ?? i + 5) % CUSTOMER_LOOKS.length]} label={e.reason === 'stock' ? '断货离开' : e.reason === 'maker' ? '等太久' : '排不上'} />)}
    {live && served.map((e, i) => <Label3D key={`s${e.t}-${e.customerId ?? i}`} position={[2.6, 1.7, 0.5]} tone="ok" text="+1" float />)}
    {live && served.slice(-2).map((e, i) => <Walker key={`o${e.t}-${e.customerId ?? i}`} from={[2.6, 0, 1.2]} to={DOOR} carry
      look={CUSTOMER_LOOKS[((e.customerId ?? i) + 4) % CUSTOMER_LOOKS.length]} />)}
    </>}
    {out && <Label3D position={[3.6, 2.9, -2.4]} tone={starving ? 'hot' : 'tag'} text={starving ? '断货！' : '原料用完'} />}
    {box('door', [-2.4, 0.01, 6.6], [2.2, 0.01, 0.08], glow('#3ef0ff', 1.4))}
    <pointLight position={[-2.4, 3, 1]} color={main} intensity={12} distance={9} decay={2} />
    <pointLight position={[2.4, 3, 0]} color={lv === 1 ? '#ff6b4a' : '#5ab8ff'} intensity={10} distance={9} decay={2} />
  </group>;
});

/** 3/4 俯视取景：把关键点（人物、柜台、招牌）投影到相机平面，按 canvas 实际宽高分别求横/纵所需距离，
 *  内容在可用区域内上下左右居中。切景/尺寸变化首帧直接对准，之后只做极小漂移。 */
interface Fit { key: string; points: P3[]; wide?: P3[]; narrow?: P3[]; elev: number }
const fwd = new THREE.Vector3(), up = new THREE.Vector3(), right = new THREE.Vector3(1, 0, 0), pv = new THREE.Vector3(), aim = new THREE.Vector3();
function solve(points: P3[], elev: number, aspect: number, fovDeg: number, out: THREE.Vector3, target: THREE.Vector3) {
  fwd.set(0, -Math.sin(elev), -Math.cos(elev));
  up.set(0, Math.cos(elev), -Math.sin(elev));
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of points) {
    pv.set(...p);
    const x = pv.dot(right), y = pv.dot(up), z = pv.dot(fwd);
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
  }
  const tv = Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2), th = tv * aspect;
  const depth = (z1 - z0) / 2;
  const dist = Math.max((x1 - x0) / 2 / th, (y1 - y0) / 2 / tv) * 1.08 + depth * 0.5 + 0.6;
  target.copy(right).multiplyScalar((x0 + x1) / 2).addScaledVector(up, (y0 + y1) / 2).addScaledVector(fwd, (z0 + z1) / 2);
  out.copy(target).addScaledVector(fwd, -dist);
}
function CameraRig({ fit }: { fit: Fit }) {
  const portrait = usePortrait();
  const { camera, size } = useThree();
  const want = useRef(new THREE.Vector3());
  const look = useRef(new THREE.Vector3());
  const last = useRef('');
  useFrame(({ clock }) => {
    const cam = camera as THREE.PerspectiveCamera;
    const aspect = size.width / Math.max(1, size.height);
    // 宽画面才把高处招牌一起纳入；窄屏优先人物与柜台
    const pts = portrait && fit.narrow ? fit.narrow : aspect >= 1.2 && fit.wide ? [...fit.points, ...fit.wide] : fit.points;
    solve(pts, fit.elev, aspect, cam.fov, want.current, aim);
    const k = `${fit.key}|${portrait ? 'p' : 'l'}|${size.width}x${size.height}`;
    if (k !== last.current) { last.current = k; camera.position.copy(want.current); look.current.copy(aim); }
    const drift = STILL ? 0 : Math.sin(clock.elapsedTime * 0.15) * 0.12;
    tmp.copy(want.current).x += drift;
    camera.position.lerp(tmp, 0.1);
    look.current.lerp(aim, 0.1);
    camera.lookAt(look.current);
  });
  return null;
}

export function TeaScene(props: { view: 'street'; street: StreetProps } | { view: 'shop'; shop: ShopProps }) {
  // ?lowfx=1 或窄屏：降低像素比、关抗锯齿、减少排队人数
  let fit: Fit;
  if (props.view === 'street') {
    const n = 1 + Math.min(9, props.street.candidates.length);
    const L = ((n - 1) * (n > 7 ? 1.25 : 1.55)) / 2 + 0.6;
    const two = streetSpots(n, true);
    const nx = Math.max(...two.map(p => Math.abs(p[0]))) + 0.6;
    fit = { key: `street${n}`, elev: 0.38,
      narrow: [[-nx, 0, 2.5], [nx, 0, 2.5], [-nx, 2.5, 0.5], [nx, 2.5, 0.5], [0, 3.4, -2.0]],
      points: [[-L, 0, 1.3], [L, 0, 1.3], [-L, 2.5, 0.6], [L, 2.5, 0.6], [0, 3.4, -2.0]],
      wide: [[-8.6, 6.0, -2.4], [8.6, 6.0, -2.4], [0, 6.0, -4.6]] };
  } else if (props.shop.live && props.shop.frame) {
    const cap = LOW_FX ? 6 : 10;
    fit = { key: 'shop-live', elev: 0.66,
      points: [[-4.4, 0, -2.4], [3.6, 0, -1.2], [-3, 0, 0.6 + cap * 0.72], [3.4, 0, 2.4], [-2.4, 2.3, -0.9], [0.6, 2.3, -1.6], [-1, 3.6, -2.7]] };
  } else {
    // 筹备：三人、三个工作区、菜单与招牌占满可用区
    fit = { key: 'shop-prep', elev: 0.55,
      points: [[-4.4, 0, -2.4], [3.6, 0, -1.2], [-3.2, 0, 1.0], [3.4, 0, 1.3], [-2.4, 2.3, -0.9], [0.6, 2.3, -1.6], [-1, 3.7, -2.7], [3.3, 2.3, -1.2]] };
  }
  const low = LOW_FX || (typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 560);
  return <Canvas className="tea-canvas" dpr={low ? 1 : [1, 1.75]} camera={{ position: [0, 3, 9], fov: 45 }} gl={{ antialias: !low, powerPreference: low ? 'low-power' : 'high-performance' }}>
    <color attach="background" args={['#0a0d1a']} />
    <fog attach="fog" args={['#0a0d1a', 22, 48]} />
    {/* 夜景但不黑成剪影：明亮环境光 + 冷暖主辅光 + 本地 Lightformer 环境反射（金属不再发黑，无网络 HDR） */}
    <ambientLight intensity={1.1} color="#c8d2ff" />
    <hemisphereLight args={['#bfe8ff', '#3a2a1c', 1.0]} />
    <directionalLight position={[5, 9, 7]} intensity={2.4} color="#fff2dc" />
    <directionalLight position={[-6, 5, 4]} intensity={0.9} color="#7fdcff" />
    <Environment resolution={64} frames={1}>
      <Lightformer form="rect" intensity={2.2} color="#ffe2b0" position={[0, 6, 4]} scale={[12, 4, 1]} />
      <Lightformer form="rect" intensity={1.4} color="#3ef0ff" position={[-8, 3, 0]} rotation-y={Math.PI / 2} scale={[10, 3, 1]} />
      <Lightformer form="rect" intensity={1.2} color="#ffd400" position={[8, 3, 0]} rotation-y={-Math.PI / 2} scale={[10, 3, 1]} />
      <Lightformer form="rect" intensity={0.8} color="#8c96ff" position={[0, 2, -8]} scale={[16, 3, 1]} />
    </Environment>
    {props.view === 'street' ? <Street {...props.street} /> : <Shop {...props.shop} />}
    <CameraRig fit={fit} />
  </Canvas>;
}
