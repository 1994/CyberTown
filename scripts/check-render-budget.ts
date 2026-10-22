import { townFogRange } from '../src/scene/cameraAtmosphere.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shallow } from 'zustand/shallow';
import { socialEntry } from '../src/world/selectors.ts';
import { LOCAL_LIGHT_CAPACITY, stableLightSlots } from '../src/scene/lightBudget.ts';
import type { WorldPlayer } from '../shared/types.ts';
import { nextRenderBudget } from '../src/renderBudget.ts';
import { Box3, BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { mergeStaticParts } from '../src/scene/staticGeometry.ts';
import { batchStaticMeshes } from '../src/scene/staticBatch.ts';
import { movementPacketDue } from '../src/world/netBudget.ts';

const player: WorldPlayer = {
  id: 'wang', x: 0, z: 0, yaw: 0, moving: false, updatedAt: 1,
  said: '一起摸鱼', saidUntil: 100, emote: 'wave', emoteUntil: 80,
};

test('position broadcasts do not invalidate character social subscribers', () => {
  const before = socialEntry([player], 'wang');
  for (let i = 1; i <= 100; i++) {
    const after = socialEntry([{ ...player, x: i, z: -i, yaw: i, moving: true, updatedAt: i }], 'wang');
    assert.ok(shallow(before, after));
  }
});

test('chat, emotes, renewed expiry and disconnect still invalidate subscribers', () => {
  const before = socialEntry([player], 'wang');
  for (const change of [{ said: '来碰杯' }, { saidUntil: 120 }, { emote: 'dance' }, { emoteUntil: 90 }]) {
    assert.ok(!shallow(before, socialEntry([{ ...player, ...change }], 'wang')));
  }
  assert.ok(!shallow(before, socialEntry([], 'wang')));
});

test('GPU light count stays bounded with a large campus', () => {
  const ranked = Array.from({ length: 100 }, (_, id) => ({ id }));
  const slots = stableLightSlots([], ranked);
  assert.equal(slots.length, LOCAL_LIGHT_CAPACITY);
  assert.deepEqual(slots, ranked.slice(0, LOCAL_LIGHT_CAPACITY));
});

test('ranking changes preserve GPU slots while moving through the campus', () => {
  const slots = stableLightSlots([], ['a', 'b', 'c', 'd', 'e', 'f']);
  assert.deepEqual(stableLightSlots(slots, ['f', 'e', 'd', 'c', 'b', 'a']), slots);
  assert.deepEqual(stableLightSlots(slots, ['g', 'a', 'b', 'c', 'd', 'e']), ['a', 'b', 'c', 'd', 'e', 'g']);
});

test('unmounted or invisible sources release slots; empty scenes leave no stale light', () => {
  const old = stableLightSlots([], ['a', 'b', 'c']);
  assert.deepEqual(stableLightSlots(old, ['c']), [undefined, undefined, 'c', undefined, undefined, undefined]);
  assert.deepEqual(stableLightSlots(old, []), Array(LOCAL_LIGHT_CAPACITY).fill(undefined));
  assert.deepEqual(stableLightSlots(stableLightSlots(old, []), ['d']), ['d', undefined, undefined, undefined, undefined, undefined]);
});

test('one slow window cannot degrade quality; sustained slow frames lower it one step', () => {
  const first = nextRenderBudget(0, { slow: 0, fast: 0 }, 34);
  assert.equal(first.tier, 0);
  assert.equal(nextRenderBudget(first.tier, first.trend, 34).tier, 1);
  assert.equal(nextRenderBudget(2, { slow: 1, fast: 0 }, 50).tier, 2);
});

test('recovery requires six healthy windows, with no rapid oscillation', () => {
  let result = { tier: 2, trend: { slow: 0, fast: 0 } };
  for (let i = 0; i < 5; i++) result = nextRenderBudget(result.tier, result.trend, 16.7);
  assert.equal(result.tier, 2);
  assert.equal(nextRenderBudget(result.tier, result.trend, 16.7).tier, 1);
  assert.equal(nextRenderBudget(0, { slow: 0, fast: 5 }, 16.7).tier, 0);
  assert.deepEqual(nextRenderBudget(1, { slow: 1, fast: 0 }, 19.5), { tier: 1, trend: { slow: 0, fast: 0 } });
  assert.deepEqual(nextRenderBudget(1, { slow: 1, fast: 5 }, NaN), { tier: 1, trend: { slow: 0, fast: 0 } });
});

test('sustained missed 60fps budget and tail stalls lower quality, isolated stalls do not', () => {
  assert.equal(nextRenderBudget(0, { slow: 1, fast: 0 }, 23, 27).tier, 1);
  assert.equal(nextRenderBudget(0, { slow: 0, fast: 0 }, 16.7, 45).tier, 0);
  assert.equal(nextRenderBudget(0, { slow: 1, fast: 0 }, 16.7, 45).tier, 1);
  assert.deepEqual(nextRenderBudget(1, { slow: 0, fast: 5 }, 16.7, 28).trend, { slow: 0, fast: 0 });
});

test('static prop batching preserves triangle count and rotated, nonuniformly scaled bounds', () => {
  const source = new BoxGeometry(1, 1, 1);
  const merged = mergeStaticParts(source, [
    { position: [4, 0, 0], rotation: [0, Math.PI / 2, 0], scale: [2, 1, 0.5] },
    { position: [-2, 1, 0], scale: [1, 2, 1] },
  ])!;
  merged.computeBoundingBox();
  const bounds = [...merged.boundingBox!.min.toArray(), ...merged.boundingBox!.max.toArray()];
  const expected = [-2.5, -0.5, -1, 4.25, 2, 1];
  bounds.forEach((n, i) => assert.ok(Math.abs(n - expected[i]) < 1e-6));
  assert.equal(merged.index!.count, source.index!.count * 2);
  const normals = merged.getAttribute('normal');
  for (let i = 0; i < normals.count; i++) {
    assert.ok(Math.abs(Math.hypot(normals.getX(i), normals.getY(i), normals.getZ(i)) - 1) < 1e-6);
  }
  assert.equal(mergeStaticParts(source, []), null);
  source.dispose(); merged.dispose();
});

test('spatial batching preserves transformed geometry, shadows and shared material ownership', () => {
  const root = new Group();
  root.position.set(5, 0, -9);
  root.rotation.y = 0.4;
  const parent = new Group();
  parent.rotation.y = 0.5;
  root.add(parent);
  const material = new MeshStandardMaterial();
  let materialDisposed = false;
  material.addEventListener('dispose', () => { materialDisposed = true; });
  const source = new BoxGeometry();
  const meshes = [0, 1, 2].map(x => {
    const mesh = new Mesh(source, material);
    mesh.position.set(x + 1, 0, 2);
    mesh.scale.set(1, 2, 0.5);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  });
  root.updateWorldMatrix(true, true);
  const before = new Box3().setFromObject(root, true);
  const batch = batchStaticMeshes(root);
  assert.equal(batch.sources, 3);
  assert.equal(batch.batches, 1);
  const group = root.getObjectByName('static-spatial-batches')!;
  const merged = group.children[0] as Mesh;
  assert.equal(merged.geometry.index!.count, source.index!.count * 3);
  assert.ok(merged.castShadow && merged.receiveShadow);
  assert.equal(merged.material, material);
  const after = new Box3().setFromObject(group, true);
  assert.ok(before.min.distanceTo(after.min) < 1e-6);
  assert.ok(before.max.distanceTo(after.max) < 1e-6);
  assert.ok(meshes.every(m => !m.visible && !m.matrixAutoUpdate));
  assert.ok(merged.geometry.boundingSphere!.containsPoint(new Vector3(2, 0, 2)));
  batch.dispose(); batch.dispose();
  assert.ok(meshes.every(m => m.visible && m.matrixAutoUpdate));
  assert.equal(root.children.length, 1);
  assert.ok(!materialDisposed);
  source.dispose(); material.dispose();
});

test('batch buckets retain spatial culling and separate shadow/layer/render-order state', () => {
  const root = new Group();
  const source = new BoxGeometry();
  const material = new MeshStandardMaterial();
  for (const x of [1, 2, 17, 18]) {
    const mesh = new Mesh(source, material);
    mesh.position.x = x;
    root.add(mesh);
  }
  const shadow = new Mesh(source, material); shadow.castShadow = true;
  const layer = new Mesh(source, material); layer.layers.set(2);
  const order = new Mesh(source, material); order.renderOrder = 5;
  root.add(shadow, layer, order);
  const batch = batchStaticMeshes(root);
  assert.equal(batch.sources, 4);
  assert.equal(batch.batches, 2);
  assert.ok(shadow.visible && layer.visible && order.visible);
  const group = root.getObjectByName('static-spatial-batches')!;
  for (const child of group.children) assert.ok((child as Mesh).geometry.boundingSphere!.radius < 2);
  batch.dispose(); source.dispose(); material.dispose();
});

test('transparent, hidden and reflected meshes retain their individual rendering semantics', () => {
  const root = new Group();
  const geometry = new BoxGeometry();
  const opaque = new MeshStandardMaterial();
  const transparent = new MeshStandardMaterial({ transparent: true, opacity: 0.4 });
  const glass = [new Mesh(geometry, transparent), new Mesh(geometry, transparent)];
  const mirrored = [new Mesh(geometry, opaque), new Mesh(geometry, opaque)];
  mirrored.forEach(mesh => { mesh.scale.x = -1; });
  const hidden = new Group(); hidden.visible = false;
  hidden.add(new Mesh(geometry, opaque), new Mesh(geometry, opaque));
  root.add(...glass, ...mirrored, hidden);
  const batch = batchStaticMeshes(root);
  assert.equal(batch.sources, 0);
  assert.ok(glass.every(mesh => mesh.visible));
  assert.ok(mirrored.every(mesh => mesh.visible));
  batch.dispose();
  assert.ok(!hidden.visible);
  geometry.dispose(); opaque.dispose(); transparent.dispose();
});

test('network budget keeps prompt movement, limits idle traffic and silences hidden pages after stop', () => {
  const idle = { x: 0, z: 0, moving: false };
  const moving = { ...idle, moving: true };
  assert.ok(movementPacketDue(100, 0, moving, idle, false));
  assert.ok(movementPacketDue(100, 0, idle, moving, false));
  assert.ok(!movementPacketDue(199, 0, moving, moving, false));
  assert.ok(movementPacketDue(200, 0, moving, moving, false));
  assert.ok(!movementPacketDue(4999, 0, idle, idle, false));
  assert.ok(movementPacketDue(5000, 0, idle, idle, false));
  assert.ok(movementPacketDue(100, 0, moving, moving, true));
  assert.ok(!movementPacketDue(60000, 0, moving, idle, true));
  assert.ok(movementPacketDue(100, 0, idle, { ...idle, x: NaN }, false));
});

test('world islands freeze world matrices, while character islands still follow animated parents', () => {
  const geometry = new BoxGeometry();
  const material = new MeshStandardMaterial();
  for (const worldStatic of [false, true]) {
    const root = new Group();
    for (const x of [1, 2]) { const mesh = new Mesh(geometry, material); mesh.position.x = x; root.add(mesh); }
    const sources = [...root.children];
    const batch = batchStaticMeshes(root, 8, worldStatic);
    assert.ok(sources.every(mesh => mesh.matrixWorldAutoUpdate === !worldStatic));
    if (!worldStatic) {
      root.position.x = 10;
      root.updateMatrixWorld(true);
      const bounds = new Box3().setFromObject(root.getObjectByName('static-spatial-batches')!, true);
      assert.equal(bounds.min.x, 10.5);
      assert.equal(bounds.max.x, 12.5);
    }
    batch.dispose();
    assert.ok(sources.every(mesh => mesh.matrixWorldAutoUpdate));
  }
  geometry.dispose(); material.dispose();
});

test('manual zoom and aerial camera targets stay before the fog wall', () => {
  for (const distance of [6, 17, 45, 60, 100, 180, 270, 306]) {
    const fog=townFogRange(distance);
    assert.ok(fog.near>distance, `target hidden at distance ${distance}`);
    assert.equal(fog.far-fog.near,160);
  }
  assert.deepEqual(townFogRange(17),{near:60,far:220});
  assert.deepEqual(townFogRange(NaN),{near:60,far:220});
});
