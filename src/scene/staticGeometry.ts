import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export interface StaticPart {
  position: THREE.Vector3Tuple;
  rotation?: THREE.Vector3Tuple;
  scale?: THREE.Vector3Tuple;
}

/** Bake local transforms while preserving the original vertices, normals and UVs. */
export function mergeStaticParts(source: THREE.BufferGeometry, parts: StaticPart[]) {
  if (!parts.length) return null;
  const transform = new THREE.Object3D();
  const copies = parts.map((part) => {
    transform.position.set(...part.position);
    transform.rotation.set(...(part.rotation ?? [0, 0, 0]));
    transform.scale.set(...(part.scale ?? [1, 1, 1]));
    transform.updateMatrix();
    return source.clone().applyMatrix4(transform.matrix);
  });
  const merged = mergeGeometries(copies, false);
  copies.forEach((geometry) => geometry.dispose());
  return merged;
}
