// Blocky character models for towers and zombies.
//
// Everything is built in "character units": legs 2 tall, torso 2x2x1,
// head ~1.2 cube (classic toy-figure proportions), then scaled to studs.
// Each limb is merged into a single vertex-coloured mesh so a whole figure is
// only ~8 draw calls.
import * as THREE from 'three';
import { PartBuilder, faceDecal, shade, MAT } from './geo.js';
import { buildWeapon } from './weapons.js';
import { mulberry32, pickOne } from '../game/rng.js';

export const CHAR_SCALE = 0.66; // character units -> studs

function newRig() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = 2;
  body.add(hips);
  root.add(body);
  root.name = 'root'; body.name = 'body'; hips.name = 'hips';
  const mk = (name, x, y, z, parent = hips) => { const g = new THREE.Group(); g.name = name; g.position.set(x, y, z); parent.add(g); return g; };
  return {
    root, body, hips,
    torso: mk('torso', 0, 0, 0),
    head: mk('head', 0, 2, 0),
    armL: mk('armL', -1.5, 1.8, 0), armR: mk('armR', 1.5, 1.8, 0),
    legL: mk('legL', -0.5, 0, 0), legR: mk('legR', 0.5, 0, 0),
    mount: mk('mount', 0.3, 1.45, 1.0),
    spinners: [], wings: [], muzzle: null, pose: 'twoHand', extra: {},
  };
}

const RIG_PARTS = ['body', 'hips', 'torso', 'head', 'armL', 'armR', 'legL', 'legR', 'mount'];

/** Cheap copy of a rig that shares all geometry with the original. */
export function cloneRig(t) {
  const root = t.root.clone(true);
  const rig = { ...t, root, extra: {}, spinners: [] };
  for (const n of RIG_PARTS) rig[n] = root.getObjectByName(n);
  rig.wings = t.wings.map((_, i) => root.getObjectByName(`wing${i}`));
  return rig;
}

/** Mark every geometry under obj as shared so disposeTree() leaves it alone. */
export function markShared(obj) {
  obj.traverse((o) => { if (o.geometry) o.geometry.userData.shared = true; });
  return obj;
}

function attach(group, builder, opts) { const m = builder.build(opts); group.add(m); return m; }

// ---------------------------------------------------------------- parts ----
function crack(b, x, y, z, nx, nz, rng, color, len = 0.9) {
  // A little zig-zag crack on a surface facing (nx, nz).
  const ry = Math.atan2(nx, nz);
  let cy = y + len / 2, cx = 0;
  for (let i = 0; i < 3; i++) {
    const seg = len / 3;
    const ang = (rng() - 0.5) * 1.4;
    const px = x + Math.cos(ry) * cx, pz = z - Math.sin(ry) * cx;
    b.box(0.11, seg * 1.15, 0.05, color, px, cy - seg / 2, pz, { ry, rz: ang });
    cx += Math.sin(ang) * seg * 0.6;
    cy -= seg;
  }
}

function headBase(b, L, opts = {}) {
  const w = opts.w || 1.2;
  if (opts.cylinder) b.cyl(0.62 * w / 1.2, 0.62 * w / 1.2, 1.2, L.skin, 0, 0.6, 0, { seg: 16 });
  else b.rbox(w, 1.2, w, L.skin, 0, 0.6, 0, { r: 0.3 });
}

function hat(b, L) {
  const c = L.hatColor || '#3d5a2c';
  switch (L.hat) {
    case 'cap':
      b.rbox(1.3, 0.5, 1.3, c, 0, 1.22, -0.02, { r: 0.18 });
      b.box(1.05, 0.09, 0.62, shade(c, -0.05), 0, 1.03, 0.78, { r: 0.03 });
      break;
    case 'helmet':
      b.rbox(1.42, 0.72, 1.46, c, 0, 1.2, 0, { r: 0.32 });
      b.box(1.5, 0.12, 1.54, shade(c, -0.08), 0, 0.92, 0, { r: 0.05 });
      b.box(0.8, 0.08, 0.06, '#1b1b1b', 0, 1.15, 0.74);
      break;
    case 'beret':
      b.rbox(1.35, 0.32, 1.35, c, 0.08, 1.3, 0, { r: 0.14, rz: -0.18 });
      b.box(0.22, 0.2, 0.06, '#d6b44a', -0.35, 1.25, 0.66);
      break;
    case 'boonie':
      b.rbox(1.28, 0.5, 1.28, c, 0, 1.26, 0, { r: 0.16 });
      b.box(2.0, 0.08, 2.0, shade(c, -0.04), 0, 1.04, 0, { r: 0.04 });
      b.box(1.3, 0.12, 1.3, shade(c, -0.15), 0, 1.1, 0);
      break;
    case 'officer':
      b.box(1.3, 0.34, 1.3, shade(c, -0.1), 0, 1.15, 0, { r: 0.08 });
      b.rbox(1.5, 0.3, 1.55, c, 0, 1.42, 0.06, { r: 0.12 });
      b.box(1.0, 0.07, 0.42, '#141414', 0, 1.0, 0.8, { rx: 0.15 });
      b.box(0.3, 0.26, 0.06, '#e2c04f', 0, 1.3, 0.76);
      break;
    case 'welder':
      b.box(1.32, 1.12, 0.16, '#3b3b3b', 0, 0.6, 0.68, { r: 0.05 });
      b.box(0.95, 0.26, 0.06, '#0e0e10', 0, 0.72, 0.77);
      b.box(1.3, 0.14, 1.3, '#2a2a2a', 0, 1.08, 0);
      break;
    case 'bandana':
      b.box(1.26, 0.28, 1.26, c, 0, 1.0, 0, { r: 0.05 });
      b.rbox(1.24, 0.25, 1.24, c, 0, 1.17, 0, { r: 0.12 });
      b.box(0.3, 0.45, 0.12, c, 0.15, 0.85, -0.66, { rz: 0.3 });
      break;
    default: break;
  }
}

