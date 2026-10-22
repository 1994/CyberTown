import type { SoundNote } from './audioCues.ts';

// 赛博小镇原创配乐：电子夜市 / 温暖 lofi。同一主题（A 小调五声）在街区、筹备、营业、高峰、复盘间变奏；
// 高峰靠更密的节奏与琶音制造张力，而不是加音量。纯数据，无运行依赖。

export type MusicScene = 'silent' | 'street' | 'prep' | 'business' | 'rush' | 'report';
export type MusicInstrument = 'pad' | 'keys' | 'bass' | 'pluck' | 'kick' | 'hat';
export interface MusicNote { step: number; midi: number; duration: number; velocity: number; instrument: MusicInstrument }
export interface MusicScore { bpm: number; steps: number; notes: MusicNote[] }

type Chord = number[];
type Phrase = [step: number, midi: number, beats: number][];

// 8 小节和声（每小节一个和弦，pad 声部 4 音，限制在 48~67 之间不刺耳）
const NIGHT: Chord[] = [
  [53, 57, 60, 64], // Fmaj7
  [55, 59, 62, 64], // G6
  [52, 55, 59, 62], // Em7
  [57, 60, 64, 67], // Am7
  [50, 57, 60, 64], // Dm9（无三音）
  [55, 59, 62, 65], // G7
  [48, 55, 59, 64], // Cmaj7
  [52, 57, 59, 62], // E7sus4
];
const NIGHT_ROOTS = [41, 43, 40, 45, 38, 43, 36, 40];
const HOME: Chord[] = [
  [48, 55, 59, 64], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 64],
  [48, 55, 59, 64], [57, 60, 64, 67], [50, 57, 60, 65], [55, 59, 62, 65],
];
const HOME_ROOTS = [36, 45, 41, 43, 36, 45, 38, 43];
const RESOLVE: Chord[] = [
  [53, 57, 60, 64], [55, 59, 62, 64], [52, 55, 59, 62], [57, 60, 64, 67],
  [53, 57, 60, 64], [55, 59, 62, 65], [48, 53, 55, 60], [48, 55, 60, 64],
];
const RESOLVE_ROOTS = [41, 43, 40, 45, 41, 43, 36, 36];

// 主题：问句（1-4 小节）+ 答句（5-8 小节）
const THEME: Phrase = [
  [0, 76, 1], [4, 74, 0.5], [6, 72, 0.5], [8, 69, 1.5],
  [16, 72, 1], [20, 74, 1], [24, 76, 2],
  [32, 79, 1], [36, 76, 0.5], [38, 74, 0.5], [40, 72, 1], [44, 74, 1],
  [48, 69, 3],
  [64, 72, 1], [68, 74, 0.5], [70, 76, 0.5], [72, 79, 1], [76, 81, 1],
  [80, 79, 1], [84, 76, 1], [88, 74, 2],
  [96, 72, 1], [100, 74, 1], [104, 76, 1], [108, 74, 1],
  [112, 69, 3],
];
// 高峰：主题截短成两拍动机，句尾留空给节奏
const RUSH_MOTIF: Phrase = [
  [0, 76, 0.5], [2, 74, 0.5], [4, 72, 1], [12, 74, 0.5], [14, 76, 0.5],
  [32, 79, 0.5], [34, 76, 0.5], [36, 74, 1], [44, 72, 0.5], [46, 74, 0.5],
  [64, 76, 0.5], [66, 79, 0.5], [68, 81, 1], [76, 79, 0.5], [78, 76, 0.5],
  [96, 74, 0.5], [98, 72, 0.5], [100, 69, 1.5], [108, 72, 0.5], [110, 74, 0.5],
];
// 复盘：慢速、放宽的主题答句
const REPORT_THEME: Phrase = [
  [0, 72, 2], [8, 74, 1], [12, 76, 1], [16, 79, 3], [32, 76, 1], [36, 74, 1], [40, 72, 2], [48, 69, 4],
  [64, 72, 1.5], [70, 74, 0.5], [72, 76, 2], [80, 79, 2], [88, 76, 2], [96, 74, 2], [104, 72, 2], [112, 72, 4],
];

