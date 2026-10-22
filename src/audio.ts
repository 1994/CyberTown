import { cueNotes, type SoundCue } from './audioCues.ts';
import { GameMusic } from './music.ts';
import type { MusicScene } from './musicScore.ts';

export const AUDIO_STORAGE_KEY = 'boss.audio';
export const MAX_SOUND_VOICES = 24;
interface AudioSettings { enabled: boolean; volume: number }
type AudioStatus = 'locked' | 'running' | 'paused' | 'unsupported';
export interface AudioSnapshot extends AudioSettings { status: AudioStatus; musicVolume: number; musicScene: MusicScene }
export interface AudioEnvironment {
  createContext: () => AudioContext | null;
  visible: () => boolean;
  now: () => number;
  read: () => string | null;
  write: (value: string) => void;
  meter?: boolean;
}

const DEFAULTS: AudioSettings = { enabled: true, volume: 0.35 };
const COOLDOWN: Partial<Record<SoundCue, number>> = { ui: 70, step: 310, miss: 380, catch: 65, countdown: 700,
  tea_order: 650, tea_pour: 900, tea_serve: 650, tea_skill: 1800, tea_stock: 5000 };

export function readAudioSettings(value: string | null): AudioSettings {
  try {
    const saved = JSON.parse(value ?? 'null');
    return {
      enabled: typeof saved?.enabled === 'boolean' ? saved.enabled : DEFAULTS.enabled,
      volume: typeof saved?.volume === 'number' && Number.isFinite(saved.volume)
        ? Math.max(0, Math.min(1, saved.volume)) : DEFAULTS.volume,
    };
  } catch { return { ...DEFAULTS }; }
}

/** One lazy context; no sound queues, fetches, frame callbacks or persistent oscillators. */
export class GameAudio {
  private env: AudioEnvironment;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private analyser: AnalyserNode | null = null;
  private samples = new Float32Array(256);
  private state: AudioSnapshot;
  private listeners = new Set<() => void>();
  private voices = new Map<OscillatorNode, GainNode>();
  private last = new Map<SoundCue, number>();
  private events = new Map<string, number>();
  private music: GameMusic;
  readonly metrics = { played: 0, lastCue: '' as SoundCue | '', peakVoices: 0, peakSignal: 0,
    counts: {} as Partial<Record<SoundCue, number>> };

  constructor(env: AudioEnvironment) {
    this.env = env;
    let saved: string | null = null;
    try { saved = env.read(); } catch { /* private browsing */ }
    let musicVolume = 0.55;
    try { const level = JSON.parse(saved ?? 'null')?.musicVolume;
      if (typeof level === 'number' && Number.isFinite(level)) musicVolume = Math.max(0, Math.min(1, level));
    } catch { /* old or unavailable preferences */ }
    this.state = { ...readAudioSettings(saved), status: 'locked', musicVolume, musicScene: 'silent' };
    this.music = new GameMusic({ audible: () => this.state.enabled && this.state.volume > 0 && this.env.visible(),
      capacity: () => Math.max(0, MAX_SOUND_VOICES - this.voices.size - 4) });
    this.music.setVolume(musicVolume);
  }

  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  get activeVoices() { return this.voices.size + this.music.activeVoices; }
  get musicStats() { return { ...this.music.metrics, activeVoices: this.music.activeVoices, playing: this.music.playing }; }
  setMusicScene(scene: MusicScene) {
    this.update({ musicScene: scene });
    try { this.music.setScene(scene); } catch { this.music.stop(); }
  }
  setMusicVolume(value: number) {
    if (!Number.isFinite(value)) return;
    const musicVolume = Math.max(0, Math.min(1, value));
    this.update({ musicVolume }); this.persist();
    try { this.music.setVolume(musicVolume); } catch { this.music.stop(); }
  }
  measurePeak() {
    if (!this.analyser) return;
    this.analyser.getFloatTimeDomainData(this.samples);
    for (const sample of this.samples) this.metrics.peakSignal = Math.max(this.metrics.peakSignal, Math.abs(sample));
  }
  private update(patch: Partial<AudioSnapshot>) {
    const next = { ...this.state, ...patch };
    if (Object.keys(next).every(k => next[k as keyof AudioSnapshot] === this.state[k as keyof AudioSnapshot])) return;
    this.state = next;
    for (const listener of this.listeners) listener();
  }
  private persist() {
    try { this.env.write(JSON.stringify({ enabled: this.state.enabled, volume: this.state.volume, musicVolume: this.state.musicVolume })); } catch { /* optional storage */ }
  }
  setEnabled(enabled: boolean) {
    this.update({ enabled });
    this.persist();
    if (!enabled) this.stopAll();
    this.applyVolume();
  }
  setVolume(volume: number) {
    if (!Number.isFinite(volume)) return;
    this.update({ volume: Math.max(0, Math.min(1, volume)) });
    this.persist();
    if (this.state.volume === 0) this.stopAll();
    this.applyVolume();
  }
  private applyVolume() {
    if (!this.ctx || !this.master) return;
    const at = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(at);
    this.master.gain.setValueAtTime(this.master.gain.value, at);
    this.master.gain.linearRampToValueAtTime(this.state.enabled ? this.state.volume * 0.7 : 0, at + 0.02);
  }

