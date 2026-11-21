// Lists of everything the engine understands, plus a validator that catches
// typos in towers.js / enemies.js / waves.js. Runs in the browser at startup
// (warnings in the console) and via `npm run check`.
import { TOWERS, STAT_DEFAULTS } from './towers.js';
import { ENEMIES, MODIFIERS } from './enemies.js';
import { getWave, DIFFICULTIES } from './waves.js';

export const ATTACKS = {
  hitscan: 'Instant shot at one target. Use burst/burstDelay for bursts.',
  spinup: 'Hitscan that speeds up while firing (spinUp = seconds to full speed).',
  spread: 'Shotgun: `pellets` hits spread inside `spreadAngle` degrees.',
  pierce: 'Fires a bolt that travels and hits up to `pierce` zombies in a line.',
  splash: 'Lobbed grenade: `splashRadius`, `maxHits`, optional `cluster` bomblets.',
  flame: 'Cone of fire every tick: `coneAngle`, `maxHits`, burnDamage/burnDuration.',
  chain: 'Lightning that jumps `chains` times within `chainRange`, × chainFalloff each jump.',
  none: 'No attack (economy / pure support).',
};

export const WEAPONS = ['rifle', 'rifle_scoped', 'sniper', 'drill', 'drill_big', 'shotgun', 'shotgun_auto', 'launcher', 'launcher_drum', 'flamer', 'minigun', 'minigun_twin', 'tesla', 'pistol', 'clipboard', 'sword', 'sword_bright', 'hammer'];
export const HATS = ['none', 'cap', 'helmet', 'beret', 'boonie', 'officer', 'welder', 'bandana'];
export const HAIR = ['none', 'short', 'ponytail', 'long'];
export const FACES = ['smirk', 'angry', 'smile', 'grin', 'determined', 'none'];
export const LOOK_KEYS = ['skin', 'shirt', 'pants', 'shoes', 'sleeves', 'gloves', 'face', 'facePaint', 'hat', 'hatColor', 'hair', 'hairColor',
  'vest', 'pouches', 'belt', 'buckles', 'kneepads', 'legStraps', 'bandolier', 'backpack', 'tank', 'medals', 'radio', 'cape', 'ghillie',
  'goggles', 'sunglasses', 'weapon', 'crates', 'scale'];
export const ENEMY_BODIES = ['walker', 'runner', 'crawler', 'bloater', 'brute', 'heavy', 'abomination', 'knight', 'warlock', 'flyer'];
export const ENEMY_ABILITIES = ['spit', 'haste', 'heal', 'summon', 'slam', 'enrage', 'deathSpawn'];
const STAT_EXTRA = ['flameColor'];
const UPGRADE_KEYS = ['name', 'cost', 'desc', 'set', 'add', 'mul', 'look'];
const TOWER_KEYS = ['name', 'role', 'description', 'cost', 'footprint', 'limit', 'look', 'stats', 'upgrades'];
const ROLES = ['Damage', 'Splash', 'Support', 'Economy'];

export function validateContent() {
  const errors = [];
  const err = (where, msg) => errors.push(`${where}: ${msg}`);
  const statKeys = new Set([...Object.keys(STAT_DEFAULTS), ...STAT_EXTRA]);

  for (const [id, t] of Object.entries(TOWERS)) {
    const w = `towers.${id}`;
    for (const k of Object.keys(t)) if (!TOWER_KEYS.includes(k)) err(w, `unknown field "${k}"`);
    if (!t.name) err(w, 'missing name');
    if (typeof t.cost !== 'number' || t.cost <= 0) err(w, 'cost must be a positive number');
    if (!ROLES.includes(t.role)) err(w, `role should be one of ${ROLES.join(', ')}`);
    if (!t.stats) { err(w, 'missing stats'); continue; }
    if (!ATTACKS[t.stats.attack || 'hitscan']) err(w, `unknown attack "${t.stats.attack}" (known: ${Object.keys(ATTACKS).join(', ')})`);
    for (const k of Object.keys(t.stats)) if (!statKeys.has(k)) err(`${w}.stats`, `unknown stat "${k}"`);
    checkLook(t.look || {}, `${w}.look`, err);
    (t.upgrades || []).forEach((u, i) => {
      const uw = `${w}.upgrades[${i}]`;
      for (const k of Object.keys(u)) if (!UPGRADE_KEYS.includes(k)) err(uw, `unknown field "${k}"`);
      if (!u.name) err(uw, 'missing name');
      if (typeof u.cost !== 'number' || u.cost <= 0) err(uw, 'cost must be a positive number');
      for (const part of ['set', 'add', 'mul']) for (const k of Object.keys(u[part] || {})) if (!statKeys.has(k)) err(`${uw}.${part}`, `unknown stat "${k}"`);
      if (u.set?.attack && !ATTACKS[u.set.attack]) err(uw, `unknown attack "${u.set.attack}"`);
      if (u.look) checkLook(u.look, `${uw}.look`, err);
    });
  }

  for (const [id, e] of Object.entries(ENEMIES)) {
    const w = `enemies.${id}`;
    for (const k of ['hp', 'speed', 'bounty', 'threat']) if (typeof e[k] !== 'number') err(w, `missing number "${k}"`);
    if (!ENEMY_BODIES.includes(e.look?.body)) err(w, `look.body should be one of ${ENEMY_BODIES.join(', ')}`);
    for (const a of e.abilities || []) {
      if (!ENEMY_ABILITIES.includes(a.type)) err(w, `unknown ability "${a.type}"`);
      for (const ref of [a.enemy, ...(a.enemies || [])].filter(Boolean)) if (!ENEMIES[ref]) err(w, `ability references unknown enemy "${ref}"`);
    }
  }

  const maxW = Math.max(...Object.values(DIFFICULTIES).map((d) => d.waves));
  for (let w = 1; w <= maxW; w++) {
    for (const g of getWave(w)) {
      if (!ENEMIES[g.type]) err(`waves[${w}]`, `unknown enemy "${g.type}"`);
      for (const m of g.mods || []) if (!MODIFIERS[m]) err(`waves[${w}]`, `unknown modifier "${m}"`);
    }
  }
  return errors;
}

function checkLook(look, where, err) {
  for (const k of Object.keys(look)) if (!LOOK_KEYS.includes(k)) err(where, `unknown look field "${k}"`);
  if (look.weapon && !WEAPONS.includes(look.weapon)) err(where, `unknown weapon "${look.weapon}" (known: ${WEAPONS.join(', ')})`);
  if (look.hat && !HATS.includes(look.hat)) err(where, `unknown hat "${look.hat}" (known: ${HATS.join(', ')})`);
  if (look.hair && !HAIR.includes(look.hair)) err(where, `unknown hair "${look.hair}"`);
  if (look.face && !FACES.includes(look.face)) err(where, `unknown face "${look.face}"`);
}
