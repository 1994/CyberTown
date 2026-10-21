import { useEffect } from 'react';
import { api, ApiError } from '../api.ts';
import type { WorldPlayer } from '../../shared/types.ts';
import { resetRuntime, rt, useWorld } from './runtime.ts';
import { acceptsWorldUpdate, mergeWorldPlayers, nearbyPlayers } from '../../shared/proximity.ts';
import type { WorldUpdate } from '../../shared/proximity.ts';
import { movementPacketDue } from './netBudget.ts';

/** 远端玩家：把服务端最新坐标设为插值目标（渲染时平滑追随） */
export function applyWorld(players: WorldPlayer[], serverTime?: number, update: WorldUpdate = {}) {
  // A late GET must not overwrite membership from newer ordered stream deltas.
  // Contact focus is an out-of-band upsert and never advances the stream clock.
  if (!acceptsWorldUpdate(useWorld.getState().streamReady, update)) return;
  if (update.stream) useWorld.setState({ streamReady: true });
  const merged = mergeWorldPlayers(useWorld.getState().players, players, update);
  useWorld.getState().setPlayers(merged, serverTime);
  if (update.onlineCount !== undefined) useWorld.setState({ onlineCount: update.onlineCount });
  else if (!update.partial) useWorld.setState({ onlineCount: merged.length });
  if (update.nearbyCount !== undefined) useWorld.setState({ nearbyCount: update.nearbyCount });
  else if (!update.local) useWorld.setState({ nearbyCount: nearbyPlayers(merged, rt.myId ?? '').length });
  const seen = new Set(merged.map(p => p.id));
  for (const p of players) {
    seen.add(p.id);
    if (p.id === rt.myId) {
      if (!rt.worldInitialized) {
        rt.me.x = p.x; rt.me.z = p.z; rt.me.yaw = p.yaw;
        rt.worldInitialized = true;
      }
      // 自己以本地预测为准；只有与服务端差距很大（被拒绝/重连）时才平滑纠正
      const d = Math.hypot(p.x - rt.me.x, p.z - rt.me.z);
      if (d > 4 && performance.now() - lastSentAt > 1500) rt.correction = { x: p.x, z: p.z };
      continue;
    }
    const r = rt.remote.get(p.id);
    if (!r) {
      rt.remote.set(p.id, { x: p.x, z: p.z, yaw: p.yaw, moving: p.moving, tx: p.x, tz: p.z, tyaw: p.yaw, tmoving: p.moving, seenAt: performance.now() });
    } else {
      r.tx = p.x;
      r.tz = p.z;
      r.tyaw = p.yaw;
      r.tmoving = p.moving;
      r.seenAt = performance.now();
    }
  }
  for (const id of [...rt.remote.keys()]) {
    if (!seen.has(id)) {
      rt.remote.delete(id);
      rt.trails.delete(id);
    }
  }
}

let lastSentAt = 0;
let lastSent = { x: NaN, z: NaN, moving: false };

/**
 * 位置上报：移动中 5Hz，停下立即上报，静止时每5秒心跳；隐藏后只补停步包。
 * 同一时间只有一个请求在途；429 退避；400/409 以服务端位置平滑纠正。
 */
export function useWorldNet(myId: string | null) {
  useEffect(() => {
    if (!myId) return;
    resetRuntime(myId);
    let alive = true;
    let inFlight = false;
    let backoffUntil = 0;
    lastSentAt = 0;
    lastSent = { x: NaN, z: NaN, moving: false };

    void api
      .world()
      .then((w) => {
        if (!alive) return;
        applyWorld(w.players, w.serverTime, { onlineCount: w.onlineCount, nearbyCount: w.nearbyCount });
      })
      .catch(() => undefined);

    const tick = async () => {
      if (!alive || inFlight || !rt.worldInitialized) return;
      const now = performance.now();
      if (now < backoffUntil) return;
      const m = rt.me;
      const due = movementPacketDue(now, lastSentAt, m, lastSent, document.hidden);
      if (!due) return;
      inFlight = true;
      const previousSent = lastSent;
      const payload = { x: round(m.x), z: round(m.z), yaw: round(m.yaw), moving: !document.hidden && m.moving };
      lastSentAt = now;
      lastSent = { x: m.x, z: m.z, moving: payload.moving };
      try {
        await api.move(payload);
      } catch (e) {
        if (!alive) return;
        lastSent = previousSent; // Retry a failed stop, including while hidden.
        if (e instanceof ApiError) {
          if (e.status === 429) backoffUntil = performance.now() + 500;
          else if (e.status === 400 || e.status === 409) {
            const p = (e.body as { player?: WorldPlayer } | null)?.player;
            if (p) rt.correction = { x: p.x, z: p.z };
            else {
              const w = await api.world().catch(() => null);
              const mine = w?.players.find((x) => x.id === myId);
              if (mine) rt.correction = { x: mine.x, z: mine.z };
            }
            backoffUntil = performance.now() + 300;
          } else backoffUntil = performance.now() + 1000;
        } else backoffUntil = performance.now() + 1000;
      } finally {
        inFlight = false;
      }
    };
    const id = window.setInterval(() => void tick(), 100);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [myId]);
}

const round = (v: number) => Math.round(v * 100) / 100;
