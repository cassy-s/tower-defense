// Turns the Blender-exported tower models (models/towers.gen.js) into
// geometry the PartBuilder can merge. Re-export with:
//   blender -b --factory-startup --python tools/blender/build_towers.py
import * as THREE from 'three';
import { PartBuilder } from './geo.js';
import { TOWER_MODELS } from './models/towers.gen.js';

export { TOWER_MODELS };

const geoCache = new Map();

function chunkGeometry(model, part, i) {
  const key = `${model}|${part}|${i}`;
  if (geoCache.has(key)) return geoCache.get(key);
  const [hexKey, v, f] = TOWER_MODELS[model].parts[part][i];
  const smooth = hexKey.endsWith('|s');
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v.map((n) => n / 1000), 3));
  g.setIndex(f);
  if (smooth) { g.computeVertexNormals(); g = g.toNonIndexed(); }
  else { g = g.toNonIndexed(); g.computeVertexNormals(); }
  g.userData.shared = true;
  geoCache.set(key, g);
  return g;
}

/** Add one rig part of a Blender model into a PartBuilder. */
export function addModelPart(b, model, part, opts = {}) {
  const chunks = TOWER_MODELS[model]?.parts[part];
  if (!chunks) return b;
  chunks.forEach(([hexKey], i) => b.add(chunkGeometry(model, part, i), hexKey.split('|')[0], 0, 0, 0, opts));
  return b;
}

export function hasModelPart(model, part) { return !!TOWER_MODELS[model]?.parts[part]; }

export function modelPartBuilder(model, part) { return addModelPart(new PartBuilder(), model, part); }
