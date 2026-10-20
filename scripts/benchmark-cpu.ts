import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { BOXES, CIRCLES, WORLD_BOUNDS, blockedAt, findPath } from '../shared/world.ts';
import { rng } from '../shared/rules.ts';
import { linearCollision } from './collision-oracle.ts';

const random = rng(72911);
const count = 100000;
const points = Array.from({ length: count }, () => [random() * 60 - 30, random() * 44 - 22, [0.36, 0.44, 0.48][Math.floor(random() * 3)]]);
type Collision = (x: number, z: number, r: number) => boolean | number;
const functions: [string, Collision][] = [['JS linear', linearCollision], ['JS spatial index', blockedAt]];
const wasmPath = 'artifacts/tmp/collision.wasm';
let wasmInfo: object = { tested: false, reason: 'Optional: run make perf-wasm to compile the Rust experiment.' };
if (existsSync(wasmPath)) {
  const bytes = readFileSync(wasmPath);
  const { instance } = await WebAssembly.instantiate(bytes, {});
  const exports = instance.exports as unknown as {
    set_bounds: (...args: number[]) => void;
    set_box: (...args: number[]) => void;
    set_circle: (...args: number[]) => void;
    blocked_at: Collision;
  };
  const b = WORLD_BOUNDS;
  assert.ok(BOXES.length <= 256 && CIRCLES.length <= 256);
  exports.set_bounds(b.minX, b.maxX, b.minZ, b.maxZ);
  BOXES.forEach((b, i) => exports.set_box(i, b.minX, b.maxX, b.minZ, b.maxZ));
  CIRCLES.forEach((c, i) => exports.set_circle(i, c.x, c.z, c.r));
  for (const p of points) assert.equal(!!exports.blocked_at(p[0], p[1], p[2]), linearCollision(p[0], p[1], p[2]));
  functions.push(['Rust WASM linear', exports.blocked_at]);
  wasmInfo = { tested: true, bytes: bytes.byteLength, equivalentPoints: count };
}
const results = functions.map(([name, fn]) => {
  let checksum = 0;
  const run = () => { for (const p of points) checksum += +fn(p[0], p[1], p[2]); };
  for (let i = 0; i < 5; i++) run();
  const times: number[] = [];
  for (let i = 0; i < 11; i++) {
    const start = performance.now(); run(); times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return { name, queries: count, medianMs: +times[5].toFixed(3), p95Ms: +times[10].toFixed(3), checksum };
});
assert.ok(results.every(r => r.checksum === results[0].checksum));
const routes = [[0, 11, -17, -13], [0, 11, 18, -13], [-17, 0, 18, 0.2], [18, -13, -25, -11]];
const routeTimes: number[] = [];
for (let i = 0; i < 101; i++) {
  const p = routes[i % routes.length];
  const start = performance.now(); findPath(p[0], p[1], p[2], p[3]); routeTimes.push(performance.now() - start);
}
const cold = routeTimes.shift()!;
routeTimes.sort((a, b) => a - b);
console.log(JSON.stringify({ runtime: process.version, platform: `${process.platform}/${process.arch}`, wasm: wasmInfo, collision: results,
  pathfinding: { coldMs: +cold.toFixed(3), medianMs: +routeTimes[50].toFixed(3), p95Ms: +routeTimes[95].toFixed(3), samples: 100 },
  note: 'CPU microbenchmark; not browser FPS. WASM tests the same original linear algorithm, JS index tests an algorithmic improvement.' }, null, 2));
