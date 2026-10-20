import { useEffect } from 'react';
import { session } from './api.ts';
import { useGame } from './store.ts';
import type { GameEvent } from '../shared/types.ts';

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
    const es = new EventSource(`/api/events?token=${encodeURIComponent(token)}`);
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
        const msg = JSON.parse(m.data) as { type: string; event?: GameEvent };
        if (msg.type === 'hello') {
          setConn('live');
          void refresh();
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
