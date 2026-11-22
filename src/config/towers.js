// ============================================================================
// TOWERS — every tower in the game is defined here, as plain data.
//
// To add a tower: copy one block, give it a new id, and edit the numbers.
// See docs/ADDING_TOWERS.md for every field and what it does.
//
// Units: range/radius in studs (the map is ~60 studs wide), cooldown in
// seconds between shots, speed in studs/second.
// ============================================================================

export const TOWERS = {
  // --------------------------------------------------------------------------
  rifleman: {
    name: 'Rifleman',
    role: 'Damage',
    description: 'Reliable all-rounder with an assault rifle. Cheap, accurate, good early.',
    cost: 200,
    footprint: 1.5,
    look: {
      model: 'soldier', face: 'scowl', hat: 'cap', weapon: 'rifle',
    },
    stats: {
      attack: 'hitscan', damage: 2, cooldown: 0.6, range: 11,
    },
    upgrades: [
      { name: 'Steady Grip', cost: 125, desc: 'Fires faster.', set: { cooldown: 0.45 } },
      { name: 'Field Scope', cost: 325, desc: '+1 damage, +3 range. Can see Shades (hidden).',
        add: { damage: 1, range: 3 }, set: { detectHidden: true }, look: { weapon: 'rifle_scoped' } },
      { name: 'Burst Fire', cost: 750, desc: 'Fires 3-round bursts. +1 damage.',
        add: { damage: 1 }, set: { burst: 3, burstDelay: 0.08, cooldown: 0.75 }, look: { hat: 'helmet', hatColor: '#4a5d3a' } },
      { name: 'Veteran Loadout', cost: 2300, desc: '+4 damage, 4-round bursts, punches through 50% armor.',
        add: { damage: 4, range: 2 }, set: { burst: 4, armorPierce: 0.5 }, look: { hat: 'beret', hatColor: '#7a1f1f', sunglasses: true, bandolier: true } },
    ],
  },

  // --------------------------------------------------------------------------
  marksman: {
    name: 'Marksman',
    role: 'Damage',
    description: 'Long-range bolt-action sniper. Huge hits, slow reload. Great against big zombies.',
    cost: 450,
    footprint: 1.5,
    look: {
      skin: '#e8a85c', shirt: '#2f4f25', pants: '#4d4a3a', shoes: '#1a1a1a',
      face: 'angry', facePaint: true, hat: 'cap', hatColor: '#34502a',
      backpack: '#2b2b28', belt: '#2a2016',
      weapon: 'sniper',
    },
    stats: {
      attack: 'hitscan', damage: 12, cooldown: 2.2, range: 26, armorPierce: 0.3, priority: 'strong',
    },
    upgrades: [
      { name: 'Oiled Bolt', cost: 250, desc: 'Reloads faster.', set: { cooldown: 1.5 } },
      { name: 'Ghillie Optics', cost: 650, desc: '+8 damage, +4 range, sees Shades.',
        add: { damage: 8, range: 4 }, set: { detectHidden: true }, look: { hat: 'boonie', hatColor: '#4b5a32' } },
      { name: 'AP Rounds', cost: 1500, desc: '+20 damage, ignores all armor, x1.5 vs bosses.',
        add: { damage: 20 }, set: { armorPierce: 1, bossMult: 1.5 } },
      { name: 'Deadeye', cost: 5400, desc: '+60 damage, much faster reload, shoots down Carrion (flying).',
        add: { damage: 60 }, set: { cooldown: 1.2, detectFlying: true }, look: { ghillie: true, facePaint: true } },
    ],
  },

  // --------------------------------------------------------------------------
  riveter: {
    name: 'Riveter',
    role: 'Damage',
    description: 'Engineer with a rebar launcher. Every hit fills her scrap meter; when it is full she stops to build a sentry turret near the road. Sentries slowly wear out.',
    cost: 600,
    sellRate: 1 / 3,
    footprint: 1.5,
    limit: 6,
    look: { model: 'engineer', weapon: 'drill', face: 'confident' },
    stats: {
      attack: 'pierce', damage: 4, cooldown: 1.4, range: 13, pierce: 1, projectileSpeed: 48,
      detectFlying: true, deadzone: 1.5, buildRange: 4, maxUnits: 1, scrapMax: 20,
      unit: { damage: 2, cooldown: 1, range: 18, health: 200, lifespan: 20 },
    },
    upgrades: [
      { name: 'Reinforced Rebar', cost: 325, desc: '+2 damage, fires faster, +3 range.',
        add: { damage: 2, range: 3 }, set: { cooldown: 1.2 } },
      { name: 'Makeshift Radar', cost: 900, desc: '+4 damage, +2 range, sees hidden. Sentries become rapid-fire and see hidden too.',
        add: { damage: 4, range: 2 }, set: { detectHidden: true, scrapMax: 32,
          unit: { damage: 1, cooldown: 0.2, range: 20, health: 400, lifespan: 30, hidden: true } } },
      { name: 'Auto Converter', cost: 2077, desc: '+10 damage, fires faster, +1 sentry.',
        add: { damage: 10, maxUnits: 1 }, set: { cooldown: 1 } },
      { name: 'Heavy Construction', cost: 6250, desc: '+10 damage, +3 range, faster. Heavy sentries.',
        add: { damage: 10, range: 3, buildRange: -1 }, set: { cooldown: 0.9, scrapMax: 150,
          unit: { damage: 3, cooldown: 0.15, range: 22, health: 750, lifespan: 45, hidden: true } }, look: { goggles: true } },
      { name: 'Improved Blueprints', cost: 12500, desc: '+50 damage, faster, +1 sentry. Sentries get a shield (stun immune).',
        add: { damage: 50, maxUnits: 1 }, set: { cooldown: 0.75,
          unit: { damage: 3, cooldown: 0.15, range: 22, health: 750, lifespan: 45, hidden: true, shield: true } } },
      { name: 'Illegal Gun Parts', cost: 32500, desc: '+10 damage, +1.5 range, faster, +1 sentry. Sentries fire twin rockets.',
        add: { damage: 10, range: 1.5, buildRange: -1, maxUnits: 1 }, set: { cooldown: 0.6, scrapMax: 340,
          unit: { damage: 3, cooldown: 0.125, range: 24, health: 1000, lifespan: 60, hidden: true, shield: true,
            rocket: { damage: 60, count: 2, cooldown: 4, radius: 5 } } } },
    ],
  },
  // --------------------------------------------------------------------------
  scatter: {
    name: 'Scattergunner',
    role: 'Damage',
    description: 'Pump shotgun. Short range, but every blast hits a whole crowd.',
    cost: 300,
    footprint: 1.5,
    look: {
      skin: '#8d5a3b', shirt: '#2f3e57', pants: '#33302c', shoes: '#141414',
      face: 'grin', hat: 'bandana', hatColor: '#b8372d', vest: '#5b4632', belt: '#2b1e14',
      weapon: 'shotgun',
    },
    stats: {
      attack: 'spread', damage: 1, cooldown: 1.1, range: 8, pellets: 5, spreadAngle: 34,
    },
    upgrades: [
      { name: 'Choke', cost: 150, desc: '+2 range.', add: { range: 2 } },
      { name: 'Buckshot', cost: 450, desc: '8 pellets per blast, +1 damage.', set: { pellets: 8 }, add: { damage: 1 } },
      { name: "Dragon's Breath", cost: 1300, desc: 'Incendiary shells set zombies on fire.',
        set: { burnDamage: 5, burnDuration: 3 }, look: { hat: 'helmet', hatColor: '#3a3f46' } },
      { name: 'Auto Shotgun', cost: 3600, desc: 'Fully automatic. +2 damage, 10 pellets.',
        set: { cooldown: 0.4, pellets: 10 }, add: { damage: 2 }, look: { weapon: 'shotgun_auto', sunglasses: true } },
    ],
  },

  // --------------------------------------------------------------------------
  grenadier: {
    name: 'Grenadier',
    role: 'Splash',
    description: 'Lobs grenades that blow up groups of zombies.',
    cost: 550,
    footprint: 1.6,
    look: {
      skin: '#f0c9a0', shirt: '#5c5a3c', pants: '#3b3b33', shoes: '#1c1c1c',
      face: 'determined', hat: 'helmet', hatColor: '#585d3f', vest: '#3d3a2b', bandolier: true,
      weapon: 'launcher',
    },
    stats: {
      attack: 'splash', damage: 6, cooldown: 2.0, range: 14, splashRadius: 3.5, maxHits: 14, projectileSpeed: 22,
    },
    upgrades: [
      { name: 'Bigger Bang', cost: 300, desc: '+1 blast radius, +1 damage.', add: { splashRadius: 1, damage: 1 } },
      { name: 'Frag Shells', cost: 800, desc: '+4 damage, hits more zombies.', add: { damage: 4, maxHits: 10 } },
      { name: 'Cluster Rounds', cost: 2200, desc: 'Each grenade splits into 4 bomblets.',
        set: { cluster: 4 }, look: { weapon: 'launcher_drum', goggles: true } },
      { name: 'Air Support', cost: 6000, desc: '+8 damage. Unlocks AIRSTRIKE ability.',
        add: { damage: 8 }, set: { cooldown: 1.5, ability: 'airstrike' }, look: { hat: 'officer', hatColor: '#4b4a33' } },
    ],
  },

  // --------------------------------------------------------------------------
  flamer: {
    name: 'Flamer',
    role: 'Splash',
    description: 'Sprays a cone of fire. Burns everything in front of it. Hazmat zombies are immune.',
    cost: 650,
    footprint: 1.6,
    look: {
      skin: '#d9a07a', shirt: '#6b4a2b', pants: '#3a2c22', shoes: '#18120e',
      face: 'grin', hat: 'welder', hatColor: '#3b3b3b', belt: '#2a1a10', gloves: '#2a1a10',
      tank: '#b33a2a', weapon: 'flamer',
    },
    stats: {
      attack: 'flame', damage: 1, cooldown: 0.15, range: 8, coneAngle: 40, maxHits: 4,
      burnDamage: 2, burnDuration: 3,
    },
    upgrades: [
      { name: 'Pressure Valve', cost: 350, desc: '+2 range, wider cone.', add: { range: 2, coneAngle: 10 } },
      { name: 'Napalm Mix', cost: 1000, desc: 'Burn deals double and lasts longer.', set: { burnDamage: 4, burnDuration: 5 }, look: { vest: '#4a3a2a', pouches: true } },
      { name: 'Armor Melter', cost: 2400, desc: 'Fire melts armor. Sees Shades.',
        set: { armorPierce: 0.8, detectHidden: true }, add: { maxHits: 4, damage: 1 }, look: { tank: '#2d6fb3' } },
      { name: 'Inferno', cost: 6500, desc: 'Blue-hot flames. +3 damage, +6 burn.',
        add: { damage: 3, burnDamage: 6, range: 1 }, set: { flameColor: 'blue' }, look: { tank: '#5ad0ff', vest: '#22303e', bandolier: true, gloves: '#5ad0ff' } },
    ],
  },

  // --------------------------------------------------------------------------
  tesla: {
    name: 'Tesla Tech',
    role: 'Splash',
    description: 'Arcs lightning that chains between zombies and briefly slows them. Can hit flying Carrion.',
    cost: 1100,
    footprint: 1.6,
    look: {
      skin: '#f3d2b3', shirt: '#e8e6df', pants: '#2c3440', shoes: '#16181c',
      face: 'smile', hair: 'short', hairColor: '#e8e2c8', goggles: true, gloves: '#d8a632', belt: '#30363f',
      tank: '#3a7ec2', weapon: 'tesla',
    },
    stats: {
      attack: 'chain', damage: 8, cooldown: 1.4, range: 12, chains: 4, chainRange: 6, chainFalloff: 0.85,
      slow: 0.4, slowDuration: 0.6, detectFlying: true,
    },
    upgrades: [
      { name: 'Capacitors', cost: 600, desc: 'Charges faster.', set: { cooldown: 1.0 }, look: { vest: '#3a4a5a' } },
      { name: 'Forked Arcs', cost: 1500, desc: 'Chains to 7 zombies.', set: { chains: 7 }, add: { damage: 3 } },
      { name: 'Ion Sight', cost: 1800, desc: 'Sees Shades (hidden). +6 damage.',
        set: { detectHidden: true }, add: { damage: 6 }, look: { hat: 'helmet', hatColor: '#d9d6cc' } },
      { name: 'Storm Caller', cost: 7000, desc: 'Massive arcs that chain 12 times.',
        set: { chains: 12, cooldown: 0.7, chainFalloff: 0.95 }, add: { damage: 12, range: 2 }, look: { tank: '#9a4fe0', cape: '#4a2a7a', gloves: '#9a4fe0' } },
    ],
  },

  // --------------------------------------------------------------------------
  gatling: {
    name: 'Gatling',
    role: 'Damage',
    description: 'Heavy rotary gun. Needs a moment to spin up, then shreds everything.',
    cost: 1600,
    footprint: 1.9,
    look: {
      model: 'minigunner', face: 'cocky', weapon: 'minigun', scale: 1.12,
    },
    stats: {
      attack: 'spinup', damage: 2, cooldown: 0.09, range: 14, spinUp: 1.6,
    },
    upgrades: [
      { name: 'Ammo Belt', cost: 450, desc: 'Spins up faster. Sees Shades.', set: { spinUp: 1.1, detectHidden: true } },
      { name: 'Hot Barrels', cost: 1600, desc: '+1 damage, +2 range.', add: { damage: 1, range: 2 } },
      { name: 'Tungsten Rounds', cost: 4500, desc: '+3 damage, pierces 50% armor, faster.',
        add: { damage: 3 }, set: { cooldown: 0.065, armorPierce: 0.5 }, look: { sunglasses: true } },
      { name: 'Twin Rotary', cost: 12000, desc: '+6 damage, shoots Carrion. A wall of lead.',
        add: { damage: 6, range: 2 }, set: { cooldown: 0.045, detectFlying: true }, look: { weapon: 'minigun_twin' } },
    ],
  },

  // --------------------------------------------------------------------------
  officer: {
    name: 'Field Officer',
    role: 'Support',
    description: 'Commands nearby towers: they fire 15% faster. Later grants hidden detection.',
    cost: 700,
    footprint: 1.5,
    limit: 6,
    look: {
      skin: '#e2b28a', shirt: '#4b5634', pants: '#3a3f2a', shoes: '#141414',
      face: 'determined', hat: 'officer', hatColor: '#3f4a2c', belt: '#3b2716', buckles: '#d6b44a',
      medals: true, weapon: 'pistol',
    },
    stats: {
      attack: 'hitscan', damage: 1, cooldown: 1.2, range: 12,
      aura: { cooldownMult: 0.85 },
    },
    upgrades: [
      { name: 'Drill Sergeant', cost: 450, desc: 'Nearby towers fire 20% faster.', set: { aura: { cooldownMult: 0.8 } } },
      { name: 'Recon Radio', cost: 1200, desc: 'Nearby towers can see Shades. +3 range.',
        add: { range: 3 }, set: { aura: { cooldownMult: 0.8, grantHidden: true } }, look: { radio: true } },
      { name: 'High Command', cost: 3200, desc: 'Nearby towers: 25% faster, +10% range.',
        set: { aura: { cooldownMult: 0.75, rangeMult: 1.1, grantHidden: true } }, look: { vest: '#2f3a24', sunglasses: true } },
      { name: 'Rally Cry', cost: 5000, desc: 'Unlocks RALLY: nearby towers fire 2x speed for 10s.',
        set: { ability: 'rally', damage: 6 }, look: { cape: '#8b1d1d', hat: 'beret', hatColor: '#8b1d1d', medals: true } },
    ],
  },

  // --------------------------------------------------------------------------
  depot: {
    name: 'Supply Depot',
    role: 'Economy',
    description: 'Quartermaster with a stack of crates. Earns cash at the end of every wave.',
    cost: 550,
    footprint: 1.8,
    limit: 8,
    look: {
      skin: '#f0c9a0', shirt: '#8a6d3b', pants: '#4b3c27', shoes: '#1d1710',
      face: 'smile', hat: 'boonie', hatColor: '#7d6a42', belt: '#2f2317',
      weapon: 'clipboard', crates: 1,
    },
    stats: { attack: 'none', range: 5, income: 90 },
    upgrades: [
      { name: 'Ration Stock', cost: 300, desc: '$140 per wave.', set: { income: 140 }, look: { crates: 2 } },
      { name: 'Fuel Cans', cost: 750, desc: '$210 per wave.', set: { income: 210 }, look: { crates: 3 } },
      { name: 'Ammo Dump', cost: 1700, desc: '$320 per wave.', set: { income: 320 }, look: { crates: 4 } },
      { name: 'Black Market', cost: 3200, desc: '$500 per wave.', set: { income: 500 }, look: { crates: 5, sunglasses: true } },
    ],
  },
};

/** Ordered list used by the shop. New towers are appended automatically. */
export const TOWER_ORDER = Object.keys(TOWERS);

/** Every stat a tower might use, with its default. Unknown stats are allowed. */
export const STAT_DEFAULTS = {
  attack: 'hitscan', damage: 1, cooldown: 1, range: 10,
  burst: 1, burstDelay: 0.1, pellets: 1, spreadAngle: 30, pierce: 1, projectileSpeed: 30, projectileSize: 1,
  splashRadius: 0, maxHits: 99, cluster: 0, coneAngle: 40, chains: 0, chainRange: 6, chainFalloff: 0.8,
  spinUp: 0, burnDamage: 0, burnDuration: 0, slow: 0, slowDuration: 0, armorPierce: 0, bossMult: 1,
  detectHidden: false, detectFlying: false, stunImmune: false, income: 0, aura: null, ability: null,
  priority: 'first',
  // builder towers (sentries) - see src/game/sentry.js
  scrapMax: 0, maxUnits: 0, buildRange: 0, deadzone: 0, unit: null,
};
