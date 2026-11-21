// Prints every wave's contents and total HP.   node tools/waves.mjs [from] [to]
import { getWave, isBossWave } from '../src/config/waves.js';
import { ENEMIES, MODIFIERS } from '../src/config/enemies.js';

const from = +(process.argv[2] || 1), to = +(process.argv[3] || 50);
let prev = 0;
for (let w = from; w <= to; w++) {
  const groups = getWave(w);
  const hp = groups.reduce((s, g) => s + g.count * ENEMIES[g.type].hp * (g.mods || []).reduce((m, k) => m * (MODIFIERS[k].hpMult || 1), 1), 0);
  const jump = prev ? `x${(hp / prev).toFixed(2)}` : '';
  prev = hp;
  const list = groups.map((g) => `${g.count} ${g.type}${g.mods ? `(${g.mods.join('+')})` : ''}`).join(', ');
  console.log(`${String(w).padStart(2)}${isBossWave(w) ? '*' : ' '} hp ${String(Math.round(hp)).padStart(6)} ${jump.padEnd(6)} ${list}`);
}
