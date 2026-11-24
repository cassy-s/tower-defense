// Simulation benchmark + fingerprint. Pure logic: runs in Node (`npm run bench`)
// and in the browser (/tests/bench.html).
//
// fingerprint(): plays seeded games start to finish and hashes the end state
// (every tower's damage and kills, cash, lives, wave, time...). The simulation
// is deterministic, so a pure optimisation must leave every fingerprint
// unchanged. Record them before a refactor, compare after.
//
// bench(): times Game.update() with a crowded late-game field.
import { Game } from '../src/game/game.js';
import { TOWERS } from '../src/config/towers.js';

const TYPES = Object.keys(TOWERS);
const STEP = 1 / 60;

/** Tiny seeded RNG for tower placement (separate from the game's own). */
function rng(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

/** Place `count` towers near the road, cycling through every type, upgraded to `levels`. */
function build(g, count, levels, seed) {
  const r = rng(seed);
  let placed = 0;
  for (let i = 0; i < 6000 && placed < count; i++) {
    const path = g.paths[i % g.paths.length];
    const p = path.at(r() * path.length);
    const x = p.x + (r() - 0.5) * 14, z = p.z + (r() - 0.5) * 14;
    const type = TYPES[placed % TYPES.length];
    if (!g.canPlace(type, x, z).ok) continue;
    const t = g.placeTower(type, x, z);
    for (let k = 0; k < levels && t.nextUpgrade; k++) g.upgradeTower(t);
    t.targeting = ['first', 'last', 'strong', 'close'][placed % 4];
    placed++;
  }
  return placed;
}

/** FNV-1a over a string. */
function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export const SCENARIOS = [
  { mapId: 'maple', difficulty: 'easy', towers: 22, levels: 9, seed: 1 },
  { mapId: 'maple', difficulty: 'hard', towers: 6, levels: 2, seed: 2 },
  { mapId: 'quarantine', difficulty: 'medium', towers: 18, levels: 3, seed: 3 },
  { mapId: 'quarantine', difficulty: 'hard', towers: 30, levels: 9, seed: 4 },
  { mapId: 'hollow', difficulty: 'medium', towers: 4, levels: 1, seed: 5 },
  { mapId: 'hollow', difficulty: 'hard', towers: 26, levels: 4, seed: 6 },
];

/** Play one scenario to the end; returns { summary, hash }. */
export function play({ mapId, difficulty, towers, levels, seed }) {
  const g = new Game({ mapId, difficulty, seed, cashOverride: 1e9 });
  build(g, towers, levels, seed);
  let steps = 0;
  while (g.state === 'playing' && steps < 60 * 60 * 120) {
    if (!g.waveInProgress && g.spawnQueue.length === 0) g.startNextWave();
    g.update(STEP); steps++;
  }
  const state = [
    g.state, g.wave, g.lives, g.cash, g.cashFrac.toFixed(9), g.time.toFixed(6), JSON.stringify(g.stats),
    ...g.towers.map((t) => `${t.type}:${t.level}:${t.kills}:${t.damageDealt.toFixed(6)}:${t.scrap.toFixed(6)}`),
    g.sentries.length, g.enemies.length,
  ].join('|');
  return { summary: `${mapId}/${difficulty} ${g.state} wave ${g.wave} lives ${g.lives}`, hash: hash(state) };
}

export function fingerprint() { return SCENARIOS.map(play); }

/**
 * Time the simulation: 40 max-level towers, a late wave running, `frames`
 * steps. Returns milliseconds per step (median of `rounds`).
 */
export function bench({ frames = 1200, rounds = 3, now = () => performance.now() } = {}) {
  const times = [];
  let enemies = 0, sentries = 0;
  for (let r = 0; r < rounds; r++) {
    const g = new Game({ mapId: 'quarantine', difficulty: 'hard', seed: 9, cashOverride: 1e9 });
    build(g, 40, 9, 9);
    g.wave = 44; g.startNextWave(); g.autoStart = true;
    for (let i = 0; i < 600; i++) g.update(STEP); // let the field fill up
    const t0 = now();
    for (let i = 0; i < frames; i++) g.update(STEP);
    times.push((now() - t0) / frames);
    enemies = g.enemies.length; sentries = g.sentries.length;
  }
  times.sort((a, b) => a - b);
  return { msPerStep: +times[Math.floor(times.length / 2)].toFixed(4), enemiesAtEnd: enemies, sentriesAtEnd: sentries };
}
