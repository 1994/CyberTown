import * as THREE from 'three';
import { rng } from '../../shared/rules.ts';

// 材质与标牌使用缓存的程序化贴图；原创广告图片单独位于 public/art。

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
        const l = 28 + r() * 8;
        g.fillStyle = `hsl(${214 + r() * 8}, 22%, ${l}%)`;
        g.fillRect(x, y, w, plankH);
        // 细密金属拉丝
        g.globalAlpha = 0.12;
        for (let i = 0; i < 7; i++) {
          g.strokeStyle = r() > 0.5 ? '#1f2e48' : '#8da8c4';
          g.lineWidth = 1 + r() * 2;
          g.beginPath();
          const yy = y + 6 + r() * (plankH - 12);
          g.moveTo(x, yy);
          g.bezierCurveTo(x + w * 0.3, yy + (r() - 0.5) * 8, x + w * 0.6, yy + (r() - 0.5) * 8, x + w, yy);
          g.stroke();
        }
        g.globalAlpha = 1;
        g.fillStyle = 'rgba(8,15,32,0.6)';
        g.fillRect(x, y, 2, plankH);
        x += w;
      }
      g.fillStyle = 'rgba(8,15,32,0.6)';
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
    const [c, g] = canvas(256, 512);
    const r = rng(seed);
    g.fillStyle = '#101c25';
    g.fillRect(0, 0, 256, 512);
    for (let row = 0; row < 32; row++) {
      g.fillStyle = row % 8 === 0 ? '#080f17' : '#1c2930';
      g.fillRect(0, row * 16, 256, row % 8 === 0 ? 5 : 2);
      for (let col = 0; col < 12; col++) {
        const x = 8 + col * 20, y = row * 16 + 4;
        const lit = r() > .66 && col !== (seed % 10);
        const color = !lit ? '#1a2c37' : warm
          ? ['#c3b5a0', '#a68954', '#e7d4ac'][Math.floor(r() * 3)]
          : ['#78c9ca', '#92abb7', '#b1ced0'][Math.floor(r() * 3)];
        g.fillStyle = color;
        g.fillRect(x, y, 13, 8);
        g.fillStyle = '#08151f';
        g.fillRect(x + 6, y, 1, 8);
        g.fillStyle = 'rgba(0,0,0,.28)';
        g.fillRect(x, y + 6, 13, 2);
      }
    }
    g.fillStyle = '#07131d';
    g.fillRect(64 + seed % 3 * 40, 0, 10, 512);
    const t = tex(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
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
    g.fillText('赛博小镇 · 夜间营业', 30, 30);
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
  const key = 'neon-' + `${w}x${h}|` + lines.map((l) => l.text + l.color + l.size).join('|');
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
        [14, 0.4],
        [5, 0.7],
        [1, 1],
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

/** 指示牌/摊位横幅文字贴图（系统中文字体） */
export function signTexture(text: string, bg: string, fg = '#ffffff', w = 512, h = 128) {
  return cached(`sign-${text}-${bg}-${fg}-${w}x${h}`, () => {
    const [c, g] = canvas(w, h);
    g.fillStyle = bg;
    const r = h * 0.22;
    g.beginPath();
    g.roundRect(4, 4, w - 8, h - 8, r);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.55)';
    g.lineWidth = 4;
    g.stroke();
    g.fillStyle = fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    let size = Math.floor(h * 0.52);
    g.font = `800 ${size}px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", system-ui, sans-serif`;
    while (g.measureText(text).width > w - 40 && size > 12) {
      size -= 2;
      g.font = `800 ${size}px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", system-ui, sans-serif`;
    }
    g.fillText(text, w / 2, h / 2 + 2);
    return tex(c);
  });
}

