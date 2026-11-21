# BLOCKADE — Zombie Tower Defense

A 3D top-down tower defense in the browser. Blocky toy-soldier towers hold the road against
waves of zombies, from Shamblers to the Dread Sovereign. Built with Three.js; no build step.

## Run it

```
npm start
```
then open **http://localhost:8080**. You need Node 18+. There are no dependencies to install,
because Three.js is vendored in `vendor/`. (`server.ps1` still works too.)

## How to play
- Pick a tower on the right (or press **1–0**), then click the grass to deploy it. Hold **Shift** to place several.
- Click a tower to open its panel: upgrade (**U**), change targeting (**T**), use its ability (**Q**), or sell (**Del**).
- **Space** starts the next wave. It can also send a wave early. **F** changes speed (1x/2x/3x). **Esc** pauses.
- Scroll to zoom, right-drag to pan.
- Watch for **Shades** (hidden, wave 11+) and **Carrion** (flying, wave 21+). You need towers that can see or hit them.

3 maps × 3 difficulties (Easy 30 / Medium 40 / Hard 50 waves). Bosses arrive on waves 15, 25, 30, 35, 40, 45 and 50.

## Project layout
```
src/config/   towers.js, enemies.js, waves.js, maps.js: all game content as data
src/game/     pure simulation (no rendering); runs headless in Node
src/render/   Three.js view: block characters, weapons, map diorama, particles, portraits
src/ui/       menus, HUD, shop, inspector
tools/        serve.mjs (dev server), sim.mjs (balance bot), check.mjs (content validator), gallery.html
docs/         ADDING_TOWERS.md
```

## Adding towers and zombies
See **[docs/ADDING_TOWERS.md](docs/ADDING_TOWERS.md)**. In short, add one block to
`src/config/towers.js` and run `npm run check`.

## Tools
- `npm run check`: validates content and runs a headless smoke battle with every tower.
- `npm run sim`: a bot plays every map × difficulty and reports how far it gets.
- `/tools/gallery.html`: renders every tower (base and max level), every zombie and every map.
