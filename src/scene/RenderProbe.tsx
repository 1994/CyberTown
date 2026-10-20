import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useRenderStats } from '../performance.ts';

/** Opt-in whole-frame counters, including shadow and composer passes. */
export function RenderProbe() {
  const gl = useThree(s => s.gl);
  const history = useRef<{ at: number; ms: number; calls: number; triangles: number }[]>([]);
  const previous = useRef(0);
  const lastPublish = useRef(0);
  useEffect(() => {
    const before = gl.info.autoReset;
    gl.info.autoReset = false;
    const resetAfterVisibilityChange = () => {
      previous.current = 0;
      history.current = [];
    };
    document.addEventListener('visibilitychange', resetAfterVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', resetAfterVisibilityChange);
      gl.info.autoReset = before;
      gl.info.reset();
    };
  }, [gl]);
  useFrame(() => {
    const now = performance.now();
    if (previous.current && !document.hidden) {
      const ms = now - previous.current;
      history.current.push({ at: now, ms, calls: gl.info.render.calls, triangles: gl.info.render.triangles });
    }
    previous.current = now;
    gl.info.reset();
    const samples = history.current;
    while (samples.length && samples[0].at < now - 5000) samples.shift();
    if (now - lastPublish.current < 1000 || samples.length < 5) return;
    lastPublish.current = now;
    const sorted = samples.map(s => s.ms).sort((a, b) => a - b);
    const mean = (key: 'ms' | 'calls' | 'triangles') => samples.reduce((n, s) => n + s[key], 0) / samples.length;
    useRenderStats.setState({ sample: {
      fps: Math.round(10000 / mean('ms')) / 10,
      medianMs: Math.round(sorted[Math.floor(sorted.length / 2)] * 10) / 10,
      p95Ms: Math.round(sorted[Math.floor((sorted.length - 1) * 0.95)] * 10) / 10,
      calls: Math.round(mean('calls')), triangles: Math.round(mean('triangles')),
      geometries: gl.info.memory.geometries, textures: gl.info.memory.textures,
      dpr: gl.getPixelRatio(), frames: samples.length,
    } });
  }, -100);
  return null;
}
