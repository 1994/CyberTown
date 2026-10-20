import { useRenderStats } from '../performance.ts';

export function RenderStats() {
  const sample = useRenderStats(s => s.sample);
  return <output data-testid="render-stats" data-sample={JSON.stringify(sample)} style={{
    position: 'fixed', right: 12, top: 180, zIndex: 100, pointerEvents: 'none',
    padding: '9px 12px', border: '1px solid #66f4ff80', borderRadius: 10,
    background: '#080f23ed', color: '#c8faff', font: '11px/1.7 monospace',
  }}>
    {sample ? <>
      {sample.fps} FPS · DPR {sample.dpr.toFixed(2)}<br/>
      中位 {sample.medianMs}ms · P95 {sample.p95Ms}ms<br/>
      CPU {sample.cpuMs}ms · P95 {sample.p95CpuMs}ms<br/>
      {sample.calls} draws · {Math.round(sample.triangles / 1000)}k triangles<br/>
      {sample.geometries} geometries · {sample.textures} textures
    </> : '性能采样中…'}
  </output>;
}
