import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { ThreeElements } from '@react-three/fiber';
import * as THREE from 'three';

import { LOCAL_LIGHT_CAPACITY, stableLightSlots } from './lightBudget.ts';

const sources = new Set<THREE.PointLight>();

/** Keep animated light refs, but render only a bounded pool near the camera target. */
export const LocalPointLight = forwardRef<THREE.PointLight, ThreeElements['pointLight']>(
  function LocalPointLight(props, forwarded) {
    const light = useRef<THREE.PointLight>(null!);
    useImperativeHandle(forwarded, () => light.current, []);
    useEffect(() => {
      const source = light.current;
      sources.add(source);
      return () => { sources.delete(source); };
    }, []);
    return <pointLight {...props} ref={light} visible={false} castShadow={false} />;
  },
);

export function LocalLightPool() {
  const group = useRef<THREE.Group>(null!);
  const selected = useRef<(THREE.PointLight | undefined)[]>([]);
  const nextPick = useRef(0);
  const vectors = useMemo(() => ({ focus: new THREE.Vector3(), direction: new THREE.Vector3(), position: new THREE.Vector3() }), []);
  useFrame(({ camera, clock }) => {
    const { focus, direction, position } = vectors;
    if (clock.elapsedTime >= nextPick.current) {
      nextPick.current = clock.elapsedTime + 0.15;
      camera.getWorldDirection(direction);
      const distance = direction.y < -0.05 ? (1 - camera.position.y) / direction.y : 18;
      focus.copy(camera.position).addScaledVector(direction, Math.max(0, distance));
      const ranked: { light: THREE.PointLight; score: number }[] = [];
      for (const light of sources) {
        let visible = light.intensity > 0;
        for (let parent = light.parent; parent && visible; parent = parent.parent) visible = parent.visible;
        if (!visible) continue;
        light.getWorldPosition(position);
        const distanceSq = position.distanceToSquared(focus);
        ranked.push({ light, score: light.intensity * Math.max(1, light.distance) / (4 + distanceSq) });
      }
      ranked.sort((a, b) => b.score - a.score);
      selected.current = stableLightSlots(selected.current, ranked.map((r) => r.light));
    }
    group.current.children.forEach((child, i) => {
      const target = child as THREE.PointLight;
      const source = selected.current[i];
      if (!source || !sources.has(source)) { target.intensity = 0; return; }
      source.getWorldPosition(target.position);
      target.color.copy(source.color);
      target.intensity = source.intensity;
      target.distance = source.distance;
      target.decay = source.decay;
    });
  });
  return <group ref={group}>{Array.from({ length: LOCAL_LIGHT_CAPACITY }, (_, i) => <pointLight key={i} intensity={0} />)}</group>;
}
