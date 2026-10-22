import { MUSIC_SCORES, type MusicInstrument, type MusicNote, type MusicScene, type MusicScore } from './musicScore.ts';

export const MAX_MUSIC_VOICES = 12;
// Compensate the soft, low-velocity score before the shared master/compressor.
const MUSIC_TRIM = 2.4;
export interface MusicVoice { stop(at?: number): void }
export interface MusicEnvironment {
  audible: () => boolean;
  capacity?: () => number;
  interval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (id: unknown) => void;
}

const TIMBRE: Record<MusicInstrument, { gain: number; attack: number; cutoff: number; wave: OscillatorType }> = {
  pad: { gain: 0.085, attack: 0.16, cutoff: 1100, wave: 'triangle' },
  keys: { gain: 0.13, attack: 0.014, cutoff: 2800, wave: 'sine' },
  bass: { gain: 0.15, attack: 0.025, cutoff: 550, wave: 'triangle' },
  pluck: { gain: 0.075, attack: 0.009, cutoff: 2400, wave: 'triangle' },
  kick: { gain: 0.12, attack: 0.008, cutoff: 380, wave: 'sine' },
  hat: { gain: 0.022, attack: 0.006, cutoff: 6500, wave: 'sine' },
};
const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();
function hatNoise(ctx: BaseAudioContext) {
  let noise = noiseCache.get(ctx);
  if (!noise) {
    noise = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.18), ctx.sampleRate);
    const data = noise.getChannelData(0);
    let seed = 93241;
    for (let i = 0; i < data.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      data[i] = seed / 2147483648 - 1;
    }
    noiseCache.set(ctx, noise);
  }
  return noise;
}

/** The same voice renderer is used by the live player and offline QA clips. */
export function renderMusicVoice(ctx: BaseAudioContext, target: AudioNode, note: MusicNote, bpm: number, at: number, ended: () => void = () => {}): MusicVoice {
  const tone = TIMBRE[note.instrument];
  const seconds = Math.max(0.045, Math.min(5, note.duration * 60 / bpm));
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = note.instrument === 'hat' ? 'highpass' : 'lowpass';
  filter.frequency.value = tone.cutoff;
  filter.Q.value = 0.45;
  let source: AudioScheduledSourceNode;
  if (note.instrument === 'hat') {
    const noise = ctx.createBufferSource();
    noise.buffer = hatNoise(ctx);
    source = noise;
  } else {
    const osc = ctx.createOscillator();
    osc.type = tone.wave;
    const hz = note.instrument === 'kick' ? 112 : 440 * 2 ** ((note.midi - 69) / 12);
    osc.frequency.setValueAtTime(hz, at);
    if (note.instrument === 'kick') osc.frequency.exponentialRampToValueAtTime(43, at + Math.min(seconds, 0.16));
    source = osc;
  }
  const level = Math.max(0, Math.min(1, note.velocity)) * tone.gain;
  const attack = Math.min(seconds * 0.2, tone.attack);
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(level, at + attack);
  if (note.instrument === 'pad') {
    gain.gain.setValueAtTime(level * 0.82, at + Math.max(attack, seconds * 0.55));
    gain.gain.linearRampToValueAtTime(0, at + seconds);
  } else gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(target);
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    source.disconnect(); filter.disconnect(); gain.disconnect(); ended();
  };
  source.onended = dispose;
  source.start(at);
  source.stop(at + seconds + 0.025);
  return { stop(deadline) {
    try { source.stop(deadline); } catch { /* the voice may have already ended */ }
    if (deadline === undefined) dispose();
  } };
}

export function notesAtStep(score: MusicScore, step: number) {
  return score.notes.filter(n => n.step === step && Number.isFinite(n.midi) && Number.isFinite(n.duration)
    && n.duration > 0 && Number.isFinite(n.velocity) && n.velocity > 0 && n.instrument in TIMBRE);
}

