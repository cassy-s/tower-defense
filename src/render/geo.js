// Geometry helpers: rounded blocks, a vertex-colour "part builder" that merges
// many little primitives into one mesh (keeps draw calls low), shared
// materials, and canvas-drawn faces.
import * as THREE from 'three';

// ------------------------------------------------------------ materials ----
export const MAT = {
  lit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.03 }),
  glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
  ghost: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, transparent: true, opacity: 0.55, depthWrite: false }),
  shade: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, transparent: true, opacity: 0.5, depthWrite: false }),
};

// ----------------------------------------------------- rounded box geo -----
const primCache = new Map();

export function roundedBox(w, h, d, r = 0) {
  const key = `rb${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}|${r.toFixed(3)}`;
  if (primCache.has(key)) return primCache.get(key);
  let g;
  if (r <= 0.0001) g = new THREE.BoxGeometry(w, h, d);
  else {
    const half = [w / 2, h / 2, d / 2];
    r = Math.min(r, half[0] - 0.001, half[1] - 0.001, half[2] - 0.001);
    // 3 segments per side: the inner grid lines are moved to where the bevel
    // starts, giving a flat centre and one rounded strip per edge. (4 segments
    // made the same shape with a redundant line through the middle: 192
    // triangles per box instead of 108.)
    g = new THREE.BoxGeometry(w, h, d, 3, 3, 3);
    const pos = g.attributes.position, nor = g.attributes.normal;
    const v = [0, 0, 0], inner = [0, 0, 0];
    for (let i = 0; i < pos.count; i++) {
      v[0] = pos.getX(i); v[1] = pos.getY(i); v[2] = pos.getZ(i);
      for (let k = 0; k < 3; k++) {
        if (Math.abs(Math.abs(v[k]) - half[k] / 3) < 1e-5) v[k] = Math.sign(v[k]) * (half[k] - r);
        inner[k] = Math.max(-(half[k] - r), Math.min(half[k] - r, v[k]));
      }
      const ox = v[0] - inner[0], oy = v[1] - inner[1], oz = v[2] - inner[2];
      const len = Math.hypot(ox, oy, oz);
      if (len > 1e-6) {
        const nx = ox / len, ny = oy / len, nz = oz / len;
        pos.setXYZ(i, inner[0] + nx * r, inner[1] + ny * r, inner[2] + nz * r);
        nor.setXYZ(i, nx, ny, nz);
      }
    }
  }
  const out = g.index ? g.toNonIndexed() : g;
  primCache.set(key, out);
  return out;
}

