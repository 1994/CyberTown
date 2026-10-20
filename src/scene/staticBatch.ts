import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Explicitly static islands only. Keep separate spatial/shadow/material buckets
 * so batching never turns the whole campus into one uncullable mesh. */
export function batchStaticMeshes(root: THREE.Group, cellSize = 8, worldStatic = false) {
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert();
  const matrix = new THREE.Matrix4();
  const center = new THREE.Vector3();
  const buckets = new Map<string, { mesh: THREE.Mesh; matrix: THREE.Matrix4 }[]>();
  const transforms: { object: THREE.Object3D; auto: boolean; worldAuto: boolean }[] = [];
  root.traverseVisible(object => {
    if (object === root) return;
    transforms.push({ object, auto: object.matrixAutoUpdate, worldAuto: object.matrixWorldAutoUpdate });
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh || (mesh as THREE.InstancedMesh).isInstancedMesh ||
      Array.isArray(mesh.material) || mesh.material.transparent || mesh.morphTargetInfluences?.length ||
      mesh.geometry.drawRange.start !== 0 || mesh.geometry.drawRange.count !== Infinity) return;
    matrix.multiplyMatrices(inverse, mesh.matrixWorld);
    // A reflected Mesh flips its culling side in Three; baking it without also
    // reversing its indices would change visibility. Leave those meshes alone.
    if (matrix.determinant() <= 0) return;
    const source = mesh.geometry;
    source.computeBoundingSphere();
    center.copy(source.boundingSphere!.center).applyMatrix4(matrix);
    const attributes = Object.keys(source.attributes).sort().map(name => {
      const a = source.getAttribute(name);
      return `${name}:${a.itemSize}:${a.normalized}:${a.array.constructor.name}`;
    }).join(',');
    const key = `${Math.floor(center.x / cellSize + 0.5)},${Math.floor(center.z / cellSize + 0.5)}|${mesh.material.uuid}|${mesh.castShadow}|${mesh.receiveShadow}|${mesh.layers.mask}|${mesh.renderOrder}|${!!source.index}|${attributes}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push({ mesh, matrix: matrix.clone() });
    buckets.set(key, bucket);
  });
  const group = new THREE.Group();
  group.name = 'static-spatial-batches';
  const originals: THREE.Mesh[] = [];
  let batchCount = 0;
  for (const parts of buckets.values()) {
    if (parts.length < 2) continue;
    const copies = parts.map(p => p.mesh.geometry.clone().applyMatrix4(p.matrix));
    const merged = mergeGeometries(copies, false);
    copies.forEach(g => g.dispose());
    if (!merged) continue;
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    const source = parts[0].mesh;
    const mesh = new THREE.Mesh(merged, source.material);
    mesh.castShadow = source.castShadow;
    mesh.receiveShadow = source.receiveShadow;
    mesh.layers.mask = source.layers.mask;
    mesh.renderOrder = source.renderOrder;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
    batchCount++;
    for (const p of parts) {
      originals.push(p.mesh);
      p.mesh.visible = false;
    }
  }
  // Local matrices of static props need not be recomposed on every frame.
  transforms.forEach(({ object }) => {
    object.matrixAutoUpdate = false;
    if (worldStatic) object.matrixWorldAutoUpdate = false;
  });
  root.add(group);
  group.updateWorldMatrix(true, true);
  if (worldStatic) group.traverse(object => {
    object.matrixAutoUpdate = false;
    object.matrixWorldAutoUpdate = false;
  });
  let disposed = false;
  return {
    sources: originals.length,
    batches: batchCount,
    dispose() {
      if (disposed) return;
      disposed = true;
      root.remove(group);
      group.children.forEach(mesh => (mesh as THREE.Mesh).geometry.dispose());
      originals.forEach(mesh => { mesh.visible = true; });
      transforms.forEach(({ object, auto, worldAuto }) => {
        object.matrixAutoUpdate = auto;
        object.matrixWorldAutoUpdate = worldAuto;
      });
    },
  };
}
