import { create } from 'zustand';
import type { WorldBounds, WorldPlayer } from '../../shared/types.ts';
import { SPAWNS, WORLD_BOUNDS } from '../../shared/world.ts';

/**
 * 园区运行时状态。
 * - 高频数据（自己的位置、远端插值位置、足迹、同事位置、按键）放在可变对象 `rt` 中，由 useFrame 读写，避免 React 重渲染。
 * - 低频 UI 数据（在线玩家列表、当前可互动对象、总览模式、输入锁）放在 zustand `useWorld` 中。
 */

export interface Smooth {
  x: number;
  z: number;
  yaw: number;
  moving: boolean;
  tx: number;
  tz: number;
  tyaw: number;
  tmoving: boolean;
  seenAt: number;
}

export const rt = {
  myId: null as string | null,
  me: { x: 0, z: 11, yaw: Math.PI, moving: false },
  /** 自动寻路（点击地面 / 小地图 / 点击人物） */
  path: null as [number, number][] | null,
  /** 服务端拒绝移动时的纠正目标（平滑拉回） */
  correction: null as { x: number; z: number } | null,
  remote: new Map<string, Smooth>(),
  /** 每个在线玩家的足迹（最新在前），用于小队跟随 */
  trails: new Map<string, [number, number][]>(),
  colleaguePos: new Map<string, { x: number; z: number }>(),
  keys: new Set<string>(),
  joy: { x: 0, z: 0 },
  camYaw: Math.PI / 4,
  lastInputAt: 0,
};

export function resetRuntime(myId: string) {
  rt.myId = myId;
  const s = SPAWNS[myId] ?? [0, 11];
  rt.me = { x: s[0], z: s[1], yaw: Math.PI, moving: false };
  rt.path = null;
  rt.correction = null;
  rt.remote.clear();
  rt.trails.clear();
  rt.colleaguePos.clear();
  rt.keys.clear();
  rt.joy = { x: 0, z: 0 };
}

/** 把位置写入足迹（间距 ≥0.35m 才记录） */
export function pushTrail(id: string, x: number, z: number) {
  let t = rt.trails.get(id);
  if (!t) {
    t = [[x, z]];
    rt.trails.set(id, t);
    return;
  }
  const [lx, lz] = t[0];
  if (Math.hypot(x - lx, z - lz) < 0.35) return;
  if (Math.hypot(x - lx, z - lz) > 6) t.length = 0; // 被纠正/瞬移：重置足迹
  t.unshift([x, z]);
  if (t.length > 40) t.length = 40;
}

/** 沿足迹回溯 dist 米处的位置（用于队员跟随） */
export function trailPoint(id: string, dist: number, fallback: { x: number; z: number }): [number, number] {
  const t = rt.trails.get(id);
  if (!t || t.length < 2) return [fallback.x, fallback.z];
  let acc = 0;
  for (let i = 1; i < t.length; i++) {
    const seg = Math.hypot(t[i][0] - t[i - 1][0], t[i][1] - t[i - 1][1]);
    if (acc + seg >= dist) {
      const k = (dist - acc) / seg;
      return [t[i - 1][0] + (t[i][0] - t[i - 1][0]) * k, t[i - 1][1] + (t[i][1] - t[i - 1][1]) * k];
    }
    acc += seg;
  }
  return t[t.length - 1];
}

/** 任意在线玩家（含自己）当前渲染位置 */
export function playerPos(id: string): { x: number; z: number; moving: boolean } | null {
  if (id === rt.myId) return rt.me;
  const r = rt.remote.get(id);
  return r ? { x: r.x, z: r.z, moving: r.moving } : null;
}

export type Near =
  | { kind: 'colleague'; id: string; dist: number }
  | { kind: 'player'; id: string; dist: number }
  | { kind: 'terminal'; dist: number };

interface WorldStore {
  players: WorldPlayer[];
  bounds: WorldBounds;
  serverOffset: number;
  near: Near | null;
  overview: boolean;
  locks: string[];
  /** 碰杯冷却（按对方 id，毫秒时间戳，服务器时钟） */
  highfiveCooldown: Record<string, number>;
  socialCooldownUntil: number;
  projectOpen: boolean;
  setProjectOpen: (v: boolean) => void;
  setPlayers: (players: WorldPlayer[], serverTime?: number) => void;
  setNear: (n: Near | null) => void;
  setOverview: (v: boolean) => void;
  lock: (k: string) => void;
  unlock: (k: string) => void;
}

export const useWorld = create<WorldStore>((set) => ({
  players: [],
  bounds: WORLD_BOUNDS,
  serverOffset: 0,
  near: null,
  overview: false,
  locks: [],
  highfiveCooldown: {},
  socialCooldownUntil: 0,
  projectOpen: false,
  setProjectOpen: (projectOpen) => set({ projectOpen }),
  setPlayers: (players, serverTime) =>
    set((s) => ({ players, serverOffset: serverTime ? serverTime - Date.now() : s.serverOffset })),
  setNear: (near) =>
    set((s) => {
      const a = s.near;
      if (a === near) return s;
      if (a && near && a.kind === near.kind && (a.kind === 'terminal' || (a as { id: string }).id === (near as { id: string }).id)) return s;
      return { near };
    }),
  setOverview: (overview) => set({ overview }),
  lock: (k) => set((s) => (s.locks.includes(k) ? s : { locks: [...s.locks, k] })),
  unlock: (k) => set((s) => ({ locks: s.locks.filter((x) => x !== k) })),
}));

export const worldNow = () => Date.now() + useWorld.getState().serverOffset;
