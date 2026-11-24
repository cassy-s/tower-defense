// Core game state + simulation. No rendering here — the 3D view listens to
// events emitted by the game. This lets tools/sim.mjs run games headlessly.
import { MAPS, WIDTH, HEIGHT, PATH_WIDTH } from '../config/maps.js';
import { TOWERS } from '../config/towers.js';
import { DIFFICULTIES, getWave, waveBonus, waveHpScale } from '../config/waves.js';
import { Path } from './path.js';
import { Enemy } from './enemy.js';
import { Tower, computeStats } from './tower.js';
import { Sentry, SENTRY_RADIUS } from './sentry.js';
import { buildLayout } from './layout.js';
import { mulberry32 } from './rng.js';

export class Game {
  constructor({ mapId = 'maple', difficulty = 'easy', seed = 1, cashOverride = null } = {}) {
    this.mapId = mapId;
    this.map = MAPS[mapId];
    this.difficultyId = difficulty;
    this.difficulty = DIFFICULTIES[difficulty];
    this.rng = mulberry32(seed);
    this.paths = this.map.paths.map((p) => new Path(p));
    this.layout = buildLayout(this.map, this.paths);
    this.center = { x: WIDTH / 2, z: HEIGHT / 2 };
    const end = this.paths[0].points.at(-1);
    this.base = { x: end.x, z: end.z };

    this.cash = cashOverride ?? this.difficulty.startCash;
    this.lives = this.maxLives = this.difficulty.lives;
    this.maxWaves = this.difficulty.waves;
    this.wave = 0;
    this.time = 0;
    this.state = 'playing'; // playing | won | lost
    this.autoStart = false;
    this.enemies = [];
    this.towers = [];
    this.sentries = [];
    this.projectiles = [];
    this.spawnQueue = [];     // { at, type, pathIndex, mods, wave }
    this.waveOpen = new Map(); // wave -> zombies not yet resolved (pending + alive)
    this.timers = [];
    this.nextSpawnPath = 0;
    this.autoTimer = 0;
    this.seen = new Set();
    this.stats = { kills: 0, leaked: 0, earned: 0, spent: 0, built: 0 };
    this.retired = [];      // sold towers, so the end screen can still credit them
    this.cashFrac = 0;      // fractions of a dollar from multiplied bounties
    this.idCounter = 0;
    this.listeners = {};
  }

  /** Ids for towers, zombies, sentries and projectiles. Unique within this game. */
  newId() { return ++this.idCounter; }

  // ------------------------------------------------------------ events ----
  on(type, fn) { (this.listeners[type] ||= []).push(fn); return () => this.off(type, fn); }
  off(type, fn) { const l = this.listeners[type]; if (l) l.splice(l.indexOf(fn) >>> 0, 1); }
  emit(type, data) { const l = this.listeners[type]; if (l) for (const fn of l.slice()) fn(data); const a = this.listeners['*']; if (a) for (const fn of a) fn(type, data); }
  later(delay, fn) { this.timers.push({ at: this.time + delay, fn }); }

  // ------------------------------------------------------------ economy ---
  /**
   * Cash is always a whole number. Multiplied bounties (Easy ×1.1, Swift ×1.2)
   * leave fractions of a dollar; those are saved up and paid out once they add
   * up to a full dollar, so nothing is lost. Returns the whole dollars added.
   */
  addCash(n, reason) {
    this.cashFrac += n;
    const whole = Math.floor(this.cashFrac + 1e-9);
    this.cashFrac -= whole;
    if (!whole) return 0;
    this.cash += whole;
    if (whole > 0) this.stats.earned += whole;
    this.emit('cash', { amount: whole, reason });
    return whole;
  }
  canAfford(n) { return this.cash >= n; }

  // ---------------------------------------------------------- placement ---
  countOf(type) { return this.towers.filter((t) => t.type === type).length; }

