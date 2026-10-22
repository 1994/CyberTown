import assert from 'node:assert/strict';
import { TOWN_OPPORTUNITIES } from '../shared/townExplore.ts';
import { SPAWNS, WORLD_BOUNDS, WALK_SPEED, blockedAt, findPath } from '../shared/world.ts';

assert.deepEqual(WORLD_BOUNDS, { minX: -90, maxX: 90, minZ: -66, maxZ: 66 });
assert.equal(new Set(TOWN_OPPORTUNITIES.map(s => s.id)).size, 4);
assert.equal(TOWN_OPPORTUNITIES.reduce((sum, s) => sum + s.reward, 0), 120);
const starts = [...Object.values(SPAWNS), ...TOWN_OPPORTUNITIES.map(s => [s.x, s.z] as [number, number]),
  ...[[-82, -56], [82, -56], [-82, 60], [82, 60], [0, 60]] as [number, number][]];
let count = 0, longest = 0;
for (const site of TOWN_OPPORTUNITIES) {
  assert.ok(Math.abs(site.x) > 45 || Math.abs(site.z) > 33, `${site.id} must invite exploration beyond the old bounds`);
  assert.equal(blockedAt(site.x, site.z), false, `${site.id}: entrance inside collision`);
  for (const start of starts) {
    const route = findPath(...start, site.x, site.z);
    assert.ok(route?.length, `${start} → ${site.id}: no route`);
    let prev = start, meters = 0;
    for (const point of route) {
      const d = Math.hypot(point[0] - prev[0], point[1] - prev[1]);
      meters += d;
      const steps = Math.max(1, Math.ceil(d / .05));
      for (let i = 1; i <= steps; i++) {
        assert.equal(blockedAt(prev[0] + (point[0] - prev[0]) * i / steps, prev[1] + (point[1] - prev[1]) * i / steps), false, `${start} → ${site.id}: route crosses collider`);
      }
      prev = point;
    }
    assert.ok(Math.hypot(prev[0] - site.x, prev[1] - site.z) <= 2.8, `${site.id}: interaction unreachable`);
    longest = Math.max(longest, meters / WALK_SPEED);
    count++;
  }
}
console.log(JSON.stringify({ routes: count, independentCollisionSamplingMeters: .05, longestWalkSeconds: Math.ceil(longest), area: 180 * 132, rewards: 120 }));
