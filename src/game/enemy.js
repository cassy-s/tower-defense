// Zombie simulation (pure logic, no rendering).
import { ENEMIES, MODIFIERS } from '../config/enemies.js';

let nextId = 1;

export class Enemy {
  constructor(game, type, { pathIndex = 0, dist = 0, mods = [], wave = 0, hpScale = 1 } = {}) {
    const def = ENEMIES[type];
    if (!def) throw new Error(`Unknown enemy type "${type}"`);
    this.id = nextId++;
    this.game = game;
    this.type = type;
    this.def = def;
    this.wave = wave;
    this.mods = mods;
    this.pathIndex = pathIndex;
    this.path = game.paths[pathIndex];
    this.dist = dist;

    let hpMult = hpScale, speedMult = 1, bountyMult = 1;
    for (const m of mods) {
      const mod = MODIFIERS[m];
      if (!mod) continue;
      hpMult *= mod.hpMult || 1;
      speedMult *= mod.speedMult || 1;
      bountyMult *= mod.bountyMult || 1;
    }
    this.maxHp = this.hp = Math.max(1, Math.round(def.hp * hpMult));
    this.maxShield = this.shield = Math.round((def.shield || 0) * hpMult);
    this.armor = def.armor || 0;
    this.baseSpeed = def.speed * speedMult;
    this.bounty = def.bounty * bountyMult;
    this.leak = def.leak || 1;
    this.hidden = !!def.hidden;
    this.flying = !!def.flying;
    this.boss = !!def.boss;
    this.size = def.size || 1;
    this.radius = 0.55 * this.size;
    this.immune = new Set(def.immune || []);

    this.lane = this.boss ? 0 : (game.rng() * 2 - 1) * 1.3;
    this.laneSeed = game.rng() * 10;
    this.alive = true;
    this.leaked = false;
    this.burn = null;           // { dps, t, source }
    this.slowMult = 1; this.slowT = 0;
    this.hasteMult = 1;
    this.enraged = false;
    this.lastHit = -1;
    this.abilityTimers = (def.abilities || []).map((a) => (a.every ? a.every * (0.5 + game.rng() * 0.5) : 0));
    this.x = 0; this.z = 0; this.dx = 1; this.dz = 0;
    this.updatePosition();
  }

  get remaining() { return this.path.length - this.dist; }
  get speed() {
    let s = this.baseSpeed * this.slowMult * this.hasteMult;
    if (this.enraged) s *= this.enrageMult || 1.5;
    return s;
  }

  updatePosition() {
    const p = this.path.at(this.dist, this._p || (this._p = {}));
    // Lateral lane offset, perpendicular to the path direction.
    // Lateral lane offset (with a gentle wander so crowds spread out).
    const lane = this.boss ? 0 : Math.max(-1.5, Math.min(1.5, this.lane + Math.sin(this.dist * 0.35 + this.laneSeed) * 0.3));
    this.x = p.x - p.dz * lane;
    this.z = p.z + p.dx * lane;
    this.dx = p.dx; this.dz = p.dz;
  }

  /** Apply damage. Returns the HP actually removed. */
  damage(amount, { armorPierce = 0, source = null, bossMult = 1 } = {}) {
    if (!this.alive) return 0;
    if (this.boss) amount *= bossMult;
    const armor = this.armor * (1 - Math.min(1, armorPierce));
    let dmg = amount * (1 - armor);
    let dealt = 0;
    if (this.shield > 0) {
      const s = Math.min(this.shield, dmg);
      this.shield -= s; dmg -= s; dealt += s;
      if (this.shield <= 0) this.game.emit('shieldBreak', { enemy: this });
    }
    const h = Math.min(this.hp, dmg);
    this.hp -= h; dealt += h;
    this.lastHit = this.game.time;
    if (source) source.damageDealt += dealt;
    if (this.hp <= 0.0001) this.game.killEnemy(this, source);
    return dealt;
  }

