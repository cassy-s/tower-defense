// Tower simulation (pure logic, no rendering).
import { TOWERS, STAT_DEFAULTS } from '../config/towers.js';

let nextId = 1;

export const TARGETING = ['first', 'last', 'strong', 'close'];
export const TARGETING_LABEL = { first: 'First', last: 'Last', strong: 'Strong', close: 'Close' };

/** Active abilities that towers can unlock via `stats.ability`. */
export const ABILITIES = {
  airstrike: {
    name: 'Airstrike', cooldown: 40,
    desc: 'Bombers hit the 6 zombies furthest along for 150 damage each.',
    use(game, tower) {
      const targets = game.enemies.filter((e) => e.alive && !e.flying).sort((a, b) => a.remaining - b.remaining).slice(0, 6);
      game.emit('airstrike', { tower, targets: targets.map((e) => ({ x: e.x, z: e.z })) });
      targets.forEach((e, i) => {
        const x = e.x, z = e.z;
        game.later(0.9 + i * 0.12, () => game.explode(x, z, 4.5, 150 + tower.stats.damage * 4, { source: tower, maxHits: 30, armorPierce: 0.5 }));
      });
    },
  },
  rally: {
    name: 'Rally', cooldown: 45, duration: 10,
    desc: 'Towers in range fire twice as fast for 10 seconds.',
    use(game, tower) { tower.abilityActive = this.duration; game.emit('rally', { tower }); },
  },
};

/**
 * Extra attack types. To add a brand-new behaviour without touching
 * Tower.update(), register it here (or from another module):
 *   ATTACK_HANDLERS.heal = { fire(tower, target, game) { ... }, needsTarget: true };
 * and use `attack: 'heal'` in towers.js.
 */
export const ATTACK_HANDLERS = {};

export function computeStats(type, level) {
  const def = TOWERS[type];
  const s = { ...STAT_DEFAULTS, ...structuredClone(def.stats || {}) };
  const look = { ...(def.look || {}) };
  const ups = def.upgrades || [];
  for (let i = 0; i < level; i++) {
    const u = ups[i];
    if (!u) break;
    if (u.set) for (const k in u.set) s[k] = structuredClone(u.set[k]);
    if (u.add) for (const k in u.add) s[k] = (Number(s[k]) || 0) + Number(u.add[k]);
    if (u.mul) for (const k in u.mul) s[k] = (s[k] ?? 1) * Number(u.mul[k]);
    if (u.look) Object.assign(look, u.look);
  }
  // Safety clamps so a bad number can't freeze or break the game.
  s.cooldown = Math.max(0.03, Number(s.cooldown) || 1);
  s.projectileSpeed = Math.max(1, Number(s.projectileSpeed) || 30);
  s.damage = Number(s.damage) || 0;
  s.range = Math.max(1, Number(s.range) || 1);
  if (s.ability && !ABILITIES[s.ability]) s.ability = null;
  if (!TARGETING.includes(s.priority)) s.priority = 'first';
  return { stats: s, look };
}

export class Tower {
  constructor(game, type, x, z) {
    const def = TOWERS[type];
    this.id = nextId++;
    this.game = game;
    this.type = type;
    this.def = def;
    this.x = x; this.z = z;
    this.level = 0;
    this.spent = def.cost;
    this.footprint = def.footprint || 1.5;
    this.angle = Math.atan2(game.center.x - x, game.center.z - z);
    this.targeting = null;
    this.cooldownTimer = 0.2;
    this.burstLeft = 0; this.burstTimer = 0;
    this.spin = 0;
    this.stunTimer = 0;
    this.kills = 0;
    this.damageDealt = 0;
    this.abilityTimer = 0;
    this.abilityActive = 0;
    this.target = null;
    this.firing = false;
    this.buff = { cooldownMult: 1, rangeMult: 1, grantHidden: false, rally: false };
    this.refresh();
  }

  refresh() {
    const { stats, look } = computeStats(this.type, this.level);
    this.stats = stats;
    this.look = look;
    if (!this.targeting) this.targeting = stats.priority || 'first';
    if (stats.ability && !this.abilityTimer) this.abilityTimer = ABILITIES[stats.ability].cooldown * 0.5;
  }

