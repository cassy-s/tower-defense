// Builds the 3D diorama for a map: tiled ground slab, road, scenery, spawn
// gates and the base. All static geometry is merged into a handful of meshes.
import * as THREE from 'three';
import { PartBuilder, shade } from './geo.js';
import { WIDTH, HEIGHT, PATH_WIDTH } from '../config/maps.js';
import { mulberry32, pickOne } from '../game/rng.js';

const MARGIN = 7;
const TILE = 2;

/** Map coords (0..WIDTH, 0..HEIGHT) -> world coords (centered at origin). */
export const toWorld = (x, z) => [x - WIDTH / 2, z - HEIGHT / 2];

export function buildWorld(game) {
  const theme = game.layout.theme;
  const rng = mulberry32(game.map.seed);
  const group = new THREE.Group();
  const b = new PartBuilder();
  const ox = -WIDTH / 2, oz = -HEIGHT / 2;

  // ------------------------------------------------------------ slab ------
  const x0 = -MARGIN, x1 = WIDTH + MARGIN, z0 = -MARGIN, z1 = HEIGHT + MARGIN;
  for (let x = x0; x < x1; x += TILE) {
    for (let z = z0; z < z1; z += TILE) {
      const inField = x >= 0 && x < WIDTH && z >= 0 && z < HEIGHT;
      let c = pickOne(rng, theme.grass);
      if (((x + z) / TILE) % 2 === 0) c = shade(c, 0.015);
      if (!inField) c = shade(c, -0.04);
      b.box(TILE, 0.4, TILE, c, ox + x + TILE / 2, -0.2 + (rng() - 0.5) * 0.02, oz + z + TILE / 2);
    }
  }
  const dirt = theme.night ? '#3a2f28' : '#7a5a3a';
  b.box(x1 - x0, 4, z1 - z0, dirt, ox + (x0 + x1) / 2, -2.4, oz + (z0 + z1) / 2);
  b.box(x1 - x0 + 0.1, 0.5, z1 - z0 + 0.1, theme.grassEdge, ox + (x0 + x1) / 2, -0.62, oz + (z0 + z1) / 2);
  // soil strata on the sides
  for (let i = 0; i < 3; i++) b.box(x1 - x0 + 0.12, 0.25, z1 - z0 + 0.12, shade(dirt, -0.06 * (i + 1)), ox + (x0 + x1) / 2, -1.6 - i * 1.1, oz + (z0 + z1) / 2);

  // ------------------------------------------------------------ road ------
  const roadY = 0.06;
  for (const path of game.paths) {
    const pts = path.points.map((p) => ({ x: Math.max(p.x, x0 + 0.5), z: p.z }));
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], c = pts[i];
      const len = Math.hypot(c.x - a.x, c.z - a.z);
      const ang = Math.atan2(c.x - a.x, c.z - a.z);
      const mx = ox + (a.x + c.x) / 2, mz = oz + (a.z + c.z) / 2;
      b.box(PATH_WIDTH + 0.7, 0.1, len, theme.pathEdge, mx, roadY - 0.03, mz, { ry: ang });
      b.box(PATH_WIDTH, 0.1, len, theme.path, mx, roadY, mz, { ry: ang });
    }
    for (const p of pts) {
      b.cyl((PATH_WIDTH + 0.7) / 2, (PATH_WIDTH + 0.7) / 2, 0.1, theme.pathEdge, ox + p.x, roadY - 0.03, oz + p.z, { seg: 20 });
      b.cyl(PATH_WIDTH / 2, PATH_WIDTH / 2, 0.1, theme.path, ox + p.x, roadY + 0.001, oz + p.z, { seg: 20 });
    }
    // Pebbles / cracks / stones on the road
    for (let d = 1; d < path.length; d += 1.3) {
      const q = path.at(d);
      const off = (rng() - 0.5) * (PATH_WIDTH - 0.8);
      const s = 0.2 + rng() * 0.35;
      b.box(s, 0.06, s * (0.6 + rng()), theme.pathDetail, ox + q.x - q.dz * off, roadY + 0.06, oz + q.z + q.dx * off, { ry: rng() * 3 });
    }
  }

  // -------------------------------------------------------- scenery -------
  const lights = [];
  for (const p of game.layout.props) buildProp(b, p, theme, ox, oz, lights);

  // Decorative border props in the margin (don't block anything).
  const borderTypes = theme.night ? ['deadtree', 'grave', 'rock', 'mushroom'] : theme.props.tent ? ['tree', 'sandbags', 'rock', 'barrel'] : ['tree', 'bush', 'tree', 'rock'];
  for (let i = 0; i < 70; i++) {
    const side = Math.floor(rng() * 4);
    const t = rng();
    let x = side < 2 ? x0 + t * (x1 - x0) : side === 2 ? x0 + 1 + rng() * (MARGIN - 2) : x1 - 1 - rng() * (MARGIN - 2);
    let z = side === 0 ? z0 + 1 + rng() * (MARGIN - 2) : side === 1 ? z1 - 1 - rng() * (MARGIN - 2) : z0 + t * (z1 - z0);
    if (game.paths.some((p) => p.distanceTo(Math.max(0, Math.min(WIDTH, x)), Math.max(0, Math.min(HEIGHT, z))) < PATH_WIDTH && (x < 2 || x > WIDTH - 2))) continue;
    if (Math.hypot(x - game.base.x - 3, z - game.base.z) < 8) continue;
    if (game.paths.some((p) => Math.hypot(x - p.points[0].x, z - p.points[0].z) < 6)) continue;
    buildProp(b, { type: pickOne(rng, borderTypes), x, z, rot: rng() * 6.28, scale: 0.9 + rng() * 0.5, seed: Math.floor(rng() * 1e9) }, theme, ox, oz, lights);
  }

  // ------------------------------------------------------ spawn gates -----
  const seenStarts = new Set();
  for (const path of game.paths) {
    const s = path.points[0];
    const key = `${s.x},${s.z}`;
    if (seenStarts.has(key)) continue;
    seenStarts.add(key);
    const gx = ox + 0.8, gz = oz + s.z;
    const stone = theme.night ? '#5b5f6b' : '#6d6a63';
    for (const side of [-1, 1]) {
      b.box(1.2, 4.2, 1.2, stone, gx, 2.1, gz + side * (PATH_WIDTH / 2 + 0.8), { r: 0.1 });
      b.box(1.5, 0.4, 1.5, shade(stone, -0.1), gx, 4.3, gz + side * (PATH_WIDTH / 2 + 0.8));
    }
    b.box(1.0, 0.8, PATH_WIDTH + 2.8, shade(stone, -0.05), gx, 4.1, gz, { r: 0.1 });
    b.box(0.3, 0.6, 1.6, '#8a1c1c', gx + 0.55, 3.9, gz);
    // warning stripes / skull sign
    b.box(0.1, 0.5, 0.5, '#e8e4d0', gx + 0.71, 3.9, gz, { glow: false });
    b.box(0.2, 3.6, PATH_WIDTH + 0.6, '#0f2a12', gx - 0.6, 1.9, gz, { glow: true });
  }

  // ------------------------------------------------------------ base ------
  const base = buildBase(b, theme, ox + game.base.x + 3.2, oz + game.base.z);

  const mesh = b.build();
  mesh.children.forEach((m) => { m.receiveShadow = true; });
  group.add(mesh);
  group.add(base.group);

  // Outer ground far below the slab, plus fog takes care of the horizon.
  const outer = new THREE.Mesh(
    new THREE.PlaneGeometry(600, 600),
    new THREE.MeshStandardMaterial({ color: shade(theme.grass[0], theme.night ? -0.12 : -0.18), roughness: 1 }),
  );
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = -4.4;
  outer.receiveShadow = true;
  group.add(outer);

  // A few real lights for night maps (lamps / gates).
  for (const l of lights.slice(0, 6)) {
    const pl = new THREE.PointLight(l.color, l.intensity, 14, 1.6);
    pl.position.set(l.x, l.y, l.z);
    group.add(pl);
  }
  return { group, flag: base.flag, bunker: base.group, basePos: new THREE.Vector3(ox + game.base.x + 3.2, 0, oz + game.base.z) };
}