function hair(b, L) {
  const c = L.hairColor || '#3a2a1a';
  const hi = shade(c, 0.1);
  if (L.hair === 'ponytail') {
    b.rbox(1.3, 0.42, 1.32, c, 0, 1.2, -0.02, { r: 0.18 });
    b.box(1.28, 0.95, 0.32, c, 0, 0.75, -0.5, { r: 0.1 });
    const tail = [[0, 1.45, -0.45, 0.62], [0, 1.72, -0.82, 0.56], [0, 1.72, -1.22, 0.5], [0, 1.45, -1.52, 0.46], [0, 1.05, -1.62, 0.42], [0, 0.66, -1.6, 0.36], [0, 0.32, -1.5, 0.3]];
    tail.forEach(([x, y, z, s], i) => b.rbox(s, s, s, i % 2 ? hi : c, x, y, z, { rx: 0.4 * i, r: s * 0.25 }));
    b.box(0.4, 0.16, 0.4, '#e0b33a', 0, 1.36, -0.32);
  } else if (L.hair === 'short') {
    b.rbox(1.3, 0.4, 1.3, c, 0, 1.16, -0.04, { r: 0.15 });
    b.box(1.28, 0.6, 0.26, c, 0, 0.85, -0.54, { r: 0.08 });
  } else if (L.hair === 'long') {
    b.rbox(1.3, 0.4, 1.3, c, 0, 1.16, -0.04, { r: 0.15 });
    b.box(1.34, 1.9, 0.3, c, 0, 0.3, -0.56, { r: 0.08 });
    b.box(0.25, 1.4, 1.1, c, -0.66, 0.4, -0.1); b.box(0.25, 1.4, 1.1, c, 0.66, 0.4, -0.1);
  }
}

function headExtras(b, L) {
  if (L.goggles) {
    b.box(1.27, 0.16, 1.27, '#2a2a2a', 0, 0.98, 0);
    for (const x of [-0.28, 0.28]) {
      b.cyl(0.19, 0.19, 0.16, '#555a60', x, 0.98, 0.64, { rx: Math.PI / 2, seg: 10 });
      b.cyl(0.14, 0.14, 0.04, '#9fe3ff', x, 0.98, 0.73, { rx: Math.PI / 2, seg: 10, glow: true });
    }
  }
  if (L.sunglasses) b.box(0.98, 0.2, 0.06, '#0c0c0c', 0, 0.68, 0.63, { r: 0.02 });
  if (L.ghillie) {
    const rng = mulberry32(5);
    for (let i = 0; i < 9; i++) b.box(0.25, 0.5, 0.25, pickOne(rng, ['#4b5a32', '#5c6b3a', '#3d4a28']), (rng() - 0.5) * 1.3, 1.35 + rng() * 0.2, (rng() - 0.5) * 1.3, { rx: rng() - 0.5, rz: rng() - 0.5 });
  }
}

function legs(rig, L, opts = {}) {
  const shoe = L.shoes || shade(L.pants, -0.15);
  for (const [g, side] of [[rig.legL, -1], [rig.legR, 1]]) {
    const b = new PartBuilder();
    const w = opts.w || 1;
    b.box(w, 1.62, w, L.pants, 0, -0.8, 0, { r: 0.06 });
    b.box(w + 0.04, 0.42, w + 0.06, shoe, 0, -1.79, 0.03, { r: 0.07 });
    if (L.kneepads) b.rbox(0.72, 0.5, 0.16, '#1f2022', 0, -1.0, 0.54);
    if (L.legStraps) { b.box(1.06, 0.18, 1.06, L.belt || '#3a2a20', 0, -0.45, 0); b.box(0.26, 0.24, 0.06, L.buckles || '#d4a934', side * 0.1, -0.45, 0.55); }
    if (L.armorLegs) { b.box(1.08, 0.6, 1.08, L.armorLegs, 0, -0.5, 0, { r: 0.06 }); b.box(0.3, 0.3, 0.08, L.crystal, 0, -1.4, 0.55, { rz: Math.PI / 4, glow: true }); }
    attach(g, b);
  }
}

function arms(rig, L, opts = {}) {
  const sleeve = L.sleeves || L.shirt;
  const w = opts.w || 1;
  for (const [g, side] of [[rig.armL, -1], [rig.armR, 1]]) {
    const b = new PartBuilder();
    b.box(w, 0.85, w, sleeve, 0, -0.22, 0, { r: 0.07 });
    b.box(w * 0.98, 1.2, w * 0.98, L.skin, 0, -1.22, 0, { r: 0.07 });
    if (L.gloves) b.box(w * 1.02, 0.45, w * 1.02, L.gloves, 0, -1.6, 0, { r: 0.07 });
    if (opts.cracks) { crack(b, side * 0.51 * w, -1.2, 0, side, 0, opts.rng, opts.crackColor, 1.1); crack(b, 0, -0.8, 0.51 * w, 0, 1, opts.rng, opts.crackColor, 0.7); }
    if (L.pauldron) b.rbox(1.35, 0.7, 1.35, L.pauldron, side * 0.05, 0.1, 0, { r: 0.15 });
    attach(g, b);
  }
}

function torsoBase(b, L) {
  b.box(2, 2, 1, L.shirt, 0, 1, 0, { r: 0.07 });
}

