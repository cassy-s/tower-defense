// Particle effects. Everything is a cube (fits the blocky style) drawn with two
// InstancedMeshes: one lit (debris, goo, smoke) and one additive glow (fire,
// sparks, tracers, lightning). Plus pooled shockwave rings and DOM text.
import * as THREE from 'three';

const _q = new THREE.Quaternion(), _dq = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _m = new THREE.Matrix4();
const _e = new THREE.Euler(), _c = new THREE.Color(), _dir = new THREE.Vector3(), _z = new THREE.Vector3(0, 0, 1);
const _tq = new THREE.Quaternion(); // reused for tracer / splat orientation (spawn copies it)
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const colorCache = new Map();       // '#rrggbb' -> [r, g, b], so spawns don't re-parse colour strings

class Cubes {
  constructor(scene, cap, material, shadows = false) {
    this.cap = cap;
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = shadows;
    for (let i = 0; i < cap; i++) { this.mesh.setMatrixAt(i, ZERO); this.mesh.setColorAt(i, _c.set(1, 1, 1)); }
    scene.add(this.mesh);
    const f = (n) => new Float32Array(cap * n);
    this.pos = f(3); this.vel = f(3); this.size = f(3); this.quat = f(4); this.spin = f(3);
    this.life = f(1); this.max = f(1); this.grav = f(1); this.drag = f(1); this.mode = new Uint8Array(cap);
    this.next = 0; this.active = 0;
    this.dirtyLo = Infinity; this.dirtyHi = -1; // colour slots written since the last upload
  }
  /** Colour: `color` ('#rrggbb') or numeric r, g, b (0..1, linear like THREE.Color). */
  spawn(o) {
    const i = this.next; this.next = (this.next + 1) % this.cap;
    const i3 = i * 3, i4 = i * 4;
    const { pos, vel, size, quat, spin } = this;
    pos[i3] = o.x; pos[i3 + 1] = o.y; pos[i3 + 2] = o.z;
    vel[i3] = o.vx || 0; vel[i3 + 1] = o.vy || 0; vel[i3 + 2] = o.vz || 0;
    const sx = o.sx ?? o.size ?? 0.2;
    size[i3] = sx; size[i3 + 1] = o.sy ?? o.size ?? sx; size[i3 + 2] = o.sz ?? o.size ?? sx;
    const q = o.quat || _q.setFromEuler(_e.set(Math.random() * 6, Math.random() * 6, Math.random() * 6));
    quat[i4] = q.x; quat[i4 + 1] = q.y; quat[i4 + 2] = q.z; quat[i4 + 3] = q.w;
    const sp = o.spin ?? 6;
    spin[i3] = (Math.random() - 0.5) * sp; spin[i3 + 1] = (Math.random() - 0.5) * sp; spin[i3 + 2] = (Math.random() - 0.5) * sp;
    this.life[i] = this.max[i] = o.life || 0.5;
    this.grav[i] = o.gravity ?? 0;
    this.drag[i] = o.drag ?? 0;
    this.mode[i] = o.mode || 0; // 0 shrink all, 1 shrink width only (tracers), 2 grow then shrink (smoke), 3 flat decal
    const ca = this.mesh.instanceColor.array;
    if (o.r !== undefined) { ca[i3] = o.r; ca[i3 + 1] = o.g; ca[i3 + 2] = o.b; }
    else {
      const key = o.color || '#ffffff';
      let rgb = colorCache.get(key);
      if (!rgb) { _c.set(key); rgb = [_c.r, _c.g, _c.b]; colorCache.set(key, rgb); }
      ca[i3] = rgb[0]; ca[i3 + 1] = rgb[1]; ca[i3 + 2] = rgb[2];
    }
    if (i < this.dirtyLo) this.dirtyLo = i;
    if (i > this.dirtyHi) this.dirtyHi = i;
  }
  /** Upload only the colour slots written this frame, not the whole buffer. */
  flushColors() {
    if (this.dirtyHi < 0) return;
    const attr = this.mesh.instanceColor;
    if (attr.addUpdateRange) { attr.clearUpdateRanges(); attr.addUpdateRange(this.dirtyLo * 3, (this.dirtyHi - this.dirtyLo + 1) * 3); }
    attr.needsUpdate = true;
    this.dirtyLo = Infinity; this.dirtyHi = -1;
  }
  reset() {
    this.life.fill(0);
    for (let i = 0; i < this.cap; i++) this.mesh.setMatrixAt(i, ZERO);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  update(dt) {
    this.flushColors();
    const { pos, vel, size, quat, spin, life, max, grav, drag, mode, mesh } = this;
    let any = false;
    for (let i = 0; i < this.cap; i++) {
      if (life[i] <= 0) continue;
      any = true;
      life[i] -= dt;
      if (life[i] <= 0) { mesh.setMatrixAt(i, ZERO); continue; }
      const i3 = i * 3, i4 = i * 4;
      vel[i3 + 1] -= grav[i] * dt;
      if (drag[i]) { const k = Math.max(0, 1 - drag[i] * dt); vel[i3] *= k; vel[i3 + 1] *= k; vel[i3 + 2] *= k; }
      pos[i3] += vel[i3] * dt; pos[i3 + 1] += vel[i3 + 1] * dt; pos[i3 + 2] += vel[i3 + 2] * dt;
      if (pos[i3 + 1] < 0.05 && grav[i] > 0) { pos[i3 + 1] = 0.05; vel[i3] *= 0.6; vel[i3 + 2] *= 0.6; vel[i3 + 1] = 0; spin[i3] = spin[i3 + 1] = spin[i3 + 2] = 0; }
      const t = life[i] / max[i];
      let k = t, kw = 1;
      if (mode[i] === 1) { k = 1; kw = t; }
      else if (mode[i] === 2) k = Math.sin(Math.min(1, (1 - t) * 1.3) * Math.PI) * 0.8 + 0.2 * t;
      else if (mode[i] === 3) k = Math.min(1, t * 3);
      _q.set(quat[i4], quat[i4 + 1], quat[i4 + 2], quat[i4 + 3]);
      if (spin[i3] || spin[i3 + 1] || spin[i3 + 2]) {
        _e.set(spin[i3] * dt, spin[i3 + 1] * dt, spin[i3 + 2] * dt);
        _q.multiply(_dq.setFromEuler(_e));
        quat[i4] = _q.x; quat[i4 + 1] = _q.y; quat[i4 + 2] = _q.z; quat[i4 + 3] = _q.w;
      }
      _p.set(pos[i3], pos[i3 + 1], pos[i3 + 2]);
      _s.set(size[i3] * k * kw, size[i3 + 1] * k * kw, size[i3 + 2] * k);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m);
    }
    if (any) mesh.instanceMatrix.needsUpdate = true;
  }
}