/**
 * The bunker, roof extras and flag are their own group (so the view can shake
 * it when zombies get in); sandbags and posts merge into the static map.
 */
function buildBase(b, theme, x, z) {
  const concrete = theme.night ? '#6a6e78' : '#9a968c';
  const bb = new PartBuilder();
  // bunker
  bb.box(5.2, 3.0, 6.4, concrete, x + 1.2, 1.5, z, { r: 0.15 });
  bb.box(5.8, 0.5, 7.0, shade(concrete, -0.1), x + 1.2, 3.2, z, { r: 0.1 });
  bb.box(0.2, 0.5, 3.6, '#16181b', x - 1.42, 2.1, z);
  bb.box(0.15, 1.8, 1.4, '#3b2f22', x - 1.42, 0.9, z + 2.0);
  // roof extras: radio mast + crates
  bb.cyl(0.08, 0.08, 4, '#2a2a2a', x + 2.6, 5.4, z - 2.4);
  bb.box(1.0, 1.0, 1.0, '#a8743f', x + 2.4, 3.95, z + 2.0, { r: 0.04 });
  // sandbag wall in front (arc)
  for (let row = 0; row < 2; row++) {
    for (let i = -5; i <= 5; i++) {
      const a = i * 0.16;
      const r = 5.4;
      b.rbox(1.15, 0.5, 0.7, row ? '#bfa878' : '#a8936a', x + 1.2 - Math.cos(a) * r, 0.28 + row * 0.48, z + Math.sin(a) * r * 1.25 + (row ? 0.3 : 0), { ry: a + Math.PI / 2, r: 0.18 });
    }
  }
  // barbed posts
  for (let i = -3; i <= 3; i++) b.box(0.15, 1.3, 0.15, '#4a3a2a', x - 5.6, 0.65, z + i * 1.3);
  b.box(0.05, 0.05, 8, '#9a9a9a', x - 5.6, 1.1, z);
  b.box(0.05, 0.05, 8, '#9a9a9a', x - 5.6, 0.7, z);
  // flag pole
  bb.cyl(0.1, 0.1, 6, '#d8d8d8', x - 0.4, 6.2, z - 2.6);
  bb.sphere(0.2, '#e2c04f', x - 0.4, 9.25, z - 2.6);
  const flagGeo = new THREE.PlaneGeometry(2.4, 1.5, 8, 2);
  flagGeo.translate(1.2, 0, 0);
  const tex = flagTexture();
  const flag = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.9 }));
  flag.position.set(x - 0.4, 8.4, z - 2.6);
  flag.castShadow = true;
  flag.userData.base = flagGeo.attributes.position.array.slice();
  const group = new THREE.Group();
  const mesh = bb.build();
  mesh.children.forEach((m) => { m.receiveShadow = true; });
  group.add(mesh, flag);
  return { flag, group };
}

function flagTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 80;
  const g = c.getContext('2d');
  g.fillStyle = '#2f5f2a'; g.fillRect(0, 0, 128, 80);
  g.fillStyle = '#f2c64a'; g.fillRect(0, 34, 128, 12);
  g.fillStyle = '#1b1b1b'; g.beginPath(); g.arc(64, 40, 20, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#f2c64a'; g.font = 'bold 26px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('B', 64, 41);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ------------------------------------------------------------ props -------
function buildProp(b, p, theme, ox, oz, lights) {
  const r = mulberry32(p.seed || 1);
  const x = ox + p.x, z = oz + p.z, s = p.scale || 1, rot = p.rot || 0;
  const rotAround = (dx, dz) => [x + dx * Math.cos(rot) + dz * Math.sin(rot), z - dx * Math.sin(rot) + dz * Math.cos(rot)];
  const at = (dx, y, dz, fn) => { const [px, pz] = rotAround(dx * s, dz * s); fn(px, y * s, pz); };
  switch (p.type) {
    case 'tree': {
      const leaf = pickOne(r, ['#3f8f3a', '#4a9a3f', '#367f33', '#5aa845']);
      b.box(0.6 * s, 2.0 * s, 0.6 * s, '#6b4a2b', x, 1.0 * s, z);
      b.rbox(2.6 * s, 1.5 * s, 2.6 * s, leaf, x, 2.5 * s, z, { ry: rot, r: 0.3 });
      b.rbox(2.0 * s, 1.2 * s, 2.0 * s, shade(leaf, 0.05), x, 3.6 * s, z, { ry: rot + 0.4, r: 0.25 });
      b.rbox(1.2 * s, 0.9 * s, 1.2 * s, shade(leaf, 0.1), x, 4.5 * s, z, { ry: rot + 0.8, r: 0.2 });
      break;
    }
    case 'bush': {
      const c = pickOne(r, ['#4a9a3f', '#3f8f3a', '#5aa845']);
      b.rbox(1.4 * s, 0.9 * s, 1.2 * s, c, x, 0.45 * s, z, { ry: rot, r: 0.3 });
      at(0.6, 0.35, 0.3, (px, py, pz) => b.rbox(0.9 * s, 0.7 * s, 0.9 * s, shade(c, 0.06), px, py, pz, { ry: rot, r: 0.25 }));
      if (r() < 0.5) at(-0.2, 0.9, 0, (px, py, pz) => b.box(0.18, 0.18, 0.18, '#e84a5f', px, py, pz));
      break;
    }
    case 'rock': {
      const c = pickOne(r, ['#8a8a86', '#7a7b78', '#96958f']);
      b.rbox(1.6 * s, 0.9 * s, 1.3 * s, c, x, 0.4 * s, z, { ry: rot, rx: 0.1, r: 0.3 });
      at(0.6, 0.25, 0.4, (px, py, pz) => b.rbox(0.8 * s, 0.6 * s, 0.7 * s, shade(c, 0.05), px, py, pz, { ry: rot * 2, r: 0.2 }));
      break;
    }
    case 'flower': {
      const c = pickOne(r, ['#ff6b8a', '#ffd23f', '#ffffff', '#b28dff', '#ff8a3d']);
      b.box(0.06, 0.4, 0.06, '#3f8f3a', x, 0.2, z);
      b.box(0.24, 0.12, 0.24, c, x, 0.42, z, { ry: rot });
      break;
    }
    case 'house': {
      const wall = pickOne(r, ['#e9dcc0', '#c9d8e8', '#f0c9a8', '#d8e8c9']);
      const roof = pickOne(r, ['#8a3a2f', '#3f4a6a', '#5a4a3a']);
      const w = 5.4 * s, d = 4.6 * s;
      b.box(w, 3.0 * s, d, wall, x, 1.5 * s, z, { ry: rot, r: 0.05 });
      b.add(coneRoof(), roof, x, 3.0 * s + 1.0 * s, z, { ry: rot + Math.PI / 4, sx: w * 0.78, sy: 2.0 * s, sz: d * 0.78 });
      at(0, 1.0, d / s / 2 + 0.02, (px, py, pz) => b.box(0.9 * s, 1.9 * s, 0.1, '#6b4a2b', px, py, pz, { ry: rot }));
      for (const dx of [-1.6, 1.6]) at(dx, 1.8, d / s / 2 + 0.02, (px, py, pz) => b.box(0.9 * s, 0.8 * s, 0.1, '#1d2a3a', px, py, pz, { ry: rot }));
      // boarded windows
      for (const dx of [-1.6, 1.6]) at(dx, 1.8, d / s / 2 + 0.08, (px, py, pz) => b.box(1.1 * s, 0.18 * s, 0.08, '#8a6a3a', px, py, pz, { ry: rot, rz: 0.3 }));
      at(1.6, 3.6, -0.8, (px, py, pz) => b.box(0.6 * s, 1.4 * s, 0.6 * s, '#7a4a3a', px, py, pz, { ry: rot }));
      break;
    }
    case 'car': {
      const c = pickOne(r, ['#c23b3b', '#3b6ac2', '#d8d8d0', '#3bb07a', '#e0a030']);
      const rust = shade(c, -0.2);
      b.box(3.8 * s, 0.9 * s, 1.9 * s, c, x, 0.75 * s, z, { ry: rot, rz: 0.04, r: 0.12 });
      at(-0.3, 1.5, 0, (px, py, pz) => b.box(2.0 * s, 0.75 * s, 1.75 * s, rust, px, py, pz, { ry: rot, r: 0.1 }));
      at(-0.3, 1.5, 0, (px, py, pz) => b.box(2.05 * s, 0.5 * s, 1.6 * s, '#1d2a3a', px, py, pz, { ry: rot }));
      for (const [dx, dz] of [[1.2, 0.9], [-1.2, 0.9], [1.2, -0.9], [-1.2, -0.9]]) at(dx, 0.4, dz, (px, py, pz) => b.cyl(0.42 * s, 0.42 * s, 0.35 * s, '#1a1a1a', px, py, pz, { rx: Math.PI / 2, ry: rot, order: 'YXZ', seg: 10 }));
      if (r() < 0.5) at(1.9, 0.9, 0.6, (px, py, pz) => b.box(0.1, 0.25, 0.4, '#fff4c0', px, py, pz, { ry: rot, glow: true }));
      break;
    }
    case 'fence': {
      const wood = theme.night ? '#3a3540' : '#c9a26a';
      for (const dx of [-1.4, 0, 1.4]) at(dx, 0.55, 0, (px, py, pz) => b.box(0.18, 1.1, 0.18, shade(wood, -0.1), px, py, pz, { ry: rot }));
      for (const y of [0.4, 0.85]) at(0, y, 0, (px, py, pz) => b.box(3.0 * s, 0.14, 0.1, wood, px, py, pz, { ry: rot }));
      break;
    }
    case 'lamp': {
      b.box(0.18, 3.4, 0.18, '#2a2a2e', x, 1.7, z);
      b.box(0.8, 0.12, 0.18, '#2a2a2e', x + 0.3, 3.4, z);
      b.box(0.36, 0.3, 0.36, theme.night ? '#ffd27a' : '#fff4c0', x + 0.6, 3.25, z, { glow: true });
      if (theme.night) lights.push({ x: x + 0.6, y: 3.0, z, color: '#ffc46a', intensity: 9 });
      break;
    }
    case 'mailbox': {
      b.box(0.12, 1.0, 0.12, '#5a4a3a', x, 0.5, z);
      b.box(0.45, 0.4, 0.7, '#3b5ac2', x, 1.1, z, { ry: rot, r: 0.1 });
      break;
    }
    case 'tent': {
      const c = pickOne(r, ['#5c6b3a', '#6b6a42', '#4b5a32']);
      b.add(prismGeo(), c, x, 1.25 * s, z, { ry: rot, sx: 3.6 * s, sy: 2.5 * s, sz: 4.5 * s });
      at(0, 0.7, 2.26, (px, py, pz) => b.box(1.0 * s, 1.4 * s, 0.05, '#2a2a1e', px, py, pz, { ry: rot }));
      break;
    }
    case 'sandbags': {
      for (let row = 0; row < 2; row++) for (let i = -1; i <= 1; i++) at(i * 0.95 + row * 0.45, 0.28 + row * 0.46, 0, (px, py, pz) => b.rbox(1.0 * s, 0.48, 0.7, row ? '#c4ae80' : '#ae9a70', px, py, pz, { ry: rot, r: 0.18 }));
      break;
    }
    case 'crate': {
      const c = pickOne(r, ['#a8743f', '#8a6a3a', '#4b5a32']);
      b.box(1.3 * s, 1.3 * s, 1.3 * s, c, x, 0.65 * s, z, { ry: rot, r: 0.03 });
      b.box(1.36 * s, 0.16 * s, 1.36 * s, shade(c, -0.12), x, 0.1 * s, z, { ry: rot });
      b.box(1.36 * s, 0.16 * s, 1.36 * s, shade(c, -0.12), x, 1.2 * s, z, { ry: rot });
      if (r() < 0.5) at(0.2, 1.3 + 0.5, 0.1, (px, py, pz) => b.box(0.9 * s, 0.9 * s, 0.9 * s, shade(c, 0.05), px, py, pz, { ry: rot + 0.4, r: 0.03 }));
      break;
    }
    case 'barrel': {
      const c = pickOne(r, ['#b33a2a', '#3a6a3a', '#3a4a7a', '#d8b02a']);
      b.cyl(0.55 * s, 0.55 * s, 1.4 * s, c, x, 0.7 * s, z, { seg: 12 });
      for (const y of [0.3, 1.1]) b.cyl(0.58 * s, 0.58 * s, 0.1, shade(c, -0.15), x, y * s, z, { seg: 12 });
      break;
    }
    case 'tower': {
      for (const [dx, dz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) at(dx, 2.5, dz, (px, py, pz) => b.box(0.25, 5, 0.25, '#6b4a2b', px, py, pz));
      b.box(3.2, 0.25, 3.2, '#8a6a3a', x, 5, z, { ry: rot });
      b.box(3.2, 1.0, 0.12, '#8a6a3a', x, 5.6, z + 1.55, { ry: 0 });
      b.add(coneRoof(), '#4b5a32', x, 7.2, z, { ry: Math.PI / 4, sx: 2.6, sy: 1.4, sz: 2.6 });
      break;
    }
    case 'cone': {
      b.cone(0.3, 0.8, '#ff7a1a', x, 0.4, z, { seg: 8 });
      b.cyl(0.24, 0.24, 0.12, '#ffffff', x, 0.45, z, { seg: 8 });
      b.box(0.7, 0.06, 0.7, '#ff7a1a', x, 0.03, z, { ry: rot });
      break;
    }
    case 'barrier': {
      b.box(2.2 * s, 0.9, 0.6, '#c9c4b8', x, 0.45, z, { ry: rot, r: 0.08 });
      for (const dx of [-0.6, 0.2]) at(dx, 0.55, 0, (px, py, pz) => b.box(0.35, 0.3, 0.62, '#d84a2a', px, py, pz, { ry: rot, rz: 0.6 }));
      break;
    }
    case 'grave': {
      const stone = pickOne(r, ['#8a8d96', '#7a7d86', '#9a9da6']);
      b.box(0.9 * s, 1.2 * s, 0.25, stone, x, 0.6 * s, z, { ry: rot, rz: (r() - 0.5) * 0.2, r: 0.12 });
      at(0, 0.08, 0.9, (px, py, pz) => b.box(0.9 * s, 0.16, 1.4 * s, '#3a2f28', px, py, pz, { ry: rot }));
      if (r() < 0.3) at(0, 1.4, 0, (px, py, pz) => b.box(0.15, 0.6, 0.15, stone, px, py, pz, { ry: rot }));
      break;
    }
    case 'deadtree': {
      const c = theme.night ? '#3a3035' : '#5a4a3a';
      b.box(0.5 * s, 3.2 * s, 0.5 * s, c, x, 1.6 * s, z, { rz: 0.05 });
      for (let i = 0; i < 4; i++) {
        const a = rot + i * 1.7, h = 1.6 + i * 0.5;
        b.box(0.22 * s, 1.5 * s, 0.22 * s, c, x + Math.cos(a) * 0.5 * s, h * s, z + Math.sin(a) * 0.5 * s, { ry: -a, rz: 0.8 });
      }
      break;
    }
    case 'pumpkin': {
      b.rbox(0.9 * s, 0.7 * s, 0.9 * s, '#e8741a', x, 0.35 * s, z, { ry: rot, r: 0.25 });
      b.box(0.1, 0.25, 0.1, '#3f6a2a', x, 0.8 * s, z);
      at(0, 0.38, 0.46, (px, py, pz) => b.box(0.45 * s, 0.18 * s, 0.05, '#ffd27a', px, py, pz, { ry: rot, glow: true }));
      break;
    }
    case 'crypt': {
      const st = '#6a6e7a';
      b.box(4.6 * s, 3.0 * s, 4.0 * s, st, x, 1.5 * s, z, { ry: rot, r: 0.08 });
      b.add(coneRoof(), shade(st, -0.12), x, 3.9 * s, z, { ry: rot + Math.PI / 4, sx: 3.8 * s, sy: 1.8 * s, sz: 3.4 * s });
      at(0, 1.2, 2.02, (px, py, pz) => b.box(1.3 * s, 2.2 * s, 0.1, '#14161c', px, py, pz, { ry: rot }));
      at(0, 1.2, 2.06, (px, py, pz) => b.box(0.9 * s, 0.25, 0.05, '#7dff6a', px, py, pz, { ry: rot, glow: true }));
      for (const dx of [-1.1, 1.1]) at(dx, 1.6, 2.1, (px, py, pz) => b.box(0.45 * s, 3.2 * s, 0.45 * s, shade(st, 0.08), px, py, pz, { ry: rot }));
      break;
    }
    case 'mushroom': {
      const c = pickOne(r, ['#7dff6a', '#6ad8ff', '#c08aff']);
      b.box(0.12, 0.35, 0.12, '#d8d0c0', x, 0.18, z);
      b.rbox(0.4, 0.18, 0.4, c, x, 0.4, z, { r: 0.06, glow: true });
      break;
    }
    default: break;
  }
}

let _roof = null;
function coneRoof() { if (!_roof) { _roof = new THREE.ConeGeometry(1, 1, 4).toNonIndexed(); } return _roof; }
let _prism = null;
function prismGeo() {
  if (!_prism) { _prism = new THREE.CylinderGeometry(0.58, 0.58, 1, 3).toNonIndexed(); _prism.rotateX(Math.PI / 2); _prism.rotateZ(Math.PI / 2); _prism.translate(0, 0.21, 0); _prism.scale(1, 1, 1); }
  return _prism;
}
