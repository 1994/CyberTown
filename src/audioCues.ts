/** Original synthesized effects; no downloaded samples or music. */
import { TEA_CUES } from './musicScore.ts';
export interface SoundNote {
  hz: number;
  end?: number;
  at?: number;
  length: number;
  gain: number;
  wave?: OscillatorType;
}

const notes = (hz: number[], gap: number, length = 0.13, gain = 0.23): SoundNote[] =>
  hz.map((f, i) => ({ hz: f, at: i * gap, length, gain, wave: 'triangle' }));

export const SOUND_CUES = {
  ...TEA_CUES,
  ui: [{ hz: 780, end: 1100, length: 0.045, gain: 0.13 }],
  phone: notes([440, 880], 0.055, 0.12, 0.16),
  intro: notes([261.63, 392, 523.25, 783.99], 0.14, 0.24, 0.17),
  start: notes([523.25, 659.25, 1046.5], 0.09, 0.15),
  catch: [{ hz: 880, end: 1320, length: 0.105, gain: 0.25, wave: 'triangle' }],
  miss: [{ hz: 260, end: 130, length: 0.16, gain: 0.17, wave: 'triangle' }],
  shield: notes([1174.66, 1567.98], 0.045, 0.19, 0.2),
  countdown: [{ hz: 659.25, length: 0.065, gain: 0.12 }],
  coins: notes([1318.51, 1760, 2093], 0.065, 0.14, 0.19),
  hire: [...notes([392, 523.25, 659.25, 783.99], 0.075, 0.2), { hz: 196, length: 0.36, gain: 0.13 }],
  poach: notes([659.25, 493.88, 329.63], 0.08, 0.18, 0.18),
  reward: notes([523.25, 659.25, 783.99, 1046.5, 1318.51], 0.09, 0.24),
  promotion: [...notes([392, 523.25, 659.25, 783.99, 1046.5], 0.11, 0.28),
    { hz: 523.25, at: 0.55, length: 0.35, gain: 0.15 }],
  cheers: [{ hz: 2093, length: 0.22, gain: 0.17 }, { hz: 3136, at: 0.025, length: 0.16, gain: 0.07 }],
  equip: notes([587.33, 880], 0.065, 0.16, 0.18),
  step: [{ hz: 115, end: 65, length: 0.045, gain: 0.085, wave: 'triangle' }],
} satisfies Record<string, SoundNote[]>;

export type SoundCue = keyof typeof SOUND_CUES;
export const SOUND_LABELS: Record<SoundCue, string> = {
  tea_order: '接单', tea_pour: '制作', tea_serve: '交付', tea_skill: '技能', tea_stock: '缺货',
  tea_pass: '营业达标', tea_fail: '营业复盘', tea_upgrade: '门店升级',
  ui: '按钮', phone: '手机', intro: '入场', start: '开局', catch: '接住礼物', miss: '失误',
  shield: '护盾', countdown: '倒计时', coins: '金币', hire: '签约', poach: '被挖角',
  reward: '年终奖', promotion: '晋升', cheers: '碰杯', equip: '换装', step: '脚步',
};

export const cueNotes = (cue: SoundCue, combo = 0): SoundNote[] => {
  // A short pentatonic rise rewards combos without becoming piercing.
  if (!Number.isFinite(combo)) combo = 0;
  const semitones = [0, 2, 4, 7, 9][Math.min(4, Math.max(0, Math.floor((combo - 1) / 2)))];
  const pitch = cue === 'catch' ? 2 ** (semitones / 12) : 1;
  return SOUND_CUES[cue].map((note: SoundNote) => ({
    ...note, hz: note.hz * pitch, end: note.end ? note.end * pitch : undefined,
  }));
};
