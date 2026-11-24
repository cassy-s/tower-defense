// Simulation tests. Pure logic, no DOM: they run in Node (`npm test`, CI) and
// in the browser (open /tests/ with the dev server running).
import { Game } from '../src/game/game.js';
import { TOWERS } from '../src/config/towers.js';
import { computeStats } from '../src/game/tower.js';
import { sentryRing } from '../src/game/sentry.js';
import { validateContent } from '../src/config/schema.js';

export const tests = [];
const test = (name, fn) => tests.push({ name, fn });
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function eq(a, b, msg) { if (a !== b) throw new Error(`${msg || 'expected equal'}: got ${a}, expected ${b}`); }

const STEP = 1 / 60;
const run = (g, seconds) => { for (let i = 0; i < seconds * 60; i++) g.update(STEP); };
const newGame = (o = {}) => new Game({ mapId: 'maple', difficulty: 'easy', seed: 5, cashOverride: 1e6, ...o });
/** A free spot near (x, z) where `type` can be placed. */
function spotNear(g, type, x, z) {
  for (let r = 0; r < 12; r += 0.5) for (let a = 0; a < 6.28; a += 0.4) {
    const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
    if (g.canPlace(type, px, pz).ok) return [px, pz];
  }
  throw new Error(`no spot for ${type} near ${x},${z}`);
}
/** Spawn a zombie and park it at distance d (it won't move: we don't call update). */
function zombieAt(g, type, d, hp) {
  const e = g.spawnEnemy(type, { counted: true });
  e.dist = d; e.lane = 0; e.laneSeed = 0; e.updatePosition();
  if (hp !== undefined) e.hp = e.maxHp = hp;
  return e;
}

// ------------------------------------------------------------- content ---
test('content validates', () => { const p = validateContent(); eq(p.length, 0, p.join('; ')); });

// ----------------------------------------------------------- targeting ---
test('targeting modes pick the right zombie', () => {
  const g = newGame();
  const a = zombieAt(g, 'shambler', 30, 5);   // behind
  const b = zombieAt(g, 'shambler', 34, 50);  // ahead, strong
  const p = g.paths[0].at(32);
  const [x, z] = spotNear(g, 'rifleman', p.x, p.z + 3);
  const t = g.placeTower('rifleman', x, z);
  t.targeting = 'first'; eq(t.findTarget(), b, 'first');
  t.targeting = 'last'; eq(t.findTarget(), a, 'last');
  t.targeting = 'strong'; eq(t.findTarget(), b, 'strong');
});

// --------------------------------------------------------------- waves ---
test('a wave completes, pays its bonus, and the game can be won', () => {
  const g = newGame({ cashOverride: 0 });
  g.maxWaves = 1;
  let ended = 0, over = null;
  g.on('waveEnd', () => ended++);
  g.on('gameOver', ({ won }) => { over = won; });
  g.startNextWave();
  for (let i = 0; i < 60 * 60 && g.state === 'playing'; i++) { for (const e of g.enemies) g.killEnemy(e, null); g.update(STEP); }
  eq(ended, 1, 'waveEnd count');
  eq(over, true, 'won');
  assert(g.cash > 0, 'wave bonus paid');
});

test('leaking every life loses the game', () => {
  const g = newGame();
  g.lives = 1;
  let over = null;
  g.on('gameOver', ({ won }) => { over = won; });
  g.startNextWave();
  run(g, 120);
  eq(over, false, 'lost');
  eq(g.state, 'lost');
});

// --------------------------------------------------------- review bugs ---
test('zombies do not teleport at road corners (2.1)', () => {
  for (const mapId of ['maple', 'quarantine', 'hollow']) {
    const g = new Game({ mapId, seed: 3 });
    for (let k = 0; k < 30; k++) {
      const e = g.spawnEnemy('shambler', { counted: true, pathIndex: k % g.paths.length });
      const step = e.speed * STEP;
      let px = e.x, pz = e.z;
      while (e.dist < e.path.length - 0.1) {
        e.dist += step; e.updatePosition();
        const j = Math.hypot(e.x - px, e.z - pz);
        assert(j < step * 2.5, `${mapId}: moved ${j.toFixed(3)} in one step (normal ${step.toFixed(3)})`);
        px = e.x; pz = e.z;
      }
    }
  }
});

