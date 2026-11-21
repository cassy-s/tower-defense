// Renders tower / zombie / map snapshots to images for the UI, using a small
// offscreen WebGL renderer. Results are cached as data URLs.
import * as THREE from 'three';
import { buildTower, buildZombie } from './characters.js';
import { buildWorld } from './world.js';
import { disposeTree } from './geo.js';
import { computeStats } from '../game/tower.js';
import { ENEMIES } from '../config/enemies.js';
import { THEMES } from '../config/maps.js';

export class Portraits {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#6a7a5a', 1.6));
    const key = new THREE.DirectionalLight('#fff4e0', 2.4); key.position.set(3, 6, 6); this.scene.add(key);
    const rim = new THREE.DirectionalLight('#9fc8ff', 1.4); rim.position.set(-5, 3, -4); this.scene.add(rim);
    this.camera = new THREE.PerspectiveCamera(28, 1, 0.1, 500);
    this.cache = new Map();
  }

  shoot(obj, { w = 256, h = 256, yaw = 0.55, pitch = 0.22, pad = 0.98, focusTop = false } = {}) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    obj.rotation.y = yaw;
    this.scene.add(obj);
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    if (focusTop) center.y += size.y * 0.06;
    const fov = (this.camera.fov * Math.PI) / 180;
    const dist = (Math.max(size.y, size.x / this.camera.aspect, size.z * 0.7) / 2 / Math.tan(fov / 2)) * pad + size.z * 0.3;
    this.camera.position.set(center.x, center.y + Math.sin(pitch) * dist, center.z + Math.cos(pitch) * dist);
    this.camera.lookAt(center);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.render(this.scene, this.camera);
    const url = this.canvas.toDataURL('image/png');
    this.scene.remove(obj);
    disposeTree(obj);
    return url;
  }

  tower(type, level = 0) {
    const key = `t:${type}:${level}`;
    if (!this.cache.has(key)) {
      const rig = buildTower(computeStats(type, level).look);
      this.cache.set(key, this.shoot(rig.root, { yaw: 0.6 }));
    }
    return this.cache.get(key);
  }

  zombie(type) {
    const key = `z:${type}`;
    if (!this.cache.has(key)) {
      const rig = buildZombie(ENEMIES[type], [0, 0, 0]);
      rig.root.position.y = ENEMIES[type].flying ? 0 : 0;
      this.cache.set(key, this.shoot(rig.root, { yaw: 0.5, pitch: 0.25 }));
    }
    return this.cache.get(key);
  }

  map(game) {
    const key = `m:${game.mapId}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const theme = THEMES[game.map.theme];
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(theme.sky);
    scene.add(new THREE.HemisphereLight(theme.hemiSky, theme.hemiGround, theme.ambient));
    const sun = new THREE.DirectionalLight(theme.sunColor, theme.sun); sun.position.set(-28, 60, 30); scene.add(sun);
    const world = buildWorld(game);
    scene.add(world.group);
    const w = 480, h = 300;
    this.renderer.setSize(w, h, false);
    const cam = new THREE.PerspectiveCamera(30, w / h, 1, 500);
    cam.position.set(0, 88, 52); cam.lookAt(0, 0, 3);
    this.renderer.setClearColor(theme.sky, 1);
    this.renderer.render(scene, cam);
    const url = this.canvas.toDataURL('image/jpeg', 0.85);
    disposeTree(world.group);
    this.cache.set(key, url);
    return url;
  }
}
