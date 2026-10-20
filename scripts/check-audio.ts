import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GameAudio, MAX_SOUND_VOICES, readAudioSettings } from '../src/audio.ts';
import { SOUND_CUES, cueNotes, type SoundCue } from '../src/audioCues.ts';

class Param {
  value = 0;
  events: { kind: string; value: number; at: number }[] = [];
  setValueAtTime(value: number, at: number) { this.value = value; this.events.push({ kind: 'set', value, at }); }
  linearRampToValueAtTime(value: number, at: number) { this.value = value; this.events.push({ kind: 'linear', value, at }); }
  exponentialRampToValueAtTime(value: number, at: number) { this.value = value; this.events.push({ kind: 'exponential', value, at }); }
  cancelScheduledValues(_at: number) { /* scheduling assertion uses recorded ramps */ }
}
class Node {
  disconnected = false;
  gain = new Param();
  connect(_node: unknown) { return this; }
  disconnect() { this.disconnected = true; }
}
class Source extends Node {
  type = 'sine';
  frequency = new Param();
  onended: (() => void) | null = null;
  starts: number[] = [];
  stops: (number | undefined)[] = [];
  start(at: number) { this.starts.push(at); }
  stop(at?: number) { this.stops.push(at); }
  finish() { this.onended?.(); }
}
class Context {
  state = 'suspended';
  currentTime = 4;
  destination = new Node();
  sources: Source[] = [];
  gains: Node[] = [];
  onstatechange: (() => void) | null = null;
  resumes = 0;
  suspends = 0;
  failResume = false;
  failSource = false;
  createGain() { const node = new Node(); this.gains.push(node); return node; }
  createDynamicsCompressor() {
    return Object.assign(new Node(), { threshold: new Param(), knee: new Param(), ratio: new Param(), attack: new Param(), release: new Param() });
  }
  createOscillator() {
    if (this.failSource) throw new Error('device lost');
    const source = new Source(); this.sources.push(source); return source;
  }
  async resume() {
    this.resumes++;
    if (this.failResume) throw new Error('gesture required');
    this.state = 'running'; this.onstatechange?.();
  }
  async suspend() { this.suspends++; this.state = 'suspended'; this.onstatechange?.(); }
  finish() { for (const source of this.sources) source.finish(); }
}
function fixture(saved: string | null = null) {
  const ctx = new Context();
  const env = { creates: 0, visible: true, now: 1000, saved, supported: true };
  const audio = new GameAudio({
    createContext: () => { env.creates++; return env.supported ? ctx as unknown as AudioContext : null; },
    visible: () => env.visible, now: () => env.now,
    read: () => env.saved, write: value => { env.saved = value; },
  });
  return { audio, ctx, env };
}

test('no context or voices before explicit user activation; repeated gestures reuse one context', async () => {
  const { audio, ctx, env } = fixture();
  assert.equal(audio.play('hire'), false);
  assert.equal(env.creates, 0);
  await audio.activate(); await audio.activate();
  assert.equal(env.creates, 1);
  assert.equal(ctx.resumes, 1);
  assert.equal(audio.play('hire'), true);
});

test('mute and zero-volume preferences persist without initializing audio', async () => {
  const { audio, env } = fixture();
  audio.setEnabled(false); audio.setVolume(0.2); await audio.activate();
  assert.equal(env.creates, 0);
  assert.deepEqual(readAudioSettings(env.saved), { enabled: false, volume: 0.2 });
  audio.setEnabled(true); audio.setVolume(0); await audio.activate();
  assert.equal(env.creates, 0);
  const restored = fixture(env.saved).audio;
  assert.equal(restored.getSnapshot().volume, 0);
});

test('malformed preferences, nonfinite numbers and out-of-range volume are safe', () => {
  assert.deepEqual(readAudioSettings('bad json'), { enabled: true, volume: 0.35 });
  assert.deepEqual(readAudioSettings('{"enabled":"false","volume":-2}'), { enabled: true, volume: 0 });
  assert.equal(readAudioSettings('{"volume":100}').volume, 1);
  assert.equal(readAudioSettings('{"volume":"loud"}').volume, 0.35);
  const { audio } = fixture(); audio.setVolume(NaN);
  assert.equal(audio.getSnapshot().volume, 0.35);
});

test('unsupported devices and rejected resume never break gameplay; later gestures can retry', async () => {
  const unsupported = fixture(); unsupported.env.supported = false;
  await unsupported.audio.activate();
  assert.equal(unsupported.audio.getSnapshot().status, 'unsupported');
  assert.equal(unsupported.audio.play('coins'), false);
  const { audio, ctx } = fixture(); ctx.failResume = true;
  await audio.activate(); assert.equal(audio.play('coins'), false);
  ctx.failResume = false; await audio.activate();
  assert.equal(audio.play('coins'), true);
  ctx.failSource = true;
  assert.doesNotThrow(() => audio.play('promotion'));
  assert.equal(audio.activeVoices, 0);
});

