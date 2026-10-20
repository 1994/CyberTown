import { create } from 'zustand';

export const PERF_ENABLED = new URLSearchParams(location.search).get('perf') === '1';
export const renderCounters = { shadowUpdates: 0, lightSelections: 0 };
export interface RenderSample {
  fps: number;
  medianMs: number;
  p95Ms: number;
  cpuMs: number;
  p95CpuMs: number;
  shadowUpdates: number;
  lightSelections: number;
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
  dpr: number;
  frames: number;
}
export const useRenderStats = create<{ sample: RenderSample | null }>(() => ({ sample: null }));
