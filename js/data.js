// ============================================================
// GAME DATA - Tower definitions, enemy definitions, wave data
// ============================================================

const TILE_SIZE = 48;
const RANGE_SCALE = 16;
const MAP_COLS = 20;
const MAP_ROWS = 15;
const MAP_W = MAP_COLS * TILE_SIZE;
const MAP_H = MAP_ROWS * TILE_SIZE;
const PATH_BUFFER = 40;

const TOWERS = {
  grunt: {
    name: "Grunt", cost: 125, role: "Offense", placement: "ground",
    unlockCost: 0, sprite: "assets/towers/grunt.png", portrait: "assets/towers/grunt_portrait.png", hitboxRadius: 20,
    base: { damage: 1, firerate: 1.0, range: 12, targetType: "single", detectHidden: false, detectLead: false, detectFlying: false },
    upgrades: [
      { name: "Faster Reloading", cost: 50, apply: s => { s.firerate = 0.7; } },
      { name: "Precise Aiming", cost: 375, apply: s => { s.damage += 2; s.range += 2; s.detectHidden = true; } },
      { name: "Stronger Equipment", cost: 1350, apply: s => { s.damage += 5; s.range += 2; s.firerate = 0.5; } },
      { name: "Akimbo Handguns", cost: 2200, apply: s => { s.firerate *= 0.5; } },
    ]
  },
  sniper: {
    name: "Sniper", cost: 450, role: "Defense", placement: "cliff",
    unlockCost: 0, sprite: "assets/towers/sniper.png", portrait: "assets/towers/sniper_portrait.png", hitboxRadius: 20,
    base: { damage: 10, firerate: 5.0, range: 28, targetType: "single", detectHidden: false, detectLead: false, detectFlying: false, stunImmune: true },
    upgrades: [
      { name: "Faster Reloading", cost: 200, apply: s => { s.damage += 2; s.firerate = 4; } },
      { name: "Geared Up", cost: 750, apply: s => { s.range += 2; s.damage += 13; s.detectHidden = true; } },
      { name: "Frontlines Sniping", cost: 2000, apply: s => { s.range += 5; s.damage += 35; s.detectLead = true; } },
      { name: "Spec Ops", cost: 5000, apply: s => { s.range += 10; s.damage += 40; s.firerate = 3; } },
    ]
  },
  paintballer: {
    name: "Paintballer", cost: 100, role: "Offense", placement: "ground",
    unlockCost: 100, sprite: "assets/towers/paintballer.png", portrait: "assets/towers/paintballer_portrait.png", hitboxRadius: 20,
    base: { damage: 1, firerate: 1.7, range: 7.5, targetType: "splash", splashRadius: 3, maxHits: 8, detectHidden: false, detectLead: false, detectFlying: false },
    upgrades: [
      { name: "Paintball Gear", cost: 25, apply: s => { s.range += 1.5; s.splashRadius += 1; s.detectHidden = true; } },
      { name: "Shoulder Pads", cost: 150, apply: s => { s.damage += 1; s.splashRadius += 0.5; s.firerate = 1.3; } },
      { name: "Double Barrel Gun", cost: 600, apply: s => { s.firerate *= 0.5; s.damage += 1; } },
      { name: "Competitive Gear", cost: 1500, apply: s => { s.range += 1.5; s.damage += 5; s.splashRadius += 1; } },
      { name: "Paintball Champion", cost: 3600, apply: s => { s.damage += 12; s.splashRadius += 1.5; } },
    ]
  },
  demolitions: {
    name: "Demolitions", cost: 700, role: "Offense", placement: "ground",
    unlockCost: 200, sprite: "assets/towers/demolitions.png", portrait: "assets/towers/demolitions_portrait.png", hitboxRadius: 24,
    base: { damage: 8, firerate: 2.6, range: 10, targetType: "splash", splashRadius: 4.5, aimTime: 1.0, detectHidden: false, detectLead: true },
    upgrades: [
      { name: "Faster Throwing", cost: 300, apply: s => { s.range += 2; s.firerate = 2.0; } },
      { name: "Ullapool Caber", cost: 950, apply: s => { s.damage += 10; s.splashRadius += 2; s.detectHidden = true; } },
      { name: "Loch-n-Load", cost: 2400, apply: s => { s.range += 2; s.damage += 7; s.firerate = 1.5; s.aimTime = 0; } },
      { name: "Expert's Ordnance", cost: 5500, apply: s => { s.range += 2; s.damage += 10; s.firerate = 1.0; } },
    ]
  },
  soldier: {
    name: "Soldier", cost: 400, role: "Offense", placement: "ground",
    unlockCost: 350, sprite: "assets/towers/soldier.png", portrait: "assets/towers/soldier_portrait.png", hitboxRadius: 20,
    base: { damage: 1, firerate: 0.175, range: 17, targetType: "burst", burstCount: 3, burstCooldown: 0.5, detectHidden: false, detectLead: false, detectFlying: false },
    upgrades: [
      { name: "Barracks Training", cost: 100, apply: s => { s.burstCooldown = 0.4; s.firerate = 0.15; } },
      { name: "Better Aiming", cost: 700, apply: s => { s.range += 2; s.damage += 1; s.burstCount = 4; s.detectHidden = true; } },
      { name: "Equipment Upgrades", cost: 1850, apply: s => { s.damage += 2; s.burstCount = 8; } },
      { name: "Deadliest Soldier", cost: 6000, apply: s => { s.range += 3; s.damage += 6; s.burstCount = 12; s.detectFlying = true; } },
    ]
  },
  farm: {
    name: "Farm", cost: 300, role: "Support", placement: "ground",
    unlockCost: 2000, sprite: "assets/towers/farm.png", portrait: "assets/towers/farm_portrait.png", hitboxRadius: 16,
    base: { damage: 0, firerate: 0, range: 5, targetType: "none", income: 60, placementLimit: 10, stunImmune: true, freezeImmune: true },
    upgrades: [
      { name: "Carrot Farm", cost: 200, apply: s => { s.income = 90; } },
      { name: "Wheat Farm", cost: 600, apply: s => { s.income = 130; } },
      { name: "Tree Farm", cost: 1250, apply: s => { s.income = 190; } },
      { name: "Apple Farm", cost: 2500, apply: s => { s.income = 280; } },
      { name: "Space Fruit Farm", cost: 4500, apply: s => { s.income = 420; } },
    ]
  },
  pyromancer: {
    name: "Pyromancer", cost: 900, role: "Offense", placement: "ground",
    unlockCost: 1250, sprite: "assets/towers/pyromancer.png", portrait: "assets/towers/pyromancer_portrait.png", hitboxRadius: 20,
    base: { damage: 1, firerate: 0.275, range: 9, targetType: "pierce", maxHits: 3, burnDamage: 2, burnDuration: 3, defenseMelt: 0.01, detectHidden: false, detectLead: true },
    upgrades: [
      { name: "Improved Handling", cost: 325, apply: s => { s.firerate = 0.2; s.range += 2; s.detectHidden = true; s.maxHits += 1; } },
      { name: "Fire Fighting", cost: 1000, apply: s => { s.damage += 1; s.maxHits += 1; } },
      { name: "Fire Hazard", cost: 2000, apply: s => { s.damage += 1; s.range += 1.5; s.burnDuration = 6; s.burnDamage += 3; s.maxHits += 2; s.defenseMelt = 0.05; } },
      { name: "Napalm Thrower", cost: 3777, apply: s => { s.damage += 2; s.burnDamage += 5; s.burnDuration = 10; s.defenseMelt = 0.10; } },
      { name: "Pyromaniac", cost: 11111, apply: s => { s.damage += 4; s.burnDamage += 15; s.range += 1.5; s.maxHits += 3; } },
    ]
  },
  commander: {
    name: "Commander", cost: 650, role: "Support", placement: "ground",
    unlockCost: 4000, sprite: "assets/towers/commander.png", portrait: "assets/towers/commander_portrait.png", hitboxRadius: 20,
    base: { damage: 0, firerate: 0, range: 10, targetType: "none", firerateBuff: 0.10, placementLimit: 6, detectHidden: true, detectLead: true, detectFlying: true },
    upgrades: [
      { name: "Leadership", cost: 400, apply: s => { s.firerateBuff = 0.15; } },
      { name: "Call to Arms", cost: 2450, apply: s => { s.range += 3; s.damage += 15; s.firerate = 1.5; s.targetType = "single"; s.hasAbility = true; s.abilityBuff = 0.10; s.abilityCooldown = 30; s.abilityDuration = 10; } },
      { name: "Intense Training", cost: 4500, apply: s => { s.range += 2; s.damage += 15; s.firerateBuff = 0.175; s.abilityBuff = 0.15; } },
      { name: "Strength in Numbers", cost: 14000, apply: s => { s.range += 2; s.damage += 20; s.firerateBuff = 0.20; s.abilityBuff = 0.20; } },
    ]
  },
  minigunner: {
    name: "Minigunner", cost: 1850, role: "Offense", placement: "ground",
    unlockCost: 8000, sprite: "assets/towers/minigunner.png", portrait: "assets/towers/minigunner_portrait.png", hitboxRadius: 28,
    base: { damage: 2, firerate: 0.15, range: 16, targetType: "single", revUpTime: 1.4, detectHidden: false },
    upgrades: [
      { name: "Improved Handling", cost: 350, apply: s => { s.firerate = 0.12; s.revUpTime = 1.2; s.detectHidden = true; } },
      { name: "Specialized Tech", cost: 1500, apply: s => { s.range += 2; s.damage += 1; } },
      { name: "Geared Up", cost: 6500, apply: s => { s.damage += 4; s.firerate = 0.1; s.revUpTime = 1.0; } },
      { name: "Futuristic Armory", cost: 21500, apply: s => { s.damage += 9; s.range += 3; } },
    ]
  },
  accel: {
    name: "Accelerator", cost: 7500, role: "Offense", placement: "ground",
    unlockCost: 2500, sprite: "assets/towers/accel.png", portrait: "assets/towers/accel_portrait.png", hitboxRadius: 20,
    base: { damage: 12, firerate: 0.25, range: 19, targetType: "beam", chargeUpTime: 6.5, beamCooldown: 2.5, overcharge: 9000, placementLimit: 5, detectHidden: false, detectLead: true, stunImmune: true },
    upgrades: [
      { name: "Extra Juice", cost: 2000, apply: s => { s.damage += 3; s.detectHidden = true; s.overcharge += 3000; } },
      { name: "Second Energy Canister", cost: 6000, apply: s => { s.range += 2; s.damage += 10; s.overcharge += 5000; s.chargeUpTime -= 1; } },
      { name: "Powerhouse Armor", cost: 9999, apply: s => { s.damage += 15; s.overcharge += 5000; s.chargeUpTime -= 1; s.beamCooldown -= 0.5; } },
      { name: "Supercharger", cost: 27500, apply: s => { s.range += 1.5; s.damage += 10; s.firerate = 0.2; s.overcharge += 5000; s.chargeUpTime -= 1; } },
      { name: "Vessel of Infinite Destruction", cost: 50000, apply: s => { s.damage += 10; s.range += 1.5; s.firerate = 0.15; s.overcharge += 10000; s.chargeUpTime -= 1; } },
    ]
  },
};

