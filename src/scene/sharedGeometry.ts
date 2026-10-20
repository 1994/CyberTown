import * as THREE from 'three';

const constructors = {
  box: THREE.BoxGeometry,
  sphere: THREE.SphereGeometry,
  cylinder: THREE.CylinderGeometry,
  capsule: THREE.CapsuleGeometry,
  cone: THREE.ConeGeometry,
  torus: THREE.TorusGeometry,
  circle: THREE.CircleGeometry,
  icosahedron: THREE.IcosahedronGeometry,
};

export type GeometryKind = keyof typeof constructors;
export type GeometryArgs = { [K in GeometryKind]: ConstructorParameters<typeof constructors[K]> };
const cache = new Map<string, THREE.BufferGeometry>();

/** Character shape parameters are a finite set of code constants, independent
 * of player count/identity/position. Share their immutable GPU buffers. */
export function sharedGeometry<K extends GeometryKind>(kind: K, args: GeometryArgs[K]) {
  const key = `${kind}:${JSON.stringify(args)}`;
  let geometry = cache.get(key);
  if (!geometry) {
    geometry = Reflect.construct(constructors[kind], args) as THREE.BufferGeometry;
    cache.set(key, geometry);
  }
  return geometry;
}
