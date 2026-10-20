import { BOXES, CIRCLES, WORLD_BOUNDS } from '../shared/world.ts';

/** Independent pre-optimization narrow-phase oracle; intentionally no broad phase. */
export function linearCollision(x: number, z: number, r: number) {
  const b = WORLD_BOUNDS;
  if (x < b.minX + 0.6 || x > b.maxX - 0.6 || z < b.minZ + 0.6 || z > b.maxZ - 0.6) return true;
  for (const o of BOXES) {
    const dx = x - Math.max(o.minX, Math.min(x, o.maxX));
    const dz = z - Math.max(o.minZ, Math.min(z, o.maxZ));
    if (dx * dx + dz * dz < r * r) return true;
  }
  for (const c of CIRCLES) {
    const dx = x - c.x;
    const dz = z - c.z;
    if (dx * dx + dz * dz < (c.r + r) ** 2) return true;
  }
  return false;
}
