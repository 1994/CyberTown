import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { glow, std } from '../scene/materials.ts';
import { LOW_FX } from '../scene/Office.tsx';

// 赛博小镇局部美术件：街区夜市角落与奶茶吧台的道具。纯装饰，不读写任何游戏数据。

type P3 = [number, number, number];
const REDUCED = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const b = (key: string | number, pos: P3, size: P3, mat: THREE.Material, rot?: P3) =>
  <mesh key={key} position={pos} rotation={rot} material={mat}><boxGeometry args={size} /></mesh>;
const cyl = (key: string | number, pos: P3, r: number, h: number, mat: THREE.Material, seg = 12, r2 = r) =>
  <mesh key={key} position={pos} material={mat}><cylinderGeometry args={[r, r2, h, seg]} /></mesh>;

let tileTex: THREE.CanvasTexture | null = null;
/** 店内地砖：暖灰/深灰交错小方砖，带细缝。 */
export function shopFloorTexture() {
  if (tileTex) return tileTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    g.fillStyle = (x + y) % 2 ? '#4a4f5e' : '#5b5f6c';
    g.fillRect(x * 32, y * 32, 32, 32);
  }
  g.strokeStyle = 'rgba(20,22,30,0.6)';
  g.lineWidth = 2;
  for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, 128); g.moveTo(0, i * 32); g.lineTo(128, i * 32); g.stroke(); }
  tileTex = new THREE.CanvasTexture(c);
  tileTex.colorSpace = THREE.SRGBColorSpace;
  tileTex.wrapS = tileTex.wrapT = THREE.RepeatWrapping;
  tileTex.repeat.set(7, 7);
  tileTex.anisotropy = 4;
  return tileTex;
}

/** 招聘亭：小铁皮亭 + 条纹雨棚 + 灯箱，作为街区视觉中心（在人物身后）。 */
export function RecruitKiosk({ position }: { position: P3 }) {
  const metal = std('#5a6478', 0.4, 0.5);
  return <group position={position}>
    {b('base', [0, 0.55, 0], [2.6, 1.1, 1.0], std('#2f6f86', 0.5, 0.2))}
    {b('top', [0, 1.12, 0.05], [2.7, 0.06, 1.1], metal)}
    {b('back', [0, 1.9, -0.45], [2.6, 1.6, 0.1], std('#3a4156', 0.7, 0.1))}
    {b('win', [0, 1.75, -0.39], [2.2, 0.9, 0.02], glow('#ffcf8a', 0.55))}
    {[-1.25, 1.25].map(x => b('post' + x, [x, 1.75, 0.45], [0.06, 1.3, 0.06], metal))}
    {/* 条纹雨棚：黄/深交替 */}
    {Array.from({ length: 8 }, (_, i) => b('aw' + i, [-1.225 + i * 0.35, 2.5, 0.25], [0.35, 0.05, 1.3], std(i % 2 ? '#1b1f2a' : '#e8b400', 0.6, 0.1), [0.28, 0, 0]))}
    {b('awl', [0, 2.33, 0.88], [2.8, 0.03, 0.03], glow('#ffd400', 1.6))}
    {/* 灯箱 */}
    {b('lb', [0, 3.05, -0.2], [1.8, 0.5, 0.18], std('#0b0e18', 0.8, 0.1))}
    {b('lbf', [0, 3.05, -0.1], [1.66, 0.36, 0.01], glow('#3ef0ff', 1.3))}
    {b('lbr', [0, 3.05, -0.09], [1.0, 0.1, 0.01], glow('#0b2c36', 1))}
    {/* 招聘传单夹 */}
    {[-0.8, -0.3, 0.2, 0.7].map((x, i) => b('fl' + x, [x, 0.7, 0.51], [0.32, 0.42, 0.01], std(['#e8f4ff', '#ffd400', '#ff6b4a', '#3ef0ff'][i], 0.8)))}
  </group>;
}

