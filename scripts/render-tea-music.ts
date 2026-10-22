import { chromium } from '@playwright/test';
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const out = 'artifacts/tea-art-audio';
await mkdir(out, { recursive: true }); await mkdir('.run/tea-music', { recursive: true });
const bundle = await build({ entryPoints: ['src/music.ts'], bundle: true, platform: 'browser', format: 'iife', globalName: 'TeaMusicQA', write: false });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const rows: Record<string, unknown>[] = [];
try {
  const page = await browser.newPage();
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  for (const scene of ['street', 'prep', 'business', 'rush', 'report']) {
    const rendered = await page.evaluate(async name => {
      const api = (window as unknown as { TeaMusicQA: { renderMusicPreview(scene: string, duration: number): Promise<AudioBuffer> } }).TeaMusicQA;
      const b = await api.renderMusicPreview(name, 27);
      const bytes = new ArrayBuffer(44 + b.length * 4); const v = new DataView(bytes);
      const str = (at: number, s: string) => [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
      str(0, 'RIFF'); v.setUint32(4, bytes.byteLength - 8, true); str(8, 'WAVE'); str(12, 'fmt ');
      v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
      v.setUint32(24, b.sampleRate, true); v.setUint32(28, b.sampleRate * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true);
      str(36, 'data'); v.setUint32(40, b.length * 4, true);
      let peak = 0, squares = 0, clipped = 0, maxJump = 0, previous = 0;
      const a = b.getChannelData(0), c = b.getChannelData(1);
      for (let i = 0; i < b.length; i++) {
        for (let ch = 0; ch < 2; ch++) {
          const sample = ch ? c[i] : a[i]; peak = Math.max(peak, Math.abs(sample)); squares += sample * sample;
          if (Math.abs(sample) >= 0.99) clipped++;
          v.setInt16(44 + i * 4 + ch * 2, Math.round(Math.max(-1, Math.min(1, sample)) * 32767), true);
        }
        maxJump = Math.max(maxJump, Math.abs(a[i] - previous)); previous = a[i];
      }
      let binary = ''; const data = new Uint8Array(bytes);
      for (let i = 0; i < data.length; i += 8192) binary += String.fromCharCode(...data.subarray(i, i + 8192));
      return { base64: btoa(binary), peak, rms: Math.sqrt(squares / b.length / 2), clipped, maxJump, seconds: b.duration };
    }, scene);
    assert.ok(rendered.peak > 0.002 && rendered.peak < 0.98, `${scene}: audible headroom`);
    assert.equal(rendered.clipped, 0); assert.ok(rendered.maxJump < 0.1, `${scene}: discontinuity`);
    const wave = `.run/tea-music/${scene}.wav`; await writeFile(wave, Buffer.from(rendered.base64, 'base64'));
    const mp3 = `${out}/${scene}.mp3`;
    const encode = spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', wave, '-codec:a', 'libmp3lame', '-q:a', '4', mp3], { encoding: 'utf8' });
    assert.equal(encode.status, 0, encode.stderr);
    const { base64: _data, ...metrics } = rendered; rows.push({ scene, ...metrics, file: mp3 });
    process.stdout.write(`${scene}: peak=${rendered.peak.toFixed(4)} rms=${rendered.rms.toFixed(4)} clipped=${rendered.clipped}\n`);
  }
} finally { await browser.close(); }
await writeFile(`${out}/music-render.json`, JSON.stringify({ renderer: 'OfflineAudioContext; same score and voice renderer as live playback', rows }, null, 2));