function torsoExtras(b, L) {
  if (L.vest) {
    b.box(2.08, 1.45, 1.12, L.vest, 0, 1.2, 0, { r: 0.08 });
    for (const x of [-0.55, 0.55]) b.box(0.2, 0.62, 1.14, shade(L.vest, -0.08), x, 1.95, 0);
    if (L.pouches) for (const x of [-0.6, 0, 0.6]) b.rbox(0.48, 0.5, 0.24, shade(L.vest, 0.06), x, 0.85, 0.62);
  }
  if (L.belt) {
    b.box(2.06, 0.28, 1.08, L.belt, 0, 0.16, 0);
    b.box(0.32, 0.24, 0.08, L.buckles || '#9a9ca0', 0, 0.16, 0.56);
    if (L.buckles) b.box(0.24, 0.28, 0.08, L.buckles, 0.7, 0.2, 0.56);
  }
  if (L.bandolier) {
    b.box(0.26, 2.7, 0.08, '#5a3a1e', 0, 1.0, 0.54, { rz: 0.72 });
    for (let i = -3; i <= 3; i++) b.box(0.12, 0.2, 0.1, '#d6a93a', i * 0.24, 1.0 + i * 0.21, 0.6, { rz: 0.72 });
  }
  if (L.backpack) {
    b.rbox(1.5, 1.5, 0.6, L.backpack, 0, 1.15, -0.8, { r: 0.12 });
    b.cyl(0.22, 0.22, 1.3, '#4b5a32', 0, 2.0, -0.8, { rz: Math.PI / 2 });
  }
  if (L.tank) {
    for (const x of [-0.42, 0.42]) {
      b.cyl(0.34, 0.34, 1.6, L.tank, x, 1.15, -0.85, { seg: 12 });
      b.sphere(0.34, L.tank, x, 1.95, -0.85, { seg: 10, sy: 0.6 });
      b.cyl(0.08, 0.08, 0.25, '#888', x, 2.15, -0.85);
    }
  }
  if (L.medals) { b.box(0.22, 0.32, 0.06, '#c2342a', -0.55, 1.45, 0.53); b.box(0.22, 0.32, 0.06, '#2a6ac2', -0.25, 1.45, 0.53); b.box(0.2, 0.2, 0.08, '#e2c04f', -0.55, 1.22, 0.56); }
  if (L.radio) { b.box(0.7, 0.9, 0.42, '#3a4030', 0.45, 1.2, -0.72, { r: 0.06 }); b.cyl(0.03, 0.03, 1.6, '#111', 0.7, 2.4, -0.72); }
  if (L.cape) b.box(2.1, 2.6, 0.1, L.cape, 0, 0.6, -0.6, { rx: 0.12 });
}

function crates(rig, n) {
  if (!n) return;
  const b = new PartBuilder();
  const spots = [[2.2, 0, -1.4], [-2.2, 0, -1.6], [2.2, 1.3, -1.4], [0, 0, -2.6], [-2.2, 1.3, -1.6], [0, 1.3, -2.6]];
  const colors = ['#a8743f', '#4b5a32', '#a8743f', '#8a6a3a', '#4b5a32', '#a8743f'];
  for (let i = 0; i < Math.min(n + 1, spots.length); i++) {
    const [x, y, z] = spots[i];
    const c = colors[i];
    b.box(1.3, 1.3, 1.3, c, x, y + 0.65, z, { r: 0.04 });
    b.box(1.36, 0.16, 1.36, shade(c, -0.12), x, y + 0.08, z);
    b.box(1.36, 0.16, 1.36, shade(c, -0.12), x, y + 1.22, z);
    b.box(0.16, 1.2, 1.36, shade(c, -0.12), x, y + 0.65, z);
  }
  const m = b.build();
  rig.body.add(m);
}

function applyPose(rig) {
  const { armL, armR, mount } = rig;
  armL.rotation.order = armR.rotation.order = 'YXZ';
  switch (rig.pose) {
    case 'heavy':
      armR.rotation.set(-1.0, -0.2, 0); armL.rotation.set(-1.1, 0.55, 0);
      mount.position.set(0.15, 0.85, 1.25);
      break;
    case 'oneHand':
      armR.rotation.set(-1.5, -0.1, 0); armL.rotation.set(0.1, 0, 0.1);
      mount.position.set(1.35, 1.75, 1.95);
      break;
    case 'board':
      armR.rotation.set(-0.3, 0, 0); armL.rotation.set(-1.2, 0.5, 0);
      mount.position.set(-0.5, 1.25, 1.45); mount.rotation.set(-0.7, 0.2, 0);
      break;
    case 'sword':
      armR.rotation.set(-0.9, 0.1, 0); armL.rotation.set(-0.3, 0, -0.15);
      mount.position.set(1.4, 0.55, 1.3); mount.rotation.set(-0.35, 0, 0);
      break;
    default:
      armR.rotation.set(-1.42, -0.5, 0); armL.rotation.set(-1.38, 0.78, 0);
      mount.position.set(0.3, 1.45, 1.0);
  }
  rig.restArmL = armL.rotation.x; rig.restArmR = armR.rotation.x;
  rig.restMountZ = mount.position.z;
}

// ---------------------------------------------------------------- tower ----
export function buildTower(look, { ghost = false } = {}) {
  const L = { skin: '#e8b98f', shirt: '#456', pants: '#333', face: 'smile', ...look };
  const rig = newRig();
  rig.body.scale.setScalar(CHAR_SCALE * (L.scale || 1));
  const mat = ghost ? MAT.ghost : MAT.lit;

  legs(rig, L);
  arms(rig, L, { w: 0.86 });
  const tb = new PartBuilder(); torsoBase(tb, L); torsoExtras(tb, L); attach(rig.torso, tb, { material: mat });
  const hb = new PartBuilder(); headBase(hb, L); hair(hb, L); hat(hb, L); headExtras(hb, L); attach(rig.head, hb, { material: mat });
  if (L.hat !== 'welder' && L.face !== 'none') {
    const f = faceDecal(L.face, { facePaint: !!L.facePaint }, 1.1);
    f.position.set(0, 0.62, 0.61);
    rig.head.add(f);
  }
  const w = buildWeapon(L.weapon);
  rig.mount.add(w.group);
  rig.muzzle = w.muzzle;
  rig.spinners = w.spinners;
  rig.pose = w.pose;
  applyPose(rig);
  crates(rig, L.crates || 0);
  if (ghost) rig.root.traverse((o) => { if (o.isMesh && o.material === MAT.lit) o.material = MAT.ghost; o.castShadow = false; });
  return rig;
}

// --------------------------------------------------------------- zombie ----
/** Picks colours for this zombie. Variant index keeps cache keys small. */
export function zombieVariant(def, rng) {
  const L = def.look;
  const pick = (v) => (Array.isArray(v) ? Math.floor(rng() * v.length) : 0);
  return [pick(L.skin), pick(L.shirt), pick(L.pants)];
}