/** 两点之间下垂的灯串（街区线缆）。 */
export function StringLights({ from, to, sag = 0.6, count = 12, colors = ['#ffd166', '#3ef0ff', '#ff6b4a'] }: {
  from: P3; to: P3; sag?: number; count?: number; colors?: string[];
}) {
  const pts = useMemo(() => Array.from({ length: count + 1 }, (_, i) => {
    const t = i / count;
    return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t - Math.sin(t * Math.PI) * sag, from[2] + (to[2] - from[2]) * t] as P3;
  }), [from, to, sag, count]);
  const wire = std('#151820', 0.8, 0.2);
  return <group>
    {pts.slice(1).map((p, i) => {
      const a = pts[i];
      const dx = p[0] - a[0], dy = p[1] - a[1], dz = p[2] - a[2];
      const len = Math.hypot(dx, dy, dz);
      const mid: P3 = [(a[0] + p[0]) / 2, (a[1] + p[1]) / 2, (a[2] + p[2]) / 2];
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, dy, dz).normalize());
      return <mesh key={'w' + i} position={mid} quaternion={q} material={wire}><cylinderGeometry args={[0.012, 0.012, len, 4]} /></mesh>;
    })}
    {pts.slice(1, -1).map((p, i) => <mesh key={'l' + i} position={[p[0], p[1] - 0.08, p[2]]} material={glow(colors[i % colors.length], 2)}>
      <sphereGeometry args={[0.06, 8, 6]} />
    </mesh>)}
  </group>;
}

/** 湿地水洼：深色高光平面 + 霓虹倒影条，克制使用。 */
export function Puddles() {
  // 降对比：半透明湿面而非纯黑椭圆
  const water = std('#3a4560', 0.06, 0.55, { transparent: true, opacity: 0.45, depthWrite: false });
  const spots: [number, number, number, number, string][] = [[-4.6, 2.8, 1.2, 0.5, '#ffb347'], [4.2, 3.4, 1.5, 0.6, '#3ef0ff']];
  return <group>
    {spots.map(([x, z, w, d, c]) => <group key={x} position={[x, 0.004, z]}>
      <mesh rotation-x={-Math.PI / 2} scale={[w, d, 1]} material={water}><circleGeometry args={[1, 24]} /></mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0.1, 0.002, 0]} scale={[w * 0.8, d * 0.18, 1]} material={glow(c, 0.35)}><planeGeometry args={[1, 1]} /></mesh>
    </group>)}
  </group>;
}

/** 自动贩卖机 + 路灯 + 箱子：街角生活感。 */
export function StreetClutter() {
  const metal = std('#5a6478', 0.35, 0.6);
  return <group>
    <group position={[-10.6, 0, -0.6]} rotation-y={0.5}>
      {b('vm', [0, 1.0, 0], [1.0, 2.0, 0.7], std('#a8303f', 0.45, 0.3))}
      {b('vmw', [-0.12, 1.25, 0.36], [0.6, 1.1, 0.02], glow('#e8f4ff', 0.7))}
      {[0, 1, 2, 3].map(k => b('vmr' + k, [-0.12, 0.85 + k * 0.26, 0.38], [0.56, 0.03, 0.02], std(['#ffd400', '#3ef0ff', '#ff6b4a', '#7dffa8'][k], 0.5)))}
      {b('vmp', [0.33, 1.2, 0.36], [0.16, 0.5, 0.02], std('#1b1f2a', 0.5))}
    </group>
    {[[-9.4, 2.4], [9.6, 2.2]].map(([x, z]) => <group key={x} position={[x, 0, z]}>
      {cyl('p', [0, 2, 0], 0.06, 4, metal, 8, 0.08)}
      {b('arm', [x < 0 ? 0.4 : -0.4, 3.95, 0], [0.8, 0.05, 0.05], metal)}
      <mesh position={[x < 0 ? 0.75 : -0.75, 3.85, 0]} material={glow('#ffe2b0', 2.2)}><sphereGeometry args={[0.13, 10, 8]} /></mesh>
    </group>)}
    {[[9.8, -0.4, 0], [10.3, -0.1, 0.4], [10.0, 0.3, 0]].map(([x, z, r], i) => b('crate' + i, [x, 0.25 + (i === 2 ? 0.5 : 0), z], [0.6, 0.5, 0.5], std(i % 2 ? '#b38550' : '#c79a62', 0.85), [0, r, 0]))}
    {/* 雨水管 + 线缆 */}
    {cyl('pipe', [-3.6, 2.5, -2.45], 0.07, 5, metal, 8)}
    {cyl('pipe2', [3.65, 2.3, -2.45], 0.07, 4.6, metal, 8)}
  </group>;
}

