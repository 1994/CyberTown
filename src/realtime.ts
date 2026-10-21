import { useEffect } from 'react';
import { api, session } from './api.ts';
import { apiURL } from './runtime-config.ts';
import { useGame } from './store.ts';
import type { GameEvent, WorldPlayer } from '../shared/types.ts';
import { applyWorld } from './world/net.ts';

/**
 * SSE 实时同步：服务端每次状态变化推送 {type:'sync', event}，客户端立即拉取最新快照。
 * 断线时浏览器自动重连（retry 1.5s），并用 4 秒轮询兜底，保证 ≤3 秒同步目标在正常网络下达成。
 */
export function useRealtime(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const token = session.get();
    if (!token) return;
    const { refresh, setConn, handleEvent } = useGame.getState();
    setConn('connecting');
    const es = new EventSource(apiURL(`/api/events?token=${encodeURIComponent(token)}`));
    let poll: number | null = null;

    es.onopen = () => {
      setConn('live');
      if (poll) {
        clearInterval(poll);
        poll = null;
      }
    };
    es.onmessage = (m) => {
      try {
        const msg = JSON.parse(m.data) as { type: string; event?: GameEvent; players?: WorldPlayer[]; serverTime?: number };
        if (msg.type === 'hello') {
          setConn('live');
          void refresh();
          // 重连后补齐园区在线玩家
          void api
            .world()
            .then((w) => applyWorld(w.players, w.serverTime))
            .catch(() => undefined);
        } else if (msg.type === 'world' && msg.players) {
          // 园区位置/社交广播：直接更新，不拉取完整经济快照
          applyWorld(msg.players, msg.serverTime);
        } else if (msg.type === 'sync') {
          void refresh().then(() => msg.event && handleEvent(msg.event));
        }
      } catch {
        /* ignore malformed */
      }
    };
    es.onerror = () => {
      setConn('offline');
      if (!poll) poll = window.setInterval(() => void refresh(), 4000);
    };
    return () => {
      es.close();
      if (poll) clearInterval(poll);
    };
  }, [enabled]);
}