export function buildZombie(def, variant = [0, 0, 0], mods = []) {
  const src = def.look;
  const L = {
    ...src,
    skin: Array.isArray(src.skin) ? src.skin[variant[0] % src.skin.length] : src.skin,
    shirt: Array.isArray(src.shirt) ? src.shirt[variant[1] % src.shirt.length] : src.shirt,
    pants: Array.isArray(src.pants) ? src.pants[variant[2] % src.pants.length] : src.pants,
  };
  const rig = newRig();
  rig.kind = L.body;
  const rng = mulberry32(variant[0] * 31 + variant[1] * 7 + variant[2] + 1);
  const crackColor = shade(L.skin, -0.42);
  const cracks = !!L.cracks;
  const mat = def.hidden ? MAT.shade : MAT.lit;
  const fortified = mods.includes('fortified');
  const swift = mods.includes('swift');
  const glow = L.glow || (swift ? '#ffb02e' : '#f6ffd8');
  rig.body.scale.setScalar(CHAR_SCALE * (def.size || 1));

  const builders = {
    walker: () => buildWalker(rig, L, { rng, cracks, crackColor, mat }),
    runner: () => buildWalker(rig, L, { rng, cracks, crackColor, mat, lean: true }),
    crawler: () => buildCrawler(rig, L, { rng, cracks, crackColor, mat }),
    bloater: () => buildBloater(rig, L, { rng, mat }),
    brute: () => buildBrute(rig, L, { rng, cracks, crackColor, mat }),
    heavy: () => buildHeavy(rig, L, { rng, mat }),
    abomination: () => buildBrute(rig, L, { rng, cracks: true, crackColor, mat, abom: true }),
    knight: () => buildKnight(rig, L, { rng, mat }),
    warlock: () => buildWarlock(rig, L, { rng, mat }),
    flyer: () => buildFlyer(rig, L, { rng, mat }),
  };
  (builders[L.body] || builders.walker)();

  // Face
  let faceStyle = 'zombie';
  if (L.screaming) faceStyle = 'scream';
  if (L.body === 'knight' || L.body === 'warlock') faceStyle = 'visor';
  if (L.body === 'flyer' || L.hood) faceStyle = 'eyes';
  if (!L.hazmat && !rig.noFace) {
    const f = faceDecal(faceStyle, { glow }, rig.faceSize || 1.1, true);
    f.position.set(0, rig.faceY ?? 0.62, rig.faceZ ?? 0.62);
    (rig.faceParent || rig.head).add(f);
  }

  if (fortified && L.body !== 'flyer') {
    const b = new PartBuilder();
    b.rbox(1.42, 0.7, 1.42, '#8d949c', 0, 1.15, 0, { r: 0.12 });
    b.box(1.45, 0.12, 1.45, '#5d646c', 0, 0.85, 0);
    attach(rig.head, b);
    for (const arm of [rig.armL, rig.armR]) { const a = new PartBuilder(); a.rbox(1.25, 0.6, 1.25, '#8d949c', 0, 0.05, 0, { r: 0.1 }); attach(arm, a); }
  }
  if (swift && L.body !== 'flyer') {
    const b = new PartBuilder(); b.box(1.28, 0.2, 1.28, '#ff8a1e', 0, 0.95, 0, { glow: true }); attach(rig.head, b);
  }
  rig.walk = L.body === 'runner' ? 'run' : rig.brute ? 'brute' : rig.knight ? 'knight' : 'shamble';
  animateZombie(rig, 0.6, 0);
  return rig;
}

/** Pose a zombie rig at walk-cycle phase `phase` (radians). */
export function animateZombie(rig, phase, time) {
  const s = Math.sin(phase), c = Math.cos(phase);
  if (rig.flyer) {
    const f = Math.sin(time * 14 + phase) * 0.6;
    rig.wings[0].rotation.z = f; rig.wings[1].rotation.z = -f;
    return;
  }
  if (rig.crawl) {
    rig.armL.rotation.x = Math.PI + s * 0.6; rig.armR.rotation.x = Math.PI - s * 0.6;
    rig.body.position.y = Math.abs(s) * 0.05;
    return;
  }
  const amp = rig.walk === 'brute' ? 0.5 : rig.walk === 'knight' ? 0.45 : rig.walk === 'run' ? 0.85 : 0.6;
  rig.legL.rotation.x = s * amp; rig.legR.rotation.x = -s * amp;
  rig.body.position.y = Math.abs(c) * 0.08;
  rig.body.rotation.z = s * 0.05;
  rig.body.rotation.x = rig.lean || 0;
  switch (rig.walk) {
    case 'run': rig.armL.rotation.x = -s * 1.0 - 0.3; rig.armR.rotation.x = s * 1.0 - 0.3; break;
    case 'brute': rig.armL.rotation.x = -0.35 - s * 0.3; rig.armR.rotation.x = -0.35 + s * 0.3; break;
    case 'knight': rig.armL.rotation.x = -0.3 - s * 0.15; break;
    default:
      rig.armL.rotation.x = -1.45 + s * 0.12; rig.armR.rotation.x = -1.5 - s * 0.12;
      rig.head.rotation.z = 0.15 + s * 0.05;
  }
}

