// ============================================================================
// WAVES & DIFFICULTY
//
// A wave is a list of spawn groups:
//   { type: 'shambler', count: 10, gap: 0.6, delay: 0, mods: ['fortified'] }
//     gap   = seconds between each zombie in the group
//     delay = seconds after the wave starts before the group begins
//
// Waves 1-12 are hand-written (they teach each zombie). After that a seeded
// generator builds waves from a "threat budget", so every run is identical.
// Boss waves are always hand-written.
// ============================================================================

import { ENEMIES } from './enemies.js';
import { mulberry32 } from '../game/rng.js';

export const DIFFICULTIES = {
  easy:   { name: 'Easy',   waves: 30, startCash: 650, lives: 150, hpMult: 1.0,  cashMult: 1.1, color: '#5ccf4a' },
  medium: { name: 'Medium', waves: 40, startCash: 650, lives: 100, hpMult: 1.2,  cashMult: 1.0, color: '#f2b233' },
  hard:   { name: 'Hard',   waves: 50, startCash: 650, lives: 50,  hpMult: 1.45, cashMult: 0.9, color: '#e8483a' },
};
export const DIFFICULTY_ORDER = Object.keys(DIFFICULTIES);

/** Cash paid when a wave is cleared. */
export const waveBonus = (w) => 100 + 10 * w;

/** Extra HP multiplier for late waves (on top of the difficulty multiplier). */
export const waveHpScale = (w) => 1 + Math.max(0, w - 25) * 0.06;

const g = (type, count, gap, delay = 0, mods) => ({ type, count, gap, delay, ...(mods ? { mods } : {}) });

const AUTHORED = {
  1: [g('shambler', 8, 1.1)],
  2: [g('shambler', 14, 0.8)],
  3: [g('shambler', 10, 0.8), g('runner', 4, 0.9, 6)],
  4: [g('runner', 10, 0.6), g('shambler', 12, 0.6, 3)],
  5: [g('shambler', 20, 0.45), g('crawler', 10, 0.35, 4)],
  6: [g('runner', 16, 0.45), g('shambler', 16, 0.5, 2), g('crawler', 8, 0.4, 8)],
  7: [g('bloater', 3, 2.5), g('shambler', 18, 0.45, 1)],
  8: [g('runner', 22, 0.35), g('bloater', 4, 2, 4)],
  9: [g('hazmat', 6, 1.2), g('shambler', 24, 0.35, 2), g('runner', 10, 0.4, 8)],
  10: [g('bloater', 6, 1.4), g('runner', 20, 0.3, 3), g('hazmat', 8, 0.9, 6)],
  11: [g('shade', 6, 1.1), g('shambler', 26, 0.3, 2), g('runner', 12, 0.35, 7)],
  12: [g('brute', 2, 4), g('shambler', 30, 0.28), g('shade', 6, 0.8, 6), g('bloater', 4, 1.6, 9)],
};

const BOSS_WAVES = {
  15: [g('abomination', 1, 1, 2), g('shambler', 30, 0.3), g('runner', 15, 0.35, 5)],
  25: [g('abomination', 2, 8, 2), g('riot', 12, 0.7), g('brute', 6, 1.5, 6)],
  30: [g('necropriest', 1, 1, 3), g('brute', 8, 1.2), g('surgeon', 6, 1.4, 5), g('shade', 14, 0.5, 8)],
  35: [g('necropriest', 1, 1, 2), g('abomination', 2, 6, 10), g('juggernaut', 4, 3, 4), g('carrion', 16, 0.5, 6)],
  40: [g('colossus', 1, 1, 6), g('juggernaut', 6, 2.5), g('screamer', 10, 0.9, 4), g('brute', 12, 0.9, 8, ['fortified'])],
  45: [g('necropriest', 2, 10, 2), g('revenant', 6, 2.5, 6), g('juggernaut', 10, 1.6, 4, ['fortified']), g('carrion', 24, 0.4, 3, ['swift'])],
  50: [g('colossus', 1, 1, 8), g('necropriest', 2, 12, 2), g('revenant', 10, 1.8, 0, ['fortified']), g('surgeon', 10, 1, 6, ['fortified']), g('shade', 30, 0.3, 4, ['swift'])],
};

// When each zombie can start appearing in generated waves.
const UNLOCK = {
  shambler: 1, runner: 3, crawler: 5, bloater: 7, hazmat: 9, shade: 11, brute: 12,
  riot: 13, spitter: 15, screamer: 17, surgeon: 19, carrion: 21, juggernaut: 26, revenant: 32,
};

function generated(w) {
  const rng = mulberry32(9001 + w * 7919);
  const budget = 0.62 * w * w + 20;
  const pool = Object.keys(UNLOCK).filter((t) => UNLOCK[t] <= w);
  // Newer / tougher zombies get more weight as waves go on.
  const weight = (t) => {
    const age = w - UNLOCK[t];
    const tough = ENEMIES[t].threat;
    return (age < 6 ? 2.2 : 1) * (w > 22 && tough < 2 ? 0.35 : 1) * (w > 30 && tough < 4 ? 0.5 : 1);
  };
  const pick = () => {
    const total = pool.reduce((s, t) => s + weight(t), 0);
    let r = rng() * total;
    for (const t of pool) { r -= weight(t); if (r <= 0) return t; }
    return pool[pool.length - 1];
  };
  const groups = [];
  const nGroups = 2 + Math.floor(rng() * (w > 20 ? 3 : 2));
  const used = new Set();
  let delay = 0;
  for (let i = 0; i < nGroups; i++) {
    let t = pick();
    for (let k = 0; k < 4 && used.has(t); k++) t = pick();
    used.add(t);
    const share = budget / nGroups * (0.7 + rng() * 0.6);
    const def = ENEMIES[t];
    const count = Math.max(1, Math.min(70, Math.round(share / def.threat)));
    const baseGap = def.threat >= 10 ? 2.2 : def.threat >= 4 ? 0.9 : 0.42;
    const gap = Math.max(def.threat >= 10 ? 0.9 : 0.16, baseGap * (1 - Math.min(0.6, w / 80)));
    const mods = [];
    if (w >= 20 && rng() < Math.min(0.5, (w - 18) * 0.03)) mods.push('fortified');
    if (w >= 24 && def.speed < 4 && rng() < 0.2) mods.push('swift');
    groups.push(g(t, count, +gap.toFixed(2), +delay.toFixed(1), mods.length ? mods : undefined));
    delay += Math.min(10, count * gap * (0.35 + rng() * 0.3));
  }
  return groups;
}

const cache = new Map();
/** Spawn groups for wave `w` (1-based). */
export function getWave(w) {
  if (!cache.has(w)) cache.set(w, AUTHORED[w] || BOSS_WAVES[w] || generated(w));
  return cache.get(w);
}

export function isBossWave(w) { return !!BOSS_WAVES[w]; }
