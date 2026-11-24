// Polyline path with constant-time-ish lookup of position by distance.

/** Lane offsets start turning this many studs before a corner. */
const CORNER_RADIUS = 1.8;

export class Path {
  constructor(points) {
    this.points = points.map(([x, z]) => ({ x, z }));
    this.cum = [0];
    for (let i = 1; i < this.points.length; i++) {
      const a = this.points[i - 1], b = this.points[i];
      this.cum.push(this.cum[i - 1] + Math.hypot(b.x - a.x, b.z - a.z));
    }
    this.length = this.cum[this.cum.length - 1];
    // Unit direction of each segment, and how far before/after each corner the
    // lane offset starts turning (so zombies walking off-centre round corners
    // instead of snapping sideways).
    this.dirs = [null];
    for (let i = 1; i < this.points.length; i++) {
      const a = this.points[i - 1], b = this.points[i];
      const len = this.cum[i] - this.cum[i - 1] || 1;
      this.dirs.push({ x: (b.x - a.x) / len, z: (b.z - a.z) / len });
    }
    this.cornerR = this.points.map((_, i) => {
      if (i === 0 || i === this.points.length - 1) return 0;
      const before = this.cum[i] - this.cum[i - 1], after = this.cum[i + 1] - this.cum[i];
      return Math.min(CORNER_RADIUS, before * 0.45, after * 0.45);
    });
  }

  /**
   * Position at distance d, offset sideways by `lane` studs (positive = left of
   * travel). Near corners the sideways direction is blended between the two
   * segments, so the offset point moves continuously. Writes x, z and the
   * (blended, unit) heading dx, dz into `out`.
   */
  laneAt(d, lane, out = {}) {
    this.at(d, out);
    const { cum, dirs, cornerR } = this;
    const i = this._seg;
    let hx = dirs[i].x, hz = dirs[i].z;
    const toEnd = cum[i] - Math.min(Math.max(d, 0), this.length), fromStart = Math.min(Math.max(d, 0), this.length) - cum[i - 1];
    let k = 0, ox = 0, oz = 0;
    if (i + 1 < dirs.length && cornerR[i] > 0 && toEnd < cornerR[i]) {
      k = 0.5 * (1 - toEnd / cornerR[i]); ox = dirs[i + 1].x; oz = dirs[i + 1].z;
    } else if (i > 1 && cornerR[i - 1] > 0 && fromStart < cornerR[i - 1]) {
      k = 0.5 * (1 - fromStart / cornerR[i - 1]); ox = dirs[i - 1].x; oz = dirs[i - 1].z;
    }
    if (k > 0) {
      const bx = hx * (1 - k) + ox * k, bz = hz * (1 - k) + oz * k;
      const l = Math.hypot(bx, bz);
      if (l > 0.2) { hx = bx / l; hz = bz / l; }
    }
    out.x -= hz * lane;
    out.z += hx * lane;
    out.dx = hx; out.dz = hz;
    return out;
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
    this._seg = i;
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
