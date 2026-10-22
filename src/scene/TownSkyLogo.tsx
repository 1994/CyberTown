import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { WorldLabel } from './WorldLabel';
import * as THREE from 'three';
import { useGame } from '../store';
import { GameLogo } from '../ui/GameLogo';

/** Project the title from a world anchor above the plaza; never intercept input. */
export function TownSkyLogo() {
  const label = useRef<HTMLDivElement>(null);
  const opacity = useRef(0);
  useFrame(({ camera }, dt) => {
    if (!label.current) return;
    const game = useGame.getState();
    const target = game.phase === 'game' && !game.introPlaying
      ? THREE.MathUtils.smoothstep(camera.position.y, 35, 72) : 0;
    opacity.current = THREE.MathUtils.damp(opacity.current, target, 5, Math.min(dt, .1));
    label.current.style.opacity = String(opacity.current);
    label.current.style.visibility = opacity.current > .01 ? 'visible' : 'hidden';
  });
  return <WorldLabel position={[0, 24, 0]} center zIndexRange={[4, 0]} style={{ pointerEvents: 'none' }}>
    <div ref={label} data-testid="town-sky-logo" style={{ width: 'clamp(180px, 26vw, 330px)', opacity: 0, visibility: 'hidden', pointerEvents: 'none' }}>
      <GameLogo />
    </div>
  </WorldLabel>;
}