function buildWalker(rig, L, { rng, cracks, crackColor, mat, lean }) {
  legs(rig, L);
  arms(rig, L, { cracks, rng, crackColor });
  const tb = new PartBuilder();
  torsoBase(tb, L);
  // torn shirt hem
  for (let i = 0; i < 4; i++) tb.box(0.35, 0.22, 0.12, L.skin, -0.7 + i * 0.47, 0.25 + rng() * 0.15, 0.48, { rz: rng() - 0.5 });
  if (L.riot) {
    tb.box(2.1, 1.5, 1.14, '#2f343c', 0, 1.2, 0, { r: 0.08 });
    tb.box(1.2, 0.22, 0.04, '#d8dade', 0, 1.35, 0.58);
  }
  if (L.surgeon) {
    tb.box(2.08, 2.0, 1.08, '#f1f1ea', 0, 1, 0, { r: 0.06 });
    tb.box(2.08, 0.9, 1.08, '#f1f1ea', 0, -0.4, 0, { r: 0.05 });
    tb.box(0.5, 0.4, 0.05, '#8a1c1c', 0.45, 0.8, 0.56, { rz: 0.4 });
    tb.box(0.3, 0.6, 0.05, '#8a1c1c', -0.5, 1.3, 0.56, { rz: -0.3 });
  }
  if (L.hazmat) tb.box(2.06, 0.25, 1.06, '#222', 0, 0.2, 0);
  if (L.jaw) { tb.sphere(0.7, '#a8d85a', 0, 2.05, 0.35, { seg: 10, glow: true, sy: 0.7 }); }
  attach(rig.torso, tb, { material: mat });

  const hb = new PartBuilder();
  headBase(hb, L);
  if (cracks) { crack(hb, 0.3, 0.7, 0.62, 0, 1, rng, crackColor, 0.6); crack(hb, 0.62, 0.5, 0, 1, 0, rng, crackColor, 0.6); }
  if (L.riot) {
    hb.rbox(1.42, 0.8, 1.42, '#23272e', 0, 1.0, 0, { r: 0.3 });
    hb.box(1.3, 0.55, 0.08, '#3b5a7a', 0, 0.6, 0.72, { rx: -0.1 });
  }
  if (L.hazmat) {
    hb.rbox(1.42, 1.42, 1.42, '#e2c22c', 0, 0.65, -0.02, { r: 0.35 });
    hb.box(1.0, 0.75, 0.2, '#1a1a1a', 0, 0.6, 0.7, { r: 0.06 });
    for (const x of [-0.26, 0.26]) hb.cyl(0.17, 0.17, 0.08, '#8fd0c0', x, 0.72, 0.82, { rx: Math.PI / 2, seg: 10 });
    hb.cyl(0.2, 0.22, 0.4, '#3a3a3a', 0, 0.3, 0.9, { rx: Math.PI / 2, seg: 10 });
  }
  if (L.hood) {
    hb.rbox(1.45, 1.4, 1.45, L.shirt, 0, 0.72, -0.08, { r: 0.35 });
    hb.box(1.05, 0.95, 0.2, '#07080a', 0, 0.58, 0.62);
  }
  if (L.surgeon) {
    hb.box(1.0, 0.45, 0.1, '#9fd0d8', 0, 0.32, 0.64);
    hb.cyl(0.22, 0.22, 0.05, '#d0d4d8', 0.25, 1.05, 0.63, { rx: Math.PI / 2, seg: 10 });
    hb.box(1.25, 0.1, 1.25, '#cfd3d6', 0, 1.0, 0);
  }
  if (L.longHair) {
    hb.rbox(1.32, 0.35, 1.32, L.longHair, 0, 1.18, -0.04, { r: 0.12 });
    hb.box(1.35, 2.2, 0.3, L.longHair, 0, 0.2, -0.56);
    hb.box(0.22, 1.6, 1.0, L.longHair, -0.66, 0.3, -0.12); hb.box(0.22, 1.6, 1.0, L.longHair, 0.66, 0.3, -0.12);
  }
  if (L.jaw) { hb.box(0.8, 0.5, 0.45, shade(L.skin, -0.1), 0, -0.05, 0.35, { rx: 0.4 }); hb.box(0.4, 0.5, 0.12, '#b8ff5a', 0, -0.4, 0.55, { glow: true }); }
  attach(rig.head, hb, { material: mat });

  if (L.riot) {
    const sb = new PartBuilder();
    sb.box(0.22, 2.8, 1.9, '#2a2e35', 0, -0.8, 0.4, { r: 0.06 });
    sb.box(0.26, 0.4, 1.9, '#e8e8e8', 0, -0.4, 0.4);
    sb.box(0.25, 0.9, 1.4, '#4a6a8a', 0, 0.3, 0.4);
    const s = sb.build(); s.position.set(-0.6, -1.0, 0.6); s.rotation.set(1.4, 0, 0);
    rig.armL.add(s);
  }
  rig.lean = lean ? 0.28 : 0.05;
}

function buildCrawler(rig, L, { rng, cracks, crackColor, mat }) {
  arms(rig, L, { cracks, rng, crackColor });
  const tb = new PartBuilder(); torsoBase(tb, L);
  tb.box(1.6, 0.3, 0.8, '#5a1c1c', 0, 0.1, 0); // torn waist
  attach(rig.torso, tb, { material: mat });
  const hb = new PartBuilder(); headBase(hb, L);
  if (cracks) crack(hb, 0.3, 0.7, 0.62, 0, 1, rng, crackColor, 0.6);
  attach(rig.head, hb, { material: mat });
  rig.hips.position.y = 0.55;
  rig.hips.rotation.x = 1.35;
  rig.head.rotation.x = -1.2;
  rig.legL.visible = rig.legR.visible = false;
  rig.crawl = true;
}

function buildBloater(rig, L, { rng, mat }) {
  legs(rig, L, { w: 1.1 });
  rig.legL.position.x = -0.75; rig.legR.position.x = 0.75;
  arms(rig, L);
  rig.armL.position.set(-2.0, 1.8, 0); rig.armR.position.set(2.0, 1.8, 0);
  const tb = new PartBuilder();
  tb.rbox(3.4, 2.9, 2.8, L.skin, 0, 1.3, 0.15, { r: 0.8 });
  tb.box(3.0, 1.0, 2.5, L.shirt, 0, 2.2, 0.05, { r: 0.3 });
  for (let i = 0; i < 9; i++) {
    const a = rng() * Math.PI * 2, y = 0.4 + rng() * 2;
    tb.sphere(0.18 + rng() * 0.22, '#d6e86a', Math.cos(a) * 1.62, y, 0.15 + Math.sin(a) * 1.35, { seg: 8, glow: rng() < 0.4 });
  }
  attach(rig.torso, tb, { material: mat });
  rig.head.position.y = 2.6;
  const hb = new PartBuilder(); headBase(hb, L, { w: 1.05 }); attach(rig.head, hb, { material: mat });
  rig.lean = 0;
}

