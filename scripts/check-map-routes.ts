// Independent reachability check: follow each returned path at fine intervals,
// rather than trusting the pathfinder's own line-of-sight decision.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { npcWalkAt, NPC_WALK_IDS } from '../shared/npcWalk.ts';
import { SPAWNS, ZONES, BOOTHS, findPath, blockedAt, WORLD_BOUNDS, WALK_SPEED } from '../shared/world.ts';

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

const contract = JSON.parse(readFileSync(new URL('../contracts/world-contract.json', import.meta.url), 'utf8'));
assert.deepEqual(WORLD_BOUNDS, contract.bounds, 'web/API campus bounds drift');
// The new streets must connect to every existing destination, in both directions.
const corners = [{ x: -33, z: -24 }, { x: 33, z: -24 }, { x: 33, z: 24 }, { x: -33, z: 24 }];
const landmarks = [...ZONES, ...corners];
for (const start of landmarks) for (const target of landmarks) {
  const path = findPath(start.x, start.z, target.x, target.z);
  assert.ok(path?.length, `disconnected district: ${start.x},${start.z} → ${target.x},${target.z}`);
  let prev: [number, number] = [start.x, start.z];
  // Some authored landmarks are a pond/terminal: findPath starts nearby.
  if (blockedAt(...prev)) continue;
  for (const point of path) {
    const steps = Math.max(1, Math.ceil(Math.hypot(point[0]-prev[0], point[1]-prev[1])/.05));
    for (let i=1;i<=steps;i++) assert.equal(blockedAt(prev[0]+(point[0]-prev[0])*i/steps, prev[1]+(point[1]-prev[1])*i/steps), false);
    prev = point;
  }
}
// Keep the first-minute loop short despite the much larger exploration space.
for (const id of ['coffee', 'project', 'talent']) {
  const target = ZONES.find(z => z.id === id)!;
  let prev: [number, number] = SPAWNS.wang;
  let meters = 0;
  for (const point of findPath(...prev, target.x, target.z)!) { meters += Math.hypot(point[0]-prev[0],point[1]-prev[1]); prev=point; }
  assert.ok(meters / WALK_SPEED < 9, `${id}: first-minute walk too long`);
}
// A full wall-clock cycle: no furniture crossings or teleport seams on NPC walks.
for (const id of NPC_WALK_IDS) {
  let prev = npcWalkAt(id, 0)!;
  for (let ms=25;ms<=600000;ms+=25) {
    const p = npcWalkAt(id,ms)!;
    assert.equal(blockedAt(p.x,p.z),false, `${id} crosses collider at ${ms}`);
    assert.ok(Math.hypot(p.x-prev.x,p.z-prev.z) <= .043, `${id}: discontinuous stroll at ${ms}`);
    prev=p;
  }
}
assert.equal(npcWalkAt('c-zhang', 12345),null,'welcoming boss must remain at spawn');
assert.equal(npcWalkAt('clone-employee', 12345),null,'employees never become scripted NPCs');
console.log(`扩图检查通过：${landmarks.length ** 2} 条地标互通、核心步行 <9秒、2位NPC十分钟连续巡游及前后端边界契约`);

// Environmental pedestrians stay on authored pavements, including between endpoints.
const { TOWN_WALKERS } = await import('../shared/townLife.ts');
for (const route of TOWN_WALKERS) {
  for (let x = route.a; x <= route.b; x += .1) assert.equal(blockedAt(x, route.z, .35), false, `resident crosses an obstacle at ${x},${route.z}`);
}
console.log(`环境居民 ${TOWN_WALKERS.length} 条步道连续碰撞检查通过`);