/** 园区地面：深色草坪 + 细微噪点 */
export function lawnTexture() {
  return cached('lawn', () => {
    const [c, g] = canvas(512, 512);
    g.fillStyle = '#183e39';
    g.fillRect(0, 0, 512, 512);
    const r = rng(77);
    for (let i = 0; i < 5000; i++) {
      g.fillStyle = r() > 0.5 ? 'rgba(81,161,146,0.25)' : 'rgba(12,39,36,0.3)';
      g.fillRect(r() * 512, r() * 512, 2, 3 + r() * 3);
    }
    const t = tex(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(14, 10);
    return t;
  });
}

/** 石材铺装 */
export function paverTexture() {
  return cached('paver', () => {
    const [c, g] = canvas(256, 256);
    g.fillStyle = '#34465e';
    g.fillRect(0, 0, 256, 256);
    const r = rng(12);
    for (let y = 0; y < 256; y += 32) {
      for (let x = (y / 32) % 2 ? -32 : 0; x < 256; x += 64) {
        g.fillStyle = `hsl(216, 22%, ${36 + r() * 10}%)`;
        g.fillRect(x + 2, y + 2, 60, 28);
      }
    }
    const t = tex(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  });
}

/** Cached material detail: sealed concrete, aggregate, panel seams and drain covers. */
export function industrialGround() {
  return cached('industrial-ground', () => {
    const [c, g] = canvas(512, 512);
    const r = rng(5127);
    g.fillStyle = '#35444a'; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 14000; i++) {
      g.fillStyle = r() > .5 ? 'rgba(172,188,186,.07)' : 'rgba(0,8,16,.16)';
      g.fillRect(r() * 512, r() * 512, 1 + r() * 2, 1 + r() * 2);
    }
    g.strokeStyle = '#17252b'; g.lineWidth = 3;
    for (let x = 0; x < 512; x += 128) {
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 512); g.stroke();
      g.beginPath(); g.moveTo(0, x); g.lineTo(512, x); g.stroke();
    }
    for (const [x,y] of [[35,42], [325,294]]) {
      g.fillStyle = '#16232b'; g.fillRect(x,y,74,42);
      g.strokeStyle = '#607276'; g.lineWidth = 1; g.strokeRect(x+2,y+2,70,38);
      g.fillStyle = '#080f16';
      for (let i=0;i<8;i++) g.fillRect(x+8+i*8,y+8,3,26);
    }
    const t = tex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  });
}

/** Data texture: rough dry aggregate with scattered smooth wet patches. */
export function wetRoughness() {
  return cached('wet-roughness', () => {
    const [c, g] = canvas(512, 512); const r = rng(803);
    g.fillStyle = '#c4c4c4'; g.fillRect(0,0,512,512);
    for(let i=0;i<12;i++) {
      const x=r()*512,y=r()*512,w=45+r()*100;
      const grad=g.createRadialGradient(x,y,0,x,y,w);
      grad.addColorStop(0,'rgba(80,80,80,.75)'); grad.addColorStop(.5,'rgba(100,100,100,.35)'); grad.addColorStop(1,'rgba(100,100,100,0)');
      g.fillStyle=grad; g.fillRect(x-w,y-w,w*2,w*2);
    }
    const t=tex(c,false); t.wrapS=t.wrapT=THREE.RepeatWrapping; return t;
  });
}

/** One cached paving texture adds stone joints and inlaid metal without geometry. */
export function plazaPaving() {
  return cached('plaza-paving-v1', () => {
    const [c,g] = canvas(1024,1024);
    const random = rng(4107);
    g.fillStyle='#33434e';g.fillRect(0,0,1024,1024);
    for(let ring=0;ring<8;ring++) {
      const outer=64*(ring+1), inner=ring*64, segments=Math.max(8,(ring+1)*8);
      for(let segment=0;segment<segments;segment++) {
        const a=(segment+(ring%2)*.5)*Math.PI*2/segments, b=a+Math.PI*2/segments;
        g.beginPath();g.arc(512,512,outer,a,b);g.arc(512,512,inner,b,a,true);g.closePath();
        const shade=25+random()*5;
        g.fillStyle=`hsl(210,17%,${shade}%)`;g.fill();
        g.strokeStyle='#24323c';g.lineWidth=2;g.stroke();
      }
    }
    // Brushed grain stays subtle; pale brass inlays frame the central sculpture.
    for(let i=0;i<10000;i++){g.fillStyle=random()>.5?'#c5d8e009':'#06121a14';g.fillRect(random()*1024,random()*1024,1+random()*3,1);}
    for(const r of [192,448]){g.beginPath();g.arc(512,512,r,0,Math.PI*2);g.strokeStyle='#a6976f';g.lineWidth=3;g.stroke();}
    for(let i=0;i<32;i++){g.save();g.translate(512,512);g.rotate(i*Math.PI/16);g.fillStyle=i%4===0?'#c8b67f':'#6a8894';g.fillRect(474,-2,i%4===0?22:10,4);g.restore();}
    return tex(c);
  });
}