  canPlace(type, x, z) {
    const def = TOWERS[type];
    if (!def) return { ok: false, reason: 'Unknown tower' };
    const r = def.footprint || 1.5;
    if (x < r * 0.6 || z < r * 0.6 || x > WIDTH - r * 0.6 || z > HEIGHT - r * 0.6) return { ok: false, reason: 'Out of bounds' };
    for (const p of this.paths) if (p.distanceTo(x, z) < PATH_WIDTH / 2 + r * 0.55) return { ok: false, reason: "Can't build on the road" };
    if (Math.hypot(x - this.base.x, z - this.base.z) < 4.5) return { ok: false, reason: 'Too close to the base' };
    for (const t of this.towers) {
      const min = (t.footprint + r) * 0.62;
      if ((t.x - x) ** 2 + (t.z - z) ** 2 < min * min) return { ok: false, reason: 'Too close to another tower' };
    }
    for (const o of this.layout.props) {
      if (!o.radius) continue;
      const min = o.radius + r * 0.45;
      if ((o.x - x) ** 2 + (o.z - z) ** 2 < min * min) return { ok: false, reason: 'Something is in the way' };
    }
    // Sentries, and spots where a Riveter is building one right now.
    const sMin = r * 0.55 + SENTRY_RADIUS;
    for (const s of this.sentries) if ((s.x - x) ** 2 + (s.z - z) ** 2 < sMin * sMin) return { ok: false, reason: 'A sentry is in the way' };
    for (const t of this.towers) {
      const b = t.buildSpot;
      if (b && (b.x - x) ** 2 + (b.z - z) ** 2 < sMin * sMin) return { ok: false, reason: 'A sentry is being built there' };
    }
    if (def.limit && this.countOf(type) >= def.limit) return { ok: false, reason: `Limit of ${def.limit} reached` };
    if (!this.canAfford(def.cost)) return { ok: false, reason: 'Not enough cash' };
    return { ok: true };
  }

  placeTower(type, x, z) {
    if (this.state !== 'playing' || !this.canPlace(type, x, z).ok) return null;
    const t = new Tower(this, type, x, z);
    this.cash -= t.def.cost;
    this.stats.spent += t.def.cost;
    this.towers.push(t);
    this.stats.built++;
    this.emit('towerPlaced', { tower: t });
    return t;
  }

  upgradeTower(t) {
    const u = t.nextUpgrade;
    if (!u || !this.canAfford(u.cost) || this.state !== 'playing') return false;
    try { computeStats(t.type, t.level + 1); } catch (err) { console.error(`Upgrade ${t.type} -> ${t.level + 1} is broken:`, err); return false; }
    this.cash -= u.cost;
    this.stats.spent += u.cost;
    t.spent += u.cost;
    t.level++;
    t.refresh();
    this.emit('towerUpgraded', { tower: t });
    return true;
  }

  sellTower(t) {
    const i = this.towers.indexOf(t);
    if (i < 0) return;
    this.towers.splice(i, 1);
    if (t.kills > 0) this.retired.push(t);
    for (const s of this.sentries.filter((s) => s.owner === t)) this.removeSentry(s, 'sold');
    this.addCash(t.sellValue, 'sell');
    this.emit('towerSold', { tower: t });
  }

  // ------------------------------------------------------------- waves ----
  get waveInProgress() { return this.waveOpen.size > 0; }

  startNextWave() {
    if (this.state !== 'playing' || this.wave >= this.maxWaves) return false;
    this.wave++;
    const w = this.wave;
    // Full refunds only last until the towers have seen a wave.
    for (const t of this.towers) t.refundable = false;
    const groups = getWave(w);
    let total = 0;
    for (const grp of groups) {
      const pathCount = this.paths.length;
      for (let i = 0; i < grp.count; i++) {
        const pathIndex = this.nextSpawnPath++ % pathCount;
        this.spawnQueue.push({ at: this.time + (grp.delay || 0) + i * grp.gap, type: grp.type, mods: grp.mods || [], wave: w, pathIndex });
        total++;
      }
    }
    this.spawnQueue.sort((a, b) => a.at - b.at);
    this.waveOpen.set(w, total);
    this.emit('waveStart', { wave: w, groups });
    return true;
  }

  spawnEnemy(type, { pathIndex = 0, dist = 0, mods = [], wave = this.wave, counted = false } = {}) {
    const hpScale = this.difficulty.hpMult * waveHpScale(wave);
    const e = new Enemy(this, type, { pathIndex, dist, mods, wave, hpScale });
    this.enemies.push(e);
    if (!counted && this.waveOpen.has(wave)) this.waveOpen.set(wave, this.waveOpen.get(wave) + 1);
    if (!this.seen.has(type)) { this.seen.add(type); this.emit('newEnemy', { type }); }
    this.emit('spawn', { enemy: e });
    return e;
  }