function buildBrute(rig, L, { rng, cracks, crackColor, mat, abom }) {
  legs(rig, L, { w: 1.15 });
  rig.legL.position.x = -0.62; rig.legR.position.x = 0.62;
  // Torso
  const tb = new PartBuilder();
  tb.rbox(2.6, 2.3, 1.7, L.shirt, 0, 1.15, 0, { r: 0.2 });
  if (L.stripes) for (let i = 0; i < 5; i++) { tb.box(2.62, 0.16, 1.72, L.stripes, 0, 0.45 + i * 0.38, 0); }
  if (L.suspenders) for (const x of [-0.6, 0.6]) tb.box(0.16, 2.3, 1.76, L.suspenders, x, 1.15, 0);
  if (abom) {
    tb.rbox(3.2, 2.6, 2.4, L.skin, 0, 1.0, 0.3, { r: 0.6 });
    for (let i = 0; i < 6; i++) tb.box(0.08, 0.5, 0.06, '#2a1414', -0.8 + i * 0.32, 1.3, 1.52, { rz: 0.4 * (i % 2 ? 1 : -1) });
    tb.box(1.8, 0.08, 0.06, '#2a1414', 0, 1.3, 1.53);
    // extra little head on shoulder
    tb.cyl(0.4, 0.4, 0.7, L.skin, 1.0, 2.55, -0.1, { seg: 12, rz: 0.4 });
  }
  if (cracks) crack(tb, -0.6, 1.2, 0.86, 0, 1, rng, crackColor, 0.8);
  attach(rig.torso, tb, { material: mat });
  rig.head.position.set(0, 2.15, 0.35);
  const hb = new PartBuilder(); hb.rbox(1.35, 1.2, 1.35, L.skin, 0, 0.55, 0, { r: 0.35 });
  if (cracks) crack(hb, 0.4, 0.6, 0.68, 0, 1, rng, crackColor, 0.5);
  attach(rig.head, hb, { material: mat });
  rig.faceZ = 0.69; rig.faceY = 0.55;
  // Arms: long, thick, big fists
  for (const [g, side] of [[rig.armL, -1], [rig.armR, 1]]) {
    g.position.set(side * 1.85, 1.9, 0);
    const b = new PartBuilder();
    b.rbox(1.4, 1.6, 1.4, L.skin, 0, -0.6, 0, { r: 0.2 });
    b.rbox(1.3, 1.5, 1.3, L.skin, 0, -2.0, 0.1, { r: 0.2 });
    b.rbox(1.7, 1.3, 1.7, shade(L.skin, 0.03), 0, -3.0, 0.2, { r: 0.25 });
    if (cracks) crack(b, side * 0.71, -1.0, 0, side, 0, rng, crackColor, 1.0);
    if (L.shackles) {
      b.box(1.8, 0.4, 1.8, '#5a5f66', 0, -2.55, 0.2, { r: 0.05 });
      for (let i = 0; i < 4; i++) b.cone(0.14, 0.3, '#c9ced6', side * 0.95, -2.55, -0.5 + i * 0.42, { rz: -side * Math.PI / 2, seg: 4 });
      for (let i = 0; i < 3; i++) b.torus(0.15, 0.05, '#8d939c', side * 0.6, -2.95 - i * 0.28, -0.55, { ry: i % 2 ? Math.PI / 2 : 0, seg: 8 });
    }
    attach(g, b, { material: mat });
  }
  if (abom) {
    const extra = new THREE.Group(); extra.position.set(0.6, 1.7, -0.9);
    const b = new PartBuilder(); b.rbox(1.0, 2.6, 1.0, L.skin, 0, -1.1, 0, { r: 0.15 }); b.rbox(1.2, 1.0, 1.2, L.skin, 0, -2.5, 0, { r: 0.2 });
    attach(extra, b, { material: mat }); extra.rotation.set(-0.6, 0, -0.8);
    rig.hips.add(extra); rig.extra.arm3 = extra;
  }
  rig.armL.rotation.set(-0.35, 0, 0.1); rig.armR.rotation.set(-0.35, 0, -0.1);
  rig.brute = true; rig.lean = 0.3;
}

function buildHeavy(rig, L, { rng, mat }) {
  legs(rig, L, { w: 1.1 });
  rig.legL.position.x = -0.58; rig.legR.position.x = 0.58;
  arms(rig, L, { w: 1.1 });
  rig.armL.position.x = -1.95; rig.armR.position.x = 1.95;
  const tb = new PartBuilder();
  tb.box(2.3, 2.2, 1.3, L.shirt, 0, 1.1, 0, { r: 0.1 });
  tb.box(1.7, 1.2, 0.2, '#9a9ea4', 0, 1.45, 0.72, { r: 0.04 });
  for (const [x, y] of [[-0.7, 1.95], [0.7, 1.95], [-0.7, 0.95], [0.7, 0.95]]) tb.sphere(0.07, '#d8dade', x, y, 0.83, { seg: 6 });
  // crossing chains
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    tb.torus(0.14, 0.05, '#2a2c30', -1.0 + t * 2.0, 2.1 - t * 1.6, 0.75, { ry: i % 2 ? Math.PI / 2 : 0, seg: 8 });
    tb.torus(0.14, 0.05, '#2a2c30', 1.0 - t * 2.0, 2.1 - t * 1.6, 0.78, { ry: i % 2 ? Math.PI / 2 : 0, seg: 8 });
  }
  // big metal crates on the shoulders
  for (const x of [-1, 1]) {
    tb.rbox(1.3, 2.2, 1.5, '#5e6166', x * 2.05, 1.5, -0.05, { r: 0.12 });
    tb.box(1.36, 0.25, 1.56, '#3f4247', x * 2.05, 2.45, -0.05);
    tb.box(1.36, 0.25, 1.56, '#3f4247', x * 2.05, 0.55, -0.05);
  }
  attach(rig.torso, tb, { material: mat });
  rig.armL.visible = rig.armR.visible = true;
  const hb = new PartBuilder(); hb.rbox(1.3, 1.25, 1.3, L.skin, 0, 0.6, 0, { r: 0.4 }); hb.rbox(1.45, 0.7, 1.45, '#5e6166', 0, 1.05, 0, { r: 0.35 });
  attach(rig.head, hb, { material: mat });
  rig.noFace = true;
  rig.armL.rotation.set(-0.9, 0.15, 0); rig.armR.rotation.set(-0.9, -0.15, 0);
  rig.brute = true; rig.lean = 0.2;
}

