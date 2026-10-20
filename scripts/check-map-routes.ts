// Independent reachability check: follow each returned path at fine intervals,
// rather than trusting the pathfinder's own line-of-sight decision.
import assert from 'node:assert/strict';
import { SPAWNS, ZONES, BOOTHS, findPath, blockedAt } from '../shared/world.ts';

let checked = 0;
for (const [id, start] of Object.entries(SPAWNS)) {
  assert.equal(blockedAt(...start), false, `${id} spawns inside an obstacle`);
  for (const target of [...ZONES, ...BOOTHS]) {
    const label = `${id} → ${'name' in target ? target.name : `booth ${target.x},${target.z}`}`;
    const route = findPath(...start, target.x, target.z);
    assert.ok(route?.length, `${label}: unreachable`);
    let previous = start;
    for (const point of route) {
      const steps = Math.max(1, Math.ceil(Math.hypot(point[0] - previous[0], point[1] - previous[1]) / 0.05));
      for (let step = 1; step <= steps; step++) {
        const x = previous[0] + ((point[0] - previous[0]) * step) / steps;
        const z = previous[1] + ((point[1] - previous[1]) * step) / steps;
        assert.equal(blockedAt(x, z), false, `${label}: collides at ${x},${z}`);
      }
      previous = point;
    }
    // Landmarks can be ponds or terminals: stop nearby on walkable ground.
    assert.ok(Math.hypot(previous[0] - target.x, previous[1] - target.z) <= 4, `${label}: stops too far away`);
    checked++;
  }
}
console.log(`地图路径检查通过：${checked} 条出生点到地标/招募点路线（每 0.05 米检查碰撞）`);
