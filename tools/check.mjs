// Validates all game content and runs a quick headless smoke test.
//   npm run check
import { validateContent } from '../src/config/schema.js';
import { TOWERS } from '../src/config/towers.js';
import { Game } from '../src/game/game.js';

const errors = validateContent();
if (errors.length) {
  console.error(`✗ ${errors.length} problem(s) in game content:`);
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
console.log('✓ content valid');

// Smoke test: every tower at every level fights a few waves without crashing.
for (const type of Object.keys(TOWERS)) {
  const g = new Game({ mapId: 'maple', difficulty: 'easy', cashOverride: 1e7 });
  const spots = [[10, 14], [20, 22], [34, 17], [40, 25], [50, 26]];
  for (const [x, z] of spots) {
    const t = g.placeTower(type, x, z);
    if (t) while (t.nextUpgrade) g.upgradeTower(t);
  }
  if (!g.towers.length) { console.error(`✗ could not place ${type} anywhere`); process.exit(1); }
  g.wave = 10;
  for (let w = 0; w < 3; w++) { g.startNextWave(); for (let i = 0; i < 60 * 40; i++) g.update(1 / 60); }
  const dmg = g.towers.reduce((s, t) => s + t.damageDealt, 0);
  const bad = g.towers.some((t) => !Number.isFinite(t.damageDealt)) || !Number.isFinite(g.cash);
  if (bad) { console.error(`✗ ${type}: NaN/Infinity detected`); process.exit(1); }
  console.log(`✓ ${type.padEnd(10)} placed ${g.towers.length}, dealt ${Math.round(dmg)} damage${TOWERS[type].stats.attack === 'none' ? ' (support)' : ''}`);
}
