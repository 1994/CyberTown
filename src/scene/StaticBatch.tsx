import { useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { Group } from 'three';
import { useThree } from '@react-three/fiber';
import { batchStaticMeshes } from './staticBatch.ts';

const enabled = new URLSearchParams(location.search).get('batching') !== '0';

/** Children must have static transforms. Animated props stay outside this island;
 * material animation and independent light sources can remain inside. */
export function StaticBatch({ children, worldStatic = false }: { children: ReactNode; worldStatic?: boolean }) {
  const root = useRef<Group>(null!);
  // Narrow views need smaller culling islands to avoid drawing off-screen props.
  const cellSize = useThree(s => worldStatic && s.size.width / s.size.height < 0.9 ? 4 : 8);
  useLayoutEffect(() => {
    if (!enabled) return;
    const batch = batchStaticMeshes(root.current, cellSize, worldStatic);
    return () => batch.dispose();
  }, [children, worldStatic, cellSize]);
  return <group ref={root}>{children}</group>;
}
