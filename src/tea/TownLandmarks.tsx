import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { ThreeElements } from '@react-three/fiber';
import * as THREE from 'three';
import { create } from 'zustand';
import { TEA_TOWN_SITES } from '../../shared/teaTown.ts';
import type { TeaMission } from '../../shared/teaTown.ts';
import { glow, std } from '../scene/materials.ts';
import { neonText } from '../scene/textures.ts';
import { LocalPointLight } from '../scene/LocalLights.tsx';

/** 大地图上奶茶小镇的外观状态：由 TownGame 从 home 写入，场景只读。 */
export const useTownLook = create<{ active: boolean; level: number; mission: TeaMission['status'] | null; target: 'shop' | 'recruit' | null }>(() => ({
  active: false, level: 1, mission: null, target: null,
}));

const SHOP = TEA_TOWN_SITES.shop;
const RECRUIT = TEA_TOWN_SITES.recruit;
const STILL = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
// 每一档门店：外墙 / 雨棚 / 招牌
const LOOK = [
  { wall: '#2d3a44', awning: ['#ff6fa8', '#fff3e6'], sign: '街角奶茶', color: '#ff7ab8' },
  { wall: '#22394a', awning: ['#29e3ff', '#f2fbff'], sign: '霓虹奶茶', color: '#3ef0ff' },
  { wall: '#2b2a3e', awning: ['#ffcf4a', '#2b2234'], sign: '夜城茶饮旗舰', color: '#ffd166' },
];

function stripes(a: string, b: string) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 16;
  const g = c.getContext('2d')!;
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? b : a; g.fillRect(i * 16, 0, 16, 16); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function Neon({ text, color, w, h, size = 150, ...rest }: { text: string; color: string; w: number; h: number; size?: number } & ThreeElements['mesh']) {
  return <mesh {...rest}>
    <planeGeometry args={[w, h]} />
    <meshBasicMaterial map={neonText([{ text, color, size }])} transparent toneMapped={false} color={new THREE.Color(2, 2, 2)} depthWrite={false} />
  </mesh>;
}

/** 地面引导光圈：目标点更亮、脉动；其余只是淡淡标记。 */
function Beacon({ x, z, color, hot }: { x: number; z: number; color: string; hot: boolean }) {
  const ring = useRef<THREE.Mesh>(null);
  const arrow = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (STILL) return;
    const t = clock.elapsedTime;
    ring.current?.scale.setScalar(1 + Math.sin(t * 3) * (hot ? 0.08 : 0.03));
    if (arrow.current) arrow.current.position.y = 2.6 + Math.sin(t * 2.4) * 0.15;
  });
  return <group position={[x, 0, z]}>
    <mesh ref={ring} rotation-x={-Math.PI / 2} position-y={0.03} material={glow(color, hot ? 2.4 : 1.1)}>
      <ringGeometry args={[0.9, 1.08, 40]} />
    </mesh>
    {hot && <mesh ref={arrow} position-y={2.6} rotation-x={Math.PI} material={glow(color, 2.6)}>
      <coneGeometry args={[0.28, 0.5, 4]} />
    </mesh>}
  </group>;
}