interface Layer { step: number[]; vel: number[] }
interface Spec {
  bpm: number; chords: Chord[]; roots: number[];
  padVel: number; padEvery?: number;
  melody?: { phrase: Phrase; instrument: MusicInstrument; transpose?: number; vel: number };
  bass?: { steps: number[]; dur: number; vel: number; octaveJump?: boolean };
  arp?: { steps: number[]; instrument: MusicInstrument; vel: number; up?: number };
  comp?: { steps: number[]; vel: number };
  kick?: Layer; hat?: Layer;
}

function build(s: Spec): MusicScore {
  const notes: MusicNote[] = [];
  const add = (step: number, midi: number, duration: number, velocity: number, instrument: MusicInstrument) =>
    notes.push({ step, midi, duration, velocity, instrument });
  s.chords.forEach((chord, bar) => {
    const at = bar * 16;
    const every = s.padEvery ?? 16;
    for (let k = 0; k < 16; k += every) chord.forEach(m => add(at + k, m, every / 4, s.padVel, 'pad'));
    if (s.bass) s.bass.steps.forEach((st, i) =>
      add(at + st, s.roots[bar] + (s.bass!.octaveJump && i % 2 ? 12 : 0), s.bass!.dur, s.bass!.vel, 'bass'));
    if (s.arp) s.arp.steps.forEach((st, i) => add(at + st, chord[i % chord.length] + (s.arp!.up ?? 12), 0.25, s.arp!.vel * (i % 4 === 0 ? 1 : 0.75), s.arp!.instrument));
    if (s.comp) s.comp.steps.forEach(st => chord.slice(1).forEach(m => add(at + st, m + 12, 0.4, s.comp!.vel, 'keys')));
    if (s.kick) s.kick.step.forEach((st, i) => add(at + st, 0, 0.25, s.kick!.vel[i % s.kick!.vel.length], 'kick'));
    if (s.hat) s.hat.step.forEach((st, i) => add(at + st, 0, 0.12, s.hat!.vel[i % s.hat!.vel.length], 'hat'));
  });
  if (s.melody) for (const [st, m, beats] of s.melody.phrase)
    add(st, m + (s.melody.transpose ?? 0), beats, s.melody.vel, s.melody.instrument);
  notes.sort((a, b) => a.step - b.step);
  return { bpm: s.bpm, steps: s.chords.length * 16, notes };
}

export const MUSIC_SCORES: Record<Exclude<MusicScene, 'silent'>, MusicScore> = {
  // 街区：夜市慢摇，lofi 底鼓 + 反拍镲，pluck 唱主题
  street: build({
    bpm: 90, chords: NIGHT, roots: NIGHT_ROOTS, padVel: 0.26,
    melody: { phrase: THEME, instrument: 'pluck', vel: 0.42 },
    bass: { steps: [0, 10], dur: 1.2, vel: 0.5 },
    kick: { step: [0, 7, 10], vel: [0.5, 0.3, 0.38] },
    hat: { step: [4, 12], vel: [0.16, 0.2] },
  }),
  // 筹备：安静思考，无鼓，电钢分解和弦
  prep: build({
    bpm: 82, chords: HOME, roots: HOME_ROOTS, padVel: 0.22,
    arp: { steps: [0, 3, 6, 8, 11, 14], instrument: 'keys', vel: 0.24, up: 12 },
    bass: { steps: [0], dur: 3.5, vel: 0.36 },
    hat: { step: [8], vel: [0.08] },
  }),
  // 营业：律动起来，四拍底鼓轻踩，主题交给电钢
  business: build({
    bpm: 104, chords: NIGHT, roots: NIGHT_ROOTS, padVel: 0.2, padEvery: 8,
    melody: { phrase: THEME, instrument: 'keys', vel: 0.36 },
    bass: { steps: [0, 6, 10, 14], dur: 0.45, vel: 0.46 },
    arp: { steps: [2, 6, 10, 14], instrument: 'pluck', vel: 0.16, up: 24 },
    kick: { step: [0, 4, 8, 12], vel: [0.48, 0.32, 0.42, 0.32] },
    hat: { step: [2, 6, 10, 14], vel: [0.2, 0.15] },
  }),
  // 高峰：同和声更快，十六分琶音 + 八度跳低音 + 密镲，主题截成动机
  rush: build({
    bpm: 114, chords: NIGHT, roots: NIGHT_ROOTS, padVel: 0.16, padEvery: 8,
    melody: { phrase: RUSH_MOTIF, instrument: 'keys', vel: 0.34 },
    bass: { steps: [0, 3, 6, 8, 11, 14], dur: 0.35, vel: 0.44, octaveJump: true },
    arp: { steps: [0, 2, 4, 6, 8, 10, 12, 14], instrument: 'pluck', vel: 0.15, up: 24 },
    kick: { step: [0, 4, 8, 10, 12], vel: [0.5, 0.34, 0.44, 0.26, 0.34] },
    hat: { step: [1, 3, 5, 7, 9, 11, 13, 15], vel: [0.12, 0.2, 0.12, 0.24] },
  }),
  // 复盘：放慢、解决到主和弦，电钢和声 + 温柔旋律
  report: build({
    bpm: 78, chords: RESOLVE, roots: RESOLVE_ROOTS, padVel: 0.24,
    melody: { phrase: REPORT_THEME, instrument: 'keys', vel: 0.34 },
    comp: { steps: [8], vel: 0.12 },
    bass: { steps: [0], dur: 3.6, vel: 0.36 },
  }),
};

