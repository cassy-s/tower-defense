// ============================================================================
// ZOMBIES — every enemy is defined here as plain data.
//
//   hp        health            speed   studs / second
//   bounty    cash on kill      leak    lives lost if it reaches the base
//   armor     0..0.9 fraction of damage blocked (towers with armorPierce ignore it)
//   shield    extra HP pool shown as a blue bar, takes damage first
//   hidden    only towers with detectHidden can target it
//   flying    only towers with detectFlying can target it
//   immune    list of effects it ignores: 'burn', 'slow'
//   abilities see game/enemy.js for every ability type
//   look      how the 3D model is built (render/characters.js)
//   threat    used by the wave generator to budget waves
// ============================================================================

export const ENEMIES = {
  shambler: {
    name: 'Shambler', blurb: 'The classic. Slow, dumb, endless.',
    hp: 6, speed: 3.0, bounty: 2, leak: 1, threat: 1,
    look: { body: 'walker', cracks: true, skin: ['#5fa58a', '#68ad90', '#579c83', '#72b398'], shirt: ['#3f4146', '#46484e', '#3a3c40', '#5a4a3d', '#3d4a5a'], pants: ['#3a3c41', '#45474c', '#2f3136'] },
  },
  runner: {
    name: 'Runner', blurb: 'Fresh, fast, and furious.',
    hp: 5, speed: 5.8, bounty: 3, leak: 1, threat: 1.6,
    look: { body: 'runner', cracks: true, skin: ['#6f88aa', '#7891b2', '#6681a3'], shirt: ['#2f3136', '#33363c', '#3a3030'], pants: ['#2a2c30', '#34363b'] },
  },
  crawler: {
    name: 'Crawler', blurb: 'Lost its legs. Not its appetite.',
    hp: 4, speed: 4.2, bounty: 1, leak: 1, threat: 0.8,
    look: { body: 'crawler', cracks: true, skin: ['#5fa58a', '#6f88aa'], shirt: ['#3f4146', '#3a3c40'], pants: ['#333'] },
  },
  bloater: {
    name: 'Bloater', blurb: 'Bursts into Crawlers when killed.',
    hp: 32, speed: 2.2, bounty: 6, leak: 3, threat: 5,
    abilities: [{ type: 'deathSpawn', enemy: 'crawler', count: 4 }],
    look: { body: 'bloater', skin: ['#8fb35a', '#9cbc62'], shirt: ['#c9c0a0'], pants: ['#4a4a3a'], pustules: true },
  },
  riot: {
    name: 'Riot Zombie', blurb: 'Armored. Riot shield soaks the first hits.',
    hp: 26, speed: 2.6, bounty: 7, leak: 3, threat: 6, armor: 0.5, shield: 20,
    look: { body: 'walker', skin: ['#7a9a6e'], shirt: ['#23272e'], pants: ['#23272e'], riot: true },
  },
  hazmat: {
    name: 'Hazmat', blurb: 'Suit makes it immune to fire.',
    hp: 26, speed: 3.0, bounty: 5, leak: 2, threat: 4, immune: ['burn'],
    look: { body: 'walker', skin: ['#7fa36b'], shirt: ['#e2c22c'], pants: ['#e2c22c'], hazmat: true },
  },
  shade: {
    name: 'Shade', blurb: 'Hidden. Only towers that can see hidden zombies can hit it.',
    hp: 14, speed: 4.0, bounty: 4, leak: 2, threat: 3.5, hidden: true,
    look: { body: 'runner', skin: ['#4a5560'], shirt: ['#1d2026'], pants: ['#1d2026'], hood: true, glow: '#7fe0ff' },
  },
  spitter: {
    name: 'Spitter', blurb: 'Spits acid that stuns a nearby tower for 2 seconds.',
    hp: 22, speed: 2.7, bounty: 6, leak: 2, threat: 5,
    abilities: [{ type: 'spit', every: 6, range: 10, stun: 2 }],
    look: { body: 'walker', skin: ['#9cb84a'], shirt: ['#556b2f'], pants: ['#3a3a2a'], jaw: true, glow: '#c6ff3a' },
  },
  screamer: {
    name: 'Screamer', blurb: 'Its shriek makes nearby zombies 35% faster.',
    hp: 20, speed: 3.2, bounty: 6, leak: 2, threat: 5,
    abilities: [{ type: 'haste', radius: 6, mult: 1.35 }],
    look: { body: 'runner', skin: ['#b3b7a0'], shirt: ['#6a2b4a'], pants: ['#2b2b3a'], longHair: '#2a2a2a', screaming: true },
  },
  surgeon: {
    name: 'Surgeon', blurb: 'Patches up nearby zombies every few seconds.',
    hp: 34, speed: 2.6, bounty: 8, leak: 3, threat: 7,
    abilities: [{ type: 'heal', every: 3, radius: 6, pct: 0.12 }],
    look: { body: 'walker', skin: ['#a6b59a'], shirt: ['#e8e8e0'], pants: ['#6fa0a8'], surgeon: true },
  },
  carrion: {
    name: 'Carrion', blurb: 'Flying. Only towers that can hit flyers can shoot it.',
    hp: 16, speed: 4.8, bounty: 5, leak: 2, threat: 4, flying: true,
    look: { body: 'flyer', skin: ['#3a3a3a'], shirt: ['#5a2a2a'], pants: ['#222'], glow: '#ff4a3a' },
  },
  brute: {
    name: 'Brute', blurb: 'Huge and tough. Shrugs off small arms.',
    hp: 110, speed: 1.9, bounty: 15, leak: 6, threat: 14, armor: 0.15, size: 1.5,
    look: { body: 'brute', skin: ['#9fbf8a', '#a8c493'], shirt: ['#e07a2e'], pants: ['#d9702a'], stripes: '#f3e6d6', suspenders: '#22262c', shackles: true },
  },
  juggernaut: {
    name: 'Juggernaut', blurb: 'Chained up in steel plating. Very heavy armor.',
    hp: 420, speed: 1.6, bounty: 40, leak: 15, threat: 40, armor: 0.45, size: 1.8,
    abilities: [{ type: 'enrage', below: 0.4, mult: 1.5 }],
    look: { body: 'heavy', skin: ['#8a8d92'], shirt: ['#6e7176'], pants: ['#77797e'], plated: true, chains: true },
  },
  revenant: {
    name: 'Revenant', blurb: 'Undead knight in crystal-studded armor. Tough, armored, and steady.',
    hp: 900, speed: 1.8, bounty: 70, leak: 25, threat: 75, armor: 0.4, size: 1.6,
    abilities: [{ type: 'enrage', below: 0.35, mult: 1.4 }],
    look: { body: 'knight', skin: ['#15171c'], shirt: ['#2c3340'], pants: ['#262b35'], trim: '#5d6b80', crystal: '#4fe3ff', weapon: 'sword', fur: '#5a4334' },
  },

  // ---------------------------------------------------------------- bosses --
  abomination: {
    name: 'Abomination', blurb: 'BOSS. Stitched-together horror. Enrages at half health and bursts into Brutes.',
    hp: 1100, speed: 1.5, bounty: 150, leak: 50, threat: 120, armor: 0.2, size: 2.4, boss: true,
    abilities: [{ type: 'enrage', below: 0.5, mult: 1.6 }, { type: 'deathSpawn', enemy: 'brute', count: 3 }],
    look: { body: 'abomination', cracks: true, skin: ['#7fae8e'], shirt: ['#4a4c52'], pants: ['#3a3c40'] },
  },
  necropriest: {
    name: 'Bone Warlock', blurb: 'BOSS. Raises the dead around it as it walks.',
    hp: 3200, speed: 1.3, bounty: 300, leak: 80, threat: 300, armor: 0.15, size: 1.9, boss: true,
    abilities: [{ type: 'summon', every: 5, enemies: ['shambler', 'runner', 'shambler', 'crawler'], count: 4 }],
    look: { body: 'warlock', skin: ['#1a1c22'], shirt: ['#3a3f4c'], pants: ['#2c3039'], trim: '#8a93a6', bone: '#d8d0b4', crystal: '#4fb8ff', cloak: '#2a2c30', weapon: 'hammer', glow: '#7dff6a' },
  },
  colossus: {
    name: 'The Dread Sovereign', blurb: 'FINAL BOSS. Its ground-slam stuns every tower nearby.',
    hp: 16000, speed: 1.0, bounty: 1000, leak: 999, threat: 1500, armor: 0.3, size: 3.2, boss: true,
    abilities: [
      { type: 'slam', every: 9, radius: 11, stun: 2.5 },
      { type: 'enrage', below: 0.3, mult: 1.5 },
      { type: 'summon', every: 12, enemies: ['revenant'], count: 1 },
    ],
    look: { body: 'knight', crown: true, shield: true, skin: ['#101216'], shirt: ['#24272e'], pants: ['#1e2127'], trim: '#4a5262', crystal: '#3ff0d8', weapon: 'sword', glow: '#bffcff' },
  },
};

/** Optional modifiers a wave can put on a group (shown as badges). */
export const MODIFIERS = {
  fortified: { name: 'Fortified', hpMult: 2, bountyMult: 1.5, color: '#9aa3ad' },
  swift: { name: 'Swift', speedMult: 1.4, bountyMult: 1.2, color: '#ffb02e' },
};

/** Enemies that introduce themselves with a toast the first time they appear. */
export const INTRO_ORDER = Object.keys(ENEMIES);
