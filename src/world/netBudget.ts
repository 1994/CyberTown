interface Position { x: number; z: number; moving: boolean }

/** Keep movement at 5Hz, emit start/stop promptly, and avoid idle broadcasts.
 * SSE owns presence; position heartbeats are only a lightweight recovery aid. */
export function movementPacketDue(now: number, lastAt: number, current: Position, last: Position, hidden: boolean) {
  if (hidden) return last.moving; // one stop packet, then quiet until visible
  if (!Number.isFinite(last.x) || !Number.isFinite(last.z)) return true;
  if (current.moving !== last.moving) return true;
  const elapsed = now - lastAt;
  if (current.moving) return elapsed >= 200;
  if (Math.hypot(current.x - last.x, current.z - last.z) > 0.02) return elapsed >= 200;
  return elapsed >= 5000;
}
