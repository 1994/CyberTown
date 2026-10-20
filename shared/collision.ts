interface Bounds { minX: number; maxX: number; minZ: number; maxZ: number }
interface Box extends Bounds {}
interface Circle { x: number; z: number; r: number }

/** Immutable broad phase for a static map. Expand buckets by the largest common
 * query radius, then do exact original narrow-phase tests on one bucket only.
 * Unusual radii retain the full scan, without truncating collision semantics. */
export function createCollisionIndex(bounds: Bounds, boxes: readonly Box[], circles: readonly Circle[], maxRadius = 0.5, cellSize = 4) {
  const width = Math.ceil((bounds.maxX - bounds.minX) / cellSize) + 1;
  const height = Math.ceil((bounds.maxZ - bounds.minZ) / cellSize) + 1;
  const buckets = Array.from({ length: width * height }, () => ({ boxes: [] as Box[], circles: [] as Circle[] }));
  const insert = (minX: number, maxX: number, minZ: number, maxZ: number, add: (bucket: typeof buckets[number]) => void) => {
    const left = Math.max(0, Math.floor((minX - maxRadius - bounds.minX) / cellSize));
    const right = Math.min(width - 1, Math.floor((maxX + maxRadius - bounds.minX) / cellSize));
    const top = Math.max(0, Math.floor((minZ - maxRadius - bounds.minZ) / cellSize));
    const bottom = Math.min(height - 1, Math.floor((maxZ + maxRadius - bounds.minZ) / cellSize));
    for (let z = top; z <= bottom; z++) for (let x = left; x <= right; x++) add(buckets[z * width + x]);
  };
  for (const b of boxes) insert(b.minX, b.maxX, b.minZ, b.maxZ, bucket => bucket.boxes.push(b));
  for (const c of circles) insert(c.x - c.r, c.x + c.r, c.z - c.r, c.z + c.r, bucket => bucket.circles.push(c));
  return (x: number, z: number, r: number): boolean => {
    if (x < bounds.minX + 0.6 || x > bounds.maxX - 0.6 || z < bounds.minZ + 0.6 || z > bounds.maxZ - 0.6) return true;
    let candidatesB = boxes;
    let candidatesC = circles;
    if (r >= 0 && r <= maxRadius && Number.isFinite(x) && Number.isFinite(z)) {
      const bucket = buckets[Math.floor((z - bounds.minZ) / cellSize) * width + Math.floor((x - bounds.minX) / cellSize)];
      candidatesB = bucket.boxes;
      candidatesC = bucket.circles;
    }
    for (const o of candidatesB) {
      const dx = x - Math.max(o.minX, Math.min(x, o.maxX));
      const dz = z - Math.max(o.minZ, Math.min(z, o.maxZ));
      if (dx * dx + dz * dz < r * r) return true;
    }
    for (const c of candidatesC) {
      const dx = x - c.x;
      const dz = z - c.z;
      const rr = c.r + r;
      if (dx * dx + dz * dz < rr * rr) return true;
    }
    return false;
  };
}
