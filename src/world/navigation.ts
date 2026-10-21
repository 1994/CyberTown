import type { ColleagueView } from '../../shared/types.ts';
import { npcWalkAt } from '../../shared/npcWalk.ts';
import { BOOTHS, findPath, podSeat } from '../../shared/world.ts';
import { api } from '../api.ts';
import { useGame } from '../store.ts';
import { applyWorld } from './net.ts';
import { rt, useWorld, worldNow } from './runtime.ts';

export function walkNear(x: number, z: number, keep = 0) {
  rt.npcNavigation = null;
  const me = rt.me;
  if (keep > 0) {
    const d = Math.hypot(x - me.x, z - me.z);
    if (d <= keep + .2) return;
    x -= ((x - me.x) / d) * keep;
    z -= ((z - me.z) / d) * keep;
  }
  const path = findPath(me.x, me.z, x, z);
  rt.path = path?.length ? path : null;
}

/** Explicit contact lookup can pin one far-away person without subscribing to everyone. */
export async function goToPlayer(id: string) {
  const { player, serverTime } = await api.focusPlayer(id);
  useWorld.getState().setFocus(id);
  applyWorld([player], serverTime, { partial: true, local: true });
  useGame.getState().closePhone();
  useGame.getState().setDrawer(null);
  useWorld.getState().setOverview(false);
  walkNear(player.x, player.z, 1.8);
}

/** Catalog navigation still works when a clone has no mounted 3D model. */
export async function goToColleague(c: ColleagueView) {
  const snap = useGame.getState().snapshot;
  if (!snap) return;
  if (c.ownerId && c.ownerId !== snap.me.id && snap.players.some(p => p.id === c.ownerId && p.online)) {
    const { player, serverTime } = await api.focusPlayer(c.ownerId);
    useWorld.getState().setFocus(c.ownerId);
    applyWorld([player], serverTime, { partial: true, local: true });
  }
  useWorld.setState({ focusColleagueId: c.id });
  const owner = c.ownerId === rt.myId ? rt.me : c.ownerId ? rt.remote.get(c.ownerId) : null;
  const fallback = c.ownerId
    ? owner ?? podSeat(c.ownerId, c.deskSlot ?? 0)
    : npcWalkAt(c.id, worldNow()) ?? BOOTHS[Math.max(0, snap.colleagues.findIndex(p => p.id === c.id)) % BOOTHS.length];
  const point = rt.colleaguePos.get(c.id) ?? fallback;
  useGame.getState().closePhone();
  useGame.getState().setDrawer(null);
  useWorld.getState().setOverview(false);
  walkNear(point.x, point.z, 1.5);
  if (!c.ownerId && npcWalkAt(c.id, worldNow()) && rt.path)
    rt.npcNavigation = { id: c.id, path: rt.path, nextAt: performance.now() + 1000 };
}

/** Refresh a moving NPC destination at most once a second. Any new ground,
 * keyboard, joystick or overlay action replaces/cancels the original path. */
export function updateNpcNavigation(now: number) {
  const target = rt.npcNavigation;
  if (!target) return;
  const arrived = rt.path === null && target.path.length === 0;
  if ((!arrived && rt.path !== target.path) || useGame.getState().snapshot?.colleagues.find(c => c.id === target.id)?.ownerId !== null) {
    rt.npcNavigation = null;
    return;
  }
  if (now < target.nextAt) return;
  const p = npcWalkAt(target.id, worldNow());
  if (!p) { rt.npcNavigation = null; return; }
  if (Math.hypot(p.x - rt.me.x, p.z - rt.me.z) < 2.2) {
    rt.path = null;
    target.path.length = 0;
    target.nextAt = now + 500;
    return;
  }
  walkNear(p.x, p.z, 1.5);
  if (rt.path) rt.npcNavigation = { id: target.id, path: rt.path, nextAt: now + 1000 };
}
