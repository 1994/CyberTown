import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Music2, Volume2, VolumeX } from 'lucide-react';
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
    <label className="sound-volume">
      <span><Music2 size={12} /> 音乐 <output>{Math.round(state.musicVolume * 100)}%</output></span>
      <input type="range" min="0" max="100" value={Math.round(state.musicVolume * 100)}
        disabled={!state.enabled} aria-label="音乐音量" data-testid="music-volume" data-sound="none"
        onChange={(event) => { sound.setMusicVolume(Number(event.target.value) / 100); void sound.activate(); }} />
    </label>
    {state.status === 'unsupported' && <small>此浏览器暂不支持音效</small>}
  </section>;
}

/** 紧凑声音菜单：一个图标按钮，点开才显示开关与音效/音乐音量（游戏内使用）。 */
export function SoundMenu({ className }: { className?: string }) {
  const state = useSyncExternalStore(sound.subscribe, sound.getSnapshot);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  // 点菜单外任何位置（如历史/通知抽屉）即收起，避免弹层与抽屉互相遮挡造成“假可点”
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', close, true);
    return () => document.removeEventListener('pointerdown', close, true);
  }, [open]);
  return <div ref={root} className={`sound-menu ${className ?? ''}`}>
    <button type="button" className="sound-menu-btn" aria-expanded={open} aria-label="声音设置" title="声音设置" data-sound="none"
      onClick={() => { setOpen(!open); void sound.activate(); }}>
      {state.enabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
    </button>
    {open && <div className="sound-menu-pop" role="dialog" aria-label="声音设置"><SoundSettings /></div>}
  </div>;
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
      data-cues={JSON.stringify(sound.metrics.counts)} data-music-scene={state.musicScene} data-music-volume={state.musicVolume.toFixed(2)}
      data-music-notes={sound.musicStats.scheduledNotes} data-music-voices={sound.musicStats.activeVoices}
      data-music-playing={String(sound.musicStats.playing)}>
      {state.status} · {sound.metrics.played} 次 · {sound.activeVoices} 音符
    </output>
    <div>{(Object.keys(SOUND_LABELS) as SoundCue[]).map(cue =>
      <button key={cue} onClick={() => sound.play(cue, { combo: 5 })} data-testid={`sound-test-${cue}`}>{SOUND_LABELS[cue]}</button>)}</div>
  </aside>;
}
