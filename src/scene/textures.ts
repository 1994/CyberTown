import * as THREE from 'three';
import { rng } from '../../shared/rules.ts';

// 所有贴图均为运行时 Canvas 程序化生成（无外部素材）。

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
}

function tex(c: HTMLCanvasElement, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

const cache = new Map<string, THREE.Texture>();
function cached(key: string, make: () => THREE.Texture) {
  let t = cache.get(key);
  if (!t) {
    t = make();
    cache.set(key, t);
  }
  return t;
}

export function woodFloor() {
  return cached('wood', () => {
    const [c, g] = canvas(1024, 1024);
    const r = rng(7);
    const plankH = 64;
    for (let y = 0; y < 1024; y += plankH) {
      let x = -Math.floor(r() * 300);
      while (x < 1024) {
        const w = 260 + Math.floor(r() * 220);
        const l = 52 + r() * 10;
        g.fillStyle = `hsl(${26 + r() * 6}, ${38 + r() * 8}%, ${l}%)`;
        g.fillRect(x, y, w, plankH);
        // 木纹
        g.globalAlpha = 0.12;
        for (let i = 0; i < 7; i++) {
          g.strokeStyle = r() > 0.5 ? '#5a3a20' : '#f3d2a8';
          g.lineWidth = 1 + r() * 2;
          g.beginPath();
          const yy = y + 6 + r() * (plankH - 12);
          g.moveTo(x, yy);
          g.bezierCurveTo(x + w * 0.3, yy + (r() - 0.5) * 8, x + w * 0.6, yy + (r() - 0.5) * 8, x + w, yy);
          g.stroke();
        }
        g.globalAlpha = 1;
        g.fillStyle = 'rgba(40,22,10,0.55)';
        g.fillRect(x, y, 2, plankH);
        x += w;
      }
      g.fillStyle = 'rgba(40,22,10,0.5)';
      g.fillRect(0, y, 1024, 2);
    }
    const t = tex(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(3, 2.2);
    return t;
  });
}

export function buildingWindows(seed: number, warm = true) {
  return cached(`win-${seed}-${warm}`, () => {
    const [c, g] = canvas(128, 256);
    const r = rng(seed);
    g.fillStyle = '#0c1120';
    g.fillRect(0, 0, 128, 256);
    const cols = 8;
    const rows = 24;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const v = r();
        let col = '#101a2e';
        if (v > 0.55) col = warm ? (v > 0.85 ? '#ffd9a0' : '#ffb85c') : '#9fd6ff';
        if (v > 0.93) col = '#ffffff';
        if (v > 0.5 && v < 0.55) col = '#4a6fae';
        g.fillStyle = col;
        g.fillRect(x * 16 + 3, y * 10.6 + 2, 10, 6.5);
      }
    }
    const t = tex(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.NearestFilter;
    return t;
  });
}

export function monitorScreen(seed: number, hue: number) {
  return cached(`scr-${seed}-${hue}`, () => {
    const [c, g] = canvas(256, 160);
    const r = rng(seed);
    const grad = g.createLinearGradient(0, 0, 0, 160);
    grad.addColorStop(0, `hsl(${hue}, 60%, 22%)`);
    grad.addColorStop(1, `hsl(${hue + 30}, 60%, 12%)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 160);
    g.fillStyle = 'rgba(255,255,255,0.15)';
    g.fillRect(0, 0, 256, 14);
    for (let i = 0; i < 12; i++) {
      const indent = Math.floor(r() * 4) * 12;
      const w = 40 + r() * 140;
      g.fillStyle = ['#7ee0ff', '#ffd27a', '#ff8fb8', '#a8ff9a', '#ffffff'][Math.floor(r() * 5)];
      g.globalAlpha = 0.85;
      g.fillRect(12 + indent, 22 + i * 11, w, 5);
    }
    g.globalAlpha = 1;
    return tex(c);
  });
}

export function chartScreen() {
  return cached('chart', () => {
    const [c, g] = canvas(512, 288);
    g.fillStyle = '#0d1b2a';
    g.fillRect(0, 0, 512, 288);
    g.strokeStyle = 'rgba(120,200,255,0.25)';
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      g.moveTo(30, 40 + i * 40);
      g.lineTo(490, 40 + i * 40);
      g.stroke();
    }
    const bars = [60, 90, 75, 130, 160, 210];
    bars.forEach((b, i) => {
      const grad = g.createLinearGradient(0, 250 - b, 0, 250);
      grad.addColorStop(0, '#ffcf5a');
      grad.addColorStop(1, '#ff7a3d');
      g.fillStyle = grad;
      g.fillRect(50 + i * 72, 250 - b, 40, b);
    });
    g.strokeStyle = '#5ee1ff';
    g.lineWidth = 5;
    g.beginPath();
    bars.forEach((b, i) => (i === 0 ? g.moveTo(70, 230 - b) : g.lineTo(70 + i * 72, 230 - b)));
    g.stroke();
    g.fillStyle = '#ffffff';
    g.font = 'bold 26px system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';
    g.fillText('本季度 KPI ↑ 老板打工中', 30, 30);
    return tex(c);
  });
}

export function whiteboard() {
  return cached('wb', () => {
    const [c, g] = canvas(512, 320);
    g.fillStyle = '#f7f8fb';
    g.fillRect(0, 0, 512, 320);
    g.font = 'bold 34px system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';
    g.fillStyle = '#e8463f';
    g.fillText('本周目标', 24, 50);
    g.font = '26px system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';
    g.fillStyle = '#2b4cc4';
    ['✓ 签下 3 位大神', '✓ 紧急项目连击 x10', '☐ 把老板挖过来', '☐ 准时下班（?）'].forEach((s, i) => g.fillText(s, 34, 100 + i * 46));
    g.strokeStyle = '#1aa36f';
    g.lineWidth = 4;
    g.beginPath();
    g.arc(420, 200, 50, 0, Math.PI * 1.6);
    g.stroke();
    return tex(c);
  });
}

export function neonText(lines: { text: string; color: string; size: number }[], w = 1024, h = 256) {
  const key = 'neon-' + lines.map((l) => l.text + l.color).join('|');
  return cached(key, () => {
    const [c, g] = canvas(w, h);
    g.clearRect(0, 0, w, h);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const total = lines.reduce((s, l) => s + l.size * 1.15, 0);
    let y = h / 2 - total / 2;
    for (const l of lines) {
      y += (l.size * 1.15) / 2;
      g.font = `900 ${l.size}px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", system-ui, sans-serif`;
      for (const [blur, alpha] of [
        [40, 0.9],
        [18, 1],
        [6, 1],
      ] as const) {
        g.shadowColor = l.color;
        g.shadowBlur = blur;
        g.globalAlpha = alpha;
        g.fillStyle = l.color;
        g.fillText(l.text, w / 2, y);
      }
      g.shadowBlur = 0;
      g.globalAlpha = 1;
      g.fillStyle = '#ffffff';
      g.globalAlpha = 0.85;
      g.fillText(l.text, w / 2, y);
      g.globalAlpha = 1;
      y += (l.size * 1.15) / 2;
    }
    return tex(c);
  });
}

export function rugTexture() {
  return cached('rug', () => {
    const [c, g] = canvas(512, 512);
    g.fillStyle = '#2f3d6b';
    g.fillRect(0, 0, 512, 512);
    g.strokeStyle = '#e9c46a';
    g.lineWidth = 10;
    g.strokeRect(24, 24, 464, 464);
    g.strokeStyle = '#f4a261';
    g.lineWidth = 4;
    g.strokeRect(44, 44, 424, 424);
    g.fillStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i < 512; i += 16) g.fillRect(i, 0, 8, 512);
    return tex(c);
  });
}

export function cityGround() {
  return cached('ground', () => {
    const [c, g] = canvas(1024, 1024);
    g.fillStyle = '#070a14';
    g.fillRect(0, 0, 1024, 1024);
    const r = rng(99);
    for (let i = 0; i < 1024; i += 128) {
      g.fillStyle = '#1a1e2c';
      g.fillRect(i + 52, 0, 24, 1024);
      g.fillRect(0, i + 52, 1024, 24);
      for (let k = 0; k < 1024; k += 12) {
        g.fillStyle = r() > 0.5 ? '#ffcf7a' : '#ff6a4a';
        g.globalAlpha = 0.6;
        g.fillRect(i + 56 + (r() > 0.5 ? 0 : 12), k, 3, 3);
        g.fillStyle = '#9fd6ff';
        g.fillRect(k, i + 56 + (r() > 0.5 ? 0 : 12), 3, 3);
        g.globalAlpha = 1;
      }
    }
    const t = tex(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(4, 4);
    return t;
  });
}