function prim(key, make) {
  if (!primCache.has(key)) { const g = make(); primCache.set(key, g.index ? g.toNonIndexed() : g); }
  return primCache.get(key);
}
export const cylGeo = (rt, rb, h, seg = 10) => prim(`cy${rt}|${rb}|${h}|${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg));
export const coneGeo = (r, h, seg = 8) => prim(`co${r}|${h}|${seg}`, () => new THREE.ConeGeometry(r, h, seg));
export const sphereGeo = (r, seg = 8) => prim(`sp${r}|${seg}`, () => new THREE.SphereGeometry(r, seg, Math.max(4, seg - 2)));
export const torusGeo = (r, t, seg = 12) => prim(`to${r}|${t}|${seg}`, () => new THREE.TorusGeometry(r, t, 6, seg));

// ------------------------------------------------------- part builder ------
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _s = new THREE.Vector3(), _p = new THREE.Vector3(), _v = new THREE.Vector3();
const _nm = new THREE.Matrix3();
const colorCache = new Map();
export function col(hex) {
  if (hex instanceof THREE.Color) return hex;
  if (!colorCache.has(hex)) colorCache.set(hex, new THREE.Color(hex));
  return colorCache.get(hex);
}
export function shade(hex, amt) {
  const c = new THREE.Color(hex);
  const hsl = {}; c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + amt)));
  return '#' + c.getHexString();
}

/**
 * Collects primitives (each with a colour and transform) and merges them into
 * one BufferGeometry. Parts flagged `glow` go into a second, unlit geometry.
 */
export class PartBuilder {
  constructor() { this.lit = { pos: [], nor: [], col: [] }; this.glow = { pos: [], nor: [], col: [] }; }

  add(geo, color, x = 0, y = 0, z = 0, o = {}) {
    _e.set(o.rx || 0, o.ry || 0, o.rz || 0, o.order || 'XYZ');
    _q.setFromEuler(_e);
    _s.set(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1);
    _p.set(x, y, z);
    _m.compose(_p, _q, _s);
    if (o.parent) _m.premultiply(o.parent);
    _nm.getNormalMatrix(_m);
    const dst = o.glow ? this.glow : this.lit;
    const c = col(color);
    const pos = geo.attributes.position, nor = geo.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
      _v.fromBufferAttribute(pos, i).applyMatrix4(_m);
      dst.pos.push(_v.x, _v.y, _v.z);
      _v.fromBufferAttribute(nor, i).applyMatrix3(_nm).normalize();
      dst.nor.push(_v.x, _v.y, _v.z);
      dst.col.push(c.r, c.g, c.b);
    }
    return this;
  }
  box(w, h, d, color, x, y, z, o = {}) { return this.add(roundedBox(w, h, d, o.r ?? 0), color, x, y, z, o); }
  rbox(w, h, d, color, x, y, z, o = {}) { return this.add(roundedBox(w, h, d, o.r ?? Math.min(w, h, d) * 0.18), color, x, y, z, o); }
  cyl(rt, rb, h, color, x, y, z, o = {}) { return this.add(cylGeo(rt, rb, h, o.seg || 10), color, x, y, z, o); }
  cone(r, h, color, x, y, z, o = {}) { return this.add(coneGeo(r, h, o.seg || 8), color, x, y, z, o); }
  sphere(r, color, x, y, z, o = {}) { return this.add(sphereGeo(r, o.seg || 8), color, x, y, z, o); }
  torus(r, t, color, x, y, z, o = {}) { return this.add(torusGeo(r, t, o.seg || 12), color, x, y, z, o); }

  static toGeometry(set) {
    if (!set.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(set.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(set.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(set.col, 3));
    g.computeBoundingSphere();
    return g;
  }

  /** Returns an Object3D (Group) with up to two meshes: lit + glow. */
  build({ shadows = true, material = MAT.lit } = {}) {
    const group = new THREE.Group();
    const lit = PartBuilder.toGeometry(this.lit);
    const glow = PartBuilder.toGeometry(this.glow);
    if (lit) { const m = new THREE.Mesh(lit, material); m.castShadow = shadows; m.receiveShadow = true; group.add(m); }
    if (glow) { const m = new THREE.Mesh(glow, MAT.glow); group.add(m); }
    return group;
  }
}

// ------------------------------------------------- geometry sharing --------
const geoByHash = new Map(); // content hash -> [geometry...]

function hashFloats(h, arr) {
  const u = new Uint32Array(arr.buffer, arr.byteOffset, arr.length);
  for (let i = 0; i < u.length; i++) { h ^= u[i]; h = Math.imul(h, 0x01000193); }
  return h;
}
function sameGeometry(a, b) {
  for (const name of ['position', 'normal', 'color']) {
    const x = a.attributes[name]?.array, y = b.attributes[name]?.array;
    if (!x || !y) { if (x !== y) return false; continue; }
    if (x.length !== y.length) return false;
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  }
  return true;
}

/**
 * Replace every mesh geometry under `root` with an identical one built before,
 * if there is one. Zombie variants differ only in a colour or two, so most of
 * their parts (a head with the same skin, legs with the same trousers...) come
 * out byte-identical; sharing them lets the instance batcher draw them
 * together. Call on templates only (geometries are kept for the whole session).
 */
export function shareGeometries(root) {
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || !o.geometry?.attributes?.position) return;
    const g = o.geometry;
    let h = 0x811c9dc5;
    for (const name of ['position', 'normal', 'color']) if (g.attributes[name]) h = hashFloats(h, g.attributes[name].array);
    const list = geoByHash.get(h) || [];
    const twin = list.find((x) => x === g || sameGeometry(x, g));
    if (twin && twin !== g) { if (!g.userData.shared) g.dispose(); o.geometry = twin; }
    else if (!twin) list.push(g);
    geoByHash.set(h, list);
    o.geometry.userData.shared = true;
  });
  return root;
}

/** Dispose all geometries under an object (materials are shared). */
export function disposeTree(obj) {
  obj.traverse((o) => {
    if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
    if (o.material && o.material.userData && o.material.userData.owned) { o.material.map?.dispose(); o.material.dispose(); }
  });
}

// --------------------------------------------------------------- faces -----
const faceCache = new Map();

export function faceTexture(style, opts = {}) {
  const key = style + JSON.stringify(opts);
  if (faceCache.has(key)) return faceCache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.lineCap = 'round'; g.lineJoin = 'round';
  const ink = '#141414';
  const eye = (x, y, w = 9, h = 14, color = ink) => { g.fillStyle = color; g.beginPath(); g.ellipse(x, y, w / 2, h / 2, 0, 0, Math.PI * 2); g.fill(); };
  const line = (pts, w = 7, color = ink) => { g.strokeStyle = color; g.lineWidth = w; g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.stroke(); };

  if (opts.facePaint) {
    g.fillStyle = 'rgba(40,70,30,0.9)';
    g.fillRect(18, 74, 22, 6); g.fillRect(22, 84, 18, 5);
    g.fillRect(88, 74, 22, 6); g.fillRect(88, 84, 18, 5);
  }

  switch (style) {
    case 'smirk':
      eye(46, 58); eye(82, 58);
      line([32, 42, 54, 50], 7); line([96, 42, 74, 50], 7);
      line([50, 86, 66, 90, 84, 80], 6);
      break;
    case 'angry':
      eye(46, 58, 9, 11); eye(82, 58, 9, 11);
      line([30, 40, 56, 52], 8); line([98, 40, 72, 52], 8);
      g.fillStyle = '#f4f4f0'; g.fillRect(44, 78, 40, 16);
      g.strokeStyle = ink; g.lineWidth = 3; g.strokeRect(44, 78, 40, 16);
      for (let x = 54; x < 84; x += 10) line([x, 78, x, 94], 2);
      line([44, 86, 84, 86], 2);
      break;
    case 'smile':
      eye(46, 58, 10, 15); eye(82, 58, 10, 15);
      line([38, 46, 44, 49], 4); line([90, 46, 84, 49], 4);
      line([48, 82, 64, 92, 80, 82], 6);
      break;
    case 'grin':
      eye(46, 56); eye(82, 56);
      line([34, 44, 54, 48], 6); line([94, 44, 74, 48], 6);
      g.fillStyle = ink; g.beginPath(); g.moveTo(40, 76); g.quadraticCurveTo(64, 108, 88, 76); g.closePath(); g.fill();
      g.fillStyle = '#f4f4f0'; g.fillRect(46, 77, 36, 7);
      break;
    case 'scowl': // angry brows + one-sided smirk (Soldier)
      eye(46, 60, 9, 12); eye(82, 60, 9, 12);
      line([30, 42, 56, 53], 8); line([98, 42, 72, 53], 8);
      line([50, 88, 66, 90, 82, 81], 6);
      break;
    case 'confident': // arched brows, small smirk (Engineer)
      eye(46, 60, 10, 13); eye(82, 60, 10, 13);
      line([34, 49, 44, 44, 57, 48], 5); line([94, 49, 84, 44, 71, 48], 5);
      line([54, 88, 68, 90, 80, 83], 5);
      break;
    case 'cocky': // slanted brows, wide crooked smile (Minigunner)
      eye(46, 58, 9, 12); eye(82, 58, 9, 12);
      line([34, 49, 56, 51], 7); line([94, 44, 72, 48], 7);
      g.fillStyle = ink; g.beginPath(); g.moveTo(36, 74); g.quadraticCurveTo(60, 108, 96, 68); g.closePath(); g.fill();
      g.fillStyle = '#f4f4f0'; g.fillRect(42, 75, 50, 11);
      break;
    case 'determined':
      eye(46, 58, 9, 12); eye(82, 58, 9, 12);
      line([32, 46, 56, 48], 7); line([96, 46, 72, 48], 7);
      line([50, 86, 78, 86], 6);
      break;
    case 'zombie': {
      const glow = opts.glow || '#f6ffd8';
      g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(30, 46, 28, 24); g.fillRect(70, 48, 26, 20);
      eye(44, 58, 12, 12, glow); eye(83, 58, 9, 9, glow);
      g.fillStyle = ink; g.fillRect(40, 82, 48, 10);
      g.fillStyle = '#e8e4d0';
      for (let x = 42; x < 86; x += 9) g.fillRect(x, 82, 5, 5);
      break;
    }
    case 'scream': {
      const glow = opts.glow || '#f6ffd8';
      eye(44, 50, 12, 12, glow); eye(84, 50, 12, 12, glow);
      g.fillStyle = '#2a0808'; g.beginPath(); g.ellipse(64, 86, 18, 22, 0, 0, Math.PI * 2); g.fill();
      break;
    }
    case 'visor': {
      const glow = opts.glow || '#bffcff';
      g.fillStyle = glow; g.fillRect(34, 54, 22, 8); g.fillRect(72, 54, 22, 8);
      break;
    }
    case 'eyes': {
      const glow = opts.glow || '#ff4a3a';
      eye(46, 58, 12, 12, glow); eye(82, 58, 12, 12, glow);
      break;
    }
    default: break;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  faceCache.set(key, tex);
  return tex;
}

const facePlane = new THREE.PlaneGeometry(1, 1);
facePlane.userData.shared = true;
const faceMats = new Map();
/** A decal plane showing a face. Unlit faces glow (used for zombies). */
export function faceDecal(style, opts = {}, size = 1.2, unlit = false) {
  const key = style + JSON.stringify(opts) + unlit;
  if (!faceMats.has(key)) {
    const map = faceTexture(style, opts);
    const m = unlit
      ? new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, toneMapped: false })
      : new THREE.MeshStandardMaterial({ map, transparent: true, roughness: 0.9, depthWrite: false });
    m.polygonOffset = true; m.polygonOffsetFactor = -2;
    faceMats.set(key, m);
  }
  const mesh = new THREE.Mesh(facePlane, faceMats.get(key));
  mesh.scale.set(size, size, 1);
  return mesh;
}