test('towers cannot be placed on sentries or on a sentry being built (2.2)', () => {
  const g = newGame();
  const p = g.paths[0].at(40);
  const [x, z] = spotNear(g, 'riveter', p.x, p.z + 4);
  const r = g.placeTower('riveter', x, z);
  const spot = { x: x + 2.6, z };
  const s = g.addSentry(r, spot.x, spot.z);
  assert(!g.canPlace('gatling', s.x, s.z).ok, 'placed on a sentry');
  g.removeSentry(s);
  r.buildSpot = spot;
  assert(!g.canPlace('gatling', spot.x, spot.z).ok, 'placed on a sentry being built');
});

test('a sentry is not built inside a tower placed during the build (2.2)', () => {
  const g = newGame();
  const p = g.paths[0].at(40);
  const [x, z] = spotNear(g, 'riveter', p.x, p.z + 4);
  const r = g.placeTower('riveter', x, z);
  r.buildSpot = { x: x + 2.6, z }; r.buildTimer = 0.05;
  g.towers.push({ x: x + 2.6, z, footprint: 1.5, stats: {}, buildSpot: null }); // a tower snuck in
  r.updateBuilder(0.1);
  eq(g.sentries.length, 0, 'sentry built inside a tower');
});

test('Scattergunner pellets skip dead zombies (2.3)', () => {
  const g = newGame();
  const p = g.paths[0].at(30);
  const [x, z] = spotNear(g, 'scatter', p.x, p.z + 3);
  const t = g.placeTower('scatter', x, z);
  while (t.nextUpgrade) g.upgradeTower(t);
  t.stats.burnDamage = 0; // count pellet damage only
  const brute = zombieAt(g, 'brute', 30);
  const hp0 = brute.hp + brute.shield;
  zombieAt(g, 'crawler', 30.3, 4);
  t.fireSpread(brute);
  const dealt = hp0 - (brute.hp + brute.shield);
  const full = t.stats.pellets * t.stats.damage * (1 - brute.armor);
  assert(dealt >= full - t.stats.damage * 2, `brute took ${dealt}, expected about ${full}`);
});

test('fire-immune zombies do not use up the Flamer hit cap (2.4)', () => {
  const g = newGame();
  const p = g.paths[0].at(30);
  const [x, z] = spotNear(g, 'flamer', p.x, p.z + 3);
  const t = g.placeTower('flamer', x, z);
  const hazmats = [];
  for (let i = 0; i < t.stats.maxHits; i++) hazmats.push(zombieAt(g, 'hazmat', 30 + i * 0.1));
  const behind = zombieAt(g, 'shambler', 29, 1000);
  t.fireFlame(hazmats[0]);
  assert(behind.hp < 1000, 'zombie behind the Hazmats was shielded');
});

test('cash stays a whole number with multiplied bounties (2.6)', () => {
  const g = newGame({ cashOverride: 0 });
  assert(g.difficulty.cashMult !== 1, 'test needs a cash multiplier');
  for (let i = 0; i < 37; i++) { const e = zombieAt(g, 'shambler', 10); g.killEnemy(e, null); }
  assert(Number.isInteger(g.cash), `cash ${g.cash}`);
  assert(Number.isInteger(g.stats.earned), `earned ${g.stats.earned}`);
  // Nothing is lost to rounding: whole dollars + the saved-up fraction = exact total.
  const bounty = 37 * g.spawnEnemy('shambler').bounty * g.difficulty.cashMult;
  assert(Math.abs(g.cash + g.cashFrac - bounty) < 1e-6, `${g.cash} + ${g.cashFrac} != ${bounty}`);
});

test('depot income text matches the money received (1.7)', () => {
  const g = newGame({ cashOverride: 1000 });
  const p = g.paths[0].at(30);
  const [x, z] = spotNear(g, 'depot', p.x, p.z + 5);
  g.placeTower('depot', x, z);
  const before = g.cash;
  let shown = 0;
  g.on('income', ({ amount }) => { shown += amount; });
  g.on('waveEnd', ({ bonus }) => { shown += bonus; });
  g.completeWave(1);
  eq(g.cash - before, shown, 'income shown vs received');
});

test("an officer's ring is its aura (no range buff from other officers)", () => {
  const g = newGame();
  const p = g.paths[0].at(30);
  const [x1, z1] = spotNear(g, 'officer', p.x, p.z + 4);
  const a = g.placeTower('officer', x1, z1);
  const [x2, z2] = spotNear(g, 'officer', x1 + 3, z1);
  const b = g.placeTower('officer', x2, z2);
  for (const t of [a, b]) while (t.nextUpgrade) g.upgradeTower(t);
  g.computeBuffs();
  eq(a.range, a.stats.range, 'officer range buffed');
});

