import { useRide } from './rideState';
import { BASKETBALL } from '../../shared/townActivities';
import { useEffect, useRef, useState } from 'react';
import { BRIDGES, RIVER, TOWN_DESTINATIONS, TOWN_DISTRICTS, TOWN_KIOSKS, TOWN_LANDMARKS, TOWN_ROADS, TOWN_SHOPHOUSES, TOWN_STREETS, isSite, type DestinationId } from '../../shared/townPlan.ts';
import { BOXES, PATHS, WORLD_BOUNDS, findPath } from '../../shared/world.ts';
import { TOWN_LOCKED_AREAS } from '../../shared/townLockedAreas.ts';
import { useGame } from '../store.ts';
import { rt, useWorld } from '../world/runtime.ts';

// 小镇地图：总览/分区查看。大区轮廓/街道/河/街屋/地标/据点/玩家/真实路线折线；点击任意处 = 真实寻路，不瞬移。
const B = WORLD_BOUNDS;
export type MapView = 'all' | 'commerce' | 'plaza' | 'leisure';
/** 各视图的世界矩形（宽高比 ≈ 地图框 180:132） */
const VIEWS: Record<MapView, { minX: number; minZ: number; w: number; h: number }> = {
  all: { minX: B.minX, minZ: B.minZ, w: B.maxX - B.minX, h: B.maxZ - B.minZ },
  // 分区视图覆盖本区全部据点（含南侧河港/滨河）
  commerce: { minX: -92, minZ: -32, w: 112, h: 82 },
  plaza: { minX: -45, minZ: -24, w: 90, h: 66 },
  leisure: { minX: -20, minZ: -32, w: 112, h: 82 },
};
export const MAP_VIEW_LABEL: Record<MapView, string> = { all: '总览', commerce: '商业区', plaza: '老镇中心', leisure: '娱乐区' };
const DEST_ICON: Record<DestinationId, string> = {
  shopping: '🛍', bicycle: '🚲', basketball: '🏀', arcade: '🎮', shop: '🧋', recruit: '🙋', leisure: '🎮', plaza: '⛲', 'west-market': '🏪', 'river-dock': '⚓', 'star-park': '🎡', 'river-walk': '🌉',
};