const ENEMIES = {
  normal:       { name: "Normal",       hp: 10,   speed: 1.0, color: "#55aa55", size: 1, hidden: false, armor: 0, burnImmune: false },
  speedy:       { name: "Speedy",       hp: 6,    speed: 2.0, color: "#ffaa00", size: 1, hidden: false, armor: 0, burnImmune: false },
  slow:         { name: "Slow",         hp: 30,   speed: 0.5, color: "#888888", size: 1, hidden: false, armor: 0, burnImmune: false },
  hidden:       { name: "Hidden",       hp: 8,    speed: 1.2, color: "#aa55ff", size: 1, hidden: true,  armor: 0, burnImmune: false },
  armored:      { name: "Armored",      hp: 60,   speed: 0.7, color: "#aaaacc", size: 1, hidden: false, armor: 0.5, burnImmune: false },
  breaker2:     { name: "Breaker II",   hp: 25,   speed: 1.0, color: "#cc4444", size: 1, hidden: false, armor: 0, burnImmune: false },
  breaker3:     { name: "Breaker III",  hp: 50,   speed: 0.9, color: "#cc2222", size: 1, hidden: false, armor: 0, burnImmune: false },
  breaker4:     { name: "Breaker IV",   hp: 100,  speed: 0.8, color: "#990000", size: 1, hidden: false, armor: 0, burnImmune: false },
  enraged:      { name: "Enraged",      hp: 20,   speed: 1.8, color: "#ff4444", size: 1, hidden: false, armor: 0, burnImmune: false },
  hazmat:       { name: "Hazmat",       hp: 40,   speed: 0.8, color: "#44cc44", size: 1, hidden: false, armor: 0, burnImmune: true },
  skeleton:     { name: "Skeleton",     hp: 15,   speed: 1.5, color: "#ddddaa", size: 1, hidden: false, armor: 0, burnImmune: false },
  bolt:         { name: "Bolt",         hp: 12,   speed: 3.0, color: "#44aaff", size: 1, hidden: false, armor: 0, burnImmune: false },
  normalBoss:   { name: "Normal Boss",  hp: 200,  speed: 0.6, color: "#55aa55", size: 1.5, hidden: false, armor: 0, burnImmune: false, boss: true },
  slowBoss:     { name: "Slow Boss",    hp: 800,  speed: 0.3, color: "#666666", size: 2,   hidden: false, armor: 0, burnImmune: false, boss: true },
  hiddenBoss:   { name: "Hidden Boss",  hp: 400,  speed: 0.8, color: "#aa55ff", size: 1.5, hidden: true,  armor: 0, burnImmune: false, boss: true },
  speedyBoss:   { name: "Speedy Boss",  hp: 150,  speed: 2.5, color: "#ffaa00", size: 1.5, hidden: false, armor: 0, burnImmune: false, boss: true },
  necromancer:  { name: "Necromancer",  hp: 300,  speed: 0.5, color: "#440066", size: 1.5, hidden: false, armor: 0, burnImmune: false, boss: true, spawnsOnDeath: { type: "skeleton", count: 3 } },
  graveDigger:  { name: "Grave Digger", hp: 5000, speed: 0.4, color: "#332211", size: 3,   hidden: false, armor: 0, burnImmune: false, boss: true },
  abnormal:         { name: "Abnormal",         hp: 12,   speed: 1.0, color: "#ff6633", size: 1 },
  quick:            { name: "Quick",            hp: 8,    speed: 2.0, color: "#ffcc00", size: 1 },
  heavy:            { name: "Heavy",            hp: 40,   speed: 0.5, color: "#884422", size: 1 },
  molten:           { name: "Molten",           hp: 50,   speed: 0.8, color: "#ff4400", size: 1, burnImmune: true },
  moltenDemon:      { name: "Molten Demon",     hp: 120,  speed: 0.7, color: "#cc2200", size: 1.3 },
  eliteAbnormal:    { name: "Elite Abnormal",   hp: 250,  speed: 0.6, color: "#ff8844", size: 1.5, boss: true },
  eliteHazmat:      { name: "Elite Hazmat",     hp: 80,   speed: 0.8, color: "#66cc44", size: 1, burnImmune: true },
  moltenGolem:      { name: "Molten Golem",     hp: 600,  speed: 0.3, color: "#993300", size: 2, boss: true },
  moltenHound:      { name: "Molten Hound",     hp: 60,   speed: 2.5, color: "#ff6600", size: 1 },
  moltenMech:       { name: "Molten Mech",      hp: 1000, speed: 0.4, color: "#664400", size: 2 },
  moltenNecromancer:{ name: "Molten Necromancer",hp: 200,  speed: 0.5, color: "#880044", size: 1.5, boss: true, spawnsOnDeath: { type: "skeleton", count: 5 } },
  eliteBoomer:      { name: "Elite Boomer",     hp: 300,  speed: 0.6, color: "#cc6600", size: 1.5 },
  bulwark:          { name: "Bulwark",          hp: 1500, speed: 0.25,color: "#554433", size: 2 },
  eliteMolten:      { name: "Elite Molten",     hp: 100,  speed: 0.9, color: "#ff5500", size: 1, burnImmune: true },
  moltenExecutioner:{ name: "Molten Executioner",hp: 3000, speed: 0.35,color: "#881100", size: 2.5, boss: true },
  tanker:           { name: "Tanker",           hp: 2000, speed: 0.3, color: "#443322", size: 2.5 },
  moltenSummoner:   { name: "Molten Summoner",  hp: 1500, speed: 0.4, color: "#660033", size: 2, boss: true, spawnsOnDeath: { type: "moltenHound", count: 4 } },
  moltenTitan:      { name: "Molten Titan",     hp: 2500, speed: 0.3, color: "#552200", size: 2.5 },
  moltenWarlord:    { name: "Molten Warlord",   hp: 15000,speed: 0.3, color: "#ff2200", size: 3, boss: true },
  fallenSkeleton:   { name: "Fallen Skeleton",  hp: 15,   speed: 1.5, color: "#9988aa", size: 1 },
  fallenDreg:       { name: "Fallen Dreg",      hp: 25,   speed: 1.0, color: "#665577", size: 1 },
  fallenSquire:     { name: "Fallen Squire",    hp: 300,  speed: 0.6, color: "#554466", size: 1.5, boss: true },
  fallenSoul:       { name: "Fallen Soul",      hp: 10,   speed: 2.0, color: "#aa88ff", size: 1, hidden: true },
  fallen:           { name: "Fallen",           hp: 80,   speed: 0.7, color: "#443355", size: 1 },
  fallenGiant:      { name: "Fallen Giant",     hp: 500,  speed: 0.3, color: "#332244", size: 2, boss: true },
  fallenHazmat:     { name: "Fallen Hazmat",    hp: 50,   speed: 0.8, color: "#448844", size: 1, burnImmune: true },
  possessedArmor:   { name: "Possessed Armor",  hp: 200,  speed: 0.5, color: "#555566", size: 1.5 },
  corruptedFallen:  { name: "Corrupted Fallen", hp: 100,  speed: 0.9, color: "#663377", size: 1 },
  fallenSeraph:     { name: "Fallen Seraph",    hp: 40,   speed: 2.2, color: "#bb99ff", size: 1 },
  necroticSkeleton: { name: "Necrotic Skeleton",hp: 150,  speed: 1.0, color: "#776655", size: 1.3 },
  fallenRusher:     { name: "Fallen Rusher",    hp: 60,   speed: 2.5, color: "#884477", size: 1 },
  fallenHero:       { name: "Fallen Hero",      hp: 180,  speed: 0.8, color: "#553366", size: 1.3 },
  fallenShield:     { name: "Fallen Shield",    hp: 1000, speed: 0.4, color: "#444455", size: 2, boss: true },
  fallenNecromancer:{ name: "Fallen Necromancer",hp: 250,  speed: 0.5, color: "#550044", size: 1.5, spawnsOnDeath: { type: "fallenSkeleton", count: 4 } },
  fallenSummoner:   { name: "Fallen Summoner",  hp: 400,  speed: 0.4, color: "#660055", size: 1.5 },
  fallenJester:     { name: "Fallen Jester",    hp: 800,  speed: 0.7, color: "#993388", size: 1.5, boss: true },
  fallenAngel:      { name: "Fallen Angel",     hp: 2000, speed: 0.5, color: "#bb77ff", size: 2, boss: true },
  fallenHonorGuard: { name: "Fallen Honor Guard",hp: 3000, speed: 0.4, color: "#443355", size: 2.5, boss: true },
  fallenTank:       { name: "Fallen Tank",      hp: 4000, speed: 0.25,color: "#332233", size: 2.5 },
  fallenGuardian:   { name: "Fallen Guardian",  hp: 2500, speed: 0.35,color: "#554477", size: 2 },
  fallenKing:       { name: "Fallen King",      hp: 20000,speed: 0.3, color: "#440066", size: 3, boss: true },
};

