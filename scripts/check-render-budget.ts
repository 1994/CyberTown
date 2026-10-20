import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shallow } from 'zustand/shallow';
import { socialEntry } from '../src/world/selectors.ts';
import { LOCAL_LIGHT_CAPACITY, stableLightSlots } from '../src/scene/lightBudget.ts';
import type { WorldPlayer } from '../shared/types.ts';
import { nextRenderBudget } from '../src/renderBudget.ts';
import { BoxGeometry } from 'three';
import { mergeStaticParts } from '../src/scene/staticGeometry.ts';

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
  assert.deepEqual(nextRenderBudget(1, { slow: 1, fast: 0 }, 23), { tier: 1, trend: { slow: 0, fast: 0 } });
  assert.deepEqual(nextRenderBudget(1, { slow: 1, fast: 5 }, NaN), { tier: 1, trend: { slow: 0, fast: 0 } });
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
