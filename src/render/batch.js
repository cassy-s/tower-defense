// Draws many animated copies of the same parts in a few draw calls.
//
// Zombies are built from a handful of rig parts (head, torso, arms, legs...)
// and every zombie of the same variant shares those parts' geometry. Drawn as
// ordinary meshes that is ~6 draw calls per zombie, twice with shadows, plus 3
// per health bar: 200 zombies = ~3,000 draw calls, which is what limits the
// frame rate. Here every visible mesh under `container` is collected each
// frame and grouped by (geometry, material, shadow flags, render order); each
// group is drawn as one InstancedMesh whose instance matrices are the meshes'
// world matrices. The original meshes stay in the scene graph (they are still
// animated as before) but are moved to a layer the camera and shadow camera
// don't render.
import * as THREE from 'three';

/** Layer for meshes that are drawn by a batch instead of directly. */
export const BATCHED_LAYER = 30;

export class InstanceBatcher {
  constructor(scene) {
    this.scene = scene;
    this.batches = new Map(); // numeric key -> { mesh, count, cap }
    this.drawn = 0;
  }

  /**
   * Call once per frame, before rendering. This also updates the world
   * matrices under `container` (which should have matrixWorldAutoUpdate =
   * false, so scene.updateMatrixWorld() leaves it alone): one walk instead of
   * two, and hidden subtrees (health bars of unhurt zombies, stun stars...)
   * are skipped entirely.
   */
  update(container) {
    for (const b of this.batches.values()) b.count = 0;
    this.drawn = 0;
    container.updateMatrix();
    container.matrixWorld.copy(container.matrix);
    if (container.parent) container.matrixWorld.premultiply(container.parent.matrixWorld);
    const ch = container.children;
    for (let i = 0; i < ch.length; i++) this.visit(ch[i], container.matrixWorld);
    for (const b of this.batches.values()) {
      const m = b.mesh;
      m.count = b.count;
      m.visible = b.count > 0;
      if (b.count) {
        const attr = m.instanceMatrix;
        attr.clearUpdateRanges(); attr.addUpdateRange(0, b.count * 16);
        attr.needsUpdate = true;
      }
    }
  }

  visit(o, parentWorld) {
    if (!o.visible) return;
    if (o.userData.still) o.matrixWorld.copy(parentWorld); // identity local transform: nothing to compose
    else {
      if (o.matrixAutoUpdate) o.updateMatrix();
      o.matrixWorld.multiplyMatrices(parentWorld, o.matrix);
    }
    if (o.isMesh && !o.isInstancedMesh) this.add(o);
    const ch = o.children;
    for (let i = 0; i < ch.length; i++) this.visit(ch[i], o.matrixWorld);
  }

  add(mesh) {
    if (!mesh.userData.batched) {
      mesh.userData.batched = true;
      mesh.layers.set(BATCHED_LAYER);
      // Most part meshes sit at their group's origin and never move by themselves.
      const p = mesh.position, q = mesh.quaternion, s = mesh.scale;
      mesh.userData.still = !mesh.children.length && p.x === 0 && p.y === 0 && p.z === 0 && q.x === 0 && q.y === 0 && q.z === 0 && s.x === 1 && s.y === 1 && s.z === 1 && !mesh.userData.moves;
    }
    const g = mesh.geometry, mat = mesh.material;
    // The material can change from frame to frame (health-bar colours), so the key is rebuilt each time.
    const key = (((g.id * 8192 + mat.id) * 2 + (mesh.castShadow ? 1 : 0)) * 2 + (mesh.receiveShadow ? 1 : 0)) * 64 + (mesh.renderOrder & 63);
    let b = this.batches.get(key);
    if (!b) { b = this.make(mesh, 64); this.batches.set(key, b); }
    if (b.count >= b.cap) this.grow(b, mesh);
    mesh.matrixWorld.toArray(b.mesh.instanceMatrix.array, b.count * 16);
    b.count++;
    this.drawn++;
  }

  make(src, cap) {
    const m = new THREE.InstancedMesh(src.geometry, src.material, cap);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.castShadow = src.castShadow;
    m.receiveShadow = src.receiveShadow;
    m.renderOrder = src.renderOrder;
    m.frustumCulled = false; // instances are everywhere on the map; the map is always in view
    m.matrixAutoUpdate = false;
    m.count = 0;
    this.scene.add(m);
    return { mesh: m, count: 0, cap };
  }

  /** Double a full batch (keeping what this frame already wrote). */
  grow(b, src) {
    const old = b.mesh;
    const next = this.make(src, b.cap * 2).mesh;
    next.instanceMatrix.array.set(old.instanceMatrix.array.subarray(0, b.count * 16));
    this.scene.remove(old);
    old.dispose(); // instance buffers only: the geometry and material are shared
    b.mesh = next; b.cap *= 2;
  }

  /** Number of draw calls (batches in use), for profiling. */
  get batchCount() { let n = 0; for (const b of this.batches.values()) if (b.count) n++; return n; }

  clear() {
    for (const b of this.batches.values()) { this.scene.remove(b.mesh); b.mesh.dispose(); }
    this.batches.clear();
  }
}
