import { EntranceMarkers } from './EntranceMarkers';
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { ThreeElements } from '@react-three/fiber';
import * as THREE from 'three';
import { create } from 'zustand';
import { TEA_TOWN_SITES } from '../../shared/teaTown.ts';
import type { TeaMission } from '../../shared/teaTown.ts';
import { glow, std } from '../scene/materials.ts';
import { shopSignTexture } from './shopSignTexture.ts';
import { LocalPointLight } from '../scene/LocalLights.tsx';
import { rt } from '../world/runtime.ts';
import { TOWN_OPPORTUNITIES } from '../../shared/townExplore.ts';

/** 大地图上奶茶小镇的外观状态：由 TownGame 从 home 写入，场景只读。 */
export const useTownLook = create<{ active: boolean; level: number; mission: TeaMission['status'] | null; target: string | null; visited: string[] }>(() => ({
  active: false, level: 1, mission: null, target: null, visited: [],
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

function Neon({ text, color, w, h, size: _size = 150, ...rest }: { text: string; color: string; w: number; h: number; size?: number } & ThreeElements['mesh']) {
  return <mesh {...rest}>
    <planeGeometry args={[w, h]} />
    <meshBasicMaterial map={shopSignTexture(text, color, w / h)} transparent toneMapped={false} color={new THREE.Color(1.05, 1.05, 1.05)} depthWrite={false} />
  </mesh>;
}

/** 地面引导光圈：目标点更亮、脉动；其余只是淡淡标记。 */
function Beacon({ x, z, color, hot }: { x: number; z: number; color: string; hot: boolean }) {
  const ring = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (STILL) return;
    const t = clock.elapsedTime;
    ring.current?.scale.setScalar(1 + Math.sin(t * 3) * (hot ? 0.08 : 0.03));
  });
  return <group position={[x, 0, z]}>
    <mesh ref={ring} rotation-x={-Math.PI / 2} position-y={0.03} material={glow(color, hot ? 2.4 : 1.1)}>
      <ringGeometry args={[0.9, 1.08, 40]} />
    </mesh>
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
      <meshBasicMaterial color={new THREE.Color(glass).multiplyScalar(closing ? 0.6 : 0.85)} toneMapped={false} /></mesh>
    <mesh position={[-0.45, 0.62, 2.22]} material={std('#1c282e', 0.5)} castShadow><boxGeometry args={[2.1, 0.5, 0.3]} /></mesh>
    <mesh position={[1.05, 0.98, 2.12]} material={std('#0e151b', 0.4, 0.5)}><boxGeometry args={[0.85, 1.9, 0.06]} /></mesh>
    <mesh position={[1.05, 1.95, 2.16]} material={glow(L.color, 1.6)}><boxGeometry args={[0.85, 0.05, 0.03]} /></mesh>
    {/* Window framing, counter products and side-wall timber stay in the shop footprint. */}
    {[-1.4,.45].map(x=><mesh key={x} position={[x,1.45,2.15]} material={std('#b89c70',.65)}><boxGeometry args={[.05,1.35,.05]} /></mesh>)}
    {[.8,2.1].map(y=><mesh key={y} position={[-.45,y,2.15]} material={std('#b89c70',.65)}><boxGeometry args={[1.95,.05,.05]} /></mesh>)}
    {[-1.1,-.65,-.2].map(x=><group key={'cup'+x} position={[x,.94,2.25]}>
      <mesh position-y={.13} material={std('#dfbc83',.45)}><cylinderGeometry args={[.075,.06,.26,10]} /></mesh>
      <mesh position-y={.27} material={std(L.color,.5)}><cylinderGeometry args={[.085,.085,.025,10]} /></mesh>
    </group>)}
    {Array.from({length:12},(_,i)=><mesh key={'slat'+i} position={[-1.615,.8,-1.8+i*.32]} material={std('#67513e',.8)}><boxGeometry args={[.03,1.3,.12]} /></mesh>)}
    <mesh position={[-1.62,2.0,-.3]} rotation-y={-Math.PI/2} material={std('#172b32',.5)}><boxGeometry args={[1.8,.7,.04]} /></mesh>
    <Neon text="TEA & CO." color="#e9c78d" w={1.7} h={.58} size={130} rotation-y={-Math.PI/2} position={[-1.65,2.0,-.3]} />
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
      <Neon text="雇佣大厅" color="#3ef0ff" w={1.45} h={0.38} size={170} position={[0, 1.98, 0.05]} />
      <Neon text="招员工 · 可选" color="#ffd166" w={1.2} h={0.2} size={130} position={[0, 1.76, 0.05]} />
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
    {/* 广场路牌：两臂分别指向商业街与娱乐街 */}
    <group position={[-8.4, 0, 9.4]} rotation-y={Math.PI / 4}>
      <mesh position-y={1.3} material={std('#1a232b', 0.5, 0.5)}><boxGeometry args={[0.1, 2.6, 0.1]} /></mesh>
      <mesh position={[0, 2.25, 0.06]} material={std('#ff9f43', 0.5)}><boxGeometry args={[1.6, 0.34, 0.05]} /></mesh>
      <Neon text="← 商业街 · 奶茶店" color="#fff3e6" w={1.55} h={0.3} size={120} position={[0, 2.25, 0.09]} />
      <mesh position={[0, 1.8, 0.06]} material={std('#8a6bff', 0.5)}><boxGeometry args={[1.6, 0.34, 0.05]} /></mesh>
      <Neon text="娱乐街 →" color="#f2fbff" w={1.4} h={0.3} size={130} position={[0, 1.8, 0.09]} />
    </group>
  </group>;
}

/** 3D 地面路线：沿当前 rt.path 每隔约 1.1m 放一个箭头，手动行走取消/改道时同步消失或刷新。 */
const ROUTE_MAX = 160;
function TownRoute() {
  const mesh = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.28); shape.lineTo(0.24, -0.08); shape.lineTo(0.1, -0.08); shape.lineTo(0, 0.08); shape.lineTo(-0.1, -0.08); shape.lineTo(-0.24, -0.08); shape.closePath();
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.InstancedMesh(geo, glow('#3ef0ff', 2), ROUTE_MAX);
    m.count = 0;
    m.frustumCulled = false;
    return m;
  }, []);
  const last = useRef({ at: 0, path: null as [number, number][] | null, len: -1 });
  const o = useMemo(() => new THREE.Object3D(), []);
  useFrame(({ clock }) => {
    const now = clock.elapsedTime;
    const path = rt.path;
    if (now - last.current.at < 0.12 && path === last.current.path && (path?.length ?? 0) === last.current.len) return;
    last.current = { at: now, path, len: path?.length ?? 0 };
    if (!path || !path.length) { mesh.count = 0; return; }
    // 长路线抽稀：总长超出上限时加大间距，保证整条路都有箭头
    let total = 0, qx = rt.me.x, qz = rt.me.z;
    for (const [x, z] of path) { total += Math.hypot(x - qx, z - qz); qx = x; qz = z; }
    const gap = Math.max(1.1, total / (ROUTE_MAX - 2));
    let n = 0, px = rt.me.x, pz = rt.me.z, carry = 0.9;
    for (const [x, z] of path) {
      const seg = Math.hypot(x - px, z - pz);
      const yaw = Math.atan2(x - px, z - pz);
      let d = carry;
      while (d < seg && n < ROUTE_MAX) {
        o.position.set(px + ((x - px) * d) / seg, 0.035, pz + ((z - pz) * d) / seg);
        o.rotation.set(0, yaw + Math.PI, 0);
        o.updateMatrix(); mesh.setMatrixAt(n++, o.matrix);
        d += gap;
      }
      carry = d - seg; px = x; pz = z;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
  });
  return <group name="town-route"><primitive object={mesh} /></group>;
}

