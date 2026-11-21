// Deterministic scenery layout for a map. Shared by the renderer (to draw it)
// and the game logic (props block tower placement).
import { WIDTH, HEIGHT, PATH_WIDTH, THEMES } from '../config/maps.js';
import { mulberry32 } from './rng.js';

// radius = footprint that blocks towers; 0 = decoration only
export const PROP_RADIUS = {
  tree: 1.3, bush: 0.8, rock: 0.9, house: 3.6, car: 2.0, fence: 1.4, lamp: 0.45, mailbox: 0.35, flower: 0,
  tent: 2.6, sandbags: 1.3, crate: 0.8, barrel: 0.6, tower: 1.9, cone: 0.3, barrier: 1.1,
  grave: 0.6, deadtree: 1.0, pumpkin: 0.5, crypt: 3.0, mushroom: 0,
};
const EDGE_BIAS = { tree: 0.7, house: 0.9, tent: 0.6, tower: 0.8, deadtree: 0.5, crypt: 0.8, car: 0.3 };

export function buildLayout(map, paths) {
  const theme = THEMES[map.theme];
  const rng = mulberry32(map.seed * 1000 + 7);
  const props = [];
  const start = paths.map((p) => p.points[0]);
  const end = paths[0].points[paths[0].points.length - 1];
  const clearOf = (x, z, r) => {
    for (const p of paths) if (p.distanceTo(x, z) < PATH_WIDTH / 2 + r + 0.7) return false;
    if (Math.hypot(x - end.x, z - end.z) < 6 + r) return false;
    for (const s of start) if (Math.hypot(x - s.x, z - s.z) < 3 + r) return false;
    for (const o of props) {
      const min = (o.radius || 0.3) + (r || 0.3) + 0.3;
      if ((o.x - x) ** 2 + (o.z - z) ** 2 < min * min) return false;
    }
    return true;
  };
  // Big props first so they find room.
  const order = Object.entries(theme.props).sort((a, b) => (PROP_RADIUS[b[0]] || 0) - (PROP_RADIUS[a[0]] || 0));
  for (const [type, count] of order) {
    const baseR = PROP_RADIUS[type] ?? 0.5;
    for (let n = 0; n < count; n++) {
      for (let tries = 0; tries < 40; tries++) {
        const scale = 0.8 + rng() * 0.45;
        const r = baseR * scale;
        let x, z;
        if (rng() < (EDGE_BIAS[type] || 0)) {
          const side = Math.floor(rng() * 4);
          const inset = 1 + r + rng() * 4;
          x = side === 0 ? inset : side === 1 ? WIDTH - inset : 1 + rng() * (WIDTH - 2);
          z = side === 2 ? inset : side === 3 ? HEIGHT - inset : 1 + rng() * (HEIGHT - 2);
        } else {
          x = 1 + r + rng() * (WIDTH - 2 - 2 * r);
          z = 1 + r + rng() * (HEIGHT - 2 - 2 * r);
        }
        if (!clearOf(x, z, r)) continue;
        props.push({ type, x, z, rot: rng() * Math.PI * 2, scale, radius: r, seed: Math.floor(rng() * 1e9) });
        break;
      }
    }
  }
  return { props, theme };
}
