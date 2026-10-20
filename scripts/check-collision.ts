import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blockedAt, BOXES, CIRCLES, PLAYER_RADIUS } from '../shared/world.ts';
import { linearCollision } from './collision-oracle.ts';
import { rng } from '../shared/rules.ts';
import { sharedGeometry } from '../src/scene/sharedGeometry.ts';
import { SphereGeometry } from 'three';

test('spatial broad phase exactly matches full scan across the entire map and supported radii', () => {
  const random = rng(72911);
  for (let i = 0; i < 100000; i++) {
    const x = random() * 64 - 32;
    const z = random() * 48 - 24;
    const r = [0, 0.18, PLAYER_RADIUS, 0.44, 0.48, 0.5, 0.6, 2, -0.2][i % 9];
    assert.equal(blockedAt(x, z, r), linearCollision(x, z, r), `${x},${z},${r}`);
  }
});

test('broad phase preserves contact edges, bucket seams and nonfinite input behavior', () => {
  const points: [number, number][] = [];
  for (let x = -30; x <= 30; x += 4) for (let z = -22; z <= 22; z += 4) points.push([x, z]);
  for (const b of BOXES) for (const x of [b.minX, b.maxX]) for (const z of [b.minZ, b.maxZ]) points.push([x, z]);
  for (const c of CIRCLES) for (const sign of [-1, 1]) points.push([c.x + sign * (c.r + PLAYER_RADIUS), c.z], [c.x, c.z + sign * (c.r + PLAYER_RADIUS)]);
  points.push([NaN, 0], [0, NaN], [Infinity, 0], [-Infinity, NaN]);
  for (const [x, z] of points) for (const r of [0, PLAYER_RADIUS, 0.48, 0.5, 5, NaN, Infinity]) {
    for (const e of [-1e-9, 0, 1e-9]) assert.equal(blockedAt(x + e, z + e, r), linearCollision(x + e, z + e, r));
  }
});

test('repeated character shapes share immutable buffers without changing topology or UVs', () => {
  const source = new SphereGeometry(0.3, 32, 24);
  const cached = sharedGeometry('sphere', [0.3, 32, 24]);
  assert.equal(cached, sharedGeometry('sphere', [0.3, 32, 24]));
  assert.notEqual(cached, sharedGeometry('sphere', [0.3, 16, 12]));
  for (const attr of ['position', 'normal', 'uv']) assert.deepEqual(cached.getAttribute(attr).array, source.getAttribute(attr).array);
  assert.deepEqual(cached.index!.array, source.index!.array);
  source.dispose();
});
