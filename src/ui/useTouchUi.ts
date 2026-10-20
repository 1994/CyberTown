import { useSyncExternalStore } from 'react';

/**
 * 是否使用触屏双拇指操作：窄屏（≤900px，即使是精确指针）或任何粗指针 / 混合触控设备。
 * 订阅 matchMedia + 旋转事件，窗口缩放、横竖屏切换都会实时更新。
 */
const QUERY = '(max-width: 900px), (pointer: coarse), (any-pointer: coarse)';

let mql: MediaQueryList | null | undefined;
const media = () => {
  if (mql === undefined) mql = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(QUERY) : null;
  return mql;
};

function subscribe(cb: () => void) {
  const m = media();
  if (!m) return () => undefined;
  m.addEventListener('change', cb);
  window.addEventListener('orientationchange', cb);
  window.addEventListener('resize', cb);
  return () => {
    m.removeEventListener('change', cb);
    window.removeEventListener('orientationchange', cb);
    window.removeEventListener('resize', cb);
  };
}

const snapshot = () => media()?.matches ?? false;

export function useTouchUi(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
