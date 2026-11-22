// Polyline path with constant-time-ish lookup of position by distance.

export class Path {
  constructor(points) {
    this.points = points.map(([x, z]) => ({ x, z }));
    this.cum = [0];
    for (let i = 1; i < this.points.length; i++) {
      const a = this.points[i - 1], b = this.points[i];
      this.cum.push(this.cum[i - 1] + Math.hypot(b.x - a.x, b.z - a.z));
    }
    this.length = this.cum[this.cum.length - 1];
  }

  /** Position + heading at distance d along the path. Writes into `out`. */
  at(d, out = {}) {
    const { points, cum } = this;
    if (d <= 0) d = 0;
    if (d >= this.length) d = this.length;
    let i = 1;
    // Binary search the segment.
    let lo = 1, hi = cum.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < d) lo = mid + 1; else hi = mid; }
    i = lo;
    const a = points[i - 1], b = points[i];
    const seg = cum[i] - cum[i - 1] || 1;
    const t = (d - cum[i - 1]) / seg;
    out.x = a.x + (b.x - a.x) * t;
    out.z = a.z + (b.z - a.z) * t;
    out.dx = (b.x - a.x) / seg;
    out.dz = (b.z - a.z) / seg;
    return out;
  }

  /** Shortest distance from point to the path polyline. */
  distanceTo(x, z) {
    let best = Infinity;
    for (let i = 1; i < this.points.length; i++) {
      const a = this.points[i - 1], b = this.points[i];
      const vx = b.x - a.x, vz = b.z - a.z;
      const len2 = vx * vx + vz * vz || 1;
      let t = ((x - a.x) * vx + (z - a.z) * vz) / len2;
      t = Math.max(0, Math.min(1, t));
      const px = a.x + vx * t - x, pz = a.z + vz * t - z;
      best = Math.min(best, Math.hypot(px, pz));
    }
    return best;
  }
}
