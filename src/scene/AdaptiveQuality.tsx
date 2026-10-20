import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { nextRenderBudget } from '../renderBudget.ts';
import { useCinema } from './cinema.ts';
import { useRenderQuality } from '../renderQuality.ts';

/** Main gameplay only: ignore loading, cinematic shots and intentionally capped backgrounds. */
export function AdaptiveQuality({ paused }: { paused: boolean }) {
  const quality = useRenderQuality(s => s.quality);
  const cinematic = useCinema(s => !!s.shot);
  const state = useRef({ previous: 0, warmUntil: 0, since: 0, frames: [] as number[], trend: { slow: 0, fast: 0 } });
  useEffect(() => {
    const reset = () => {
      state.current = { previous: 0, warmUntil: performance.now() + 12000, since: 0, frames: [], trend: { slow: 0, fast: 0 } };
    };
    reset();
    document.addEventListener('visibilitychange', reset);
    return () => document.removeEventListener('visibilitychange', reset);
  }, [quality, paused, cinematic]);
  useFrame(() => {
    if (quality !== 'balanced' || paused || cinematic || document.hidden) return;
    const now = performance.now();
    const sample = state.current;
    const ms = sample.previous ? now - sample.previous : 0;
    sample.previous = now;
    if (now < sample.warmUntil) return;
    if (!sample.since) sample.since = now;
    if (ms > 0) sample.frames.push(ms);
    if (now - sample.since < 2000 || sample.frames.length < 10) return;
    sample.frames.sort((a, b) => a - b);
    const current = useRenderQuality.getState();
    const next = nextRenderBudget(current.tier, sample.trend, sample.frames[Math.floor(sample.frames.length / 2)]);
    sample.trend = next.trend;
    sample.frames = [];
    sample.since = now;
    if (next.tier !== current.tier) current.setTier(next.tier);
  });
  return null;
}
