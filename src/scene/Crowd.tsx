import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { useGame } from '../store.ts';
import { dressed } from '../look.ts';
import { rt } from '../world/runtime.ts';
import { goToPlayer } from '../world/navigation.ts';

const dummy = new THREE.Object3D();

/** Real nearby players at medium/far range. Four instanced draws, no portraits,
 * shadows, aura, DOM labels or per-person skeletons. Selecting promotes to full. */
export function Crowd({ ids }: { ids: string[] }) {
  const snapshot = useGame(s => s.snapshot);
  const heads = useRef<THREE.InstancedMesh>(null);
  const hair = useRef<THREE.InstancedMesh>(null);
  const bodies = useRef<THREE.InstancedMesh>(null);
  const pants = useRef<THREE.InstancedMesh>(null);
  const headGeo = useMemo(() => new THREE.SphereGeometry(.33, 10, 8), []);
  const hairGeo = useMemo(() => new THREE.SphereGeometry(.345, 10, 6, 0, Math.PI * 2, 0, Math.PI / 1.95), []);
  const bodyGeo = useMemo(() => new THREE.CapsuleGeometry(.2, .4, 2, 6), []);
  const pantsGeo = useMemo(() => new THREE.CylinderGeometry(.18, .16, .55, 6), []);
  const looks = useMemo(() => {
    const players = new Map(snapshot?.players.map(p => [p.id, p]));
    const clones = new Map(snapshot?.colleagues.filter(c => c.selfPlayerId).map(c => [c.selfPlayerId!, c]));
    return ids.map(id => {
      const player = players.get(id), clone = clones.get(id);
      return clone ? dressed(clone.look, player?.style) : null;
    });
  }, [ids, snapshot]);
  const color = useMemo(() => new THREE.Color(), []);

  useFrame(({ clock }, dtRaw) => {
    const dt = Math.min(dtRaw, .05);
    const meshes = [heads.current, hair.current, bodies.current, pants.current];
    if (meshes.some(m => !m)) return;
    ids.forEach((id, i) => {
      const r = rt.remote.get(id), look = looks[i];
      if (!r || !look) {
        dummy.scale.setScalar(0); dummy.updateMatrix();
        meshes.forEach(m => m!.setMatrixAt(i, dummy.matrix));
        return;
      }
      // Interpolate the same network target; no rig or trail budget in far LOD.
      r.x = THREE.MathUtils.damp(r.x, r.tx, 6, dt);
      r.z = THREE.MathUtils.damp(r.z, r.tz, 6, dt);
      r.moving = r.tmoving && performance.now() - r.seenAt < 1200;
      const bob = r.moving ? Math.sin(clock.elapsedTime * 10 + i) * .035 : 0;
      const heights = [1.52, 1.54, .95, .42];
      meshes.forEach((mesh, part) => {
        dummy.position.set(r.x, heights[part] * 1.25 + bob, r.z);
        dummy.rotation.set(0, r.tyaw, 0);
        dummy.scale.setScalar(1.25); dummy.updateMatrix();
        mesh!.setMatrixAt(i, dummy.matrix);
        color.set([look.skin, look.hair, look.shirt, look.pants][part]);
        mesh!.setColorAt(i, color);
      });
    });
    meshes.forEach(m => { m!.count = ids.length; m!.instanceMatrix.needsUpdate = true; if (m!.instanceColor) m!.instanceColor.needsUpdate = true; });
  });
  const select = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 6 || e.instanceId === undefined) return;
    const id = ids[e.instanceId];
    if (id) void goToPlayer(id).catch(() => useGame.getState().toast({ tone: 'info', title: '对方暂时离开了' }));
  };
  // fixed allocations avoid GPU buffer recreation as people enter/leave cells
  return <group onClick={select}>
    <instancedMesh ref={heads} args={[headGeo, undefined, 48]} frustumCulled={false} count={0}><meshStandardMaterial roughness={.85} /></instancedMesh>
    <instancedMesh ref={hair} args={[hairGeo, undefined, 48]} frustumCulled={false} count={0}><meshStandardMaterial roughness={.85} /></instancedMesh>
    <instancedMesh ref={bodies} args={[bodyGeo, undefined, 48]} frustumCulled={false} count={0}><meshStandardMaterial roughness={.85} /></instancedMesh>
    <instancedMesh ref={pants} args={[pantsGeo, undefined, 48]} frustumCulled={false} count={0}><meshStandardMaterial roughness={.85} /></instancedMesh>
  </group>;
}
