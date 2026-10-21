/** A short, bounded batching window absorbs bursts of SSE economic events.
 * Every event is delivered after refresh; coalescing never drops a trade cue. */
export function createSyncQueue<T>(refresh: () => Promise<void>, consume: (event: T) => void, delay = 50) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let events: T[] = [];
  let alive = true;
  return {
    enqueue(event?: T) {
      if (!alive) return;
      if (event !== undefined) events.push(event);
      if (timer !== null) return;
      timer = setTimeout(() => {
        timer = null;
        const batch = events;
        events = [];
        void refresh().then(() => { if (alive) batch.forEach(consume); }).catch(() => undefined);
      }, delay);
    },
    dispose() {
      alive = false;
      if (timer !== null) clearTimeout(timer);
      timer = null;
      events = [];
    },
  };
}
