/** Progress is measured against the current waypoint, so sliding along a wall
 * without approaching it also triggers recovery. New input resets the timer. */
export class NavigationRecovery {
  private path: [number, number][] | null = null;
  private waypoint: [number, number] | undefined;
  private best = Infinity;
  private stalled = 0;
  update(path: [number, number][] | null, x: number, z: number, dt: number): boolean {
    const waypoint = path?.[0];
    if (path !== this.path || waypoint !== this.waypoint) {
      this.path = path; this.waypoint = waypoint;
      this.best = waypoint ? Math.hypot(waypoint[0] - x, waypoint[1] - z) : Infinity;
      this.stalled = 0;
      return false;
    }
    if (!waypoint) return false;
    const distance = Math.hypot(waypoint[0] - x, waypoint[1] - z);
    if (distance < this.best - .06) { this.best = distance; this.stalled = 0; }
    else this.stalled += dt;
    if (this.stalled < .8) return false;
    this.stalled = 0;
    this.best = distance;
    return true;
  }
}
