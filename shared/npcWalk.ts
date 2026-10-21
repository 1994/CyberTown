import { findPath } from './world.ts';

/** Two fictional, unowned characters stroll. Employees and the welcoming boss
 * keep their authored homes. Server-adjusted wall time gives every browser the
 * same position without extra SSE traffic or per-frame path searches. */
const WALKS: Record<string, [number, number][]> = {
  'c-tony': [[-23.4, -15.1], [-33, 0], [-33, 24], [0, 24], [-17, 11]],
  'c-sakura': [[-13, -10.9], [-17, -24], [18, -24], [33, 0], [18, -17]],
};
const SPEED = 1.65;
const WAIT_MS = 14000;
interface Leg { from: [number, number]; to: [number, number]; start: number; end: number; moving: boolean }
interface Walk { legs: Leg[]; duration: number }
const cache = new Map<string, Walk>();

function route(id: string): Walk | null {
  if (cache.has(id)) return cache.get(id)!;
  const stops = WALKS[id];
  if (!stops) return null;
  const legs: Leg[] = [];
  let elapsed = 0;
  let current = stops[0];
  for (let i = 0; i < stops.length; i++) {
    const next = stops[(i + 1) % stops.length];
    legs.push({ from: current, to: current, start: elapsed, end: elapsed + WAIT_MS, moving: false });
    elapsed += WAIT_MS;
    const path = findPath(...current, ...next);
    if (!path?.length) throw new Error(`NPC walk unreachable: ${id}`);
    for (const point of path) {
      const duration = Math.hypot(point[0] - current[0], point[1] - current[1]) / SPEED * 1000;
      if (duration > 0) {
        legs.push({ from: current, to: point, start: elapsed, end: elapsed + duration, moving: true });
        elapsed += duration;
      }
      current = point;
    }
  }
  const walk = { legs, duration: elapsed };
  cache.set(id, walk);
  return walk;
}

export function npcWalkAt(id: string, serverTime: number) {
  const walk = route(id);
  if (!walk) return null;
  const phase = ((serverTime % walk.duration) + walk.duration) % walk.duration;
  const index = walk.legs.findIndex(leg => phase < leg.end);
  const leg = walk.legs[index];
  const k = (phase - leg.start) / (leg.end - leg.start);
  const facing = leg.moving ? leg : walk.legs[(index + 1) % walk.legs.length];
  return {
    x: leg.from[0] + (leg.to[0] - leg.from[0]) * k,
    z: leg.from[1] + (leg.to[1] - leg.from[1]) * k,
    yaw: Math.atan2(facing.to[0] - facing.from[0], facing.to[1] - facing.from[1]),
    moving: leg.moving,
  };
}

export const NPC_WALK_IDS = Object.keys(WALKS);
