// Rendering profiler for the running game. In the browser console on the game page:
//   const p = await import('/tests/render-profile.js');
//   p.setupCrowd();          // 40 towers + 250 zombies on Quarantine (replaces the current game)
//   p.profileFrames(180);    // median/p95 frame time, where it goes, draw calls, triangles
// Frames are stepped by hand at 60 fps, so it works even in a background tab.
import { TOWERS } from '../src/config/towers.js';

const TYPES = Object.keys(TOWERS);

export function setupCrowd({ zombies = 250, towers = 40, levels = 2 } = {}) {
  const app = window.app;
  localStorage.removeItem('blockade.run.v1');
  app.startGame('quarantine', 'hard');
  const g = app.game;
  g.cash = 1e9;
  let s = 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  let placed = 0;
  for (let i = 0; i < 6000 && placed < towers; i++) {
    const p = g.paths[i % g.paths.length].at(r() * g.paths[0].length);
    const x = p.x + (r() - 0.5) * 14, z = p.z + (r() - 0.5) * 14, type = TYPES[placed % TYPES.length];
    if (!g.canPlace(type, x, z).ok) continue;
    const t = g.placeTower(type, x, z);
    for (let k = 0; k < levels; k++) g.upgradeTower(t);
    placed++;
  }
  g.wave = 40; g.startNextWave();
  const kinds = ['brute', 'juggernaut', 'riot', 'shambler', 'runner'];
  for (let i = 0; i < zombies; i++) g.spawnEnemy(kinds[i % kinds.length], { pathIndex: i % g.paths.length, dist: (i * 0.37) % 60, wave: 40 });
  return g;
}

export function profileFrames(frames = 180, speed = 1) {
  const app = window.app, v = app.view, g = app.game;
  app.speed = speed;
  const T = {};
  const wrap = (obj, name, label) => {
    const f = obj[name];
    obj[name] = function (...a) { const t0 = performance.now(); try { return f.apply(this, a); } finally { T[label] = (T[label] || 0) + performance.now() - t0; } };
    return () => { obj[name] = f; };
  };
  const undo = [
    wrap(g, 'update', 'sim'), wrap(v, 'update', 'view.update'), wrap(v.fx, 'update', 'fx.update'), wrap(app.ui, 'update', 'ui.update'),
    wrap(v.scene, 'updateMatrixWorld', 'matrices'), wrap(v.batcher, 'update', 'batcher'), wrap(v.renderer, 'render', 'gl.render'),
  ];
  let now = app.last;
  const times = [];
  for (let f = 0; f < frames; f++) { now += 1000 / 60; const a = performance.now(); app.step(now); times.push(performance.now() - a); }
  undo.forEach((f) => f());
  times.sort((a, b) => a - b);
  const breakdown = {};
  for (const k in T) breakdown[k] = +(T[k] / frames).toFixed(2);
  let objects = 0; v.scene.traverse(() => objects++);
  const info = v.renderer.info.render;
  return {
    zombies: g.enemies.length, towers: g.towers.length,
    medianFrameMs: +times[frames >> 1].toFixed(2), p95FrameMs: +times[Math.floor(frames * 0.95)].toFixed(2),
    breakdown, drawCalls: info.calls, triangles: info.triangles, batches: v.batcher.batchCount, sceneObjects: objects,
  };
}
