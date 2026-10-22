/** Keep the camera target clear at every zoom, with haze only behind the town. */
export function townFogRange(distance: number) {
  const safeDistance = Number.isFinite(distance) ? Math.max(0, distance) : 0;
  const near = Math.max(60, safeDistance + 24);
  return { near, far: near + 160 };
}