export class FX {
  constructor(scene, camera, overlay) {
    this.scene = scene;
    this.camera = camera;
    this.lit = new Cubes(scene, 1600, new THREE.MeshStandardMaterial({ roughness: 0.8 }), false);
    this.glow = new Cubes(scene, 2200, new THREE.MeshBasicMaterial({ blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false }));
    this.rings = [];
    const ringGeo = new THREE.RingGeometry(0.85, 1, 40);
    ringGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
      m.visible = false; m.userData = { t: 0, dur: 1, r: 1 };
      scene.add(m); this.rings.push(m);
    }
    this.ringNext = 0;
    this.overlay = overlay;
    this.texts = [];
    this.shakeAmt = 0;
    this.quality = 1;
    // Players who ask their OS for less motion get no screen shake.
    const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    this.reducedMotion = !!mq?.matches;
    mq?.addEventListener?.('change', (e) => { this.reducedMotion = e.matches; });
  }

  /** Clear every particle, ring and floating text (new game / back to menu). */
  reset() {
    this.lit.reset(); this.glow.reset();
    for (const m of this.rings) m.visible = false;
    for (const t of this.texts) { t.alive = false; t.div.style.display = 'none'; }
    this.shakeAmt = 0;
  }

  // ---------------------------------------------------------- primitives --
  tracer(from, to, color = '#ffe9a8', width = 0.07, life = 0.07) {
    _dir.set(to.x - from.x, to.y - from.y, to.z - from.z);
    const len = _dir.length();
    if (len < 0.01) return;
    _dir.normalize();
    _tq.setFromUnitVectors(_z, _dir);
    this.glow.spawn({ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2, z: (from.z + to.z) / 2, sx: width, sy: width, sz: len, quat: _tq, spin: 0, life, mode: 1, color });
  }

  muzzle(pos, dir, color = '#ffd36a', size = 0.45) {
    this.glow.spawn({ ...pos, size, spin: 0, life: 0.06, color });
    this.glow.spawn({ x: pos.x + dir.x * 0.25, y: pos.y, z: pos.z + dir.z * 0.25, size: size * 0.6, life: 0.05, color: '#fff7d6' });
  }

  sparks(pos, color = '#ffd36a', n = 4, speed = 5) {
    for (let i = 0; i < n * this.quality; i++) {
      this.glow.spawn({ ...pos, vx: (Math.random() - 0.5) * speed, vy: Math.random() * speed * 0.8, vz: (Math.random() - 0.5) * speed, size: 0.09, life: 0.25, gravity: 12, color });
    }
  }

  goo(pos, color = '#4a7a3a', n = 4, speed = 4) {
    for (let i = 0; i < n * this.quality; i++) {
      this.lit.spawn({ ...pos, vx: (Math.random() - 0.5) * speed, vy: 1 + Math.random() * speed, vz: (Math.random() - 0.5) * speed, size: 0.12 + Math.random() * 0.14, life: 0.5 + Math.random() * 0.3, gravity: 16, color });
    }
  }

  splat(x, z, color = '#2f4a22', size = 1.2) {
    _tq.setFromEuler(_e.set(0, Math.random() * 6, 0));
    this.lit.spawn({ x, y: 0.09, z, sx: size, sy: 0.04, sz: size * (0.6 + Math.random() * 0.5), quat: _tq, spin: 0, life: 6, mode: 3, color });
  }

  ring(x, z, radius, color = '#ffffff', dur = 0.5, y = 0.15) {
    const m = this.rings[this.ringNext]; this.ringNext = (this.ringNext + 1) % this.rings.length;
    m.visible = true; m.position.set(x, y, z);
    m.material.color.set(color);
    m.userData = { t: 0, dur, r: radius };
  }

  explosion(x, z, radius) {
    const n = Math.min(26, 8 + radius * 3) * this.quality;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = Math.random() * radius * 2.2;
      this.glow.spawn({ x, y: 0.6, z, vx: Math.cos(a) * s, vy: 2 + Math.random() * 5, vz: Math.sin(a) * s, size: 0.3 + Math.random() * 0.5, life: 0.35 + Math.random() * 0.2, drag: 3, color: Math.random() < 0.5 ? '#ffb02e' : '#ff5a1e' });
    }
    for (let i = 0; i < n * 0.6; i++) {
      const a = Math.random() * Math.PI * 2, s = Math.random() * radius;
      this.lit.spawn({ x: x + Math.cos(a) * s * 0.4, y: 0.8, z: z + Math.sin(a) * s * 0.4, vx: Math.cos(a) * s * 0.6, vy: 1.5 + Math.random() * 2, vz: Math.sin(a) * s * 0.6, size: 0.6 + Math.random() * 0.7, life: 0.9 + Math.random() * 0.5, drag: 2, mode: 2, color: Math.random() < 0.5 ? '#5a5a5a' : '#3a3a3a', spin: 2 });
    }
    for (let i = 0; i < 6 * this.quality; i++) {
      this.lit.spawn({ x, y: 0.4, z, vx: (Math.random() - 0.5) * 9, vy: 4 + Math.random() * 5, vz: (Math.random() - 0.5) * 9, size: 0.18, life: 0.9, gravity: 18, color: '#5a4630' });
    }
    this.glow.spawn({ x, y: 0.8, z, size: radius * 0.9, life: 0.12, spin: 0, color: '#fff0b0' });
    this.ring(x, z, radius, '#ffb347', 0.35);
    this.splat(x, z, '#2a2520', radius * 0.9);
    this.shake(Math.min(0.35, radius * 0.06));
  }

  flame(from, angle, range, cone, blue = false) {
    const n = 5 * this.quality;
    for (let i = 0; i < n; i++) {
      const a = angle + ((Math.random() - 0.5) * cone * Math.PI) / 180;
      const sp = range * (2.2 + Math.random() * 1.2);
      const c = blue ? (Math.random() < 0.5 ? '#6ab8ff' : '#c8f0ff') : (Math.random() < 0.4 ? '#ffd36a' : Math.random() < 0.6 ? '#ff8a1e' : '#ff4a1a');
      this.glow.spawn({ x: from.x, y: from.y, z: from.z, vx: Math.sin(a) * sp, vy: 0.5 + Math.random(), vz: Math.cos(a) * sp, size: 0.35 + Math.random() * 0.3, life: 0.32 + Math.random() * 0.1, drag: 1.5, mode: 2, color: c });
    }
    if (Math.random() < 0.3) this.lit.spawn({ x: from.x + Math.sin(angle) * range * 0.8, y: 1.2, z: from.z + Math.cos(angle) * range * 0.8, vy: 1.5, size: 0.6, life: 0.8, mode: 2, color: '#3a3a3a', spin: 2 });
  }

  burn(pos) { this.glow.spawn({ x: pos.x + (Math.random() - 0.5) * 0.6, y: pos.y, z: pos.z + (Math.random() - 0.5) * 0.6, vy: 2, size: 0.25, life: 0.35, mode: 2, color: Math.random() < 0.5 ? '#ff8a1e' : '#ffd36a' }); }

  lightning(points, color = '#9ff4ff') {
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      let prev = a;
      const segs = 4;
      for (let k = 1; k <= segs; k++) {
        const t = k / segs;
        const j = k === segs ? 0 : 0.5;
        const p = { x: a.x + (b.x - a.x) * t + (Math.random() - 0.5) * j, y: a.y + (b.y - a.y) * t + (Math.random() - 0.5) * j, z: a.z + (b.z - a.z) * t + (Math.random() - 0.5) * j };
        this.tracer(prev, p, color, 0.12, 0.14);
        this.tracer(prev, p, '#ffffff', 0.05, 0.1);
        prev = p;
      }
      this.sparks(b, color, 3, 4);
    }
  }

  death(pos, color, size = 1) {
    this.goo(pos, color, 8 * Math.min(3, size), 5 * Math.sqrt(size));
    this.splat(pos.x, pos.z, color, 1.1 * size);
  }

  heal(pos) {
    for (let i = 0; i < 3; i++) this.glow.spawn({ x: pos.x + (Math.random() - 0.5), y: pos.y + Math.random(), z: pos.z + (Math.random() - 0.5), vy: 2, size: 0.22, life: 0.6, spin: 0, color: '#6aff8a' });
  }

  shake(a) { if (!this.reducedMotion) this.shakeAmt = Math.min(0.6, this.shakeAmt + a); }

  // ------------------------------------------------------------- text ------
  text(worldPos, str, cls = '') {
    if (!this.overlay) return;
    let el = this.texts.find((t) => !t.alive);
    if (!el) {
      if (this.texts.length > 40) return;
      const div = document.createElement('div');
      div.className = 'float-text';
      this.overlay.appendChild(div);
      el = { div, alive: false };
      this.texts.push(el);
    }
    el.alive = true; el.t = 0; el.pos = new THREE.Vector3(worldPos.x, worldPos.y, worldPos.z);
    el.div.textContent = str;
    el.div.className = 'float-text ' + cls;
    el.div.style.display = 'block';
  }

  update(dt, viewW, viewH) {
    this.lit.update(dt);
    this.glow.update(dt);
    for (const m of this.rings) {
      if (!m.visible) continue;
      const u = m.userData; u.t += dt;
      const k = u.t / u.dur;
      if (k >= 1) { m.visible = false; continue; }
      const r = u.r * (0.2 + 0.8 * Math.sqrt(k));
      m.scale.set(r, 1, r);
      m.material.opacity = (1 - k) * 0.85;
    }
    for (const t of this.texts) {
      if (!t.alive) continue;
      t.t += dt;
      if (t.t > 1.0) { t.alive = false; t.div.style.display = 'none'; continue; }
      _p.copy(t.pos); _p.y += t.t * 1.6;
      _p.project(this.camera);
      t.div.style.transform = `translate(${((_p.x + 1) / 2) * viewW}px, ${((1 - _p.y) / 2) * viewH}px) translate(-50%, -50%)`;
      t.div.style.opacity = String(Math.min(1, (1 - t.t) * 3));
    }
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 1.5);
  }
}