export function TownMap({ target, view, visited, onWalk }: { target: DestinationId | null; view: MapView; visited: string[]; onWalk: () => void }) {
  const myId = useGame(s => s.snapshot?.me.id);
  const players = useWorld(s => s.players);
  const svg = useRef<SVGSVGElement>(null);
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick(x => x + 1), 200); return () => clearInterval(id); }, []);
  const V = VIEWS[view];
  // 文字与标记随视图缩放：总览只放大区名与据点，分区才显示街名/地标
  const k = V.w / 90;
  const detail = view !== 'all';

  const go = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = svg.current!.getBoundingClientRect();
    // viewBox 以 meet 居中：按实际缩放换算点击位置
    const s = Math.min(r.width / V.w, r.height / V.h);
    const ox = (r.width - V.w * s) / 2, oy = (r.height - V.h * s) / 2;
    const x = V.minX + (e.clientX - r.left - ox) / s;
    const z = V.minZ + (e.clientY - r.top - oy) / s;
    if (x < B.minX || x > B.maxX || z < B.minZ || z > B.maxZ) return;
    const p = findPath(rt.me.x, rt.me.z, x, z);
    rt.npcNavigation = null;
    rt.path = p && p.length ? p : null;
    useWorld.getState().setOverview(false);
    onWalk();
  };
  const me = rt.me;
  const route = rt.path?.length ? [[me.x, me.z] as [number, number], ...rt.path] : null;
  return <svg ref={svg} className="town-mapsvg" viewBox={`${V.minX} ${V.minZ} ${V.w} ${V.h}`} onClick={go} role="img"
    aria-label={`小镇地图·${MAP_VIEW_LABEL[view]}，点击设定步行目标`} data-testid="minimap" data-view={view}>
    <rect x={B.minX} y={B.minZ} width={B.maxX - B.minX} height={B.maxZ - B.minZ} fill="#0d1322" />
    {TOWN_DISTRICTS.map(d => <rect key={d.id} x={d.rect.minX} y={d.rect.minZ} width={d.rect.maxX - d.rect.minX} height={d.rect.maxZ - d.rect.minZ}
      fill={d.color} fillOpacity={d.id === 'expansion' ? 0.04 : 0.08} stroke={d.color} strokeOpacity={0.45} strokeWidth={0.3 * k}
      strokeDasharray={d.id === 'expansion' ? `${1.2 * k} ${k}` : undefined} />)}
    <rect x={B.minX} y={RIVER.minZ} width={B.maxX - B.minX} height={RIVER.maxZ - RIVER.minZ} fill="#1d5a8a" opacity={0.8} />
    {[...PATHS, ...TOWN_ROADS].map((p, i) => <rect key={i} x={p.minX} y={p.minZ} width={p.maxX - p.minX} height={p.maxZ - p.minZ} fill="#5d6c8c" opacity={0.75} />)}
    <rect x={BASKETBALL.x-6} y={BASKETBALL.z-7} width={12} height={14} fill="#985f42" stroke="#9bc9c2" strokeWidth={.3}/>
    <path d={`M${BASKETBALL.x-6} ${BASKETBALL.z}h12`} stroke="#9bc9c2" strokeWidth={.25}/>
    <circle cx={BASKETBALL.x} cy={BASKETBALL.z} r={1.5} fill="none" stroke="#9bc9c2" strokeWidth={.25}/>
    {BRIDGES.map(([a, b]) => <rect key={a} x={a} y={RIVER.minZ - 0.4} width={b - a} height={RIVER.maxZ - RIVER.minZ + 0.8} fill="#a8865c" />)}
    {BOXES.map((b, i) => b.minZ >= RIVER.minZ && b.maxZ <= RIVER.maxZ ? null
      : <rect key={'b' + i} x={b.minX} y={b.minZ} width={b.maxX - b.minX} height={b.maxZ - b.minZ} fill="#05070f" opacity={0.55} />)}
    {TOWN_SHOPHOUSES.map((h, i) => <rect key={'h' + i} x={h.x - h.w / 2} y={h.z - h.d / 2} width={h.w} height={h.d} rx={0.3}
      fill={h.district === 'commerce' ? '#7a4b2c' : '#3f3470'} stroke={h.district === 'commerce' ? '#ffb347' : '#b18bff'} strokeWidth={0.2} />)}
    {TOWN_KIOSKS.map((s, i) => <rect key={'k' + i} x={s.x - s.w / 2} y={s.z - s.d / 2} width={s.w} height={s.d} fill={s.color} opacity={0.7} />)}
    <rect x={-8.5} y={-6} width={17} height={12} rx={0.6} fill="#2a3346" stroke="#ffd166" strokeWidth={0.25} />
    {TOWN_DISTRICTS.map(d => {
      const cx = Math.max(V.minX + 10 * k, Math.min(V.minX + V.w - 10 * k, (d.rect.minX + d.rect.maxX) / 2));
      return <text key={'t' + d.id} className="town-map-district" x={cx} y={d.id === 'expansion' ? -58 : Math.max(-30, V.minZ + 4 * k)}
        textAnchor="middle" fill={d.color} fontSize={3.4 * k}>{d.name}</text>;
    })}
    {detail && TOWN_STREETS.map(s => <text key={s.name} className="town-map-street" x={s.x} y={s.z + 0.8} textAnchor="middle" fontSize={1.9}
      transform={s.vertical ? `rotate(-90 ${s.x} ${s.z})` : undefined}>{s.name}</text>)}
    {detail && TOWN_LANDMARKS.filter(l=>l.open).map(l => <g key={l.name} className={`town-map-landmark ${l.open ? '' : 'closed'}`}>
      <circle cx={l.x} cy={l.z} r={0.7} />
      <text x={l.x} y={l.z - 1.4} textAnchor="middle" fontSize={1.8}>{l.name}{!l.open ? ' · 未开放' : ''}</text>
    </g>)}
    {TOWN_LOCKED_AREAS.map(area=><g key={area.id} data-testid={`map-locked-area-${area.id}`}>
      <title>{area.name} · 未解锁：{area.hint}</title>
      <rect x={area.minX} y={area.minZ} width={area.maxX-area.minX} height={area.maxZ-area.minZ} fill="none" stroke="#a0acc3" strokeOpacity={.4} strokeWidth={.25*k} strokeDasharray={`${1.2*k} ${.8*k}`}/>
      {detail&&<text x={area.x} y={area.z} textAnchor="middle" fill="#b6c0cf" fontSize={1.65}>{area.name} · 未解锁</text>}
    </g>)}
    {(Object.keys(TOWN_DESTINATIONS) as DestinationId[]).map(id => {
      if (id === 'leisure') return null;
      const d = id==='bicycle'?{...TOWN_DESTINATIONS[id],...useRide.getState().parked}:TOWN_DESTINATIONS[id];
      const site = isSite(id);
      const done = site && visited.includes(id);
      // 总览只画据点与奶茶店，避免挤成一团
      if (!detail && !site && id !== 'shop' && id !== 'arcade' && id !== 'recruit' && id !== 'shopping' && id !== 'basketball') return null;
      return <g key={id} transform={`translate(${d.x} ${d.z})`} className={`town-map-dest ${target === id ? 'on' : ''} ${site ? 'site' : ''} ${done ? 'done' : ''}`}>
        <circle r={(target === id ? 2.4 : 1.8) * Math.min(k, 1.6)} />
        <text y={1 * Math.min(k, 1.6)} textAnchor="middle" fontSize={2.2 * Math.min(k, 1.6)}>{done ? '✓' : DEST_ICON[id]}</text>
        {(site || !detail) && <text className="town-map-destname" y={-2.6 * Math.min(k, 1.6)} textAnchor="middle" fontSize={1.9 * Math.min(k, 1.6)}>{d.name}</text>}
      </g>;
    })}
    {route && <polyline data-testid="town-map-route" className="town-map-route" points={route.map(p => p.join(',')).join(' ')} strokeWidth={0.6 * k} />}
    {players.filter(p => p.id !== myId).map(p => {
      const r = rt.remote.get(p.id);
      return <circle key={p.id} cx={r?.x ?? p.x} cy={r?.z ?? p.z} r={0.9 * k} fill="#9ef8ff" stroke="#05070f" strokeWidth={0.3} />;
    })}
    <g transform={`translate(${me.x} ${me.z}) rotate(${(-me.yaw * 180) / Math.PI}) scale(${k})`}>
      <circle r={1.5} fill="#ffd166" stroke="#05070f" strokeWidth={0.4} />
      <path d="M0 2.8 L1.2 0.6 L-1.2 0.6 Z" fill="#05070f" />
    </g>
  </svg>;
}