  /** Call synchronously from a trusted pointer/key gesture, including after iOS interruption. */
  async activate() {
    if (!this.state.enabled || this.state.volume === 0 || !this.env.visible()) return;
    try {
      if (!this.ctx || this.ctx.state === 'closed') {
        this.ctx = this.env.createContext();
        if (!this.ctx) { this.update({ status: 'unsupported' }); return; }
        this.master = this.ctx.createGain();
        this.compressor = this.ctx.createDynamicsCompressor();
        this.compressor.threshold.value = -16;
        this.compressor.knee.value = 10;
        this.compressor.ratio.value = 8;
        this.compressor.attack.value = 0.003;
        this.compressor.release.value = 0.16;
        this.master.connect(this.compressor);
        if (this.env.meter) {
          this.analyser = this.ctx.createAnalyser();
          this.analyser.fftSize = 256;
          this.compressor.connect(this.analyser);
          this.analyser.connect(this.ctx.destination);
        } else this.compressor.connect(this.ctx.destination);
        this.master.gain.value = this.state.volume * 0.7;
        this.music.attach(this.ctx, this.master);
        this.ctx.onstatechange = () => {
          const running = this.ctx?.state === 'running';
          if (!running) this.stopAll();
          this.update({ status: running ? 'running' : 'paused' });
        };
      }
      if (this.ctx.state !== 'running') await this.ctx.resume();
      // If the page was hidden while resume was pending, never start late audio.
      if (!this.env.visible()) { this.pause(); return; }
      this.update({ status: this.ctx.state === 'running' ? 'running' : 'paused' });
      this.music.start();
    } catch { this.update({ status: 'paused' }); }
  }

  play(cue: SoundCue, options: { combo?: number; key?: string } = {}): boolean {
    try { return this.schedule(cue, options); }
    catch {
      // Audio/device failure must never abort a successful game transaction.
      this.stopAll();
      this.update({ status: 'paused' });
      return false;
    }
  }
  private schedule(cue: SoundCue, options: { combo?: number; key?: string }): boolean {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || !this.state.enabled || this.state.volume === 0 || !this.env.visible()) return false;
    const now = this.env.now();
    if (now - (this.last.get(cue) ?? -Infinity) < (COOLDOWN[cue] ?? 100)) return false;
    for (const [key, at] of this.events) if (now - at > 60_000) this.events.delete(key);
    if (options.key && this.events.has(options.key)) return false;
    const notes = cueNotes(cue, options.combo);
    if (this.activeVoices + notes.length > MAX_SOUND_VOICES) return false;
    if (['tea_pass', 'tea_fail', 'tea_upgrade', 'tea_skill', 'hire'].includes(cue)) this.music.duck();
    this.last.set(cue, now);
    if (options.key) this.events.set(options.key, now);
    while (this.events.size > 512) this.events.delete(this.events.keys().next().value!);
    const start = ctx.currentTime + 0.005;
    for (const note of notes) {
      const source = ctx.createOscillator();
      const gain = ctx.createGain();
      const at = start + (note.at ?? 0);
      source.type = note.wave ?? 'sine';
      source.frequency.setValueAtTime(note.hz, at);
      if (note.end) source.frequency.exponentialRampToValueAtTime(note.end, at + note.length);
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(note.gain, at + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + note.length);
      source.connect(gain);
      gain.connect(this.master!);
      this.voices.set(source, gain);
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
        this.voices.delete(source);
      };
      source.start(at);
      source.stop(at + note.length + 0.015);
    }
    this.metrics.played++;
    this.metrics.counts[cue] = (this.metrics.counts[cue] ?? 0) + 1;
    this.metrics.lastCue = cue;
    this.metrics.peakVoices = Math.max(this.metrics.peakVoices, this.activeVoices);
    return true;
  }
  stopAll() {
    this.music.stop();
    for (const [source, gain] of this.voices) {
      try { source.stop(); } catch { /* already stopped */ }
      try { source.disconnect(); gain.disconnect(); } catch { /* detached device */ }
    }
    this.voices.clear();
  }
  pause() {
    this.stopAll();
    if (this.ctx && this.ctx.state !== 'closed') void this.ctx.suspend().catch(() => undefined);
    if (this.ctx) this.update({ status: 'paused' });
  }
}

export const sound = new GameAudio({
  createContext: () => {
    const Audio = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    return Audio ? new Audio({ latencyHint: 'interactive' }) : null;
  },
  visible: () => typeof document !== 'undefined' && !document.hidden,
  now: () => performance.now(),
  read: () => typeof window !== 'undefined' ? window.localStorage.getItem(AUDIO_STORAGE_KEY) : null,
  write: value => window.localStorage.setItem(AUDIO_STORAGE_KEY, value),
  meter: typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('audio') === 'debug',
});
