import * as THREE from 'three';

const signs = new Map<string, THREE.CanvasTexture>();
/** Shop lettering keeps its real aspect ratio; a restrained halo preserves colored strokes. */
export function shopSignTexture(text: string, color: string, aspect: number) {
  const key = `${text}|${color}|${aspect}`;
  const existing = signs.get(key); if (existing) return existing;
  const c = document.createElement('canvas'); c.width = 1024; c.height = Math.max(96, Math.round(1024 / aspect));
  const g = c.getContext('2d')!;
  let px = c.height * .64;
  const face = (n: number) => `600 ${n}px "PingFang SC", "Microsoft YaHei", sans-serif`;
  g.font = face(px); px *= Math.min(1, c.width * .89 / Math.max(1,g.measureText(text).width));
  g.font = face(px); g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = color; g.shadowColor = color; g.shadowBlur = 4;
  g.fillText(text, c.width / 2, c.height * .52);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  signs.set(key, t); return t;
}