  applyBurn(dps, duration, source) {
    if (this.immune.has('burn') || dps <= 0) return;
    if (!this.burn || this.burn.dps <= dps) this.burn = { dps, t: duration, source };
    else this.burn.t = Math.max(this.burn.t, duration);
  }

  applySlow(amount, duration) {
    if (this.immune.has('slow') || amount <= 0) return;
    if (this.boss) amount *= 0.4;
    const mult = 1 - amount;
    if (this.slowT <= 0 || mult < this.slowMult) this.slowMult = mult;
    this.slowT = Math.max(this.slowT, duration);
  }

  update(dt) {
    const game = this.game;
    // Status effects
    if (this.burn) {
      this.burn.t -= dt;
      this.damage(this.burn.dps * dt, { source: this.burn.source, armorPierce: 1 });
      if (this.burn && this.burn.t <= 0) this.burn = null;
      if (!this.alive) return;
    }
    if (this.slowT > 0) { this.slowT -= dt; if (this.slowT <= 0) this.slowMult = 1; }

    // Abilities
    const abilities = this.def.abilities;
    if (abilities) {
      for (let i = 0; i < abilities.length; i++) {
        const a = abilities[i];
        if (a.type === 'enrage') {
          if (!this.enraged && this.hp < this.maxHp * a.below) {
            this.enraged = true; this.enrageMult = a.mult;
            game.emit('enrage', { enemy: this });
          }
          continue;
        }
        if (!a.every) continue;
        this.abilityTimers[i] -= dt;
        if (this.abilityTimers[i] > 0) continue;
        this.abilityTimers[i] = a.every;
        this.useAbility(a);
      }
    }

    this.dist += this.speed * dt;
    if (this.dist >= this.path.length) { game.leakEnemy(this); return; }
    this.updatePosition();
  }

  useAbility(a) {
    const game = this.game;
    if (a.type === 'spit') {
      let best = null, bestD = a.range * a.range;
      for (const t of game.towers) {
        if (t.stats.stunImmune || t.stunTimer > 0) continue;
        const d = (t.x - this.x) ** 2 + (t.z - this.z) ** 2;
        if (d < bestD) { bestD = d; best = t; }
      }
      if (best) {
        game.emit('spit', { enemy: this, tower: best });
        game.later(0.45, () => best.stun(a.stun));
      }
    } else if (a.type === 'heal') {
      const r2 = a.radius * a.radius;
      const healed = [];
      for (const e of game.enemies) {
        if (!e.alive || e === this || e.boss) continue;
        if ((e.x - this.x) ** 2 + (e.z - this.z) ** 2 > r2) continue;
        if (e.hp >= e.maxHp) continue;
        e.hp = Math.min(e.maxHp, e.hp + e.maxHp * a.pct);
        healed.push(e);
      }
      game.emit('heal', { enemy: this, healed, radius: a.radius });
    } else if (a.type === 'summon') {
      for (let k = 0; k < a.count; k++) {
        const type = a.enemies[k % a.enemies.length];
        game.spawnEnemy(type, { pathIndex: this.pathIndex, dist: Math.max(0, this.dist - 1 - k * 0.8), wave: this.wave });
      }
      game.emit('summon', { enemy: this });
    } else if (a.type === 'slam') {
      const r2 = a.radius * a.radius;
      for (const t of game.towers) {
        if ((t.x - this.x) ** 2 + (t.z - this.z) ** 2 <= r2 && !t.stats.stunImmune) t.stun(a.stun);
      }
      game.emit('slam', { enemy: this, radius: a.radius });
    }
  }

  onDeath() {
    for (const a of this.def.abilities || []) {
      if (a.type !== 'deathSpawn') continue;
      for (let k = 0; k < a.count; k++) {
        this.game.spawnEnemy(a.enemy, {
          pathIndex: this.pathIndex, dist: Math.max(0, this.dist - k * 0.7), wave: this.wave,
          mods: this.mods.filter((m) => m === 'fortified'),
        });
      }
    }
  }
}
