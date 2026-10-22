import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

// 场景内文字标签：画到 CanvasTexture 上的 Sprite，完全在 three 场景图内。
// 不再使用 drei Html（它为每个标签创建独立 ReactDOM root 并挂到 canvas 父节点，
// 场景切换时与主 ReactDOM 的删除提交竞争，触发 NotFoundError removeChild）。

export type LabelTone = 'tag' | 'on' | 'self' | 'off' | 'hot' | 'sk' | 'ok' | 'bad';
const TONE: Record<LabelTone, { fg: string; bg: string; line: string }> = {
  tag: { fg: '#e8f4ff', bg: 'rgba(8,10,18,0.82)', line: 'rgba(255,255,255,0.25)' },
  on: { fg: '#3ef0ff', bg: 'rgba(8,10,18,0.86)', line: '#3ef0ff' },
  self: { fg: '#ffd400', bg: 'rgba(8,10,18,0.86)', line: '#ffd400' },
  off: { fg: '#8d9bb8', bg: 'rgba(8,10,18,0.6)', line: 'rgba(255,255,255,0.12)' },
  hot: { fg: '#ff8a9c', bg: 'rgba(30,6,12,0.86)', line: '#ff3b5c' },
  sk: { fg: '#ffd400', bg: 'rgba(40,32,0,0.82)', line: '#ffd400' },
  ok: { fg: '#7dffa8', bg: 'rgba(0,0,0,0)', line: 'rgba(0,0,0,0)' },
  bad: { fg: '#ff8a9c', bg: 'rgba(40,8,14,0.8)', line: 'rgba(0,0,0,0)' },
};

const PX = 44; // 字号（像素）
const texCache = new Map<string, { tex: THREE.CanvasTexture; aspect: number }>();
function labelTexture(text: string, tone: LabelTone) {
  const key = `${tone}|${text}`;
  let hit = texCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  const g = c.getContext('2d')!;
  const font = `700 ${PX}px system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`;
  g.font = font;
  const w = Math.ceil(g.measureText(text).width) + PX;
  const h = Math.round(PX * 1.6);
  c.width = w;
  c.height = h;
  const t = TONE[tone];
  g.fillStyle = t.bg;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = t.line;
  g.lineWidth = 3;
  g.strokeRect(1.5, 1.5, w - 3, h - 3);
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = t.fg;
  g.shadowBlur = tone === 'sk' || tone === 'ok' ? 12 : 0;
  g.fillStyle = t.fg;
  g.fillText(text, w / 2, h / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  hit = { tex, aspect: w / h };
  texCache.set(key, hit);
  return hit;
}

/** 场景文字。float=true 时从挂载起上浮淡出约 1.1 秒（用于技能、出杯、流失浮字）。 */
export function Label3D({ text, tone = 'tag', position, height = 0.3, float = false, minPixels = 0 }: {
  text: string; tone?: LabelTone; position: [number, number, number]; height?: number; float?: boolean; minPixels?: number;
}) {
  const { tex, aspect } = labelTexture(text, tone);
  const mat = useMemo(() => new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }), [tex]);
  useEffect(() => () => mat.dispose(), [mat]);
  const s = useRef<THREE.Sprite>(null);
  const t0 = useRef(-1);
  useFrame(({ clock, camera, size }) => {
    if (minPixels && s.current && camera instanceof THREE.OrthographicCamera) {
      const unitsPerPixel = (camera.top-camera.bottom)/(camera.zoom*size.height);
      const shownHeight = Math.max(height,minPixels*unitsPerPixel);
      s.current.scale.set(shownHeight*aspect,shownHeight,1);
    }
    if (!float || !s.current) return;
    if (t0.current < 0) t0.current = clock.elapsedTime;
    const k = (clock.elapsedTime - t0.current) / 1.1;
    s.current.position.y = position[1] + Math.min(1, k) * 0.5;
    mat.opacity = k < 0.15 ? k / 0.15 : Math.max(0, 1 - (k - 0.15) / 0.85);
    s.current.visible = k < 1;
  });
  return <sprite ref={s} position={position} scale={[height * aspect, height, 1]} material={mat} renderOrder={10} />;
}