/** 菜单灯箱：深底 + 彩色条目块（不用文字），三档时更宽并加金边。 */
export function MenuBoard({ position, level }: { position: P3; level: number }) {
  const rows = ['#ffb347', '#b18bff', '#7dffa8', '#ff6b4a', '#3ef0ff'];
  const w = level >= 3 ? 2.6 : 2.0;
  return <group position={position}>
    {b('bd', [0, 0, 0], [w, 1.2, 0.08], std('#0d1018', 0.7, 0.2))}
    {level >= 3 && b('gold', [0, 0, -0.01], [w + 0.12, 1.32, 0.06], glow('#ffd400', 1.2))}
    {rows.slice(0, level >= 2 ? 5 : 4).map((c, i) => <group key={c} position={[0, 0.4 - i * 0.2, 0.05]}>
      {b('d', [-w / 2 + 0.25, 0, 0], [0.14, 0.14, 0.01], glow(c, 1.2))}
      {b('l', [-0.1, 0, 0], [w * 0.5, 0.05, 0.01], std('#c8d2ff', 0.6))}
      {b('p', [w / 2 - 0.3, 0, 0], [0.24, 0.07, 0.01], glow('#ffd400', 0.9))}
    </group>)}
  </group>;
}

/** 前台后方的配料罐层架：彩色玻璃罐，随库存比例变空。 */
export function JarShelf({ position, fill }: { position: P3; fill: number }) {
  const colors = ['#ffb347', '#7a4e32', '#b18bff', '#7dffa8', '#ff6b4a', '#f2e2c4'];
  const glass = std('#cfe6ff', 0.1, 0.1, { transparent: true, opacity: 0.35 });
  const wood = std('#6b4a32', 0.7, 0.1);
  return <group position={position}>
    {[0, 0.55].map(y => b('s' + y, [0, y, 0], [2.0, 0.05, 0.3], wood))}
    {[0, 0.55].flatMap((y, row) => colors.map((c, i) => {
      const x = -0.8 + i * 0.32;
      const level = Math.max(0.05, Math.min(1, fill * 1.2 - (row * 6 + i) * 0.04));
      return <group key={`${row}${i}`} position={[x, y + 0.03, 0]}>
        <mesh position={[0, 0.17, 0]} material={glass}><cylinderGeometry args={[0.1, 0.1, 0.34, 12]} /></mesh>
        <mesh position={[0, 0.02 + level * 0.15, 0]} scale={[1, level, 1]} material={std(c, 0.6)}><cylinderGeometry args={[0.085, 0.085, 0.3, 12]} /></mesh>
        <mesh position={[0, 0.36, 0]} material={std('#3a4156', 0.5, 0.5)}><cylinderGeometry args={[0.105, 0.105, 0.04, 12]} /></mesh>
      </group>;
    }))}
  </group>;
}

/** 空杯塔：生活感道具，不代表任何订单。 */
export function CupStack({ position, n = 5 }: { position: P3; n?: number }) {
  const m = std('#e8f0ff', 0.3, 0.05);
  return <group position={position}>{Array.from({ length: n }, (_, i) =>
    <mesh key={i} position={[0, 0.06 + i * 0.05, 0]} material={m}><cylinderGeometry args={[0.07, 0.055, 0.12, 10, 1, true]} /></mesh>)}</group>;
}

/** 订单小票：挂在制作台上方横杆，数量 = 真实 makerQueue（不再画成已做好的杯子）。 */
export function OrderTickets({ position, count }: { position: P3; count: number }) {
  const paper = std('#f4efe2', 0.9);
  const ink = std('#ff6b4a', 0.6);
  const n = Math.min(count, LOW_FX ? 8 : 12);
  return <group position={position}>
    {b('rail', [0, 0.02, 0], [2.6, 0.03, 0.03], std('#9aa4b8', 0.3, 0.6))}
    {Array.from({ length: n }, (_, i) => <group key={i} position={[-1.15 + i * 0.21, -0.14, 0.02]} rotation-z={((i * 37) % 7 - 3) * 0.02}>
      {b('p', [0, 0, 0], [0.16, 0.24, 0.005], paper)}
      {b('i', [0, 0.06, 0.004], [0.1, 0.025, 0.002], ink)}
    </group>)}
  </group>;
}