  get maxLevel() { return (this.def.upgrades || []).length; }
  get nextUpgrade() { return (this.def.upgrades || [])[this.level] || null; }
  get range() { return this.stats.range * this.buff.rangeMult; }
  get sellValue() { return Math.floor(this.spent * 0.7); }
  get effectiveCooldown() {
    let c = this.stats.cooldown * this.buff.cooldownMult;
    if (this.buff.rally) c *= 0.5;
    return c;
  }
  get dps() {
    const s = this.stats;
    if (s.attack === 'none') return 0;
    const cd = this.effectiveCooldown;
    let per = s.damage;
    if (s.attack === 'spread') per *= s.pellets;
    if (s.burst > 1) return (per * s.burst) / Math.max(cd, s.burstDelay * (s.burst - 1));
    return per / cd;
  }

  stun(t) {
    if (this.stats.stunImmune) return;
    this.stunTimer = Math.max(this.stunTimer, t);
    this.game.emit('stun', { tower: this, t });
  }

  canSee(e) {
    if (!e.alive) return false;
    if (e.hidden && !(this.stats.detectHidden || this.buff.grantHidden)) return false;
    if (e.flying && !this.stats.detectFlying) return false;
    return true;
  }

  inRange(e, r = this.range) {
    const dx = e.x - this.x, dz = e.z - this.z;
    const rr = r + e.radius * 0.5;
    return dx * dx + dz * dz <= rr * rr;
  }

  findTarget() {
    let best = null, bestScore = -Infinity;
    const mode = this.targeting;
    for (const e of this.game.enemies) {
      if (!this.canSee(e) || !this.inRange(e)) continue;
      let score;
      if (mode === 'first') score = -e.remaining;
      else if (mode === 'last') score = e.remaining;
      else if (mode === 'strong') score = e.hp + e.shield + (e.boss ? 1e6 : 0) - e.remaining * 0.001;
      else score = -((e.x - this.x) ** 2 + (e.z - this.z) ** 2);
      if (score > bestScore) { bestScore = score; best = e; }
    }
    return best;
  }

  faceTarget(e) { this.angle = Math.atan2(e.x - this.x, e.z - this.z); }

  update(dt) {
    const s = this.stats;
    if (this.def.hooks?.onUpdate) this.def.hooks.onUpdate(this, this.game, dt);
    if (this.abilityTimer > 0) this.abilityTimer -= dt;
    if (this.abilityActive > 0) this.abilityActive -= dt;
    if (this.stunTimer > 0) { this.stunTimer -= dt; this.firing = false; this.spin = Math.max(0, this.spin - dt); return; }
    if (s.attack === 'none') return;

    if (this.cooldownTimer > 0) this.cooldownTimer -= dt;

    // Burst follow-up shots
    if (this.burstLeft > 0) {
      this.burstTimer -= dt;
      if (this.burstTimer <= 0) {
        let t = this.target;
        if (!t || !this.canSee(t) || !this.inRange(t)) t = this.target = this.findTarget();
        if (t) { this.faceTarget(t); this.fireHitscan(t); }
        this.burstLeft--;
        this.burstTimer = s.burstDelay;
      }
      return;
    }

    const target = this.findTarget();
    this.target = target;
    this.firing = !!target;
    if (s.attack === 'spinup') {
      const rate = dt / Math.max(0.05, s.spinUp);
      this.spin = target ? Math.min(1, this.spin + rate) : Math.max(0, this.spin - rate * 1.4);
    }
    if (!target) return;
    this.faceTarget(target);
    if (this.cooldownTimer > 0) return;

    let cd = this.effectiveCooldown;
    switch (s.attack) {
      case 'hitscan':
        this.fireHitscan(target);
        if (s.burst > 1) { this.burstLeft = s.burst - 1; this.burstTimer = s.burstDelay; }
        break;
      case 'spinup':
        if (this.spin < 0.08) return;
        cd = cd * (1 + 6 * (1 - this.spin));
        this.fireHitscan(target);
        break;
      case 'spread': this.fireSpread(target); break;
      case 'pierce': this.firePierce(target); break;
      case 'splash': this.fireSplash(target); break;
      case 'flame': this.fireFlame(target); break;
      case 'chain': this.fireChain(target); break;
      default: {
        const h = ATTACK_HANDLERS[s.attack];
        if (!h) return;
        h.fire(this, target, this.game);
      }
    }
    this.cooldownTimer = cd;
  }

  hitOpts() { return { source: this, armorPierce: this.stats.armorPierce, bossMult: this.stats.bossMult }; }

  /** Damage + every on-hit effect (burn, slow, custom hook). All attacks go through here. */
  applyHit(e, dmg = this.stats.damage) {
    if (!e.alive) return;
    e.damage(dmg, this.hitOpts());
    this.applyStatus(e);
  }