function buildKnight(rig, L, { rng, mat }) {
  const trim = L.trim || '#5d6b80', cr = L.crystal || '#4fe3ff';
  legs(rig, { ...L, armorLegs: shade(L.pants, 0.05), crystal: cr });
  arms(rig, { ...L, skin: shade(L.shirt, -0.05), pauldron: shade(L.shirt, 0.04) });
  const tb = new PartBuilder();
  tb.box(2.1, 2.05, 1.15, L.shirt, 0, 1.02, 0, { r: 0.08 });
  tb.box(1.4, 1.2, 0.12, shade(L.shirt, 0.06), 0, 1.35, 0.6, { r: 0.04 });
  tb.box(0.18, 1.4, 0.08, trim, -0.75, 1.1, 0.6); tb.box(0.18, 1.4, 0.08, trim, 0.75, 1.1, 0.6);
  tb.box(0.25, 0.6, 0.08, cr, 0, 1.5, 0.66, { glow: true });
  tb.box(0.3, 0.3, 0.08, cr, 0, 0.45, 0.66, { rz: Math.PI / 4, glow: true });
  tb.box(2.14, 0.28, 1.18, '#7a6a4a', 0, 0.16, 0);
  tb.box(1.0, 0.7, 0.1, '#8a7a55', 0, -0.25, 0.56);
  if (L.fur) { tb.rbox(2.8, 0.7, 1.6, L.fur, 0, 2.0, -0.1, { r: 0.3 }); tb.box(2.4, 2.4, 0.12, shade(L.fur, -0.12), 0, 0.8, -0.62); }
  if (L.cloak) {
    // Royal cape: tattered strips from the shoulders to the ground, crystal clasps.
    for (let i = 0; i < 7; i++) tb.box(0.4, 4.0 + rng() * 0.5, 0.14, i % 2 ? L.cloak : shade(L.cloak, 0.06), -1.2 + i * 0.4, -0.05 - rng() * 0.3, -0.7, { rx: 0.12 });
    for (const x of [-1, 1]) tb.box(0.35, 0.35, 0.2, cr, x * 0.85, 2.0, 0.55, { rz: Math.PI / 4, glow: true });
    tb.rbox(2.6, 0.5, 1.5, shade(L.shirt, 0.08), 0, 2.15, -0.05, { r: 0.2 });
  }
  // shoulder crystals
  for (const x of [-1, 1]) for (let i = 0; i < 3; i++) tb.cone(0.13, 0.7 - i * 0.12, cr, x * (1.55 + i * 0.1), 2.35 + i * 0.05, -0.2 + i * 0.25, { rz: -x * (0.4 + i * 0.2), glow: true, seg: 4 });
  attach(rig.torso, tb, { material: mat });
  const hb = new PartBuilder();
  hb.rbox(1.35, 1.35, 1.35, L.skin, 0, 0.65, 0, { r: 0.25 });
  hb.box(1.38, 0.12, 1.38, trim, 0, 0.3, 0);
  hb.box(0.2, 0.5, 0.08, cr, 0, 1.05, 0.68, { glow: true });
  if (L.crown) {
    // A full ring of tall crystal spikes, taller at the front.
    hb.box(1.5, 0.25, 1.5, trim, 0, 1.32, 0);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const h = 0.8 + (Math.cos(a) * 0.5 + 0.5) * 0.9;
      hb.cone(0.16, h, cr, Math.sin(a) * 0.62, 1.4 + h / 2, Math.cos(a) * 0.62, { rx: Math.cos(a) * 0.3, rz: -Math.sin(a) * 0.3, seg: 4, glow: true });
    }
  } else {
    for (let i = 0; i < 4; i++) {
      const a = -1 + (i / 3) * 2;
      hb.cone(0.13, 0.55, cr, a * 0.55, 1.45, 0.4, { rz: -a * 0.5, seg: 4, glow: true });
    }
  }
  attach(rig.head, hb, { material: mat });
  rig.faceZ = 0.68; rig.faceY = 0.62;
  const w = buildWeapon(L.crown ? 'sword_bright' : 'sword');
  rig.armR.add(w.group); w.group.position.set(0, -1.85, 0.1); w.group.rotation.set(-0.2, 0, 0);
  rig.armR.rotation.set(-0.6, 0, 0); rig.armL.rotation.set(-0.3, 0, 0);
  if (L.shield) {
    const sb = new PartBuilder();
    sb.rbox(0.25, 3.0, 2.0, '#2c3038', 0, 0, 0, { r: 0.1 });
    sb.box(0.3, 2.6, 0.12, trim, 0, 0, 0);
    sb.box(0.3, 0.12, 1.7, trim, 0, 0.5, 0);
    sb.box(0.34, 0.45, 0.45, cr, 0, 0.5, 0, { rx: Math.PI / 4, glow: true });
    const s = sb.build(); s.position.set(-0.65, -1.2, 0.3); rig.armL.add(s);
  }
  rig.lean = 0.05; rig.knight = true;
}

