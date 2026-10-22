import { useEffect, useRef, useState } from 'react';
import { TOWN_DESTINATIONS, TOWN_DISTRICTS, TOWN_LANDMARKS, TOWN_SHOPHOUSES, TOWN_STREETS, type DestinationId } from '../../shared/townPlan.ts';
import { BOXES, PATHS, WORLD_BOUNDS, findPath } from '../../shared/world.ts';
import { useGame } from '../store.ts';
import { rt, useWorld } from '../world/runtime.ts';

// 小镇地图：大区轮廓/街道/街屋/地标文字/玩家/真实路线折线。点地图任意处 = 真实寻路，不瞬移。
const B = WORLD_BOUNDS;
const W = B.maxX - B.minX;
const H = B.maxZ - B.minZ;
const DEST_ICON: Record<DestinationId, string> = { shop: '🧋', recruit: '🙋', leisure: '🎮', plaza: '⛲' };

export function TownMap({ target, onWalk }: { target: DestinationId | null; onWalk: () => void }) {
  const myId = useGame(s => s.snapshot?.me.id);
  const players = useWorld(s => s.players);
  const svg = useRef<SVGSVGElement>(null);
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick(x => x + 1), 200); return () => clearInterval(id); }, []);

  const go = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = svg.current!.getBoundingClientRect();
    const x = B.minX + ((e.clientX - r.left) / r.width) * W;
    const z = B.minZ + ((e.clientY - r.top) / r.height) * H;
    const p = findPath(rt.me.x, rt.me.z, x, z);
    rt.npcNavigation = null;
    rt.path = p && p.length ? p : null;
    useWorld.getState().setOverview(false);
    onWalk();
  };
  const me = rt.me;
  const route = rt.path?.length ? [[me.x, me.z] as [number, number], ...rt.path] : null;
  return <svg ref={svg} className="town-mapsvg" viewBox={`${B.minX} ${B.minZ} ${W} ${H}`} onClick={go} role="img" aria-label="小镇地图，点击设定步行目标" data-testid="minimap">
    <rect x={B.minX} y={B.minZ} width={W} height={H} fill="#0d1322" />
    {TOWN_DISTRICTS.map(d => <rect key={d.id} x={d.rect.minX} y={d.rect.minZ} width={d.rect.maxX - d.rect.minX} height={d.rect.maxZ - d.rect.minZ}
      fill={d.color} fillOpacity={d.id === 'expansion' ? 0.05 : 0.09} stroke={d.color} strokeOpacity={0.5} strokeWidth={0.3}
      strokeDasharray={d.id === 'expansion' ? '1.2 1' : undefined} />)}
    {PATHS.map((p, i) => <rect key={i} x={p.minX} y={p.minZ} width={p.maxX - p.minX} height={p.maxZ - p.minZ} fill="#5d6c8c" opacity={0.75} />)}
    {BOXES.map((b, i) => <rect key={'b' + i} x={b.minX} y={b.minZ} width={b.maxX - b.minX} height={b.maxZ - b.minZ} fill="#05070f" opacity={0.55} />)}
    {TOWN_SHOPHOUSES.map((h, i) => <rect key={'h' + i} x={h.x - h.w / 2} y={h.z - h.d / 2} width={h.w} height={h.d} rx={0.3}
      fill={h.district === 'commerce' ? '#7a4b2c' : '#3f3470'} stroke={h.district === 'commerce' ? '#ffb347' : '#b18bff'} strokeWidth={0.2} />)}
    <rect x={-8.5} y={-6} width={17} height={12} rx={0.6} fill="#2a3346" stroke="#ffd166" strokeWidth={0.25} />
    {TOWN_DISTRICTS.map(d => <text key={'t' + d.id} className="town-map-district" x={(d.rect.minX + d.rect.maxX) / 2}
      y={d.id === 'expansion' ? -28.6 : -16.6} textAnchor="middle" fill={d.color}>{d.name}</text>)}
    {TOWN_STREETS.map(s => <text key={s.name} className="town-map-street" x={s.x} y={s.z + 0.8} textAnchor="middle"
      transform={s.vertical ? `rotate(-90 ${s.x} ${s.z})` : undefined}>{s.name}</text>)}
    {TOWN_LANDMARKS.map(l => <g key={l.name} className={`town-map-landmark ${l.open ? '' : 'closed'}`}>
      <circle cx={l.x} cy={l.z} r={0.7} />
      <text x={l.x} y={l.z - 1.4} textAnchor="middle">{l.name}</text>
    </g>)}
    {(Object.keys(TOWN_DESTINATIONS) as DestinationId[]).map(id => {
      const d = TOWN_DESTINATIONS[id];
      return <g key={id} transform={`translate(${d.x} ${d.z})`} className={`town-map-dest ${target === id ? 'on' : ''}`}>
        <circle r={target === id ? 2.4 : 1.8} />
        <text y={1} textAnchor="middle" fontSize={2.2}>{DEST_ICON[id]}</text>
      </g>;
    })}
    {route && <polyline data-testid="town-map-route" className="town-map-route" points={route.map(p => p.join(',')).join(' ')} />}
    {players.filter(p => p.id !== myId).map(p => {
      const r = rt.remote.get(p.id);
      return <circle key={p.id} cx={r?.x ?? p.x} cy={r?.z ?? p.z} r={0.9} fill="#9ef8ff" stroke="#05070f" strokeWidth={0.3} />;
    })}
    <g transform={`translate(${me.x} ${me.z}) rotate(${(-me.yaw * 180) / Math.PI})`}>
      <circle r={1.5} fill="#ffd166" stroke="#05070f" strokeWidth={0.4} />
      <path d="M0 2.8 L1.2 0.6 L-1.2 0.6 Z" fill="#05070f" />
    </g>
  </svg>;
}