test('hidden pages stop, suspend and discard events instead of replaying a backlog', async () => {
  const { audio, ctx, env } = fixture(); await audio.activate();
  audio.play('hire'); assert.ok(audio.activeVoices > 0);
  env.visible = false; audio.pause();
  assert.equal(audio.activeVoices, 0);
  assert.equal(ctx.suspends, 1);
  assert.equal(audio.play('coins'), false);
  env.visible = true; assert.equal(audio.play('coins'), false);
  await audio.activate();
  assert.equal(audio.metrics.played, 1);
  assert.equal(audio.play('coins'), true);
});

test('API and SSE delivery of the same transaction produce exactly one confirmation cue', async () => {
  const { audio, ctx, env } = fixture(); await audio.activate();
  assert.equal(audio.play('hire', { key: 'trade:boss:123' }), true);
  ctx.finish(); env.now += 500;
  assert.equal(audio.play('hire', { key: 'trade:boss:123' }), false);
  assert.equal(audio.metrics.played, 1);
  assert.equal(audio.play('hire', { key: 'trade:boss:124' }), true);
});

test('OS audio interruptions discard scheduled notes before the next gesture resumes', async () => {
  const { audio, ctx } = fixture(); await audio.activate(); audio.play('promotion');
  ctx.state = 'interrupted'; ctx.onstatechange?.();
  assert.equal(audio.activeVoices, 0);
  assert.equal(audio.getSnapshot().status, 'paused');
  assert.equal(audio.play('coins'), false);
  await audio.activate();
  assert.equal(audio.metrics.played, 1);
  assert.equal(audio.play('coins'), true);
});

test('rapid clicks, misses and footsteps are throttled and active voices stay bounded', async () => {
  const { audio, env } = fixture(); await audio.activate();
  audio.play('ui'); assert.equal(audio.play('ui'), false);
  env.now += 80; assert.equal(audio.play('ui'), true);
  for (let i = 0; i < 100; i++) { env.now += 200; audio.play('promotion'); }
  assert.ok(audio.activeVoices <= MAX_SOUND_VOICES);
  assert.ok(audio.metrics.peakVoices <= MAX_SOUND_VOICES);
});

test('each note has a finite end and releases both oscillator and envelope nodes', async () => {
  const { audio, ctx } = fixture(); await audio.activate(); audio.play('promotion');
  for (const source of ctx.sources) {
    assert.equal(source.starts.length, 1);
    assert.ok(source.starts[0] >= ctx.currentTime);
    assert.ok(source.stops[0]! > source.starts[0]);
    assert.ok(source.stops[0]! - ctx.currentTime < 1.2);
  }
  ctx.finish();
  assert.equal(audio.activeVoices, 0);
  assert.ok(ctx.sources.every(source => source.disconnected));
  assert.ok(ctx.gains.slice(1).every(node => node.disconnected));
});

test('muting mid-effect stops queued notes immediately; re-enabling does not replay them', async () => {
  const { audio, ctx, env } = fixture(); await audio.activate(); audio.play('reward');
  audio.setEnabled(false);
  assert.equal(audio.activeVoices, 0);
  assert.ok(ctx.sources.every(source => source.stops.includes(undefined)));
  assert.equal(audio.play('catch'), false);
  audio.setEnabled(true); env.now += 500; await audio.activate();
  assert.equal(audio.metrics.played, 1);
  assert.equal(audio.play('catch'), true);
});

test('all cues stay short, pitched safely and use click-free attack/release envelopes', async () => {
  for (const cue of Object.keys(SOUND_CUES) as SoundCue[]) {
    for (const note of cueNotes(cue, 999)) {
      assert.ok(note.hz >= 40 && note.hz < 5000);
      assert.ok(note.length > 0.006 && note.length <= 0.4);
      assert.ok((note.at ?? 0) + note.length < 1);
      assert.ok(note.gain > 0 && note.gain <= 0.3);
    }
  }
  assert.ok(cueNotes('catch', 9)[0].hz > cueNotes('catch', 1)[0].hz);
  assert.ok(Number.isFinite(cueNotes('catch', NaN)[0].hz));
  const { audio, ctx } = fixture(); await audio.activate(); audio.play('catch');
  const envelope = ctx.gains[1].gain.events;
  assert.equal(envelope[0].value, 0);
  assert.equal(envelope[1].kind, 'linear');
  assert.equal(envelope.at(-1)!.kind, 'exponential');
  assert.ok(envelope.at(-1)!.value < 0.001);
});