/** 原咖啡亭位置（中心 -22.5,-1，占地 4.2×3.2）重建为奶茶店，门脸朝 +x 正对交互点。 */
function TeaShopFacade({ level, closing }: { level: number; closing: boolean }) {
  const L = LOOK[Math.max(0, Math.min(2, level - 1))];
  const awning = useMemo(() => stripes(L.awning[0], L.awning[1]), [L]);
  const cup = useRef<THREE.Group>(null);
  useFrame(({ clock }) => { if (!STILL && cup.current) cup.current.rotation.y = clock.elapsedTime * 0.5; });
  const glass = closing ? '#5b4a3a' : '#ffe2b0';
  return <group position={[-22.5, 0, -1]} rotation-y={Math.PI / 2}>
    {/* 主体与檐口 */}
    <mesh position={[0, 1.4, 0]} material={std(L.wall, 0.6, 0.2)} castShadow receiveShadow><boxGeometry args={[3.2, 2.8, 4.2]} /></mesh>
    <mesh position={[0, 2.88, 0.05]} material={std('#141b22', 0.4, 0.6)}><boxGeometry args={[3.4, 0.16, 4.4]} /></mesh>
    <mesh position={[0, 0.08, 2.15]} material={std('#3a4650', 0.8)}><boxGeometry args={[3.3, 0.16, 0.25]} /></mesh>
    {/* 橱窗、门、点单窗台 */}
    <mesh position={[-0.45, 1.45, 2.11]}><planeGeometry args={[1.9, 1.3]} />
      <meshBasicMaterial color={new THREE.Color(glass).multiplyScalar(closing ? 0.6 : 1.3)} toneMapped={false} /></mesh>
    <mesh position={[-0.45, 0.62, 2.22]} material={std('#1c282e', 0.5)} castShadow><boxGeometry args={[2.1, 0.5, 0.3]} /></mesh>
    <mesh position={[1.05, 0.98, 2.12]} material={std('#0e151b', 0.4, 0.5)}><boxGeometry args={[0.85, 1.9, 0.06]} /></mesh>
    <mesh position={[1.05, 1.95, 2.16]} material={glow(L.color, 1.6)}><boxGeometry args={[0.85, 0.05, 0.03]} /></mesh>
    {/* 斜雨棚 */}
    <mesh position={[0, 2.42, 2.55]} rotation-x={0.45}><boxGeometry args={[3.4, 0.05, 1.1]} />
      <meshStandardMaterial map={awning} roughness={0.7} /></mesh>
    {/* 门头招牌 */}
    <mesh position={[0, 3.32, 1.9]} material={std('#0b1016', 0.5, 0.4)}><boxGeometry args={[3.2, 0.78, 0.12]} /></mesh>
    <Neon text={L.sign} color={L.color} w={3.1} h={0.78} size={level === 3 ? 120 : 150} position={[0, 3.32, 1.97]} />
    {/* 状态牌：救店前“即将停业”，完成后“营业中” */}
    <Neon text={closing ? '即将停业' : '营业中'} color={closing ? '#ff4d5e' : '#7dffb0'} w={1.2} h={0.32} size={170} position={[-0.45, 1.98, 2.13]} />
    {/* 屋顶大杯：店的地标 */}
    <group ref={cup} position={[0, 3.0, -1.0]}>
      <mesh position-y={0.55} material={std('#f4e6d0', 0.35, 0, { transparent: true, opacity: 0.92 })}><cylinderGeometry args={[0.5, 0.38, 1.1, 18]} /></mesh>
      <mesh position-y={0.32} material={std('#a8693f', 0.6)}><cylinderGeometry args={[0.43, 0.39, 0.5, 18]} /></mesh>
      <mesh position-y={1.14} material={std(L.awning[0], 0.4)}><cylinderGeometry args={[0.53, 0.53, 0.08, 18]} /></mesh>
      <mesh position={[0.12, 1.5, 0]} rotation-z={-0.18} material={glow(L.color, 1.8)}><cylinderGeometry args={[0.05, 0.05, 0.8, 8]} /></mesh>
    </group>
    {level >= 3 && <>
      <mesh position={[1.55, 2.4, 1.5]} material={std('#0b1016', 0.5, 0.4)}><boxGeometry args={[0.16, 2.6, 0.7]} /></mesh>
      <mesh position={[1.64, 2.4, 1.5]} rotation-y={Math.PI / 2} material={glow('#ffd166', 1.5)}><planeGeometry args={[0.5, 2.3]} /></mesh>
    </>}
    {level >= 2 && <mesh position={[0, 2.95, 2.25]} material={glow(L.color, 2)}><boxGeometry args={[3.3, 0.04, 0.04]} /></mesh>}
    <LocalPointLight position={[0, 2.2, 3.2]} color={closing ? '#ff9a7a' : L.color} intensity={closing ? 6 : 12} distance={9} decay={2} />
  </group>;
}

/** 广场招募点：一块小看板 + 光圈。 */
function RecruitStand({ hot }: { hot: boolean }) {
  return <group>
    <group position={[RECRUIT.x - 1.6, 0, RECRUIT.z - 0.4]} rotation-y={Math.PI / 4}>
      <mesh position-y={0.9} material={std('#1a232b', 0.5, 0.5)}><boxGeometry args={[0.1, 1.8, 0.1]} /></mesh>
      <mesh position-y={1.95} material={std('#0b1016', 0.5, 0.4)}><boxGeometry args={[1.5, 0.62, 0.08]} /></mesh>
      <Neon text="广场招募" color="#3ef0ff" w={1.45} h={0.38} size={170} position={[0, 1.98, 0.05]} />
      <Neon text="可选 · 0–2 人" color="#ffd166" w={1.2} h={0.2} size={130} position={[0, 1.76, 0.05]} />
    </group>
    <Beacon x={RECRUIT.x} z={RECRUIT.z} color="#3ef0ff" hot={hot} />
  </group>;
}

/** 咖啡区入口改成“奶茶小镇”门楼（挂在原有灯串立柱之间，不新增障碍）+ 广场路标。 */
function TownGate() {
  return <group>
    <mesh position={[-11, 3.55, 0]} material={std('#141b22', 0.4, 0.6)}><boxGeometry args={[0.16, 0.16, 9.6]} /></mesh>
    <mesh position={[-10.95, 3.95, 0]} rotation-y={Math.PI / 2} material={std('#0b1016', 0.5, 0.4)}><boxGeometry args={[3.6, 0.7, 0.08]} /></mesh>
    <Neon text="奶茶小镇" color="#ff7ab8" w={3.5} h={0.7} rotation-y={Math.PI / 2} position={[-10.89, 3.95, 0]} />
    <group position={[-8.4, 0, 9.4]} rotation-y={Math.PI / 4}>
      <mesh position-y={1.1} material={std('#1a232b', 0.5, 0.5)}><boxGeometry args={[0.1, 2.2, 0.1]} /></mesh>
      <mesh position={[0, 2.0, 0.06]} material={std('#ff7ab8', 0.5)}><boxGeometry args={[1.3, 0.34, 0.05]} /></mesh>
      <Neon text="← 奶茶小镇" color="#fff3e6" w={1.25} h={0.3} size={140} position={[0, 2.0, 0.09]} />
    </group>
  </group>;
}

export function TownLandmarks() {
  const { level, mission, target } = useTownLook();
  const closing = level <= 1 && mission !== 'completed';
  return <group>
    <TeaShopFacade level={level} closing={closing} />
    <Beacon x={SHOP.x} z={SHOP.z} color={LOOK[Math.max(0, Math.min(2, level - 1))].color} hot={target === 'shop' || mission === 'accepted'} />
    <RecruitStand hot={target === 'recruit'} />
    <TownGate />
  </group>;
}
