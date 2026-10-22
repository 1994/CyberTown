import { useEffect, useRef, useState } from 'react';
import { useCinema } from '../scene/cinema.ts';
import { useGame } from '../store.ts';

const CHAPTERS = ['城市之上', '霓虹小镇', '街角奶茶', '自由探索，开始'];

export function CinematicOverlay() {
  const playing = useGame((s) => s.introPlaying);
  const nonce = useGame((s) => s.introNonce);
  const shot = useCinema((s) => s.shot);
  const startedAt = useCinema((s) => s.introStartedAt);
  const duration = useCinema((s) => s.introDuration);
  const [progress, setProgress] = useState(0);
  const skip = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!playing || !startedAt) return;
    const before = document.activeElement as HTMLElement | null;
    skip.current?.focus({ preventScroll: true });
    setProgress(0);
    const id = setInterval(() => setProgress(Math.min(1, (performance.now() - startedAt) / duration)), 100);
    return () => {
      clearInterval(id);
      if (before?.isConnected) before.focus({ preventScroll: true });
    };
  }, [playing, nonce, startedAt, duration]);
  if (!playing && !shot) return null;
  const chapter = Math.min(3, Math.floor(progress * 4));
  return <div
    className={`cinema-overlay ${playing ? 'intro-film' : 'event-film'}`}
    key={playing ? `intro-${nonce}` : `shot-${shot!.id}`}
    data-testid={playing ? 'intro-overlay' : 'event-cinematic'}
    data-scene={playing ? chapter : shot?.kind}
    aria-label={playing ? '入场电影' : shot?.title}
  >
    <div className="cinema-bar top" />
    <div className="cinema-bar bottom" />
    {!playing && shot?.kind !== 'arrival' && <div className="cinema-wipe" aria-hidden="true" />}
    {playing ? <>
      <div className="cinema-title" style={{ animationPlayState: startedAt ? 'running' : 'paused' }}>
        <small>CYBER TOWN</small>
        <h1>赛博<span>小镇</span></h1>

      </div>
      <div className="cinema-chapter"><i>0{chapter + 1} / 04</i><span>{CHAPTERS[chapter]}</span></div>
      <div className="cinema-progress"><i style={{ width: `${progress * 100}%` }} /></div>
    </> : <div className="cinema-event-title" role="status">
      <small>{shot?.kind === 'poach' ? 'A NEW CHAPTER' : 'WELCOME TO THE TEAM'}</small>
      <h2>{shot?.title}</h2>
      <p>{shot?.subtitle}</p>
    </div>}
    <button
      ref={skip}
      className="cinema-skip"
      onClick={() => playing
        ? window.dispatchEvent(new CustomEvent('world-skip-intro'))
        : useCinema.getState().clear()}
      data-testid={playing ? 'btn-skip-intro' : 'btn-skip-shot'}
    >{playing ? '跳过片头' : '继续探索'} <kbd>Esc</kbd></button>
  </div>;
}