  resolveEnemy(e) {
    const n = this.waveOpen.get(e.wave);
    if (n === undefined) return;
    if (n <= 1) {
      this.waveOpen.delete(e.wave);
      this.completeWave(e.wave);
    } else this.waveOpen.set(e.wave, n - 1);
  }

  completeWave(w) {
    if (this.state !== 'playing') return;
    const bonus = Math.round(waveBonus(w) * this.difficulty.cashMult);
    this.addCash(bonus, 'wave');
    // Each depot pays a whole number of dollars, so the "+$" text over it is
    // exactly what lands in the bank.
    let income = 0;
    for (const t of this.towers) {
      if (!t.stats.income) continue;
      const amount = Math.round(t.stats.income * this.difficulty.cashMult);
      income += amount;
      this.emit('income', { tower: t, amount });
    }
    if (income) this.addCash(income, 'income');
    this.emit('waveEnd', { wave: w, bonus, income });
    if (this.wave >= this.maxWaves && this.waveOpen.size === 0 && this.spawnQueue.length === 0) {
      this.state = 'won';
      this.emit('gameOver', { won: true });
    } else if (this.autoStart && this.waveOpen.size === 0) this.autoTimer = 1.2;
  }

  killEnemy(e, source) {
    if (!e.alive) return;
    e.alive = false;
    this.stats.kills++;
    if (source) source.kills++;
    const reward = e.bounty * this.difficulty.cashMult;
    this.addCash(reward, 'kill');
    this.emit('kill', { enemy: e, source, reward });
    e.onDeath();
    this.resolveEnemy(e);
  }

  leakEnemy(e) {
    if (!e.alive) return;
    e.alive = false;
    e.leaked = true;
    this.stats.leaked++;
    this.lives = Math.max(0, this.lives - e.leak);
    this.emit('leak', { enemy: e, lives: this.lives });
    if (this.lives <= 0 && this.state === 'playing') {
      this.state = 'lost';
      this.emit('gameOver', { won: false });
      return;
    }
    this.resolveEnemy(e);
  }

  // ------------------------------------------------------------ sentries ---
  sentriesOf(t) { let n = 0; for (const s of this.sentries) if (s.owner === t) n++; return n; }

  addSentry(owner, x, z) {
    const s = new Sentry(this, owner, x, z);
    this.sentries.push(s);
    this.emit('sentrySpawn', { sentry: s });
    return s;
  }

  removeSentry(s, reason) {
    const i = this.sentries.indexOf(s);
    if (i < 0) return;
    s.alive = false;
    this.sentries.splice(i, 1);
    this.emit('sentryGone', { sentry: s, reason });
  }

  // -------------------------------------------------------- projectiles ---
  addProjectile(p) {
    p.id = (this._pid = (this._pid || 0) + 1);
    this.projectiles.push(p);
    this.emit('projectile', { p });
  }