export type TeaSoundCue = 'tea_order' | 'tea_pour' | 'tea_serve' | 'tea_skill' | 'tea_stock' | 'tea_pass' | 'tea_fail' | 'tea_upgrade';

// 音效克制：接单/倒茶/出杯都是短软音，避免每杯“叮”成噪声；技能/达标/升级才明亮
export const TEA_CUES: Record<TeaSoundCue, SoundNote[]> = {
  tea_order: [{ hz: 660, end: 740, length: 0.05, gain: 0.08, wave: 'sine' }],
  tea_pour: [{ hz: 220, end: 150, length: 0.16, gain: 0.07, wave: 'triangle' }, { hz: 880, end: 620, at: 0.03, length: 0.09, gain: 0.03, wave: 'sine' }],
  tea_serve: [{ hz: 784, length: 0.07, gain: 0.08, wave: 'triangle' }, { hz: 1046.5, at: 0.06, length: 0.1, gain: 0.07, wave: 'sine' }],
  tea_skill: [
    { hz: 1318.5, at: 0, length: 0.08, gain: 0.1, wave: 'triangle' },
    { hz: 1568, at: 0.06, length: 0.08, gain: 0.1, wave: 'triangle' },
    { hz: 2093, at: 0.12, length: 0.16, gain: 0.08, wave: 'sine' },
  ],
  tea_stock: [{ hz: 196, end: 147, length: 0.22, gain: 0.14, wave: 'square' }, { hz: 185, end: 139, at: 0.26, length: 0.22, gain: 0.1, wave: 'square' }],
  tea_pass: [
    { hz: 523.25, at: 0, length: 0.14, gain: 0.16, wave: 'triangle' },
    { hz: 659.25, at: 0.12, length: 0.14, gain: 0.16, wave: 'triangle' },
    { hz: 783.99, at: 0.24, length: 0.14, gain: 0.16, wave: 'triangle' },
    { hz: 1046.5, at: 0.36, length: 0.4, gain: 0.15, wave: 'sine' },
  ],
  tea_fail: [
    { hz: 392, at: 0, length: 0.18, gain: 0.13, wave: 'triangle' },
    { hz: 349.23, at: 0.18, length: 0.18, gain: 0.12, wave: 'triangle' },
    { hz: 293.66, at: 0.36, length: 0.36, gain: 0.11, wave: 'sine' },
  ],
  tea_upgrade: [
    { hz: 392, at: 0, length: 0.12, gain: 0.15, wave: 'triangle' },
    { hz: 523.25, at: 0.1, length: 0.12, gain: 0.15, wave: 'triangle' },
    { hz: 659.25, at: 0.2, length: 0.12, gain: 0.15, wave: 'triangle' },
    { hz: 783.99, at: 0.3, length: 0.12, gain: 0.15, wave: 'triangle' },
    { hz: 1046.5, at: 0.42, length: 0.4, gain: 0.16, wave: 'sine' },
    { hz: 1568, at: 0.5, length: 0.32, gain: 0.07, wave: 'sine' },
  ],
};