/** 商圈据点：地面光圈 + 立牌；已考察转绿并显示 ✓（状态来自服务端 home.exploration）。 */
function SiteMarker({ id, name, x, z, district, visited, hot }: { id: string; name: string; x: number; z: number; district: string; visited: boolean; hot: boolean }) {
  const color = visited ? '#7dffb0' : district === 'commerce' ? '#ffb347' : '#b18bff';
  return <group name={`town-site-${id}`}>
    <Beacon x={x} z={z} color={color} hot={hot || !visited} />
    {/* 悬浮立牌：不落地、不占据点 4m 空地 */}
    <group position={[x, 3.4, z]} rotation-y={Math.PI / 4}>
      <mesh material={std('#0b1016', 0.5, 0.4)}><boxGeometry args={[2.3, 0.55, 0.06]} /></mesh>
      <Neon text={visited ? `✓ ${name}` : name} color={color} w={2.2} h={0.48} size={140} position={[0, 0, 0.04]} />
    </group>
  </group>;
}

export function TownLandmarks() {
  const { level, mission, target, visited, active } = useTownLook();
  const closing = level <= 1 && mission !== 'completed';
  return <group>
    <TeaShopFacade level={level} closing={closing} />
    <Beacon x={SHOP.x} z={SHOP.z} color={LOOK[Math.max(0, Math.min(2, level - 1))].color} hot={target === 'shop' || mission === 'accepted'} />
    <RecruitStand hot={target === 'recruit'} />
    <TownGate />
    <group position={[18,0,11.2]}>
      {/* A raised street marquee keeps the walk-in point clear; the existing entry icon stays single. */}
      <group position={[0,5.1,-1.5]}>
        <mesh material={std('#101a2c',.4,.4)}><boxGeometry args={[6.9,2.05,.22]}/></mesh>
        {[-1,1].map(side=><mesh key={side} position={[side*3.47,0,0]} material={glow('#e88aff',1.5)}><boxGeometry args={[.06,2.08,.25]}/></mesh>)}
        {[-1,1].map(side=><mesh key={side} position={[0,side*1.04,0]} material={glow('#ffd875',1.3)}><boxGeometry args={[7,.06,.25]}/></mesh>)}
        {[0,Math.PI].map(angle=><group key={angle} rotation-y={angle}>
          <Neon text="霓虹赌摊 · 小游戏" color="#8affed" w={4.8} h={.4} position={[0,.68,.13]}/>
          <Neon text="富贵险中求" color="#ffe184" w={6.3} h={.88} position={[0,0,.13]}/>
          <Neon text="猜中双倍到账 · 仅试玩金币" color="#e6d5ff" w={5.8} h={.38} position={[0,-.67,.13]}/>
        </group>)}
      </group>
      <mesh rotation-x={-Math.PI/2} position-y={.026} material={glow('#aa79ff',1.3)}><ringGeometry args={[2.3,2.48,6]}/></mesh>
      <mesh rotation-x={-Math.PI/2} position-y={.028} material={glow('#65ffe7',1.5)}><ringGeometry args={[2.65,2.72,6]}/></mesh>
      <LocalPointLight position={[0,3.5,0]} color="#d8bdff" intensity={24} distance={13} decay={2}/>
      <LocalPointLight position={[-4,2.5,-4]} color="#79ffdf" intensity={18} distance={10} decay={2}/>
    </group>
    <TownRoute />
    {active && <EntranceMarkers />}
    {active && TOWN_OPPORTUNITIES.map(o => <SiteMarker key={o.id} {...o} visited={visited.includes(o.id)} hot={target === o.id} />)}
  </group>;
}
