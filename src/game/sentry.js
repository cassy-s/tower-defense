// Sentries: small turrets a "builder" tower (the Engineer / Riveter) puts down
// near itself once its scrap meter is full. Pure logic, no rendering.
//
// A builder tower has these stats (see towers.js riveter):
//   scrapMax   scrap needed per sentry (scrap = damage the tower itself deals)
//   maxUnits   how many of its sentries can be alive at once
//   buildRange sentries are placed within this many studs (yellow ring)
//   deadzone   the tower can't shoot or build closer than this (red ring)
//   unit       { damage, cooldown, range, health, lifespan, hidden, shield, rocket }
//
// A sentry keeps the stats its builder had when it was put down; upgrading the
// builder improves the sentries it builds after that.
import { WIDTH, HEIGHT } from '../config/maps.js';

export class Sentry {
  constructor(game, owner, x, z) {
    this.id = game.newId();
    this.game = game;
    this.owner = owner;
    this.x = x; this.z = z;
    this.stats = { ...owner.stats.unit };
    this.tier = owner.level;
    this.maxHp = this.hp = this.stats.health;
    this.drain = this.stats.health / Math.max(1, this.stats.lifespan);
    this.angle = owner.angle;
    this.cooldownTimer = 0.6;
    this.rocketTimer = 1.5;
    this.target = null;
    this.alive = true;
    this.stunTimer = 0;
  }

  get range() { return this.stats.range; }

  canSee(e) {
    if (!e.alive || e.flying) return false;
    if (e.hidden && !this.stats.hidden) return false;
    return true;
  }

  inRange(e) {
    const r = this.range + e.radius * 0.5;
    return (e.x - this.x) ** 2 + (e.z - this.z) ** 2 <= r * r;
  }

  findTarget() {
    let best = null, bestScore = -Infinity;
    for (const e of this.game.enemies) {
      if (!this.canSee(e) || !this.inRange(e)) continue;
      const score = -e.remaining;
      if (score > bestScore) { bestScore = score; best = e; }
    }
    return best;
  }

  /** Damage from enemy abilities. Shielded sentries take half and can't be stunned. */
  hurt(n, stun = 0) {
    if (!this.alive) return;
    this.hp -= this.stats.shield ? n * 0.5 : n;
    if (stun && !this.stats.shield) this.stunTimer = Math.max(this.stunTimer, stun);
    this.game.emit('sentryHurt', { sentry: this });
    if (this.hp <= 0) this.game.removeSentry(this, 'destroyed');
  }

  update(dt) {
    this.hp -= this.drain * dt;
    if (this.hp <= 0) { this.game.removeSentry(this, 'expired'); return; }
    if (this.stunTimer > 0) { this.stunTimer -= dt; return; }
    if (this.cooldownTimer > 0) this.cooldownTimer -= dt;
    if (this.rocketTimer > 0) this.rocketTimer -= dt;
    const t = this.findTarget();
    this.target = t;
    if (!t) return;
    this.angle = Math.atan2(t.x - this.x, t.z - this.z);
    const s = this.stats;
    const opts = { source: this.owner, armorPierce: this.owner.stats.armorPierce };
    if (this.cooldownTimer <= 0) {
      this.cooldownTimer = s.cooldown;
      t.damage(s.damage, opts);
      this.game.emit('sentryShot', { sentry: this, enemy: t });
    }
    const r = s.rocket;
    if (r && this.rocketTimer <= 0) {
      this.rocketTimer = r.cooldown;
      for (let i = 0; i < r.count; i++) {
        const x = t.x, z = t.z, delay = 0.35 + i * 0.15;
        this.game.emit('sentryRocket', { sentry: this, x, z, delay, i });
        this.game.later(delay, () => this.game.explode(x, z, r.radius, r.damage, { ...opts, maxHits: 40 }));
      }
    }
  }
}

/** How close a tower's centre may be to a sentry (or a sentry being built). */
export const SENTRY_RADIUS = 0.8;

/**
 * The ring around a builder tower where its sentries go. `outer` is what the
 * yellow ring shows. Sentries can't go right next to the tower, so at high
 * levels (small buildRange) the ring is a little bigger than buildRange.
 */
export function sentryRing(stats) {
  const inner = (stats.deadzone || 0) + 0.9;
  return { inner, outer: Math.max(inner + 0.2, stats.buildRange || 0) };
}

/** True if nothing (tower, sentry, prop) is in the way of a sentry at x, z. */
export function sentrySpotFree(game, x, z) {
  for (const t of game.towers) if ((t.x - x) ** 2 + (t.z - z) ** 2 < (t.footprint * 0.75 + 0.6) ** 2) return false;
  for (const o of game.sentries) if ((o.x - x) ** 2 + (o.z - z) ** 2 < 1.6 ** 2) return false;
  for (const o of game.layout.props) if (o.radius && (o.x - x) ** 2 + (o.z - z) ** 2 < (o.radius + 0.4) ** 2) return false;
  return true;
}

/** Best free spot for a new sentry around a builder tower, or null. */
export function findSentrySpot(game, tower) {
  const { inner, outer } = sentryRing(tower.stats);
  let best = null, bestScore = Infinity;
  for (let ri = 0; ri < 3; ri++) {
    const r = inner + ((outer - inner) * (ri + 0.5)) / 3;
    for (let k = 0; k < 20; k++) {
      const a = (k / 20) * Math.PI * 2 + ri * 0.4;
      const x = tower.x + Math.sin(a) * r, z = tower.z + Math.cos(a) * r;
      if (x < 1 || z < 1 || x > WIDTH - 1 || z > HEIGHT - 1) continue;
      // Also keep clear of spots other builders are about to use.
      let blocked = !sentrySpotFree(game, x, z);
      if (!blocked) for (const t of game.towers) if (t.buildSpot && (t.buildSpot.x - x) ** 2 + (t.buildSpot.z - z) ** 2 < 1.6 ** 2) { blocked = true; break; }
      if (blocked) continue;
      // Prefer the roadside: close to the path, but not in the middle of it.
      let d = Infinity;
      for (const p of game.paths) d = Math.min(d, p.distanceTo(x, z));
      const score = Math.abs(d - 2.2);
      if (score < bestScore) { bestScore = score; best = { x, z }; }
    }
  }
  return best;
}