test('placement preview includes Field Officer range buffs (1.7)', () => {
  const g = newGame();
  const p = g.paths[0].at(30);
  const [x, z] = spotNear(g, 'officer', p.x, p.z + 4);
  const o = g.placeTower('officer', x, z);
  while (o.nextUpgrade) g.upgradeTower(o);
  const [tx, tz] = spotNear(g, 'rifleman', x + 3, z);
  assert(g.previewBuff('rifleman', tx, tz).rangeMult > 1, 'no range buff in preview');
});

test('the Riveter ring shows where sentries really go (2.6)', () => {
  for (let lvl = 0; lvl <= TOWERS.riveter.upgrades.length; lvl++) {
    const s = computeStats('riveter', lvl).stats;
    const { inner, outer } = sentryRing(s);
    assert(outer >= inner, `level ${lvl}: ring ${outer} inside ${inner}`);
  }
});

test('selling before the next wave refunds in full', () => {
  const g = newGame();
  const p = g.paths[0].at(30);
  const [x, z] = spotNear(g, 'rifleman', p.x, p.z + 4);
  const t = g.placeTower('rifleman', x, z);
  g.upgradeTower(t);
  eq(t.sellValue, t.spent, 'full refund before the wave');
  g.startNextWave();
  assert(t.sellValue < t.spent, 'refund after the wave starts');
});

test('the end-screen MVP counts sold towers (1.7)', () => {
  const g = newGame();
  const p = g.paths[0].at(30);
  const [x, z] = spotNear(g, 'rifleman', p.x, p.z + 4);
  const t = g.placeTower('rifleman', x, z);
  t.kills = 5;
  g.sellTower(t);
  assert(g.retired.includes(t), 'sold tower not kept');
});

test('ids are per game', () => {
  const a = newGame(), b = newGame();
  const e1 = a.spawnEnemy('shambler'), e2 = b.spawnEnemy('shambler');
  eq(e1.id, e2.id, 'ids shared across games');
});

// ---------------------------------------------------------- save/load ---
test('a game saved between waves resumes exactly', () => {
  const g = newGame({ cashOverride: 5000 });
  const p = g.paths[0].at(30);
  const [x, z] = spotNear(g, 'riveter', p.x, p.z + 4);
  const t = g.placeTower('riveter', x, z);
  g.upgradeTower(t); t.targeting = 'strong'; t.kills = 7;
  g.addSentry(t, x + 2.6, z);
  g.wave = 6; g.lives = 33;
  assert(g.canSave, 'should be saveable');
  const data = JSON.parse(JSON.stringify(g.serialize()));
  const r = Game.fromSave(data);
  eq(r.wave, 6); eq(r.lives, 33); eq(r.cash, g.cash);
  eq(r.towers.length, 1); eq(r.towers[0].level, 1); eq(r.towers[0].targeting, 'strong'); eq(r.towers[0].kills, 7);
  eq(r.towers[0].sellValue, t.sellValue, 'sell value');
  eq(r.sentries.length, 1); eq(r.sentries[0].owner, r.towers[0]);
  r.startNextWave(); eq(r.wave, 7);
});

test('a game is not saveable mid-wave', () => {
  const g = newGame();
  g.startNextWave();
  run(g, 3);
  assert(!g.canSave, 'saveable mid-wave');
});

test('every tower at every level fights without NaN', () => {
  for (const type of Object.keys(TOWERS)) {
    const g = newGame({ cashOverride: 1e7 });
    for (const [x, z] of [[10, 14], [20, 22], [34, 17], [40, 25]]) {
      const t = g.placeTower(type, x, z);
      if (t) while (t.nextUpgrade) g.upgradeTower(t);
    }
    g.wave = 10; g.startNextWave(); run(g, 20);
    assert(Number.isFinite(g.cash) && g.towers.every((t) => Number.isFinite(t.damageDealt) && Number.isFinite(t.dps)), `${type}: NaN`);
  }
});

/** Runs every test; returns { passed, failed: [{ name, error }] }. */
export async function runAll(log = console.log) {
  const failed = [];
  let passed = 0;
  for (const t of tests) {
    try { await t.fn(); passed++; log(`✓ ${t.name}`); }
    catch (err) { failed.push({ name: t.name, error: err }); log(`✗ ${t.name}\n    ${err.message}`); }
  }
  log(`\n${passed} passed, ${failed.length} failed`);
  return { passed, failed };
}
