// Headless balance simulator. Plays the game with a simple greedy bot and
// reports how far it gets.  Usage:
//   node tools/sim.mjs                 -> every map x difficulty
//   node tools/sim.mjs maple medium    -> one run, wave-by-wave log
import { Game } from '../src/game/game.js';
import { TOWERS } from '../src/config/towers.js';
import { computeStats } from '../src/game/tower.js';
import { MAP_ORDER } from '../src/config/maps.js';
import { DIFFICULTY_ORDER } from '../src/config/waves.js';

const DT = 1 / 30;

function pathSamples(game) {
  const pts = [];
  for (const p of game.paths) for (let d = 0; d < p.length; d += 1) { const q = p.at(d); pts.push([q.x, q.z]); }
  return pts;
}

function coverage(samples, x, z, r) {
  let n = 0; const r2 = r * r;
  for (const [px, pz] of samples) if ((px - x) ** 2 + (pz - z) ** 2 <= r2) n++;
  return n;
}

function value(type, level, x, z, samples) {
  const { stats: s } = computeStats(type, level);
  if (s.attack === 'none') return 0;
  let per = s.damage * (s.attack === 'spread' ? Math.min(s.pellets, 4) : 1);
  if (s.attack === 'pierce') per *= Math.min(s.pierce, 6) * 0.6;
  if (s.attack === 'splash') per *= Math.min(s.maxHits, 6) * (s.cluster ? 1.8 : 1);
  if (s.attack === 'flame') per = (s.damage + s.burnDamage * 0.5) * Math.min(s.maxHits, 4);
  if (s.attack === 'chain') per *= Math.min(s.chains + 1, 5) * 0.8;
  const cd = s.burst > 1 ? (s.cooldown + s.burstDelay * (s.burst - 1)) / s.burst : s.cooldown;
  const dps = per / cd * (1 + s.armorPierce * 0.4) * (s.detectHidden ? 1.15 : 1);
  return dps * Math.sqrt(coverage(samples, x, z, s.range));
}

export function runBot(mapId, diff, { log = false } = {}) {
  const game = new Game({ mapId, difficulty: diff, seed: 42 });
  const samples = pathSamples(game);
  const spots = [];
  for (let x = 1.5; x < 63; x += 1.5) for (let z = 1.5; z < 39; z += 1.5) spots.push([x, z]);
  const hasHidden = () => game.towers.some((t) => t.stats.detectHidden || t.buff.grantHidden);
  const hasFlying = () => game.towers.some((t) => t.stats.detectFlying);
  const best = (type) => {
    let b = null, bv = 0;
    for (const [x, z] of spots) {
      if (!game.canPlace(type, x, z).ok) continue;
      const v = TOWERS[type].stats.attack === 'none' ? 1 + Math.random() : value(type, 0, x, z, samples);
      if (v > bv) { bv = v; b = [x, z]; }
    }
    return b ? { x: b[0], z: b[1], v: bv } : null;
  };

  const spend = () => {
    for (let guard = 0; guard < 30; guard++) {
      // Requirements first.
      if (game.wave >= 9 && !hasHidden()) {
        const r = game.towers.find((t) => t.type === 'rifleman' && t.level < 2);
        if (r) { if (!game.upgradeTower(r)) return; continue; }
      }
      if (game.wave >= 19 && !hasFlying()) {
        const t = game.towers.find((t) => t.type === 'tesla' && t.level < 3);
        if (t) { if (!game.upgradeTower(t)) return; continue; }
        const p = best('tesla'); if (p && game.placeTower('tesla', p.x, p.z)) continue; return;
      }
      if (game.wave >= 3 && game.wave <= 22 && game.countOf('depot') < Math.min(4, Math.floor(game.wave / 4))) {
        const p = best('depot'); if (p && game.placeTower('depot', p.x, p.z)) continue;
        if (game.cash < TOWERS.depot.cost) return;
      }
      const opts = [];
      for (const type of Object.keys(TOWERS)) {
        if (type === 'depot' || type === 'officer') continue;
        if (game.cash < TOWERS[type].cost) continue;
        const p = best(type); if (p) opts.push({ kind: 'place', type, p, score: p.v / TOWERS[type].cost });
      }
      for (const t of game.towers) {
        const u = t.nextUpgrade; if (!u || game.cash < u.cost) continue;
        if (t.type === 'depot') { if (game.wave < 25) opts.push({ kind: 'up', t, score: 0.05 }); continue; }
        const gain = value(t.type, t.level + 1, t.x, t.z, samples) - value(t.type, t.level, t.x, t.z, samples);
        opts.push({ kind: 'up', t, score: gain / u.cost * 1.1 });
      }
      if (!opts.length) return;
      opts.sort((a, b) => b.score - a.score);
      const o = opts[0];
      if (o.kind === 'place') game.placeTower(o.type, o.p.x, o.p.z); else game.upgradeTower(o.t);
    }
  };

  let lastWave = 0;
  game.on('waveEnd', ({ wave }) => {
    if (log) console.log(`wave ${String(wave).padStart(2)}  lives ${String(game.lives).padStart(3)}  cash ${Math.floor(game.cash).toString().padStart(6)}  towers ${game.towers.map((t) => t.type[0] + t.level).join(' ')}`);
  });
  spend();
  game.startNextWave();
  let guard = 0;
  while (game.state === 'playing' && guard++ < 2_000_000) {
    game.update(DT);
    if (Math.floor(game.time * 2) !== lastWave) { lastWave = Math.floor(game.time * 2); spend(); }
    if (!game.waveInProgress && game.state === 'playing') { spend(); game.startNextWave(); }
  }
  return { state: game.state, wave: game.wave, lives: game.lives, max: game.maxWaves, towers: game.towers.length, time: game.time };
}

const [, , mapArg, diffArg] = process.argv;
if (mapArg) {
  const r = runBot(mapArg, diffArg || 'easy', { log: true });
  console.log(r);
} else {
  for (const m of MAP_ORDER) for (const d of DIFFICULTY_ORDER) {
    const r = runBot(m, d);
    console.log(`${m.padEnd(11)} ${d.padEnd(7)} ${r.state.padEnd(5)} wave ${r.wave}/${r.max} lives ${r.lives}`);
  }
}
