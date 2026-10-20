import { useEffect, useRef, useState } from 'react';
import { BOXES, PATHS, WORLD_BOUNDS, ZONES, findPath } from '../../shared/world.ts';
import { useGame } from '../store.ts';
import { rt, useWorld } from '../world/runtime.ts';

const B = WORLD_BOUNDS;
const W = B.maxX - B.minX;
const H = B.maxZ - B.minZ;

/** 小地图：区域、道路、在线玩家、自己的朝向与小队。点击 = 设定步行目标（寻路走过去，不瞬移） */
export function Minimap() {
  const snap = useGame((s) => s.snapshot)!;
  const players = useWorld((s) => s.players);
  const [, setTick] = useState(0);
  const svg = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 200);
    return () => clearInterval(id);
  }, []);

  const go = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = svg.current!.getBoundingClientRect();
    const x = B.minX + ((e.clientX - r.left) / r.width) * W;
    const z = B.minZ + ((e.clientY - r.top) / r.height) * H;
    const p = findPath(rt.me.x, rt.me.z, x, z);
    rt.path = p && p.length ? p : null;
    useWorld.getState().setOverview(false);
  };

  const colorOf = (id: string) => snap.players.find((p) => p.id === id)?.color ?? '#fff';
  const me = rt.me;
  const end = rt.path?.[rt.path.length - 1];
  return (
    <svg
      ref={svg}
      className="minimap"
      viewBox={`${B.minX} ${B.minZ} ${W} ${H}`}
      onClick={go}
      role="img"
      aria-label="园区小地图，点击设定步行目标"
      data-testid="minimap"
    >
      <rect x={B.minX} y={B.minZ} width={W} height={H} rx={2} fill="#22361f" />
      {PATHS.map((p, i) => (
        <rect key={i} x={p.minX} y={p.minZ} width={p.maxX - p.minX} height={p.maxZ - p.minZ} fill="#8f8677" opacity={0.75} />
      ))}
      <rect x={-8.5} y={-6} width={17} height={12} fill="#7a5a3d" stroke="#3ef0ff" strokeWidth={0.3} />
      {BOXES.map((b, i) => (
        <rect key={'o' + i} x={b.minX} y={b.minZ} width={b.maxX - b.minX} height={b.maxZ - b.minZ} fill="#0e1222" opacity={0.55} />
      ))}
      {ZONES.map((z) => (
        <g key={z.id} transform={`translate(${z.x} ${z.z})`}>
          <circle r={2.6} fill={z.color} opacity={0.18} />
          <text y={1.1} textAnchor="middle" fontSize={3.2}>
            {z.icon}
          </text>
        </g>
      ))}
      {end && <circle cx={end[0]} cy={end[1]} r={0.9} fill="none" stroke="#ffd166" strokeWidth={0.4} />}
      {players
        .filter((p) => p.id !== snap.me.id)
        .map((p) => {
          const r = rt.remote.get(p.id);
          return <circle key={p.id} cx={r?.x ?? p.x} cy={r?.z ?? p.z} r={1.1} fill={colorOf(p.id)} stroke="#fff" strokeWidth={0.3} />;
        })}
      {snap.colleagues
        .filter((c) => c.ownerId === snap.me.id)
        .map((c) => {
          const p = rt.colleaguePos.get(c.id);
          return p ? <circle key={c.id} cx={p.x} cy={p.z} r={0.6} fill="#ffd166" opacity={0.8} /> : null;
        })}
      <g transform={`translate(${me.x} ${me.z}) rotate(${(-me.yaw * 180) / Math.PI})`}>
        <circle r={1.6} fill="#ffd166" stroke="#1b1d2e" strokeWidth={0.4} />
        <path d="M0 2.8 L1.2 0.6 L-1.2 0.6 Z" fill="#1b1d2e" />
      </g>
    </svg>
  );
}

export function zoneLabel(id: string) {
  return ZONES.find((z) => z.id === id)?.name ?? '';
}