/** 吊灯：一档裸灯泡，二档青色灯罩，三档金色环形吊灯。 */
export function Pendants({ level }: { level: number }) {
  const wire = std('#151820', 0.8, 0.2);
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => { if (ref.current && !LOW_FX && !REDUCED) ref.current.rotation.y = Math.sin(clock.elapsedTime * 0.4) * 0.03; });
  if (level >= 3) return <group ref={ref} position={[0.2, 3.3, -0.2]}>
    {cyl('w', [0, 0.35, 0], 0.01, 0.7, wire, 4)}
    <mesh rotation-x={Math.PI / 2} material={glow('#ffd400', 1.8)}><torusGeometry args={[1.2, 0.04, 8, 48]} /></mesh>
    {Array.from({ length: 8 }, (_, i) => <mesh key={i} position={[Math.cos(i / 8 * Math.PI * 2) * 1.2, -0.1, Math.sin(i / 8 * Math.PI * 2) * 1.2]}
      material={glow('#ffe2b0', 2)}><sphereGeometry args={[0.07, 8, 6]} /></mesh>)}
  </group>;
  return <group ref={ref}>{[-2.4, 0.6, 2.6].map(x => <group key={x} position={[x, 3.2, -0.6]}>
    {cyl('w', [0, 0.4, 0], 0.01, 0.8, wire, 4)}
    {level >= 2 && <mesh position={[0, 0.05, 0]} material={std('#2f7f95', 0.4, 0.4)}><coneGeometry args={[0.28, 0.22, 16, 1, true]} /></mesh>}
    <mesh position={[0, -0.04, 0]} material={glow(level >= 2 ? '#e8f4ff' : '#ffe2b0', 2)}><sphereGeometry args={[0.09, 10, 8]} /></mesh>
  </group>)}</group>;
}

/** 店面门楣轮廓：一档卷帘箱，二档条纹雨棚 + 霓虹管，三档双竖招牌 + 金框。 */
export function Frontage({ level, main }: { level: number; main: string }) {
  const dark = std('#1b1f2a', 0.6, 0.3);
  if (level === 1) return <group position={[0, 3.75, 2.2]}>
    {b('box', [0, 0, 0], [11.6, 0.3, 0.35], std('#5a6478', 0.45, 0.5))}
    {Array.from({ length: 4 }, (_, i) => b('sl' + i, [0, -0.2 - i * 0.07, 0.12], [11.4, 0.04, 0.02], std('#8a94a8', 0.4, 0.6)))}
  </group>;
  return <group position={[0, 3.6, 2.2]}>
    {Array.from({ length: 14 }, (_, i) => b('aw' + i, [-5.53 + i * 0.85, 0, 0], [0.85, 0.06, 1.0],
      std(i % 2 ? '#1b1f2a' : level >= 3 ? '#c9a227' : '#2f7f95', 0.6, 0.15), [0.32, 0, 0]))}
    {b('lip', [0, -0.18, 0.5], [11.9, 0.05, 0.05], glow(main, 1.6))}
    {level >= 3 && [-5.5, 5.5].map(x => <group key={x} position={[x, -1.2, 0.3]}>
      {b('blade', [0, 0, 0], [0.16, 2.0, 0.7], dark)}
      {[-1, 1].map(s => b('f' + s, [s * 0.085, 0, 0], [0.01, 1.8, 0.56], glow('#ffd400', 1.5)))}
    </group>)}
  </group>;
}

/** 取饮台：出杯口 + 地面取饮区标记（与前台、制作台分区）。 */
export function PickupCounter({ position, main }: { position: P3; main: string }) {
  return <group position={position}>
    {b('c', [0, 0.5, 0], [1.5, 1.0, 0.55], std('#4b5a78', 0.4, 0.35))}
    {b('f', [0, 0.5, 0.28], [1.4, 0.85, 0.02], std('#6f4e8a', 0.5, 0.1))}
    {b('l', [0, 1.0, 0.285], [1.5, 0.03, 0.02], glow(main, 1.8))}
    {b('sign', [0, 1.55, -0.2], [0.9, 0.3, 0.06], std('#0d1018', 0.7))}
    {b('signf', [0, 1.55, -0.16], [0.8, 0.2, 0.01], glow('#b18bff', 1.3))}
    <mesh rotation-x={-Math.PI / 2} position={[0, 0.008, 1.2]} material={glow('#b18bff', 0.45)}><ringGeometry args={[0.95, 1.0, 40]} /></mesh>
  </group>;
}
