// Blocky weapon models. Each builder returns { group, muzzle, spinners, pose }.
// Built in "character units" (a torso is 2 units tall), pointing along +Z,
// with the origin at the grip.
import * as THREE from 'three';
import { PartBuilder } from './geo.js';

const METAL = '#2b2d31', METAL2 = '#3c3f45', LIGHT = '#6c7077', WOOD = '#7a3f1d', WOOD2 = '#5e2f15';
const R2 = Math.PI / 2;

function finish(b, muzzleAt, extra = {}) {
  const group = b.build();
  const muzzle = new THREE.Object3D();
  muzzle.position.set(...muzzleAt);
  group.add(muzzle);
  const spinners = [];
  for (const s of extra.spinners || []) { group.add(s); spinners.push(s); }
  return { group, muzzle, spinners, pose: extra.pose || 'twoHand' };
}

function spinnerFrom(b, x, y, z) {
  const g = b.build();
  const holder = new THREE.Group();
  holder.position.set(x, y, z);
  holder.add(g);
  return holder;
}

const W = {
  rifle(scoped = false) {
    const b = new PartBuilder();
    b.box(0.28, 0.42, 1.3, METAL, 0, 0.15, 0.45, { r: 0.04 });
    b.box(0.24, 0.42, 0.9, METAL2, 0, 0.05, -0.5, { r: 0.05 });
    b.box(0.2, 0.45, 0.24, METAL, 0, -0.22, 0.1, { rx: 0.35 });
    b.box(0.2, 0.62, 0.3, LIGHT, 0, -0.28, 0.72, { rx: -0.22, r: 0.03 });
    b.box(0.3, 0.32, 0.8, METAL2, 0, 0.15, 1.45, { r: 0.05 });
    b.cyl(0.06, 0.06, 0.9, METAL, 0, 0.18, 2.25, { rx: R2 });
    b.box(0.07, 0.3, 0.07, METAL, 0, 0.36, 1.85);
    if (scoped) { b.cyl(0.13, 0.13, 0.75, '#18191b', 0, 0.55, 0.55, { rx: R2 }); b.cyl(0.16, 0.13, 0.12, '#18191b', 0, 0.55, 0.95, { rx: R2 }); }
    else b.box(0.08, 0.16, 0.62, METAL, 0, 0.44, 0.5);
    return finish(b, [0, 0.18, 2.75]);
  },
  sniper() {
    const b = new PartBuilder();
    b.box(0.26, 0.36, 2.0, WOOD, 0, 0, 0.35, { r: 0.06 });
    b.box(0.26, 0.55, 0.7, WOOD, 0, -0.12, -0.85, { r: 0.08 });
    b.box(0.2, 0.2, 0.5, WOOD2, 0, -0.08, 1.15);
    b.cyl(0.065, 0.065, 2.0, '#1a1b1d', 0, 0.16, 2.25, { rx: R2 });
    b.cyl(0.13, 0.13, 1.0, '#1a1b1d', 0, 0.48, 0.55, { rx: R2 });
    b.cyl(0.17, 0.13, 0.18, '#1a1b1d', 0, 0.48, 1.08, { rx: R2 });
    b.cyl(0.16, 0.13, 0.14, '#1a1b1d', 0, 0.48, 0.02, { rx: R2 });
    b.box(0.1, 0.18, 0.1, '#1a1b1d', 0, 0.3, 0.55);
    b.box(0.3, 0.06, 0.06, LIGHT, 0.16, 0.2, 0.1);
    return finish(b, [0, 0.16, 3.25]);
  },
  drill(big = false) {
    const b = new PartBuilder();
    const s = big ? 1.25 : 1;
    b.box(0.42, 0.5, 1.25, '#232428', 0, 0.15, 0.35, { r: 0.07 });
    b.box(0.22, 0.55, 0.26, '#232428', 0, -0.25, 0.0, { rx: 0.3 });
    b.box(0.18, 0.55, 0.22, '#3a3c41', 0, -0.25, 0.95, { rx: -0.15 });
    b.box(0.12, 0.12, 0.9, '#55585e', 0, 0.45, 0.4);
    b.cyl(0.3 * s, 0.3 * s, 0.25, '#55585e', 0, 0.15, 1.1, { rx: R2 });
    if (big) b.cyl(0.36, 0.36, 0.12, '#e07b25', 0, 0.15, 1.2, { rx: R2 });
    const sb = new PartBuilder();
    sb.cone(0.24 * s, 1.9 * s, '#c9ced6', 0, 0, 0.95 * s, { rx: R2, seg: 6 });
    for (let i = 0; i < 5; i++) sb.box(0.5 * s * (1 - i / 6), 0.05, 0.08, '#8d939c', 0, 0, (0.25 + i * 0.32) * s, { rz: i * 0.9 });
    const spinner = spinnerFrom(sb, 0, 0.15, 1.2);
    return finish(b, [0, 0.15, 1.2 + 1.9 * s], { spinners: [spinner] });
  },
  shotgun(auto = false) {
    const b = new PartBuilder();
    b.box(0.26, 0.38, 1.0, auto ? METAL : METAL2, 0, 0.12, 0.35, { r: 0.04 });
    b.box(0.24, 0.42, 0.85, auto ? METAL2 : WOOD, 0, 0.0, -0.5, { r: 0.06 });
    b.cyl(0.09, 0.09, 1.6, '#1d1e20', 0, 0.22, 1.5, { rx: R2 });
    b.cyl(0.08, 0.08, 1.3, '#1d1e20', 0, 0.06, 1.35, { rx: R2 });
    b.box(0.26, 0.24, 0.5, auto ? LIGHT : WOOD, 0, 0.04, 1.3, { r: 0.05 });
    b.box(0.2, 0.42, 0.24, METAL, 0, -0.22, 0.05, { rx: 0.3 });
    if (auto) b.cyl(0.32, 0.32, 0.28, METAL2, 0, -0.25, 0.65, { rz: R2 });
    return finish(b, [0, 0.22, 2.35]);
  },
  launcher(drum = false) {
    const b = new PartBuilder();
    b.cyl(0.28, 0.28, 1.7, '#4b5a32', 0, 0.2, 0.9, { rx: R2, seg: 12 });
    b.cyl(0.32, 0.32, 0.15, '#2e3620', 0, 0.2, 1.75, { rx: R2, seg: 12 });
    b.box(0.24, 0.4, 0.8, METAL2, 0, 0.0, -0.35, { r: 0.06 });
    b.box(0.2, 0.45, 0.24, METAL, 0, -0.25, 0.25, { rx: 0.3 });
    b.box(0.08, 0.3, 0.3, METAL, 0, 0.55, 0.7);
    if (drum) b.cyl(0.45, 0.45, 0.55, METAL2, 0, 0.0, 0.35, { rx: R2, seg: 6 });
    return finish(b, [0, 0.2, 1.85]);
  },
  flamer() {
    const b = new PartBuilder();
    b.box(0.32, 0.42, 1.0, '#8a2b20', 0, 0.12, 0.35, { r: 0.06 });
    b.box(0.2, 0.45, 0.24, METAL, 0, -0.22, 0.1, { rx: 0.3 });
    b.box(0.18, 0.4, 0.22, METAL, 0, -0.2, 0.75, { rx: -0.2 });
    b.cyl(0.1, 0.12, 1.3, LIGHT, 0, 0.16, 1.45, { rx: R2 });
    b.cyl(0.17, 0.17, 0.2, METAL, 0, 0.16, 2.1, { rx: R2 });
    b.sphere(0.07, '#ffb347', 0, 0.02, 2.2, { glow: true });
    return finish(b, [0, 0.16, 2.25]);
  },
  minigun(twin = false) {
    const b = new PartBuilder();
    const spinners = [];
    const xs = twin ? [-0.42, 0.42] : [0];
    for (const x of xs) {
      b.box(0.5, 0.5, 0.95, METAL2, x, 0, 0.3, { r: 0.07 });
      b.cyl(0.3, 0.3, 0.12, METAL, x, 0, 2.05, { rx: R2, seg: 12 });
      const sb = new PartBuilder();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        sb.cyl(0.065, 0.065, 1.5, '#222326', Math.cos(a) * 0.18, Math.sin(a) * 0.18, 0, { rx: R2, seg: 6 });
      }
      sb.cyl(0.1, 0.1, 1.5, '#444', 0, 0, 0, { rx: R2, seg: 6 });
      spinners.push(spinnerFrom(sb, x, 0, 1.5));
    }
    b.box(0.5, 0.45, 0.6, '#4b5a32', twin ? 0 : 0.5, -0.25, 0.2, { r: 0.05 });
    b.box(0.1, 0.35, 0.5, METAL, 0, 0.42, 0.25);
    return finish(b, [0, 0, 2.3], { spinners, pose: 'heavy' });
  },
  tesla() {
    const b = new PartBuilder();
    b.box(0.36, 0.46, 1.1, '#d9d6cc', 0, 0.12, 0.35, { r: 0.08 });
    b.box(0.2, 0.45, 0.24, METAL, 0, -0.22, 0.1, { rx: 0.3 });
    b.cyl(0.08, 0.08, 1.4, '#b87333', 0, 0.16, 1.4, { rx: R2 });
    for (let i = 0; i < 3; i++) b.torus(0.2 - i * 0.03, 0.05, '#c98a3a', 0, 0.16, 1.05 + i * 0.35);
    b.sphere(0.2, '#8ff4ff', 0, 0.16, 2.2, { glow: true, seg: 10 });
    return finish(b, [0, 0.16, 2.25]);
  },
  pistol() {
    const b = new PartBuilder();
    b.box(0.2, 0.3, 0.7, METAL, 0, 0.1, 0.3, { r: 0.04 });
    b.box(0.18, 0.38, 0.22, METAL2, 0, -0.15, 0.05, { rx: 0.25 });
    return finish(b, [0, 0.12, 0.7], { pose: 'oneHand' });
  },
  clipboard() {
    const b = new PartBuilder();
    b.box(0.9, 1.2, 0.08, '#8a5a2b', 0, 0, 0, { r: 0.03 });
    b.box(0.75, 0.95, 0.03, '#f4f1e8', 0, -0.05, 0.05);
    for (let i = 0; i < 4; i++) b.box(0.55, 0.05, 0.02, '#7a7a80', 0, 0.25 - i * 0.18, 0.07);
    b.box(0.4, 0.12, 0.1, '#bfc3c9', 0, 0.58, 0.04);
    return finish(b, [0, 0, 0], { pose: 'board' });
  },
  sword(color = '#4fe3ff') {
    const b = new PartBuilder();
    b.box(0.16, 0.16, 0.6, '#1d2026', 0, 0, -0.1);
    b.box(0.9, 0.18, 0.18, '#3b4352', 0, 0, 0.25, { r: 0.04 });
    b.box(0.08, 0.36, 2.6, color, 0, 0, 1.6, { glow: true });
    b.cone(0.18, 0.5, color, 0, 0, 3.12, { rx: R2, seg: 4, glow: true });
    return finish(b, [0, 0, 3.2], { pose: 'sword' });
  },
  hammer(bone = '#d8d0b4') {
    const b = new PartBuilder();
    b.cyl(0.08, 0.08, 3.0, '#3a3a3f', 0, 0, 1.0, { rx: R2 });
    b.box(1.1, 0.8, 0.8, '#2c2f35', 0, 0, 2.5, { r: 0.08 });
    b.box(1.14, 0.2, 0.84, bone, 0, 0.2, 2.5);
    b.box(1.14, 0.2, 0.84, bone, 0, -0.2, 2.5);
    return finish(b, [0, 0, 2.5], { pose: 'sword' });
  },
};

export function buildWeapon(name) {
  switch (name) {
    case 'rifle': return W.rifle(false);
    case 'rifle_scoped': return W.rifle(true);
    case 'sniper': return W.sniper();
    case 'drill': return W.drill(false);
    case 'drill_big': return W.drill(true);
    case 'shotgun': return W.shotgun(false);
    case 'shotgun_auto': return W.shotgun(true);
    case 'launcher': return W.launcher(false);
    case 'launcher_drum': return W.launcher(true);
    case 'flamer': return W.flamer();
    case 'minigun': return W.minigun(false);
    case 'minigun_twin': return W.minigun(true);
    case 'tesla': return W.tesla();
    case 'pistol': return W.pistol();
    case 'clipboard': return W.clipboard();
    case 'sword': return W.sword();
    case 'sword_bright': return W.sword('#3ff0d8');
    case 'hammer': return W.hammer();
    default: return W.rifle(false);
  }
}