  applyStatus(e) {
    const s = this.stats;
    if (!e.alive) return;
    if (s.burnDamage) e.applyBurn(s.burnDamage * (e.boss ? s.bossMult : 1), s.burnDuration, this);
    if (s.slow) e.applySlow(s.slow, s.slowDuration);
    if (this.def.hooks?.onHit) this.def.hooks.onHit(this, e, this.game);
  }

  fireHitscan(target) {
    const s = this.stats;
    this.game.emit('shot', { tower: this, x: target.x, z: target.z, enemy: target });
    this.applyHit(target);
  }

  fireSpread(target) {
    const s = this.stats;
    const aim = Math.atan2(target.x - this.x, target.z - this.z);
    const half = (s.spreadAngle * Math.PI) / 360;
    const hits = [];
    for (const e of this.game.enemies) {
      if (!this.canSee(e) || !this.inRange(e)) continue;
      let d = Math.atan2(e.x - this.x, e.z - this.z) - aim;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      if (Math.abs(d) <= half || e === target) hits.push(e);
    }
    hits.sort((a, b) => ((a.x - this.x) ** 2 + (a.z - this.z) ** 2) - ((b.x - this.x) ** 2 + (b.z - this.z) ** 2));
    const struck = [];
    for (let p = 0; p < s.pellets; p++) {
      const e = hits[p % hits.length];
      struck.push({ x: e.x, z: e.z });
      this.applyHit(e);
    }
    this.game.emit('spread', { tower: this, hits: struck, angle: aim });
  }

  firePierce(target) {
    const s = this.stats;
    const dx = target.x - this.x, dz = target.z - this.z;
    const len = Math.hypot(dx, dz) || 1;
    this.game.addProjectile({
      kind: 'bolt', tower: this, x: this.x + (dx / len) * 1.2, z: this.z + (dz / len) * 1.2,
      vx: (dx / len) * s.projectileSpeed, vz: (dz / len) * s.projectileSpeed,
      life: (this.range * 1.5) / s.projectileSpeed, pierce: s.pierce, hit: new Set(),
      size: s.projectileSize, damage: s.damage,
    });
  }

  fireSplash(target) {
    const s = this.stats;
    // Lead the target: guess where it'll be when the grenade lands.
    const dist = Math.hypot(target.x - this.x, target.z - this.z);
    const flight = Math.max(0.35, dist / s.projectileSpeed);
    const p = target.path.at(Math.min(target.path.length, target.dist + target.speed * flight * 0.9));
    const tx = p.x - p.dz * target.lane, tz = p.z + p.dx * target.lane;
    this.game.addProjectile({
      kind: 'grenade', tower: this, sx: this.x, sz: this.z, tx, tz, x: this.x, z: this.z,
      t: 0, duration: flight, damage: s.damage,
    });
  }

  fireFlame(target) {
    const s = this.stats;
    const aim = Math.atan2(target.x - this.x, target.z - this.z);
    const half = (s.coneAngle * Math.PI) / 360;
    let n = 0;
    for (const e of this.game.enemies) {
      if (n >= s.maxHits) break;
      if (!this.canSee(e) || !this.inRange(e)) continue;
      let d = Math.atan2(e.x - this.x, e.z - this.z) - aim;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      if (Math.abs(d) > half && e !== target) continue;
      n++;
      if (e.immune.has('burn')) { this.game.emit('immune', { enemy: e }); continue; }
      this.applyHit(e);
    }
    this.game.emit('flame', { tower: this, angle: aim, range: this.range, cone: s.coneAngle, color: s.flameColor });
  }

  fireChain(target) {
    const s = this.stats;
    const points = [{ x: this.x, z: this.z }];
    const hit = new Set();
    let cur = target, dmg = s.damage;
    for (let i = 0; i <= s.chains && cur; i++) {
      hit.add(cur);
      points.push({ x: cur.x, z: cur.z, y: cur.flying ? 3 : 1.2 });
      this.applyHit(cur, dmg);
      dmg *= s.chainFalloff;
      const from = cur;
      let next = null, bestD = s.chainRange * s.chainRange;
      for (const e of this.game.enemies) {
        if (hit.has(e) || !this.canSee(e)) continue;
        const d = (e.x - from.x) ** 2 + (e.z - from.z) ** 2;
        if (d < bestD) { bestD = d; next = e; }
      }
      cur = next;
    }
    this.game.emit('chain', { tower: this, points });
  }

  useAbility() {
    const a = ABILITIES[this.stats.ability];
    if (!a || this.abilityTimer > 0 || this.stunTimer > 0) return false;
    a.use(this.game, this);
    this.abilityTimer = a.cooldown;
    return true;
  }
}