function buildWarlock(rig, L, { rng, mat }) {
  const bone = L.bone || '#d8d0b4', cr = L.crystal || '#4fb8ff';
  legs(rig, L);
  arms(rig, { ...L, skin: shade(L.shirt, -0.05) });
  const tb = new PartBuilder();
  tb.box(2.1, 2.05, 1.15, L.shirt, 0, 1.02, 0, { r: 0.08 });
  tb.box(2.14, 0.28, 1.18, '#3a2f25', 0, 0.16, 0);
  tb.box(0.4, 0.3, 0.1, '#9aa0aa', 0, 0.16, 0.6);
  tb.box(1.5, 0.7, 1.3, '#1d1e22', 0, 2.0, 0.1, { r: 0.2 }); // scarf
  // Tattered cloak down to the ground
  for (let i = 0; i < 6; i++) tb.box(0.4, 3.2 + rng() * 0.8, 0.12, L.cloak, -1.0 + i * 0.4, 0.1 - rng() * 0.4, -0.66, { rx: 0.08 });
  // Skull pauldrons
  for (const x of [-1, 1]) {
    tb.rbox(1.5, 1.2, 1.6, bone, x * 1.55, 2.05, 0, { r: 0.3 });
    tb.box(0.3, 0.3, 0.1, '#1a1a1a', x * 1.55 - 0.3, 2.1, 0.8); tb.box(0.3, 0.3, 0.1, '#1a1a1a', x * 1.55 + 0.3, 2.1, 0.8);
    tb.cone(0.2, 0.9, bone, x * 2.2, 2.7, -0.2, { rz: -x * 0.9, seg: 5 });
    for (let k = 0; k < 4; k++) tb.cone(0.07, 0.3, bone, x * 1.55 - 0.45 + k * 0.3, 1.45, 0.75, { rx: Math.PI, seg: 4 });
  }
  attach(rig.torso, tb, { material: mat });
  const hb = new PartBuilder();
  hb.rbox(1.35, 1.35, 1.35, '#3a3f4c', 0, 0.65, 0, { r: 0.28 });
  hb.box(1.38, 0.12, 1.38, L.trim, 0, 0.3, 0);
  hb.box(0.35, 0.35, 0.1, cr, 0, 1.05, 0.68, { rz: Math.PI / 4, glow: true });
  for (const x of [-1, 1]) { hb.cone(0.18, 0.9, '#2a2d33', x * 0.75, 1.45, 0, { rz: -x * 0.5, seg: 5 }); hb.cone(0.12, 0.5, bone, x * 0.92, 1.95, 0, { rz: -x * 0.25, seg: 5 }); }
  attach(rig.head, hb, { material: mat });
  rig.faceZ = 0.68;
  const w = buildWeapon('hammer');
  rig.armR.add(w.group); w.group.position.set(0, -1.85, 0.1); w.group.rotation.set(-0.5, 0, 0);
  rig.armR.rotation.set(-0.5, 0, 0);
  rig.lean = 0.05; rig.knight = true;
}

function buildFlyer(rig, L, { rng }) {
  rig.legL.visible = rig.legR.visible = rig.armL.visible = rig.armR.visible = false;
  rig.hips.position.y = 0;
  const tb = new PartBuilder();
  tb.rbox(1.3, 1.1, 2.2, L.skin, 0, 0, 0, { r: 0.35 });
  tb.box(1.0, 0.25, 1.0, L.shirt, 0, 0.5, -0.4, { r: 0.08 });
  tb.box(0.9, 0.2, 1.0, shade(L.skin, -0.05), 0, -0.1, -1.4, { rx: -0.2 });
  for (let i = 0; i < 3; i++) tb.box(0.08, 0.06, 0.5, '#c9c1a6', 0.2 - i * 0.2, -0.6, 0.4, { rx: 0.3 });
  attach(rig.torso, tb);
  rig.head.position.set(0, 0.35, 1.25);
  const hb = new PartBuilder();
  hb.rbox(0.8, 0.8, 0.8, L.skin, 0, 0.1, 0.1, { r: 0.25 });
  hb.cone(0.22, 0.8, '#d8cfae', 0, 0.0, 0.8, { rx: Math.PI / 2, seg: 4 });
  hb.box(0.5, 0.25, 0.3, '#5a1414', 0, 0.55, 0);
  attach(rig.head, hb);
  rig.faceY = 0.18; rig.faceZ = 0.52; rig.faceSize = 0.75;
  for (const side of [-1, 1]) {
    const wing = new THREE.Group();
    wing.name = `wing${rig.wings.length}`;
    wing.position.set(side * 0.6, 0.25, 0);
    const b = new PartBuilder();
    b.box(1.8, 0.12, 1.3, '#26262a', side * 0.9, 0, 0, { r: 0.04 });
    b.box(1.6, 0.1, 0.9, '#1c1c1f', side * 2.4, 0, -0.2, { r: 0.03 });
    for (let i = 0; i < 4; i++) b.box(0.3, 0.08, 0.9, '#1c1c1f', side * (2.0 + i * 0.4), 0, -0.85, { r: 0.02 });
    b.box(1.7, 0.06, 0.08, L.shirt, side * 1.6, 0.08, 0.5);
    attach(wing, b);
    rig.hips.add(wing);
    rig.wings.push(wing);
  }
  rig.flyer = true;
}

// ----------------------------------------------------------- base plate ----
const TIER_COLORS = ['#8a8f96', '#b87a3a', '#c9ced6', '#f2c64a', '#6fe3ff'];
export function buildPlate(level, footprint) {
  const b = new PartBuilder();
  const r = footprint * 0.75;
  b.cyl(r, r * 1.05, 0.14, '#3b3f46', 0, 0.07, 0, { seg: 20 });
  b.cyl(r * 0.92, r * 0.92, 0.05, '#2c2f35', 0, 0.16, 0, { seg: 20 });
  for (let i = 0; i < level; i++) {
    const a = Math.PI + (i - (level - 1) / 2) * 0.32;
    b.box(0.22, 0.12, 0.22, TIER_COLORS[Math.min(level, 4)], Math.sin(a) * r * 0.86, 0.2, Math.cos(a) * r * 0.86, { glow: level >= 4 });
  }
  return b.build({ shadows: false });
}
