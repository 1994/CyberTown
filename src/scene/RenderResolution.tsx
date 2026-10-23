import { useEffect, useState } from 'react';
import { scenePixelRatio } from '../renderBudget.ts';

/** Cap full-screen render targets without fighting Canvas's DPR configuration. */
export function useScenePixelRatio(target: number) {
  const [viewport, setViewport] = useState(() => [window.innerWidth, window.innerHeight]);
  useEffect(() => {
    const resize = () => setViewport([window.innerWidth, window.innerHeight]);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  return scenePixelRatio(viewport[0], viewport[1], target);
}
