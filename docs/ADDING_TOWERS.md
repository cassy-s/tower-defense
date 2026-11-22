# Adding a tower (character)

Every tower lives in **`src/config/towers.js`** as plain data. Adding one = adding one block.
The shop, hotkeys, portraits, field guide, inspector and upgrade UI all pick it up automatically.

After editing, run:

```
npm run check
```

It validates every field (typos in stat names, unknown weapons/hats, bad costs) and runs a
quick headless battle with each tower to make sure nothing crashes.

---

## Template

```js
  medic: {
    name: 'Combat Medic',
    role: 'Support',                 // Damage | Splash | Support | Economy  (sets the card colour)
    description: 'One sentence shown in the shop tooltip and field guide.',
    cost: 600,                       // placement price
    footprint: 1.5,                  // placement radius in studs (1.5 normal, 1.9 big)
    limit: 6,                        // optional: max per game
    look: {                          // how the 3D figure is built
      skin: '#e8b98f', shirt: '#e8e6df', pants: '#2c3440', shoes: '#16181c',
      face: 'smile', hat: 'helmet', hatColor: '#d8d8d0',
      vest: '#b8372d', belt: '#30363f', backpack: '#d8d8d0',
      weapon: 'pistol',
    },
    stats: {                         // level-0 stats
      attack: 'hitscan', damage: 2, cooldown: 0.8, range: 12,
    },
    upgrades: [                      // any number of levels, bought in order
      { name: 'Field Kit', cost: 200, desc: 'Fires faster.', set: { cooldown: 0.6 } },
      { name: 'Steady Hands', cost: 500, desc: '+2 damage, sees hidden.', add: { damage: 2 }, set: { detectHidden: true } },
      { name: 'Trauma Team', cost: 1500, desc: '+4 range.', add: { range: 4 }, look: { hat: 'beret', hatColor: '#b8372d' } },
    ],
  },
```

### Upgrade operators
| key   | meaning                                   | example                     |
|-------|-------------------------------------------|-----------------------------|
| `set` | replace a stat                            | `set: { cooldown: 0.45 }`   |
| `add` | add to a stat                             | `add: { damage: 2 }`        |
| `mul` | multiply a stat                           | `mul: { range: 1.2 }`       |
| `look`| change the model from this level onward  | `look: { hat: 'beret' }`    |

---

## Stats

| stat | default | notes |
|---|---|---|
| `attack` | `hitscan` | see attack types below |
| `damage` | 1 | per hit / per pellet |
| `cooldown` | 1 | **seconds between shots** (fire rate = 1 / cooldown). If you're given "firerate 0.6" in TDS-style seconds, that is `cooldown: 0.6` |
| `range` | 10 | studs (the map is 64 × 40) |
| `burst`, `burstDelay` | 1, 0.1 | shots per trigger pull, seconds between them |
| `pellets`, `spreadAngle` | 1, 30 | for `spread` |
| `pierce`, `projectileSpeed`, `projectileSize` | 1, 30, 1 | for `pierce` |
| `splashRadius`, `maxHits`, `cluster` | 0, 99, 0 | for `splash` (and `maxHits` caps `flame`) |
| `coneAngle` | 40 | for `flame` |
| `chains`, `chainRange`, `chainFalloff` | 0, 6, 0.8 | for `chain` |
| `spinUp` | 0 | for `spinup`, seconds to full fire rate |
| `burnDamage`, `burnDuration` | 0, 0 | damage/second fire DoT (ignores armor; Hazmat zombies immune) |
| `slow`, `slowDuration` | 0, 0 | 0.4 = 40 % slower |
| `armorPierce` | 0 | 0..1, fraction of zombie armor ignored |
| `bossMult` | 1 | damage multiplier vs bosses |
| `detectHidden`, `detectFlying` | false | can target Shades / Carrion |
| `stunImmune` | false | ignores Spitter acid and boss slams |
| `income` | 0 | cash paid at the end of each wave |
| `aura` | null | `{ cooldownMult: 0.85, rangeMult: 1.1, grantHidden: true }` applied to towers in range |
| `ability` | null | `'airstrike'` or `'rally'` (active button in the inspector) |
| `priority` | `first` | default targeting: `first`, `last`, `strong`, `close` |

### Attack types
- `hitscan` – instant shot (rifles, snipers, pistols). Add `burst` for burst fire.
- `spinup` – hitscan that ramps up (miniguns).
- `spread` – shotgun pellets in a cone.
- `pierce` – a travelling bolt that drills through a line of zombies.
- `splash` – lobbed explosive.
- `flame` – fire cone + burn.
- `chain` – chain lightning.
- `none` – support/economy only.

## Look (3D model)

Figures are built from blocks: head, 2×2×1 torso, block arms and legs. Colours are any CSS hex.

| field | values |
|---|---|
| `skin`, `shirt`, `pants`, `shoes`, `sleeves`, `gloves` | colours (sleeves default to shirt) |
| `face` | `smirk`, `angry`, `smile`, `grin`, `determined`, `none` · `facePaint: true` adds camo stripes |
| `hat` + `hatColor` | `cap`, `helmet`, `beret`, `boonie`, `officer`, `welder`, `bandana`, `none` |
| `hair` + `hairColor` | `short`, `ponytail`, `long`, `none` |
| torso extras | `vest` (colour), `pouches`, `belt` (colour), `buckles` (colour), `bandolier`, `backpack` (colour), `tank` (colour, back tanks), `medals`, `radio`, `cape` (colour), `ghillie` |
| head extras | `goggles`, `sunglasses` |
| legs | `kneepads`, `legStraps` |
| `weapon` | `rifle`, `rifle_scoped`, `sniper`, `drill`, `drill_big`, `shotgun`, `shotgun_auto`, `launcher`, `launcher_drum`, `flamer`, `minigun`, `minigun_twin`, `tesla`, `pistol`, `clipboard`, `sword`, `sword_bright`, `hammer` |
| `crates` | number of supply crates stacked around the figure |
| `scale` | overall size multiplier (1.15 = chunky) |

Need something that isn't in these lists (a new gun, a new hat, a brand-new attack)?
- New weapon model → add a builder in `src/render/weapons.js` and its name to `WEAPONS` in `src/config/schema.js`.
- New hat/hair → `hat()` / `hair()` in `src/render/characters.js` + `HATS`/`HAIR` in schema.
- New attack behaviour → a `fireX()` method + a `case` in `Tower.update()` in `src/game/tower.js`, a visual handler in `src/render/view.js`, and the name in `ATTACKS` in schema.

You can preview every model at `http://localhost:8080/tools/gallery.html`.

---

# Adding a zombie

Add a block to **`src/config/enemies.js`** (hp, speed, bounty, leak, threat, flags, abilities, look),
then make it appear: add it to `UNLOCK` in `src/config/waves.js` (wave it starts showing up in
generated waves) or to a hand-written wave. Ability types: `spit`, `haste`, `heal`, `summon`, `slam`,
`enrage`, `deathSpawn` (see `src/game/enemy.js`). Model bodies: `walker`, `runner`, `crawler`, `bloater`,
`brute`, `heavy`, `abomination`, `knight`, `warlock`, `flyer`.
