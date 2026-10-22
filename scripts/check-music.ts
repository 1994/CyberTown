import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GameMusic, MAX_MUSIC_VOICES } from '../src/music.ts';
import { MUSIC_SCORES } from '../src/musicScore.ts';

class Param {
  value = 0;
  setValueAtTime(v: number, _at: number) { this.value = v; }
  linearRampToValueAtTime(v: number, _at: number) { this.value = v; }
  exponentialRampToValueAtTime(v: number, _at: number) { this.value = v; }
  cancelScheduledValues(_at: number) {}
}
class Node {
  gain = new Param(); frequency = new Param(); Q = new Param();
  type = ''; buffer: unknown;
  disconnected = false;
  connect(_target: unknown) { return this; }
  disconnect() { this.disconnected = true; }
}
class Voice extends Node {
  onended: (() => void) | null = null;
  end = Infinity; done = false; began = Infinity;
  start(at: number) { this.began = at; }
  stop(at?: number) { this.end = Math.min(this.end, at ?? 0); }
  finish() { if (!this.done) { this.done = true; this.onended?.(); } }
}
class Context {
  state = 'running'; currentTime = 0; sampleRate = 22050;
  nodes: Node[] = []; voices: Voice[] = []; fail = false;
  createGain() { const n = new Node(); this.nodes.push(n); return n; }
  createBiquadFilter() { return this.createGain(); }
  createOscillator() {
    if (this.fail) throw new Error('device removed');
    const v = new Voice(); this.voices.push(v); return v;
  }
  createBufferSource() { return this.createOscillator(); }
  createBuffer(_channels: number, size: number, _rate: number) { return { getChannelData: () => new Float32Array(size) }; }
  advance(seconds: number) { this.currentTime += seconds; for (const v of this.voices) if (v.end <= this.currentTime) v.finish(); }
}
function fixture() {
  const ctx = new Context();
  const env = { audible: false, timers: new Map<number, () => void>(), next: 0, capacity: 12 };
  const music = new GameMusic({ audible: () => env.audible, capacity: () => env.capacity,
    interval: fn => { const id = ++env.next; env.timers.set(id, fn); return id; },
    clearInterval: id => { env.timers.delete(id as number); } });
  music.attach(ctx as unknown as AudioContext, new Node() as unknown as AudioNode);
  return { ctx, env, music };
}

test('music remains locked until audible; repeated gestures/scene updates own one scheduler', () => {
  const { music, env, ctx } = fixture(); music.setScene('street');
  assert.equal(ctx.voices.length, 0); assert.equal(env.timers.size, 0);
  env.audible = true; music.start(); music.start(); music.setScene('street');
  assert.equal(env.timers.size, 1); assert.equal(music.metrics.schedulerStarts, 1);
  assert.ok(music.metrics.scheduledNotes > 0);
  music.stop(); assert.equal(env.timers.size, 0); assert.equal(music.activeVoices, 0);
});

test('scene crossfades retire old buses, with a shared voice cap and no surviving timer on stop', () => {
  const { music, env, ctx } = fixture(); env.audible = true;
  for (let i = 0; i < 20; i++) {
    music.setScene(i % 2 ? 'rush' : 'street'); ctx.advance(0.04); music.pump();
    assert.equal(env.timers.size, 1); assert.ok(music.activeVoices <= MAX_MUSIC_VOICES);
  }
  music.stop(); ctx.advance(10);
  assert.equal(env.timers.size, 0); assert.equal(music.activeVoices, 0);
  assert.ok(ctx.nodes.every(n => n.disconnected));
});

test('long stalls discard missed music instead of scheduling minutes of backlog', () => {
  const { music, env, ctx } = fixture(); env.audible = true; music.setScene('business');
  const before = music.metrics.scheduledNotes; ctx.advance(120); music.pump();
  assert.ok(music.metrics.scheduledNotes - before <= MAX_MUSIC_VOICES);
  assert.ok(ctx.voices.filter(v => !v.done).every(v => v.began >= ctx.currentTime));
  music.stop();
});

test('backgrounding, zero music volume and audio interruption stop the scheduler and all voices', () => {
  const { music, env, ctx } = fixture(); env.audible = true; music.setScene('prep');
  env.audible = false; music.pump(); assert.equal(env.timers.size, 0); assert.equal(music.activeVoices, 0);
  env.audible = true; music.start(); music.setVolume(0);
  assert.equal(env.timers.size, 0); assert.equal(music.activeVoices, 0);
  music.setVolume(0.5); assert.equal(env.timers.size, 1);
  ctx.state = 'interrupted'; music.pump(); assert.equal(env.timers.size, 0); assert.equal(music.activeVoices, 0);
});

test('a removed audio device cannot throw from scene changes or break game state', () => {
  const { music, env, ctx } = fixture(); env.audible = true; ctx.fail = true;
  assert.doesNotThrow(() => music.setScene('street'));
  assert.equal(env.timers.size, 0); assert.equal(music.activeVoices, 0);
  ctx.fail = false; music.start(); assert.ok(music.activeVoices > 0); music.stop();
});

test('all five original arrangements are complete, finite and fit polyphony across their loop seam', () => {
  for (const [name, score] of Object.entries(MUSIC_SCORES)) {
    assert.ok(score.bpm >= 76 && score.bpm <= 116, name);
    assert.ok(score.steps >= 128 && score.steps % 16 === 0, name);
    assert.ok(new Set(score.notes.map(n => n.instrument)).size >= 3, name);
    const edges: [number, number][] = [];
    const sixteenth = 60 / score.bpm / 4;
    for (let repeat = 0; repeat < 3; repeat++) for (const n of score.notes) {
      assert.ok(Number.isInteger(n.step) && n.step >= 0 && n.step < score.steps);
      assert.ok(Number.isFinite(n.velocity) && n.velocity > 0 && n.velocity <= 1);
      assert.ok(Number.isFinite(n.duration) && n.duration > 0 && n.duration <= 8);
      assert.ok(n.midi === 0 || (n.midi >= 24 && n.midi <= 96));
      const start = (repeat * score.steps + n.step) * sixteenth;
      const length = n.instrument === 'hat' ? Math.min(0.18, n.duration * 60 / score.bpm + 0.025) : n.duration * 60 / score.bpm + 0.025;
      edges.push([start, 1], [start + length, -1]);
    }
    edges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let active = 0, peak = 0;
    for (const [,delta] of edges) { active += delta; peak = Math.max(peak, active); }
    assert.ok(peak <= MAX_MUSIC_VOICES, `${name}: ${peak} voices`);
  }
});