for (const e of Object.values(ENEMIES)) {
  if (e.hidden === undefined) e.hidden = false;
  if (e.armor === undefined) e.armor = 0;
  if (e.burnImmune === undefined) e.burnImmune = false;
  if (e.boss === undefined) e.boss = false;
}

const WAVES = {
  casual: [
    [{ count:4, type:"normal" }],
    [{ count:4, type:"normal" }, { count:4, type:"speedy" }],
    [{ count:3, type:"speedy" }, { count:5, type:"normal" }],
    [{ count:5, type:"slow" }],
    [{ count:4, type:"slow" }, { count:3, type:"speedy" }, { count:6, type:"normal" }],
    [{ count:1, type:"normal" }, { count:2, type:"speedy" }, { count:3, type:"slow" }, { count:4, type:"normal" }, { count:5, type:"speedy" }, { count:6, type:"slow" }],
    [{ count:4, type:"normal" }, { count:6, type:"slow" }, { count:1, type:"normalBoss" }, { count:5, type:"speedy" }, { count:4, type:"normal" }],
    [{ count:8, type:"slow" }, { count:4, type:"normal", mods:["bloated"] }, { count:3, type:"speedy", mods:["bloated"] }],
    [{ count:12, type:"hidden" }],
    [{ count:4, type:"normal", mods:["bloated"] }, { count:3, type:"speedy", mods:["nimble"] }, { count:5, type:"slow", mods:["bloated"] }, { count:4, type:"hidden" }, { count:8, type:"normal" }, { count:4, type:"normal", mods:["bloated"] }, { count:3, type:"speedy", mods:["nimble"] }, { count:5, type:"slow", mods:["bloated"] }, { count:2, type:"normalBoss" }],
    [{ count:6, type:"breaker2" }, { count:4, type:"speedy" }, { count:3, type:"hidden" }],
    [{ count:5, type:"armored" }, { count:6, type:"normal", mods:["bloated"] }],
    [{ count:8, type:"breaker2" }, { count:4, type:"enraged" }, { count:1, type:"slowBoss" }],
    [{ count:6, type:"hidden", mods:["nimble"] }, { count:4, type:"armored" }, { count:6, type:"breaker2" }],
    [{ count:5, type:"breaker3" }, { count:3, type:"enraged" }, { count:2, type:"normalBoss" }, { count:8, type:"normal", mods:["bloated"] }],
    [{ count:10, type:"skeleton" }, { count:1, type:"necromancer" }, { count:5, type:"hidden" }],
    [{ count:4, type:"armored", mods:["bloated"] }, { count:6, type:"breaker3" }, { count:3, type:"enraged", mods:["nimble"] }],
    [{ count:8, type:"hazmat" }, { count:4, type:"breaker3", mods:["bloated"] }, { count:1, type:"hiddenBoss" }],
    [{ count:5, type:"bolt" }, { count:3, type:"breaker4" }, { count:6, type:"armored" }, { count:2, type:"speedyBoss" }],
    [{ count:6, type:"breaker4" }, { count:4, type:"armored", mods:["bloated"] }, { count:1, type:"slowBoss" }, { count:8, type:"enraged" }, { count:2, type:"normalBoss" }],
    [{ count:8, type:"breaker4", mods:["bloated"] }, { count:5, type:"bolt" }, { count:4, type:"hazmat" }],
    [{ count:6, type:"armored", mods:["bloated"] }, { count:1, type:"necromancer" }, { count:10, type:"skeleton" }, { count:3, type:"breaker4" }],
    [{ count:4, type:"breaker4", mods:["bloated"] }, { count:2, type:"hiddenBoss" }, { count:6, type:"enraged", mods:["nimble"] }, { count:1, type:"slowBoss" }],
    [{ count:10, type:"bolt" }, { count:8, type:"breaker4" }, { count:4, type:"armored", mods:["bloated"] }, { count:2, type:"speedyBoss" }, { count:1, type:"necromancer" }],
    [{ count:1, type:"graveDigger" }, { count:6, type:"breaker4", mods:["bloated"] }, { count:8, type:"enraged" }, { count:4, type:"armored", mods:["bloated"] }],
  ],
  molten: (() => {
    const w = [];
    w.push([{ count:5, type:"abnormal" }]);
    w.push([{ count:4, type:"abnormal" }, { count:4, type:"quick" }]);
    w.push([{ count:6, type:"abnormal" }, { count:3, type:"quick" }, { count:3, type:"heavy" }]);
    w.push([{ count:5, type:"heavy" }, { count:4, type:"quick" }]);
    w.push([{ count:8, type:"abnormal", mods:["bloated"] }, { count:3, type:"molten" }]);
    w.push([{ count:4, type:"molten" }, { count:6, type:"quick" }, { count:1, type:"eliteAbnormal" }]);
    w.push([{ count:6, type:"heavy", mods:["bloated"] }, { count:4, type:"moltenDemon" }]);
    w.push([{ count:5, type:"moltenDemon" }, { count:3, type:"eliteHazmat" }, { count:1, type:"moltenGolem" }]);
    w.push([{ count:8, type:"moltenHound" }, { count:4, type:"molten" }, { count:3, type:"heavy", mods:["bloated"] }]);
    w.push([{ count:6, type:"moltenDemon" }, { count:2, type:"eliteAbnormal" }, { count:1, type:"moltenGolem" }, { count:5, type:"moltenHound" }]);
    for (let i = 11; i <= 35; i++) {
      const groups = [];
      const scale = 1 + (i - 10) * 0.15;
      if (i < 15) {
        groups.push({ count: Math.round(6 * scale), type: "moltenDemon" });
        groups.push({ count: Math.round(4 * scale), type: "eliteHazmat" });
        if (i % 3 === 0) groups.push({ count: 1, type: "moltenGolem" });
      } else if (i < 20) {
        groups.push({ count: Math.round(5 * scale), type: "eliteBoomer" });
        groups.push({ count: Math.round(3 * scale), type: "bulwark" });
        if (i === 15) groups.push({ count: 1, type: "moltenExecutioner" });
        if (i % 2 === 0) groups.push({ count: 1, type: "moltenNecromancer" });
      } else if (i < 25) {
        groups.push({ count: Math.round(4 * scale), type: "eliteMolten" });
        groups.push({ count: Math.round(3 * scale), type: "tanker" });
        groups.push({ count: Math.round(2 * scale), type: "moltenMech" });
        if (i === 20) groups.push({ count: 1, type: "moltenExecutioner" });
      } else if (i < 30) {
        groups.push({ count: Math.round(4 * scale), type: "moltenMech" });
        groups.push({ count: Math.round(3 * scale), type: "moltenTitan" });
        if (i % 3 === 0) groups.push({ count: 1, type: "moltenSummoner" });
      } else if (i < 35) {
        groups.push({ count: Math.round(3 * scale), type: "moltenTitan", mods:["bloated"] });
        groups.push({ count: Math.round(4 * scale), type: "tanker", mods:["bloated"] });
        groups.push({ count: 1, type: "moltenExecutioner" });
      } else {
        groups.push({ count: 1, type: "moltenWarlord" });
        groups.push({ count: 6, type: "moltenTitan", mods:["bloated"] });
        groups.push({ count: 4, type: "tanker", mods:["bloated"] });
      }
      w.push(groups);
    }
    return w;
  })(),
  fallen: (() => {
    const w = [];
    w.push([{ count:5, type:"fallenSkeleton" }]);
    w.push([{ count:4, type:"fallenSkeleton" }, { count:4, type:"fallenSoul" }]);
    w.push([{ count:6, type:"fallenDreg" }, { count:3, type:"fallenSkeleton" }]);
    w.push([{ count:5, type:"fallenDreg" }, { count:3, type:"fallenSoul" }]);
    w.push([{ count:4, type:"fallenDreg", mods:["bloated"] }, { count:1, type:"fallenSquire" }]);
    w.push([{ count:6, type:"fallen" }, { count:4, type:"fallenSoul" }]);
    w.push([{ count:5, type:"fallen" }, { count:3, type:"fallenHazmat" }, { count:1, type:"fallenGiant" }]);
    w.push([{ count:8, type:"fallenSeraph" }, { count:4, type:"fallen" }]);
    w.push([{ count:4, type:"possessedArmor" }, { count:6, type:"corruptedFallen" }, { count:1, type:"fallenSquire" }]);
    w.push([{ count:5, type:"possessedArmor" }, { count:3, type:"necroticSkeleton" }, { count:1, type:"fallenGiant" }, { count:6, type:"fallenRusher" }]);
    for (let i = 11; i <= 40; i++) {
      const groups = [];
      const scale = 1 + (i - 10) * 0.12;
      if (i < 15) {
        groups.push({ count: Math.round(5 * scale), type: "corruptedFallen" });
        groups.push({ count: Math.round(3 * scale), type: "fallenHero" });
        if (i % 3 === 0) groups.push({ count: 1, type: "fallenShield" });
      } else if (i < 20) {
        groups.push({ count: Math.round(4 * scale), type: "fallenHero" });
        groups.push({ count: Math.round(3 * scale), type: "necroticSkeleton" });
        groups.push({ count: 1, type: "fallenNecromancer" });
        if (i % 2 === 0) groups.push({ count: 1, type: "fallenJester" });
      } else if (i < 25) {
        groups.push({ count: Math.round(3 * scale), type: "fallenSummoner" });
        groups.push({ count: Math.round(4 * scale), type: "possessedArmor", mods:["bloated"] });
        if (i === 20) groups.push({ count: 1, type: "fallenAngel" });
      } else if (i < 30) {
        groups.push({ count: Math.round(3 * scale), type: "fallenGuardian" });
        groups.push({ count: Math.round(2 * scale), type: "fallenTank" });
        if (i % 3 === 0) groups.push({ count: 1, type: "fallenAngel" });
      } else if (i < 35) {
        groups.push({ count: Math.round(3 * scale), type: "fallenTank", mods:["bloated"] });
        groups.push({ count: Math.round(2 * scale), type: "fallenGuardian", mods:["bloated"] });
        groups.push({ count: 1, type: "fallenHonorGuard" });
      } else if (i < 40) {
        groups.push({ count: Math.round(4 * scale), type: "fallenTank", mods:["bloated"] });
        groups.push({ count: 2, type: "fallenHonorGuard" });
        groups.push({ count: 1, type: "fallenAngel" });
      } else {
        groups.push({ count: 1, type: "fallenKing" });
        groups.push({ count: 4, type: "fallenHonorGuard" });
        groups.push({ count: 6, type: "fallenTank", mods:["bloated"] });
      }
      w.push(groups);
    }
    return w;
  })(),
};

const MODE_CONFIG = {
  casual: { waves: 25, startCash: 600, baseHP: 100, hpScale: 1 },
  molten: { waves: 35, startCash: 600, baseHP: 150, hpScale: 1.5 },
  fallen: { waves: 40, startCash: 600, baseHP: 200, hpScale: 2 },
};
