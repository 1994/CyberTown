import { useEffect } from 'react';
import { session } from './api.ts';
import { apiURL } from './runtime-config.ts';
import { useGame } from './store.ts';
import type { GameEvent, WorldPlayer } from '../shared/types.ts';
import { applyWorld } from './world/net.ts';
import { createSyncQueue } from './syncQueue.ts';

/**
 * SSE 实时同步：服务端每次状态变化推送 {type:'sync', event}，客户端立即拉取最新快照。
 * 断线时浏览器自动重连（retry 1.5s），并用 4 秒轮询兜底，保证 ≤3 秒同步目标在正常网络下达成。
 */
export function useRealtime(enabled: boolean, townOwner?: string | null) {
  useEffect(() => {
    if (!enabled) return;
    const token = session.get();
    if (!token) return;
    const { refresh, setConn, handleEvent } = useGame.getState();
    const sync = createSyncQueue(refresh, handleEvent);
    setConn('connecting');
    const es = new EventSource(apiURL(`/api/events?token=${encodeURIComponent(token)}&world=2${townOwner ? '&town='+encodeURIComponent(townOwner) : ''}`));
    let poll: number | null = null;
    let alive = true;

    const markLive = () => {
      if (!navigator.onLine) return;
      if (useGame.getState().conn !== 'live') setConn('live');
      if (poll) {
        clearInterval(poll);
        poll = null;
      }
    };
    es.onopen = markLive;
    es.onmessage = (m) => {
      if (!alive) return;
      try {
        const msg = JSON.parse(m.data) as { type: string; event?: GameEvent; players?: WorldPlayer[]; serverTime?: number; partial?: boolean; removed?: string[]; onlineCount?: number; nearbyCount?: number };
        if (msg.type === 'hello') {
          markLive();
          sync.enqueue();
          // The first world packet after every connection is a full AOI reset.
          // Avoid racing a GET snapshot against newer stream deltas.
        } else if (msg.type === 'world' && msg.players) {
          // A REST refresh can fail while the stream stays open. A subsequent
          // world packet proves recovery even when EventSource never reopens.
          markLive();
          // 园区位置/社交广播：直接更新，不拉取完整经济快照
          applyWorld(msg.players, msg.serverTime, { ...msg, stream: true });
        } else if (msg.type === 'sync') {
          sync.enqueue(msg.event);
        }
      } catch {
        /* ignore malformed */
      }
    };
    const markOffline = () => {
      setConn('offline');
      if (!poll) poll = window.setInterval(() => {
        if (navigator.onLine) void refresh();
      }, 4000);
    };
    es.onerror = markOffline;
    window.addEventListener('offline', markOffline);
    return () => {
      alive = false;
      sync.dispose();
      es.close();
      window.removeEventListener('offline', markOffline);
      if (poll) clearInterval(poll);
    };
  }, [enabled, townOwner]);
}
