import { useEffect, useState, useSyncExternalStore } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { sound } from '../audio.ts';
import { SOUND_LABELS, type SoundCue } from '../audioCues.ts';

export function SoundToggle({ className }: { className?: string }) {
  const state = useSyncExternalStore(sound.subscribe, sound.getSnapshot);
  const toggle = async () => {
    sound.setEnabled(!state.enabled);
    if (!state.enabled) { await sound.activate(); sound.play('ui'); }
  };
  return <button type="button" className={className} onClick={() => void toggle()}
    data-testid="btn-sound" data-sound="none" aria-pressed={state.enabled}
    aria-label={`音效：${state.enabled ? '开' : '关'}`} title="开启或关闭游戏音效">
    {state.enabled ? <Volume2 size={17} /> : <VolumeX size={17} />}
    <span>音效：{state.enabled ? '开' : '关'}</span>
  </button>;
}

export function SoundSettings() {
  const state = useSyncExternalStore(sound.subscribe, sound.getSnapshot);
  return <section className="sound-settings" aria-label="游戏音效">
    <SoundToggle />
    <label className="sound-volume">
      <span>音量 <output>{Math.round(state.volume * 100)}%</output></span>
      <input type="range" min="0" max="100" value={Math.round(state.volume * 100)}
        disabled={!state.enabled} aria-label="音效音量" data-testid="sound-volume" data-sound="none"
        onChange={(event) => { sound.setVolume(Number(event.target.value) / 100); void sound.activate(); }}
        onPointerUp={() => sound.play('ui')} onKeyUp={() => sound.play('ui')} />
    </label>
    {state.status === 'unsupported' && <small>此浏览器暂不支持音效</small>}
  </section>;
}

/** Opt-in audio QA panel, like ?perf=1; never displayed during ordinary play. */
export function SoundDiagnostics() {
  const state = useSyncExternalStore(sound.subscribe, sound.getSnapshot);
  const [, refresh] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => { sound.measurePeak(); refresh(n => n + 1); }, 100);
    return () => clearInterval(id);
  }, []);
  return <aside className="sound-debug" aria-label="音效调试" data-sound="none">
    <b>音效调试</b>
    <SoundToggle />
    <output data-testid="sound-diagnostics" data-state={state.status} data-played={sound.metrics.played}
      data-last-cue={sound.metrics.lastCue} data-voices={sound.activeVoices} data-peak={sound.metrics.peakSignal.toFixed(5)}
      data-cues={JSON.stringify(sound.metrics.counts)}>
      {state.status} · {sound.metrics.played} 次 · {sound.activeVoices} 音符
    </output>
    <div>{(Object.keys(SOUND_LABELS) as SoundCue[]).map(cue =>
      <button key={cue} onClick={() => sound.play(cue, { combo: 5 })} data-testid={`sound-test-${cue}`}>{SOUND_LABELS[cue]}</button>)}</div>
  </aside>;
}
