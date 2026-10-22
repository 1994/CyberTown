import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type * as THREE from 'three';
import type { Look } from '../../shared/types.ts';
import type { TownClone, TownJobKind } from '../../shared/town.ts';
import { dressedColleague } from '../look.ts';
import { Character } from '../scene/Character.tsx';
import { useGame } from '../store.ts';
import { Label3D } from './Label3D.tsx';
import { useTownState } from './townState.ts';

// 私人小镇里只显示自己雇佣的分身（TownHome.clones）：闲置在镇中心喷泉旁，派工的在对应杂活点忙碌。
// 纯装饰演员：不占碰撞、不冒充真人位置，也不再显示旧的全体同事/迎宾 NPC。

const STILL = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const SCALE = 1.12;
/** 各工作的站位（都在步道边缘/空地，不挡主路线） */
const SPOTS: Record<'idle' | Exclude<TownJobKind, 'rest'>, [number, number, number][]> = {
  // 喷泉（0,16）外圈，面朝喷泉
  idle: Array.from({ length: 12 }, (_, i) => {
    const a = Math.PI * (0.15 + (i / 11) * 0.7) + (i % 2 ? Math.PI : 0);
    return [Math.sin(a) * 3.3, 16 + Math.cos(a) * 3.3, a + Math.PI] as [number, number, number];
  }),
  // 商业街南侧人行道扫街
  clean: [-27, -24.5, -22, -19.5, -17, -14.5, -12, -25.8, -21.2, -16.4, -12.8, -10].map((x, i) => [x, i < 7 ? 13.15 : 9.25, i < 7 ? Math.PI : 0] as [number, number, number]),
  // 南巷坊/摊亭旁搬货
  stock: [-30, -29, -28, -31, -27, -26, -32, -25, -24, -33, -23, -22].map((x, i) => [x, 8.9 - (i % 2) * 0.1, Math.PI / 2] as [number, number, number]),
  // 奶茶店门口巡检
  manage: Array.from({ length: 12 }, (_, i) => [-17.6 + (i % 3) * 0.6, -3.4 + Math.floor(i / 3) * 1.6, -Math.PI / 2] as [number, number, number]),
};
const JOB_TEXT: Record<Exclude<TownJobKind, 'rest'>, string> = { clean: '保洁中', stock: '补货中', manage: '巡检中' };

function fallbackLook(c: TownClone): Look {
  return { skin: '#f1c7a1', hair: '#2b2b33', hairStyle: 'short', shirt: c.color, pants: '#2a3142', accessory: 'none', avatarUrl: c.avatarUrl, avatarName: c.name };
}

function Actor({ c, look, spot, busy }: { c: TownClone; look: Look; spot: [number, number, number]; busy: TownJobKind | null }) {
  const body = useRef<THREE.Group>(null);
  const seed = useMemo(() => [...c.id].reduce((n, ch) => n + ch.charCodeAt(0), 0) % 7, [c.id]);
  // 忙碌时轻微起伏/转身，闲置时几乎静止；减少动态时不动
  useFrame(({ clock }) => {
    if (STILL || !body.current) return;
    const t = clock.elapsedTime + seed;
    body.current.position.y = busy ? Math.abs(Math.sin(t * 4)) * 0.05 : 0;
    body.current.rotation.y = busy ? Math.sin(t * 1.3) * 0.35 : 0;
  });
  return <group name={`town-staff-${c.id}`} position={[spot[0], 0, spot[1]]} rotation-y={spot[2]}>
    <group ref={body}><Character look={look} scale={SCALE} /></group>
    <Label3D text={busy && busy !== 'rest' ? `${c.name} · ${JOB_TEXT[busy]}` : `${c.name} · Lv${c.level}`} tone={busy && busy !== 'rest' ? 'hot' : 'tag'} position={[0, 2.3, 0]} height={0.26} />
  </group>;
}

export function TownStaffActors() {
  const clones = useTownState(s => (s.home && !s.home.visitor ? s.home.clones : null));
  const colleagues = useGame(s => s.snapshot?.colleagues);
  if (!clones?.length) return null;
  const used: Record<string, number> = {};
  return <group name="town-staff">
    {clones.slice(0, 12).map(c => {
      const job = c.job && c.job.status === 'active' && c.job.kind !== 'rest' ? c.job.kind : null;
      const key = job ?? 'idle';
      const i = used[key] = (used[key] ?? -1) + 1;
      const spot = SPOTS[key][i % SPOTS[key].length];
      // 外观沿用来源同事的卡通形象与头像
      const src = colleagues?.find(x => x.selfPlayerId === c.playerId);
      const look = src ? { ...dressedColleague(src), avatarUrl: c.avatarUrl ?? src.look.avatarUrl } : fallbackLook(c);
      return <Actor key={c.id} c={c} look={look} spot={spot} busy={job} />;
    })}
  </group>;
}
