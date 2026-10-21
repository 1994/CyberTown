import type { WorldPlayer } from './types.ts';

export interface WorldUpdate {
  partial?: boolean;
  removed?: string[];
  onlineCount?: number;
  nearbyCount?: number;
  stream?: boolean;
  local?: boolean;
}

/** HTTP bootstrap may finish after streaming membership. Focus is an explicit
 * out-of-band upsert and must not cause ordered deltas to be discarded. */
export const acceptsWorldUpdate = (streamReady: boolean, update: WorldUpdate) =>
  !!update.stream || !!update.local || !streamReady;

/** Missing entries in a delta remain; a reconnect/full response removes ghosts. */
export function mergeWorldPlayers(current: readonly WorldPlayer[], incoming: WorldPlayer[], update: WorldUpdate = {}): WorldPlayer[] {
  if (!update.partial) return incoming;
  const merged = new Map(current.map(p => [p.id, p]));
  for (const id of update.removed ?? []) merged.delete(id);
  for (const p of incoming) merged.set(p.id, p);
  return [...merged.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export interface CrowdSelection { full: string[]; lite: string[] }

/** Keep slots stable at tier boundaries; focus and close interaction take priority. */
export function selectCrowd(
  players: readonly WorldPlayer[], me: { x: number; z: number }, myId: string,
  previous: CrowdSelection, compact: boolean, focusId: string | null,
): CrowdSelection {
  const rank = players.filter(p => p.id !== myId).map(p => {
    const distance = Math.hypot(p.x - me.x, p.z - me.z);
    const priority = p.id === focusId ? -100 : distance - (previous.full.includes(p.id) ? 1.5 : 0);
    return { id: p.id, distance, priority };
  }).sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
  const full = rank.filter(p => p.id === focusId || p.distance <= (previous.full.includes(p.id) ? 14 : 12))
    .slice(0, compact ? 6 : 12).map(p => p.id);
  const fullSet = new Set(full);
  const lite = rank.filter(p => !fullSet.has(p.id)).slice(0, compact ? 28 : 48).map(p => p.id);
  return { full: full.sort(), lite: lite.sort() };
}

/** Keep the authored NPC cast and own team. Employee directory size must never
 * dictate the number of 3D actors. One representative per nearby foreign team. */
export function selectColleagues<T extends { id: string; ownerId: string | null; selfPlayerId: string | null; deskSlot: number | null }>(
  colleagues: readonly T[], myId: string, nearby: ReadonlySet<string>, online: ReadonlySet<string>,
  focusId: string | null, retained: ReadonlySet<string>,
): T[] {
  const chosen = new Set<string>();
  const represented = new Set<string>();
  for (const c of colleagues) {
    const authored = c.selfPlayerId === null;
    if (c.ownerId === myId || c.id === focusId || retained.has(c.id) ||
      (authored && (!c.ownerId || !online.has(c.ownerId) || nearby.has(c.ownerId)))) chosen.add(c.id);
  }
  for (const c of [...colleagues].sort((a, b) => (a.deskSlot ?? 0) - (b.deskSlot ?? 0))) {
    if (c.ownerId && c.ownerId !== myId && nearby.has(c.ownerId) && !represented.has(c.ownerId) && represented.size < 4) {
      chosen.add(c.id); represented.add(c.ownerId);
    }
  }
  // A small stable selection of employee booths remains browseable on foot.
  let booths = 0;
  for (const c of colleagues) if (c.selfPlayerId && c.selfPlayerId !== myId && !c.ownerId && booths++ < 4) chosen.add(c.id);
  return colleagues.filter(c => chosen.has(c.id));
}

/** A pinned contact may be subscribed from across the campus; subscription is
 * not proof of physical proximity and must not inflate the nearby counter. */
export function nearbyPlayers(players: readonly WorldPlayer[], myId: string) {
  const me = players.find(p => p.id === myId);
  return me ? players.filter(p => p.id !== myId && Math.hypot(p.x - me.x, p.z - me.z) <= 26) : [];
}
