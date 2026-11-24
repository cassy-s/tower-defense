# BLOCKADE — Zombie Tower Defense

A 3D top-down tower defense in the browser. Blocky toy-soldier towers hold the road against
waves of zombies, from Shamblers to the Dread Sovereign. Built with Three.js; no build step.

## ▶ [PLAY IN YOUR BROWSER](https://cassy-s.github.io/tower-defense/)

No install needed — just click the link above.

## Run it locally (only for developing)

```
npm start
```
then open **http://localhost:8080**. You need Node 18+. There are no dependencies to install,
because Three.js and the fonts are vendored in `vendor/`.

No Node? On Windows, `powershell -ExecutionPolicy Bypass -File server.ps1` serves the same thing.

## How to play
- Pick a tower on the right (or press **1–0**), then click the grass to deploy it. Hold **Shift** to place several.
- Click a tower to open its panel: upgrade (**U** or **E**), change targeting (**T**, **Shift+T** back), use its ability (**Q**), or sell (**Del** twice).
- A tower sold before the next wave starts is refunded in full, so a misplaced tower costs nothing.
- **Space** starts the next wave. It can also send a wave early. **F** changes speed (1x/2x/3x). **Esc** closes whatever is open, or pauses. **M** mutes.
- Scroll to zoom, right-drag to pan.
- The game saves between waves. Press **CONTINUE** on the title screen to pick up where you left off.
- Watch for **Shades** (hidden, wave 11+) and **Carrion** (flying, wave 21+). Only towers that see hidden zombies can target Shades (explosions still catch them), and only towers that hit flying can hurt Carrion.

3 maps × 3 difficulties (Easy 30 / Medium 40 / Hard 50 waves). Bosses arrive on waves 15, 25, 30, 35, 40, 45 and 50.

## Project layout
```
src/config/   towers.js, enemies.js, waves.js, maps.js: all game content as data
src/game/     pure simulation (no rendering); runs headless in Node
src/render/   Three.js view: block characters, weapons, map diorama, particles, portraits
src/ui/       menus, HUD, shop, inspector
tests/        simulation tests (run by `npm test`, or open /tests/ in the browser)
tools/        serve.mjs (dev server), sim.mjs (balance bot), check.mjs (content validator), test.mjs, stamp.mjs, gallery.html
docs/         ADDING_TOWERS.md
```

## Adding towers and zombies
See **[docs/ADDING_TOWERS.md](docs/ADDING_TOWERS.md)**. In short, add one block to
`src/config/towers.js` and run `npm run check`.

## Tools
- `npm run check`: validates content and runs a headless smoke battle with every tower.
- `npm test`: simulation tests (targeting, waves, win/loss, save/load, and the bugs from the last review). The same tests run in the browser at `/tests/`.
- `npm run stamp`: gives every module a content-hash URL in `index.html` so a deploy never mixes old and new files, and writes the build id to `build.txt` (a page that is an old cached copy sees a different id and loads the new one). Run it before committing (CI checks). Without Node: `tools\stamp.ps1`.
- `npm run sim`: a bot plays every map × difficulty and reports how far it gets.
- `node tools/waves.mjs 1 50`: prints every wave's zombies and total HP. Useful when tuning.
- `/tools/gallery.html`: renders every tower (base and max level), every zombie and every map.