  explode(x, z, radius, damage, { source = null, maxHits = 99, armorPierce = 0, hitFlying = false, bossMult = 1 } = {}) {
    const hits = [];
    const r2 = radius * radius;
    for (const e of this.enemies) {
      if (!e.alive || (e.flying && !hitFlying)) continue;
      const d = (e.x - x) ** 2 + (e.z - z) ** 2;
      if (d <= (radius + e.radius) ** 2) hits.push([d, e]);
    }
    hits.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < Math.min(maxHits, hits.length); i++) {
      const e = hits[i][1];
      e.damage(damage, { source, armorPierce, bossMult });
      if (source?.applyStatus) source.applyStatus(e);
    }
    this.emit('explode', { x, z, radius });
  }

  updateProjectiles(dt) {
    const list = this.projectiles;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      let done = false;
      if (p.kind === 'bolt') {
        p.x += p.vx * dt; p.z += p.vz * dt; p.life -= dt;
        const t = p.tower;
        const hr = 0.7 * p.size;
        for (const e of this.enemies) {
          if (p.hit.has(e) || !t.canSee(e)) continue;
          const rr = hr + e.radius;
          if ((e.x - p.x) ** 2 + (e.z - p.z) ** 2 > rr * rr) continue;
          p.hit.add(e);
          t.applyHit(e, p.damage);
          this.emit('boltHit', { p, enemy: e });
          if (--p.pierce <= 0) { done = true; break; }
        }
        if (p.life <= 0 || p.x < -5 || p.z < -5 || p.x > WIDTH + 5 || p.z > HEIGHT + 5) done = true;
      } else if (p.kind === 'grenade') {
        p.t += dt;
        const k = Math.min(1, p.t / p.duration);
        p.x = p.sx + (p.tx - p.sx) * k;
        p.z = p.sz + (p.tz - p.sz) * k;
        p.y = 1.6 + Math.sin(k * Math.PI) * (2 + p.duration * 3);
        if (k >= 1) {
          done = true;
          const s = p.tower.stats;
          const o = { source: p.tower, maxHits: s.maxHits, armorPierce: s.armorPierce, bossMult: s.bossMult, hitFlying: s.detectFlying };
          this.explode(p.tx, p.tz, s.splashRadius, p.damage, o);
          if (s.cluster) {
            for (let c = 0; c < s.cluster; c++) {
              const a = (c / s.cluster) * Math.PI * 2 + this.rng();
              const cx = p.tx + Math.cos(a) * s.splashRadius * 0.9, cz = p.tz + Math.sin(a) * s.splashRadius * 0.9;
              this.later(0.2 + c * 0.06, () => this.explode(cx, cz, s.splashRadius * 0.6, p.damage * 0.5, o));
            }
          }
        }
      }
      if (done) { list.splice(i, 1); this.emit('projectileEnd', { p }); }
    }
  }

  // ------------------------------------------------------------- update ---
  computeBuffs() {
    for (const t of this.towers) { const b = t.buff; b.cooldownMult = 1; b.rangeMult = 1; b.grantHidden = false; b.rally = false; }
    for (const src of this.towers) {
      const aura = src.stats.aura;
      const rally = src.abilityActive > 0 && src.stats.ability === 'rally';
      if ((!aura && !rally) || src.stunTimer > 0) continue;
      const r = src.stats.range;
      for (const t of this.towers) {
        if (t === src) continue;
        if ((t.x - src.x) ** 2 + (t.z - src.z) ** 2 > r * r) continue;
        if (aura) applyAura(t.buff, aura, t.stats);
        if (rally) t.buff.rally = true;
      }
    }
  }

  /** The aura buffs a tower of this type would get if placed at x, z (for the placement preview). */
  previewBuff(type, x, z) {
    const buff = { cooldownMult: 1, rangeMult: 1, grantHidden: false, rally: false };
    const stats = computeStats(type, 0).stats;
    for (const src of this.towers) {
      const aura = src.stats.aura;
      if (!aura || src.stunTimer > 0) continue;
      const r = src.stats.range;
      if ((x - src.x) ** 2 + (z - src.z) ** 2 > r * r) continue;
      applyAura(buff, aura, stats);
    }
    return buff;
  }

  computeHaste() {
    for (const e of this.enemies) e.hasteMult = 1;
    for (const s of this.enemies) {
      if (!s.alive || !s.def.abilities) continue;
      for (const a of s.def.abilities) {
        if (a.type !== 'haste') continue;
        const r2 = a.radius * a.radius;
        for (const e of this.enemies) {
          if (e === s || e.boss) continue;
          if ((e.x - s.x) ** 2 + (e.z - s.z) ** 2 <= r2) e.hasteMult = Math.max(e.hasteMult, a.mult);
        }
      }
    }
  }

  update(dt) {
    if (this.state !== 'playing') return;
    this.time += dt;

    if (this.autoTimer > 0) { this.autoTimer -= dt; if (this.autoTimer <= 0) this.startNextWave(); }

    // Spawns
    while (this.spawnQueue.length && this.spawnQueue[0].at <= this.time) {
      const s = this.spawnQueue.shift();
      this.spawnEnemy(s.type, { pathIndex: s.pathIndex, mods: s.mods, wave: s.wave, counted: true });
    }

    // Delayed effects
    if (this.timers.length) {
      const due = this.timers.filter((t) => t.at <= this.time);
      if (due.length) { this.timers = this.timers.filter((t) => t.at > this.time); for (const t of due) t.fn(); }
    }

    for (const e of this.enemies) e.savePrev();
    for (const p of this.projectiles) { p.px = p.x; p.pz = p.z; p.py = p.y; }

    this.computeHaste();
    for (const e of this.enemies) if (e.alive) e.update(dt);
    this.computeBuffs();
    for (const t of this.towers) t.update(dt);
    for (const s of this.sentries.slice()) s.update(dt);
    this.updateProjectiles(dt);

    // Compact dead enemies (renderer keeps its own references for death anims).
    if (this.enemies.some((e) => !e.alive)) this.enemies = this.enemies.filter((e) => e.alive);
  }

  // -------------------------------------------------------- save / load ---
  /** True between waves, when the game can be saved and resumed exactly. */
  get canSave() {
    return this.state === 'playing' && !this.waveInProgress && this.spawnQueue.length === 0 && this.enemies.length === 0;
  }

  /** Plain-data snapshot of a game between waves (see canSave). */
  serialize() {
    const towers = this.towers;
    return {
      v: SAVE_VERSION,
      mapId: this.mapId, difficulty: this.difficultyId,
      wave: this.wave, cash: this.cash, cashFrac: this.cashFrac, lives: this.lives,
      autoStart: this.autoStart, nextSpawnPath: this.nextSpawnPath,
      seen: [...this.seen], stats: { ...this.stats },
      towers: towers.map((t) => ({
        type: t.type, x: t.x, z: t.z, level: t.level, spent: t.spent, refundable: t.refundable, targeting: t.targeting,
        kills: t.kills, damageDealt: t.damageDealt, abilityTimer: t.abilityTimer, scrap: t.scrap, angle: t.angle,
      })),
      retired: this.retired.map((t) => ({ type: t.type, level: t.level, kills: t.kills })),
      sentries: this.sentries.map((s) => ({ owner: towers.indexOf(s.owner), x: s.x, z: s.z, hp: s.hp, stats: s.stats, tier: s.tier })),
      savedAt: Date.now(),
    };
  }

  /** Rebuilds a game from serialize() output. Returns null if the data is unusable. */
  static fromSave(data, { seed = 1 } = {}) {
    if (!data || data.v !== SAVE_VERSION || !MAPS[data.mapId] || !DIFFICULTIES[data.difficulty]) return null;
    const g = new Game({ mapId: data.mapId, difficulty: data.difficulty, seed });
    g.wave = data.wave; g.cash = data.cash; g.cashFrac = data.cashFrac || 0; g.lives = data.lives;
    g.autoStart = !!data.autoStart; g.nextSpawnPath = data.nextSpawnPath || 0;
    g.seen = new Set(data.seen || []);
    Object.assign(g.stats, data.stats || {});
    for (const d of data.towers || []) {
      if (!TOWERS[d.type]) continue;
      const t = new Tower(g, d.type, d.x, d.z);
      t.level = Math.min(d.level || 0, t.maxLevel);
      t.refresh();
      Object.assign(t, {
        spent: d.spent, refundable: !!d.refundable, targeting: d.targeting || t.targeting, kills: d.kills || 0,
        damageDealt: d.damageDealt || 0, abilityTimer: d.abilityTimer || 0, scrap: d.scrap || 0, angle: d.angle ?? t.angle,
      });
      g.towers.push(t);
    }
    g.retired = (data.retired || []).filter((r) => TOWERS[r.type]).map((r) => ({ ...r, def: TOWERS[r.type] }));
    for (const d of data.sentries || []) {
      const owner = g.towers[d.owner];
      if (!owner || !d.stats) continue;
      const s = new Sentry(g, owner, d.x, d.z);
      s.stats = { ...d.stats }; s.tier = d.tier ?? owner.level;
      s.maxHp = s.stats.health; s.hp = Math.min(d.hp, s.maxHp);
      s.drain = s.stats.health / Math.max(1, s.stats.lifespan);
      g.sentries.push(s);
    }
    return g;
  }
}

const SAVE_VERSION = 1;

/** Applies one aura to a tower's buff. Aura towers don't take range from other auras (their ring is their aura). */
function applyAura(buff, aura, stats) {
  if (aura.cooldownMult !== undefined) buff.cooldownMult = Math.min(buff.cooldownMult, Math.max(0.2, aura.cooldownMult));
  if (aura.rangeMult !== undefined && !stats.aura) buff.rangeMult = Math.max(buff.rangeMult, aura.rangeMult);
  if (aura.grantHidden) buff.grantHidden = true;
}
