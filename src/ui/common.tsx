import { useEffect, useRef, useState } from 'react';

export const fmt = (n: number) => n.toLocaleString('zh-CN');

/** 金币数字滚动 */
export function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);
  const prev = useRef(value);
  useEffect(() => {
    const from = prev.current;
    prev.current = value;
    if (from === value) return;
    setFlash(value > from ? 'up' : 'down');
    const start = performance.now();
    let raf = 0;
    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / 700);
      setShown(Math.round(from + (value - from) * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const id = setTimeout(() => setFlash(null), 1200);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(id);
    };
  }, [value]);
  return <span className={`countup ${flash ?? ''}`}>{fmt(shown)}</span>;
}

/** 按 Unicode 码点截断（与服务端 40 码点限制一致） */
export function clipCodepoints(s: string, n: number) {
  return [...s].slice(0, n).join('');
}