/** One look-ahead scheduler, only while the unlocked page is audible. */
export class GameMusic {
  private env: MusicEnvironment;
  private ctx: AudioContext | null = null;
  private target: AudioNode | null = null;
  private scene: MusicScene = 'silent';
  private volume = 0.55;
  private timer: unknown = null;
  private nextAt = 0;
  private step = 0;
  private bus: GainNode | null = null;
  private buses = new Map<GainNode, { count: number; retired: boolean }>();
  private voices = new Map<MusicVoice, GainNode>();
  readonly metrics = { scheduledNotes: 0, droppedNotes: 0, peakVoices: 0, schedulerStarts: 0, sceneChanges: 0 };
  constructor(env: MusicEnvironment) { this.env = env; }
  get activeVoices() { return this.voices.size; }
  get playing() { return this.timer !== null; }
  get currentScene() { return this.scene; }
  attach(ctx: AudioContext, target: AudioNode) {
    if (this.ctx && this.ctx !== ctx) this.stop();
    this.ctx = ctx; this.target = target;
  }
  setScene(scene: MusicScene) {
    if (scene === this.scene) return;
    this.stop(true);
    this.scene = scene;
    this.metrics.sceneChanges++;
    this.start();
  }
  setVolume(value: number) {
    if (!Number.isFinite(value)) return;
    this.volume = Math.max(0, Math.min(1, value));
    if (this.volume === 0) { this.stop(); return; }
    if (this.ctx && this.bus) {
      const now = this.ctx.currentTime;
      this.bus.gain.cancelScheduledValues(now);
      this.bus.gain.setValueAtTime(this.bus.gain.value, now);
      this.bus.gain.linearRampToValueAtTime(this.volume * MUSIC_TRIM, now + 0.15);
    }
    this.start();
  }
  start() {
    try { this.begin(); } catch { this.stop(); }
  }
  private begin() {
    const ctx = this.ctx;
    if (this.timer !== null || !ctx || !this.target || ctx.state !== 'running' || !this.env.audible()
      || this.scene === 'silent' || this.volume === 0) return;
    const bus = ctx.createGain();
    const now = ctx.currentTime;
    bus.gain.setValueAtTime(0, now);
    bus.gain.linearRampToValueAtTime(this.volume * MUSIC_TRIM, now + 0.65);
    bus.connect(this.target);
    this.buses.set(bus, { count: 0, retired: false });
    this.bus = bus;
    this.step = 0; this.nextAt = now + 0.035;
    this.timer = (this.env.interval ?? ((fn, ms) => globalThis.setInterval(fn, ms)))(() => this.pump(), 80);
    this.metrics.schedulerStarts++;
    this.pump();
  }
  /** Public only to allow deterministic scheduler tests without real timers. */
  pump() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || !this.env.audible()) { this.stop(); return; }
    if (this.scene === 'silent' || !this.bus || this.timer === null) return;
    const score = MUSIC_SCORES[this.scene];
    if (!score || score.bpm < 40 || score.bpm > 200 || score.steps < 16) { this.stop(); return; }
    const interval = 60 / score.bpm / 4;
    // Long stalls/background interruptions discard elapsed beats, never burst them.
    if (this.nextAt < ctx.currentTime - 0.25) {
      const missed = Math.ceil((ctx.currentTime - this.nextAt) / interval);
      this.step = (this.step + missed) % score.steps;
      this.nextAt = ctx.currentTime + 0.035;
    }
    const bus = this.bus;
    try {
      while (this.nextAt < ctx.currentTime + 0.13) {
        for (const note of notesAtStep(score, this.step)) {
          const capacity = Math.min(MAX_MUSIC_VOICES, this.env.capacity?.() ?? MAX_MUSIC_VOICES);
          if (this.voices.size >= capacity) { this.metrics.droppedNotes++; continue; }
          let voice: MusicVoice;
          voice = renderMusicVoice(ctx, bus, note, score.bpm, this.nextAt, () => {
            this.voices.delete(voice);
            const state = this.buses.get(bus);
            if (state) { state.count--; this.releaseBus(bus); }
          });
          this.voices.set(voice, bus);
          this.buses.get(bus)!.count++;
          this.metrics.scheduledNotes++;
          this.metrics.peakVoices = Math.max(this.metrics.peakVoices, this.voices.size);
        }
        this.step = (this.step + 1) % score.steps;
        this.nextAt += interval;
      }
    } catch { this.stop(); }
  }
  duck() {
    if (!this.ctx || !this.bus) return;
    const at = this.ctx.currentTime;
    this.bus.gain.cancelScheduledValues(at);
    this.bus.gain.setValueAtTime(this.bus.gain.value, at);
    this.bus.gain.linearRampToValueAtTime(this.volume * MUSIC_TRIM * 0.45, at + 0.05);
    this.bus.gain.linearRampToValueAtTime(this.volume * MUSIC_TRIM, at + 0.8);
  }
  private releaseBus(bus: GainNode) {
    const state = this.buses.get(bus);
    if (state?.retired && state.count <= 0) { bus.disconnect(); this.buses.delete(bus); }
  }
  stop(fade = false) {
    if (this.timer !== null) {
      (this.env.clearInterval ?? (id => globalThis.clearInterval(id as ReturnType<typeof globalThis.setInterval>)))(this.timer);
      this.timer = null;
    }
    this.bus = null;
    const ctx = this.ctx;
    const soften = fade && ctx?.state === 'running';
    for (const [bus, state] of this.buses) {
      state.retired = true;
      if (ctx && soften) {
        const at = ctx.currentTime;
        bus.gain.cancelScheduledValues(at);
        bus.gain.setValueAtTime(bus.gain.value, at);
        bus.gain.linearRampToValueAtTime(0, at + 0.35);
      }
      this.releaseBus(bus);
    }
    for (const voice of [...this.voices.keys()]) voice.stop(soften && ctx ? ctx.currentTime + 0.37 : undefined);
  }
}

/** Original score, same instruments as live playback, for portable QA previews. */
export async function renderMusicPreview(scene: Exclude<MusicScene, 'silent'>, seconds = 24): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * 44100), 44100);
  const master = ctx.createGain(); master.gain.value = 0.35 * 0.7 * 0.55 * MUSIC_TRIM;
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -16; compressor.ratio.value = 8; compressor.knee.value = 10;
  master.connect(compressor); compressor.connect(ctx.destination);
  const score = MUSIC_SCORES[scene];
  const stepTime = 60 / score.bpm / 4;
  for (let at = 0.035, step = 0; at < seconds - 0.3; at += stepTime, step = (step + 1) % score.steps) {
    for (const note of notesAtStep(score, step)) renderMusicVoice(ctx, master, note, score.bpm, at);
  }
  return ctx.startRendering();
}
