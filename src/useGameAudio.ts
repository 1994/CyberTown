import { useEffect } from 'react';
import { sound } from './audio.ts';
import { useGame } from './store.ts';
import { rt } from './world/runtime.ts';
import { movementLocked } from './world/input.ts';
import { useCinema } from './scene/cinema.ts';

/** Gesture activation lives outside React clicks so it also covers keyboard and touch. */
export function useGameAudio() {
  useEffect(() => {
    const gesture = (event: Event) => {
      if (event.isTrusted && !(event instanceof KeyboardEvent && event.repeat)) void sound.activate();
    };
    const click = (event: MouseEvent) => {
      if (!event.isTrusted || !(event.target instanceof Element)) return;
      const button = event.target.closest('button');
      if (button && !button.disabled && button.getAttribute('aria-disabled') !== 'true'
        && !button.closest('[data-sound="none"]')) sound.play('ui');
    };
    const visibility = () => { if (document.hidden) sound.pause(); };
    const pagehide = () => sound.pause();
    document.addEventListener('pointerdown', gesture, true);
    document.addEventListener('keydown', gesture, true);
    document.addEventListener('click', click, true);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', pagehide);
    const unsubscribe = useGame.subscribe((s, p) => {
      if (s.phase === 'game' && (p.phase !== 'game' || s.introNonce !== p.introNonce)) sound.play('intro');
      if (s.phoneOpen && !p.phoneOpen) sound.play('phone');
      if (s.celebration && s.celebration.key !== p.celebration?.key) {
        sound.play(s.celebration.key.startsWith('promotion:') ? 'promotion' : 'reward', { key: `celebration:${s.celebration.key}` });
      }
      if (s.phase !== 'game' && p.phase === 'game') sound.stopAll();
    });
    // Audio-only cadence; no subscriptions to movement and no render-loop work.
    const steps = window.setInterval(() => {
      const game = useGame.getState();
      if (game.phase === 'game' && rt.me.moving && !movementLocked() && !useCinema.getState().shot)
        sound.play('step');
    }, 160);
    return () => {
      unsubscribe();
      clearInterval(steps);
      document.removeEventListener('pointerdown', gesture, true);
      document.removeEventListener('keydown', gesture, true);
      document.removeEventListener('click', click, true);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', pagehide);
      sound.pause();
    };
  }, []);
}
