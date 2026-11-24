// The 3D view: owns the renderer, scene, camera and all entity visuals.
// It never changes game state — it only listens to game events and mirrors
// what the simulation is doing.
import * as THREE from 'three';
import { buildWorld, toWorld } from './world.js';
import { buildTower, buildZombie, zombieVariant, buildPlate, animateZombie, cloneRig, buildSentry } from './characters.js';
import { FX } from './fx.js';
import { PartBuilder, disposeTree, MAT, shade, shareGeometries } from './geo.js';
import { WIDTH, HEIGHT, THEMES } from '../config/maps.js';
import { TOWERS } from '../config/towers.js';
import { computeStats } from '../game/tower.js';
import { sentryRing } from '../game/sentry.js';
import { InstanceBatcher } from './batch.js';

// Built once, cloned per entity (clones share geometry, which lets the batcher
// draw all copies in one call).
const zombieTemplates = new Map();
const towerTemplates = new Map();
const plateTemplates = new Map();
const projTemplates = new Map();
let starsTemplate = null;
const lerp = (a, b, k) => a + (b - a) * k;

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
// Reused spawn options for death dust (dozens per kill; no garbage per particle).
const _dust = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 0.2, life: 1, gravity: -1.5, drag: 1.2, spin: 4, r: 1, g: 1, b: 1 };
const ENEMY_HEIGHT = 3.4;
const DISSOLVE_TIME = 0.55;
const FLY_Y = 3.6;

// Shared health bar pieces
const barGeo = new THREE.PlaneGeometry(1, 1);
barGeo.userData.shared = true;
const barMat = {
  bg: new THREE.MeshBasicMaterial({ color: '#111', depthTest: false, transparent: true, opacity: 0.75 }),
  hp: new THREE.MeshBasicMaterial({ color: '#5ee04a', depthTest: false }),
  low: new THREE.MeshBasicMaterial({ color: '#ff4a3a', depthTest: false }),
  mid: new THREE.MeshBasicMaterial({ color: '#ffc23a', depthTest: false }),
  shield: new THREE.MeshBasicMaterial({ color: '#4ab8ff', depthTest: false }),
};

export class View {
  constructor(canvas, overlay) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.matrixWorldAutoUpdate = false; // render() updates it once, before batching
    this.scene.matrixAutoUpdate = false;      // the scene root never moves (and this lets the flag below work)
    // Towers and zombies (with their health bars) live under `actors`. The batcher
    // updates their matrices and draws them; the scene-wide update skips them.
    this.actors = new THREE.Group();
    this.actors.matrixAutoUpdate = false;
    // three.js still walks into children whatever the flags say, so opt out of the
    // scene-wide pass explicitly. (getWorldPosition()/updateWorldMatrix() on a
    // part still work: they use a different method.)
    this.actors.updateMatrixWorld = () => {};
    this.scene.add(this.actors);
    this.batcher = new InstanceBatcher(this.scene);
    this.camera = new THREE.PerspectiveCamera(32, 1, 1, 600);
    this.hemi = new THREE.HemisphereLight('#cfe9ff', '#5d8a3a', 1.2);
    this.sun = new THREE.DirectionalLight('#fff3dc', 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -46; sc.right = 46; sc.top = 34; sc.bottom = -34; sc.near = 1; sc.far = 200;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.hemi, this.sun, this.sun.target);

    this.fx = new FX(this.scene, this.camera, overlay);
    this.overlay = overlay;
    this.towerViews = new Map();
    this.enemyViews = new Map();
    this.projViews = new Map();
    this.dying = [];
    this.flyers = [];
    this.sentryViews = new Map();
    this.dyingSentries = [];
    this.world = null;
    this.game = null;
    this.unsub = [];
    this.time = 0;
    this.zoom = 1;
    this.pan = new THREE.Vector2(0, 0);
    this.insetRight = 0;
    this.insetTop = 70;
    this.menuMode = false;
    this.orbit = 0;
    this.selected = null;
    this.hovered = null;
    this.baseShake = 0;
    this.timers = [];
    this.alpha = 1; // how far between the last two simulation steps we are drawing

    // Range indicator
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 72).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.2, depthWrite: false }));
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.975, 1, 96).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.75, depthWrite: false }));
    this.range = new THREE.Group(); this.range.add(disc, ring); this.range.position.y = 0.16; this.range.visible = false;
    this.range.userData = { disc, ring };
    this.scene.add(this.range);
    this.ghost = null;
    // Footprint marker (placement) + selection ring
    this.foot = new THREE.Mesh(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#7dff6a', transparent: true, opacity: 0.45, depthWrite: false }));
    this.foot.position.y = 0.2; this.foot.visible = false;
    this.selRing = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffd34a', transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false }));
    this.selRing.position.y = 0.25; this.selRing.visible = false;
    this.scene.add(this.foot, this.selRing);

    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.resize();
  }

  // ------------------------------------------------------------ setup -----
  setGame(game, { menu = false } = {}) {
    this.clear();
    this.game = game;
    this.menuMode = menu;
    const theme = THEMES[game.map.theme];
    this.theme = theme;
    this.scene.background = new THREE.Color(theme.sky);
    this.scene.fog = new THREE.Fog(theme.fog, theme.fogNear, theme.fogFar);
    this.hemi.color.set(theme.hemiSky); this.hemi.groundColor.set(theme.hemiGround); this.hemi.intensity = theme.ambient;
    this.sun.color.set(theme.sunColor); this.sun.intensity = theme.sun;
    this.sun.position.set(-28, 60, 30); this.sun.target.position.set(0, 0, 0);

    this.world = buildWorld(game);
    this.scene.add(this.world.group);
    for (const t of game.towers) this.addTower(t);
    for (const e of game.enemies) this.addEnemy(e);
    for (const s of game.sentries) this.addSentry(s, { quiet: true }); // e.g. a resumed game

    const on = (type, fn) => this.unsub.push(game.on(type, fn));
    on('towerPlaced', ({ tower }) => { this.addTower(tower); const [x, z] = toWorld(tower.x, tower.z); this.fx.ring(x, z, tower.footprint * 1.2, '#ffffff', 0.4); this.fx.goo({ x, y: 0.3, z }, '#8a6a4a', 8, 4); });
    on('towerUpgraded', ({ tower }) => this.rebuildTower(tower, true));
    on('towerSold', ({ tower }) => this.removeTower(tower, true));
    on('spawn', ({ enemy }) => this.addEnemy(enemy));
    on('kill', ({ enemy, reward }) => this.killEnemy(enemy, reward));
    on('leak', ({ enemy }) => this.leakEnemy(enemy));
    on('shot', (d) => this.onShot(d));
    on('spread', (d) => this.onSpread(d));
    on('flame', (d) => this.onFlame(d));
    on('chain', (d) => this.onChain(d));
    on('projectile', ({ p }) => this.addProjectile(p));
    on('projectileEnd', ({ p }) => this.removeProjectile(p));
    on('boltHit', ({ enemy }) => { const ev = this.enemyViews.get(enemy.id); if (ev) this.fx.goo(this.enemyCenter(enemy), ev.gore, 3, 3); });
    on('explode', ({ x, z, radius }) => { const [wx, wz] = toWorld(x, z); this.fx.explosion(wx, wz, radius); });
    on('spit', (d) => this.onSpit(d));
    on('stun', ({ tower }) => { const tv = this.towerViews.get(tower.id); if (tv) tv.stars.visible = true; });
    on('heal', ({ healed }) => { for (const e of healed.slice(0, 8)) this.fx.heal(this.enemyCenter(e)); });
    on('summon', ({ enemy }) => { const c = this.enemyCenter(enemy); this.fx.ring(c.x, c.z, 4, '#7dff6a', 0.6); this.fx.goo({ x: c.x, y: 0.2, z: c.z }, '#3a2a1a', 14, 5); });
    on('slam', ({ enemy, radius }) => { const c = this.enemyCenter(enemy); this.fx.ring(c.x, c.z, radius, '#ffdd88', 0.6); this.fx.ring(c.x, c.z, radius * 0.6, '#ffffff', 0.45); this.fx.goo({ x: c.x, y: 0.2, z: c.z }, '#6a5a40', 24, 9); this.fx.shake(0.5); });
    on('enrage', ({ enemy }) => { const c = this.enemyCenter(enemy); this.fx.ring(c.x, c.z, 3, '#ff3a2a', 0.6); this.fx.text({ ...c, y: c.y + 2 }, 'ENRAGED!', 'warn'); });
    on('shieldBreak', ({ enemy }) => this.fx.sparks(this.enemyCenter(enemy), '#8fd8ff', 10, 6));
    on('immune', ({ enemy }) => { if (Math.random() < 0.04) this.fx.text(this.enemyCenter(enemy), 'IMMUNE', 'muted'); });
    on('income', ({ tower, amount }) => { const [x, z] = toWorld(tower.x, tower.z); this.fx.text({ x, y: 3, z }, `+$${amount}`, 'cash'); });
    on('rally', ({ tower }) => { const [x, z] = toWorld(tower.x, tower.z); this.fx.ring(x, z, tower.range, '#ffd34a', 0.8); });
    on('airstrike', ({ targets }) => this.onAirstrike(targets));
    on('sentryBuilding', (d) => this.onSentryBuilding(d));
    on('sentrySpawn', ({ sentry }) => this.addSentry(sentry));
    on('sentryGone', ({ sentry, reason }) => this.removeSentry(sentry, reason));
    on('sentryShot', (d) => this.onSentryShot(d));
    on('sentryRocket', (d) => this.onSentryRocket(d));
    on('sentryHurt', ({ sentry }) => { const sv = this.sentryViews.get(sentry.id); if (sv) { sv.hurt = 1; this.fx.sparks({ x: sv.root.position.x, y: 1, z: sv.root.position.z }, '#ffd36a', 6, 5); } });
  }

  // ---------------------------------------------------------- sentries ----
  /** quiet: no build effects or sound (sentries that already exist when a game is loaded). */
  addSentry(s, { quiet = false } = {}) {
    const model = buildSentry(s.stats, s.tier);
    const root = new THREE.Group();
    const [x, z] = toWorld(s.x, s.z);
    root.position.set(x, 0, z);
    root.add(model.root);
    const bar = new THREE.Group();
    const bg = new THREE.Mesh(barGeo, barMat.bg), fill = new THREE.Mesh(barGeo, barMat.shield);
    bg.renderOrder = 10; fill.renderOrder = 11;
    bg.scale.set(1.5, 0.22, 1); fill.scale.set(1.4, 0.14, 1); fill.position.z = 0.01;
    bar.add(bg, fill); bar.position.y = 2.3;
    root.add(bar);
    this.scene.add(root);
    const sv = { sentry: s, root, model, bar, fill, yaw: s.angle, recoil: 0, rise: quiet ? 1 : 0, hurt: 0 };
    model.turret.rotation.y = s.angle;
    this.sentryViews.set(s.id, sv);
    if (quiet) return;
    this.fx.ring(x, z, 1.6, '#d8a838', 0.45);
    this.fx.sparks({ x, y: 0.8, z }, '#ffd36a', 14, 7);
    this.onSound?.('build');
  }

  removeSentry(s, reason) {
    const sv = this.sentryViews.get(s.id);
    if (!sv) return;
    this.sentryViews.delete(s.id);
    const p = sv.root.position;
    this.fx.goo({ x: p.x, y: 0.8, z: p.z }, '#2b2d31', 8, 5);
    this.fx.goo({ x: p.x, y: 0.8, z: p.z }, '#7a2f30', 4, 4);
    for (let i = 0; i < 6; i++) this.fx.lit.spawn({ x: p.x + (Math.random() - 0.5), y: 0.6 + Math.random(), z: p.z + (Math.random() - 0.5), vy: 1.5, size: 0.5, life: 0.9, mode: 2, color: '#6a6a6a' });
    if (reason === 'destroyed') this.fx.explosion(p.x, p.z, 1.2);
    sv.dieT = 0;
    this.dyingSentries.push(sv);
  }

  onSentryBuilding({ tower, x, z, time }) {
    const [wx, wz] = toWorld(x, z);
    this.fx.ring(wx, wz, 1.4, '#ffd34a', time);
    const n = 6;
    for (let i = 0; i < n; i++) this.later((i / n) * time, () => this.fx.sparks({ x: wx + (Math.random() - 0.5) * 0.8, y: 0.4 + Math.random() * 0.6, z: wz + (Math.random() - 0.5) * 0.8 }, '#ffd36a', 4, 5));
    const tv = this.towerViews.get(tower.id);
    if (tv) tv.building = time;
  }

  onSentryShot({ sentry, enemy }) {
    const sv = this.sentryViews.get(sentry.id);
    if (!sv) return;
    sv.recoil = 1;
    sv.root.updateMatrixWorld(true);
    const from = sv.model.muzzle.getWorldPosition(new THREE.Vector3());
    const to = this.enemyCenter(enemy);
    to.x += (Math.random() - 0.5) * 0.3; to.z += (Math.random() - 0.5) * 0.3;
    this.fx.tracer(from, to, '#ffe08a', 0.05, 0.05);
    _v.set(to.x - from.x, 0, to.z - from.z).normalize();
    this.fx.muzzle(from, _v, '#ffc84a', 0.3);
    if (Math.random() < 0.5) { const ev = this.enemyViews.get(enemy.id); this.fx.goo(to, ev ? ev.gore : '#3a5a2a', 1, 3); }
    if (Math.random() < 0.35) this.onSound?.('shot', sentry);
  }

  onSentryRocket({ sentry, x, z, delay, i }) {
    const sv = this.sentryViews.get(sentry.id);
    if (!sv) return;
    sv.root.updateMatrixWorld(true);
    const from = sv.model.muzzle.getWorldPosition(new THREE.Vector3());
    from.x += (i ? 0.5 : -0.5);
    const [tx, tz] = toWorld(x, z);
    const T = delay, g = 14;
    const vy = (1.2 - from.y + 0.5 * g * T * T) / T;
    this.fx.lit.spawn({ x: from.x, y: from.y, z: from.z, vx: (tx - from.x) / T, vy, vz: (tz - from.z) / T, size: 0.32, sz: 0.6, life: T, gravity: g, spin: 0, color: '#3b402d' });
    for (let k = 0; k < 5; k++) this.later((k / 5) * T, () => this.fx.lit.spawn({ x: from.x + (tx - from.x) * (k / 5), y: from.y + 1.5 * Math.sin((k / 5) * Math.PI), z: from.z + (tz - from.z) * (k / 5), vy: 0.6, size: 0.35, life: 0.6, mode: 2, color: '#9a9a9a' }));
    this.onSound?.('launch', sentry);
  }

  clear() {
    for (const u of this.unsub) u();
    this.unsub = [];
    for (const tv of this.towerViews.values()) { tv.root.removeFromParent(); disposeTree(tv.root); }
    for (const ev of this.enemyViews.values()) { ev.root.removeFromParent(); disposeTree(ev.root); }
    for (const d of this.dying) { d.root.removeFromParent(); disposeTree(d.root); }
    this.batcher.clear();
    for (const p of this.projViews.values()) this.scene.remove(p);
    for (const f of this.flyers) { this.scene.remove(f.obj); disposeTree(f.obj); }
    for (const sv of [...this.sentryViews.values(), ...this.dyingSentries]) { this.scene.remove(sv.root); disposeTree(sv.root); }
    this.sentryViews.clear(); this.dyingSentries = [];
    this.timers = [];
    this.towerViews.clear(); this.enemyViews.clear(); this.projViews.clear(); this.dying = []; this.flyers = [];
    this.fx.reset(); // particles, splats and floating text don't carry over into the next game
    this.baseShake = 0;
    if (this.world) { this.scene.remove(this.world.group); disposeTree(this.world.group); this.world = null; }
    this.hideGhost();
    this.range.visible = false;
    this.showBuilderRings(0, 0, null);
    this.selected = null;
    this.selRing.visible = false;
  }

  // ----------------------------------------------------------- towers -----
  addTower(t) {
    const root = new THREE.Group();
    const [x, z] = toWorld(t.x, t.z);
    root.position.set(x, 0, z);
    if (!starsTemplate) {
      const sb = new PartBuilder();
      for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; sb.box(0.22, 0.22, 0.22, '#ffe14a', Math.cos(a) * 0.7, 0, Math.sin(a) * 0.7, { glow: true, ry: a }); }
      starsTemplate = shareGeometries(sb.build({ shadows: false }));
    }
    const stars = starsTemplate.clone(true);
    stars.position.y = 3.3; stars.visible = false;
    root.add(stars);
    const tv = { tower: t, root, stars, rig: null, plate: null, yaw: t.angle, recoil: 0, level: -1, pop: 0 };
    this.towerViews.set(t.id, tv);
    this.actors.add(root); // drawn through the instance batcher
    this.rebuildTower(t, false);
    tv.pop = 1;
    return tv;
  }

  rebuildTower(t, effect) {
    const tv = this.towerViews.get(t.id);
    if (!tv) return;
    if (tv.rig) { tv.root.remove(tv.rig.root); disposeTree(tv.rig.root); }
    if (tv.plate) { tv.root.remove(tv.plate); disposeTree(tv.plate); }
    // Towers that look the same share one template's geometry, so the batcher
    // can draw all of them (e.g. six max-level Riveters) together.
    const lookKey = JSON.stringify(t.look);
    if (!towerTemplates.has(lookKey)) towerTemplates.set(lookKey, (() => { const r = buildTower(t.look); shareGeometries(r.root); return r; })());
    tv.rig = cloneRig(towerTemplates.get(lookKey));
    const plateKey = `${t.level}|${t.footprint}`;
    if (!plateTemplates.has(plateKey)) plateTemplates.set(plateKey, shareGeometries(buildPlate(t.level, t.footprint)));
    tv.plate = plateTemplates.get(plateKey).clone(true);
    tv.root.add(tv.rig.root, tv.plate);
    tv.rig.root.position.y = 0.2;
    tv.level = t.level;
    if (effect) {
      const [x, z] = toWorld(t.x, t.z);
      this.fx.ring(x, z, t.footprint * 1.5, '#ffe14a', 0.5);
      for (let i = 0; i < 16; i++) this.fx.glow.spawn({ x: x + (Math.random() - 0.5) * 2, y: 0.5 + Math.random() * 2, z: z + (Math.random() - 0.5) * 2, vy: 3, size: 0.18, life: 0.7, color: '#ffe14a' });
      tv.pop = 1;
    }
    if (this.selected === t) this.showRangeFor(t);
  }

  removeTower(t, effect) {
    const tv = this.towerViews.get(t.id);
    if (!tv) return;
    if (effect) {
      const [x, z] = toWorld(t.x, t.z);
      this.fx.goo({ x, y: 1, z }, '#9a8a6a', 14, 5);
      this.fx.text({ x, y: 2.5, z }, `+$${t.sellValue}`, 'cash');
    }
    tv.root.removeFromParent(); disposeTree(tv.root);
    this.towerViews.delete(t.id);
    if (this.selected === t) this.select(null);
  }

  muzzleWorld(tv, out = new THREE.Vector3()) {
    if (tv.rig?.muzzle) { tv.rig.root.updateMatrixWorld(true); return tv.rig.muzzle.getWorldPosition(out); }
    return out.copy(tv.root.position).setY(1.5);
  }

  enemyCenter(e) {
    const [x, z] = toWorld(e.x, e.z);
    return { x, y: e.flying ? FLY_Y : 1.45 * e.size, z };
  }

  onShot({ tower, enemy }) {
    const tv = this.towerViews.get(tower.id);
    if (!tv) return;
    tv.recoil = 1;
    const from = this.muzzleWorld(tv);
    const to = this.enemyCenter(enemy);
    to.x += (Math.random() - 0.5) * 0.3; to.z += (Math.random() - 0.5) * 0.3;
    const s = tower.stats;
    // The "heavy" look and sound is a property of the tower (the sniper), not of
    // how much damage a shot does: a max-level Gatling hits for 12 but fires
    // 20+ times a second, so it gets light effects and fewer particles.
    const heavy = tower.def.shot === 'heavy';
    const rapid = s.attack === 'spinup';
    this.fx.tracer(from, to, heavy ? '#fff1b8' : '#ffe08a', heavy ? 0.12 : 0.06, heavy ? 0.12 : 0.06);
    _v.set(to.x - from.x, 0, to.z - from.z).normalize();
    this.fx.muzzle(from, _v, '#ffc84a', heavy ? 0.7 : 0.4);
    const ev = this.enemyViews.get(enemy.id);
    if (!rapid || Math.random() < 0.35) this.fx.goo(to, ev ? ev.gore : '#3a5a2a', heavy ? 6 : rapid ? 1 : 2, heavy ? 5 : 3);
    if (enemy.armor > 0 && s.armorPierce < 0.5 && (!rapid || Math.random() < 0.3)) this.fx.sparks(to, '#ffffff', 2, 3);
    if (s.attack === 'hitscan' || (rapid && Math.random() < 0.45)) this.ejectCasing(tv);
    if (this.onSound) this.onSound(heavy ? 'sniper' : rapid ? 'minigun' : 'shot', tower);
  }

  onSpread({ tower, hits }) {
    const tv = this.towerViews.get(tower.id);
    if (!tv) return;
    tv.recoil = 1.3;
    const from = this.muzzleWorld(tv);
    for (const h of hits) {
      const [x, z] = toWorld(h.x, h.z);
      const to = { x: x + (Math.random() - 0.5) * 0.8, y: 1.0 + Math.random() * 0.5, z: z + (Math.random() - 0.5) * 0.8 };
      this.fx.tracer(from, to, tower.stats.burnDamage ? '#ff8a3a' : '#ffe08a', 0.05, 0.07);
      this.fx.goo(to, '#3a5a2a', 1, 3);
    }
    this.fx.muzzle(from, _v.set(0, 0, 0), '#ffb347', 0.8);
    this.onSound?.('shotgun', tower);
  }

  onFlame({ tower, angle, range, cone, color }) {
    const tv = this.towerViews.get(tower.id);
    if (!tv) return;
    const from = this.muzzleWorld(tv);
    this.fx.flame(from, angle, range, cone, color === 'blue');
    this.onSound?.('flame', tower);
  }

  onChain({ tower, points }) {
    const tv = this.towerViews.get(tower.id);
    if (!tv) return;
    tv.recoil = 0.6;
    const from = this.muzzleWorld(tv);
    const pts = [from, ...points.slice(1).map((p) => { const [x, z] = toWorld(p.x, p.z); return { x, y: p.y, z }; })];
    this.fx.lightning(pts, tower.level >= 4 ? '#d6a8ff' : '#9ff4ff');
    this.onSound?.('zap', tower);
  }

  onSpit({ enemy, tower }) {
    const from = this.enemyCenter(enemy); from.y += 0.8;
    const [tx, tz] = toWorld(tower.x, tower.z);
    const T = 0.45, g = 20;
    for (let i = 0; i < 6; i++) {
      this.fx.lit.spawn({ x: from.x, y: from.y, z: from.z, vx: (tx - from.x) / T + (Math.random() - 0.5), vy: (1.5 - from.y + 0.5 * g * T * T) / T, vz: (tz - from.z) / T + (Math.random() - 0.5), size: 0.3 - i * 0.03, life: T + 0.05, gravity: g, color: '#9adf2a' });
    }
    this.later(T, () => { this.fx.goo({ x: tx, y: 1.5, z: tz }, '#9adf2a', 10, 4); this.fx.splat(tx, tz, '#6a9a1a', 1.4); });
    this.onSound?.('spit');
  }

  onAirstrike(targets) {
    const b = new PartBuilder();
    b.rbox(1.2, 1.0, 6, '#5a6a42', 0, 0, 0, { r: 0.3 });
    b.box(9, 0.2, 1.6, '#4b5a32', 0, 0.2, 0.3, { r: 0.08 });
    b.box(3, 0.15, 1.0, '#4b5a32', 0, 0.3, -2.6);
    b.box(0.15, 1.3, 1.0, '#4b5a32', 0, 0.8, -2.6);
    b.box(0.9, 0.5, 1.2, '#1d2a3a', 0, 0.55, 1.6);
    for (const x of [-2.6, 2.6]) b.cyl(0.4, 0.4, 1.3, '#3a3a3a', x, -0.2, 0.9, { rx: Math.PI / 2 });
    const plane = b.build();
    plane.scale.setScalar(0.9);
    const zMid = targets.length ? targets.reduce((s, t) => s + t.z, 0) / targets.length : HEIGHT / 2;
    const [, wz] = toWorld(0, zMid);
    plane.position.set(-60, 14, wz);
    plane.rotation.y = Math.PI / 2;
    this.scene.add(plane);
    this.flyers.push({ obj: plane, vx: 55, life: 2.6 });
    targets.forEach((t, i) => {
      const [x, z] = toWorld(t.x, t.z);
      this.later(0.05 + i * 0.12, () => this.fx.lit.spawn({ x, y: 13, z, vy: -14, size: 0.5, sy: 0.9, life: 0.85, spin: 0, color: '#2a2a2a' }));
    });
    this.onSound?.('plane');
  }

  // ---------------------------------------------------------- enemies -----
  addEnemy(e) {
    const variant = zombieVariant(e.def, Math.random);
    const key = `${e.type}|${variant.join(',')}|${e.mods.join(',')}`;
    if (!zombieTemplates.has(key)) zombieTemplates.set(key, (() => { const t = buildZombie(e.def, variant, e.mods); shareGeometries(t.root); return t; })());
    const rig = cloneRig(zombieTemplates.get(key));
    const root = new THREE.Group();
    root.add(rig.root);
    const bar = new THREE.Group();
    const bg = new THREE.Mesh(barGeo, barMat.bg), fill = new THREE.Mesh(barGeo, barMat.hp), sh = new THREE.Mesh(barGeo, barMat.shield);
    bg.renderOrder = 10; fill.renderOrder = 11; sh.renderOrder = 11;
    bar.add(bg, fill, sh);
    const w = Math.min(3.2, 1.3 * Math.sqrt(e.size));
    bg.scale.set(w + 0.12, 0.3, 1); fill.scale.set(w, 0.2, 1); fill.position.z = 0.01;
    sh.scale.set(w, 0.12, 1); sh.position.set(0, 0.22, 0.01);
    bar.position.y = (e.flying ? FLY_Y : 0) + ENEMY_HEIGHT * e.size * 1.08 + 0.4;
    bar.visible = false;
    root.add(bar);
    const ev = { enemy: e, root, rig, bar, fill, sh, barW: w, phase: Math.random() * 6, yaw: Math.atan2(e.dx, e.dz), lastHit: -1, pop: 0, gore: shade(rig.kind === 'knight' || rig.kind === 'warlock' ? '#2a3a4a' : (e.def.look.skin?.[0] || '#4a6a3a'), -0.25), rise: 0 };
    root.rotation.y = ev.yaw;
    this.syncEnemy(ev, 0);
    this.actors.add(root); // drawn through the instance batcher
    this.enemyViews.set(e.id, ev);
    if (e.boss) this.onSound?.('boss');
  }

  killEnemy(e, reward = e.bounty) {
    const ev = this.enemyViews.get(e.id);
    if (!ev) return;
    this.enemyViews.delete(e.id);
    this.syncEnemy(ev, 0, 1); // die where the simulation says it died
    ev.bar.visible = false;
    ev.deathT = 0;
    this.dying.push(ev);
    const c = this.enemyCenter(e);
    // Disintegrate instead of falling over: a burst of the zombie's own colours
    // drifting up and away, then the rest dissolves over DISSOLVE_TIME.
    ev.dust = this.prepareDust(ev, 60);
    const a = Math.random() * Math.PI * 2;
    ev.wind = { x: Math.cos(a) * 0.8 + e.dx * 0.6, z: Math.sin(a) * 0.8 + e.dz * 0.6 };
    this.dustFrom(ev, Math.round(Math.min(60, 26 * e.size) * this.fx.quality));
    for (let i = 0; i < 6; i++) this.fx.glow.spawn({ x: c.x + (Math.random() - 0.5) * e.size, y: c.y + (Math.random() - 0.5) * e.size * 1.5, z: c.z + (Math.random() - 0.5) * e.size, vy: 2.5, size: 0.12, life: 0.5, color: '#fff1c0' });
    if (e.boss) { this.fx.explosion(c.x, c.z, 4); this.fx.text({ ...c, y: c.y + 2 }, `+$${Math.round(reward)}`, 'cash big'); }
    this.onSound?.(e.boss ? 'bossDie' : 'die');
  }

  leakEnemy(e) {
    const ev = this.enemyViews.get(e.id);
    if (!ev) return;
    this.enemyViews.delete(e.id);
    ev.root.removeFromParent(); disposeTree(ev.root);
    const p = this.world.basePos;
    this.fx.goo({ x: p.x - 3, y: 1, z: p.z }, '#ff3a2a', 10, 5);
    this.fx.text({ x: p.x - 3, y: 3, z: p.z }, `-${e.leak}`, 'damage');
    this.baseShake = 0.4;
    this.fx.shake(0.15);
    this.onSound?.('leak');
  }

  syncEnemy(ev, dt, alpha = this.alpha) {
    const e = ev.enemy, rig = ev.rig;
    const [x, z] = toWorld(lerp(e.px ?? e.x, e.x, alpha), lerp(e.pz ?? e.z, e.z, alpha));
    ev.root.position.set(x, e.flying ? FLY_Y + Math.sin(this.time * 3 + ev.phase) * 0.3 : 0, z);
    // facing
    const target = Math.atan2(e.dx, e.dz);
    let d = target - ev.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    ev.yaw += d * Math.min(1, dt * 8);
    rig.root.rotation.y = ev.yaw;
    ev.root.rotation.y = 0;
    // spawn rise-from-ground
    if (ev.rise < 1) { ev.rise = Math.min(1, ev.rise + dt * 2.5); rig.root.position.y = (ev.rise - 1) * 1.2; }
    // walk cycle (frozen once the game is over: the survivors stop where they are)
    const sp = this.game?.state === 'playing' ? e.speed : 0;
    ev.phase += dt * sp * (rig.brute ? 1.4 : 2.2);
    animateZombie(rig, ev.phase, this.time);
    // hit pop
    if (e.lastHit !== ev.lastHit) { ev.lastHit = e.lastHit; ev.pop = 1; }
    if (ev.pop > 0) { ev.pop = Math.max(0, ev.pop - dt * 10); const k = 1 + ev.pop * 0.1; rig.root.scale.set(k, 1 - ev.pop * 0.07, k); }
    // status visuals
    if (e.burn && Math.random() < dt * 14) this.fx.burn(this.enemyCenter(e));
    if (e.slowT > 0 && Math.random() < dt * 6) { const c2 = this.enemyCenter(e); this.fx.glow.spawn({ x: c2.x + (Math.random() - 0.5), y: c2.y + Math.random(), z: c2.z + (Math.random() - 0.5), size: 0.15, life: 0.4, color: '#8fe8ff' }); }
    if (e.enraged && Math.random() < dt * 8) { const c2 = this.enemyCenter(e); this.fx.glow.spawn({ x: c2.x, y: c2.y + 1, z: c2.z, vy: 2, size: 0.3, life: 0.4, color: '#ff3a2a' }); }
    // health bar
    const damaged = e.hp < e.maxHp || e.shield > 0;
    ev.bar.visible = damaged && !this.menuMode;
    if (ev.bar.visible) {
      ev.bar.quaternion.copy(this.camera.quaternion);
      const k = Math.max(0, e.hp / e.maxHp);
      ev.fill.scale.x = ev.barW * k;
      ev.fill.position.x = -ev.barW * (1 - k) / 2;
      ev.fill.material = k < 0.3 ? barMat.low : k < 0.6 ? barMat.mid : barMat.hp;
      ev.sh.visible = e.shield > 0;
      if (e.shield > 0) { const ks = e.shield / e.maxShield; ev.sh.scale.x = ev.barW * ks; ev.sh.position.x = -ev.barW * (1 - ks) / 2; }
    }
  }

  // ------------------------------------------------------ projectiles -----
  addProjectile(p) {
    const tkey = `${p.kind}|${p.size || 1}`;
    if (!projTemplates.has(tkey)) {
      const b = new PartBuilder();
      if (p.kind === 'bolt') {
        const s = p.size || 1;
        b.cone(0.22 * s, 1.1 * s, '#c9ced6', 0, 0, 0.3 * s, { rx: Math.PI / 2, seg: 6 });
        b.cyl(0.2 * s, 0.2 * s, 0.3 * s, '#e07b25', 0, 0, -0.35 * s, { rx: Math.PI / 2, seg: 8 });
        b.box(0.08, 0.08, 0.5, '#ffe9a8', 0, 0, -0.75 * s, { glow: true });
      } else {
        b.rbox(0.45, 0.45, 0.55, '#3d4a2a', 0, 0, 0, { r: 0.15 });
        b.box(0.2, 0.15, 0.2, '#d8b02a', 0, 0.28, 0);
      }
      projTemplates.set(tkey, shareGeometries(b.build({ shadows: true })));
    }
    const m = projTemplates.get(tkey).clone(true);
    m.userData.p = p;
    this.scene.add(m);
    this.projViews.set(p.id, m);
    if (p.kind === 'bolt') {
      const tv = this.towerViews.get(p.tower.id);
      if (tv) { tv.recoil = 1; const from = this.muzzleWorld(tv); this.fx.muzzle(from, _v.set(0, 0, 0), '#ffe9a8', 0.5); }
      this.onSound?.('bolt', p.tower);
    } else {
      const tv = this.towerViews.get(p.tower.id);
      if (tv) tv.recoil = 1;
      this.onSound?.('launch', p.tower);
    }
  }

  removeProjectile(p) {
    const m = this.projViews.get(p.id);
    if (!m) return;
    this.scene.remove(m); disposeTree(m);
    this.projViews.delete(p.id);
  }

  // ---------------------------------------------------------- placement ---
  /** rangeMult: buffs (Field Officer range) the tower would get at this spot. */
  showGhost(type, x, z, ok, rangeMult = 1) {
    if (!this.ghost || this.ghost.type !== type) {
      this.hideGhost();
      const look = computeStats(type, 0).look;
      const rig = buildTower(look, { ghost: true });
      this.ghost = { type, rig };
      this.scene.add(rig.root);
    }
    const [wx, wz] = toWorld(x, z);
    this.ghost.rig.root.position.set(wx, 0.2, wz);
    this.ghost.rig.root.rotation.y = Math.atan2(WIDTH / 2 - x, HEIGHT / 2 - z);
    this.ghost.rig.root.visible = true;
    const stats = computeStats(type, 0).stats;
    this.showRange(wx, wz, stats.range * rangeMult, ok ? '#9dff8a' : '#ff3a2a');
    this.showBuilderRings(wx, wz, stats);
    const fp = TOWERS[type].footprint || 1.5;
    this.foot.visible = true; this.foot.position.set(wx, 0.2, wz); this.foot.scale.set(fp, 1, fp);
    this.foot.material.color.set(ok ? '#7dff6a' : '#ff3a2a');
  }

  hideGhost() {
    if (this.foot) this.foot.visible = false;
    if (this.ghost) { this.scene.remove(this.ghost.rig.root); disposeTree(this.ghost.rig.root); this.ghost = null; }
    if (this.selected) this.showRangeFor(this.selected); else { this.range.visible = false; this.showBuilderRings(0, 0, null); }
  }

  showRange(wx, wz, r, color = '#ffffff') {
    this.range.visible = true;
    this.range.position.set(wx, 0.16, wz);
    this.range.scale.set(r, 1, r);
    this.range.userData.disc.material.color.set(color);
    this.range.userData.ring.material.color.set(color);
  }

  showRangeFor(t) {
    const [x, z] = toWorld(t.x, t.z);
    this.shownRange = t.range;
    this.showRange(x, z, t.range, t.stats.aura ? '#ffd34a' : '#bfe6ff');
    this.showBuilderRings(x, z, t.stats);
  }

  /** Engineer: yellow ring = where sentries go, red ring = dead zone. */
  showBuilderRings(x, z, stats) {
    if (!this.builderRings) {
      const mk = (color) => { const m = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false })); m.position.y = 0.18; this.scene.add(m); return m; };
      this.builderRings = { build: mk('#ffd34a'), dead: mk('#ff4a3a') };
    }
    const { build, dead } = this.builderRings;
    const on = !!(stats && stats.scrapMax);
    build.visible = dead.visible = on;
    if (!on) return;
    const { outer } = sentryRing(stats); // where sentries really go (see findSentrySpot)
    build.position.set(x, 0.18, z); build.scale.set(outer, 1, outer);
    dead.position.set(x, 0.19, z); dead.scale.set(stats.deadzone, 1, stats.deadzone);
  }

  select(t) {
    this.selected = t;
    this.selRing.visible = !!t;
    if (t) { const [x, z] = toWorld(t.x, t.z); this.selRing.position.set(x, 0.25, z); this.selRing.scale.setScalar(t.footprint * 1.05); }
    if (t) this.showRangeFor(t); else if (!this.ghost) { this.range.visible = false; this.showBuilderRings(0, 0, null); }
  }

  // -------------------------------------------------------------- input ---
  /** Screen pixel -> map coords on the ground plane. */
  pick(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.ray.intersectPlane(this.groundPlane, _v2);
    if (!hit) return null;
    return { x: hit.x + WIDTH / 2, z: hit.z + HEIGHT / 2 };
  }

  /** Screen x (CSS pixels) of a tower, used to open the inspector on the other side. */
  screenX(t) {
    const [x, z] = toWorld(t.x, t.z);
    _v.set(x, 0, z).project(this.camera);
    const r = this.canvas.getBoundingClientRect();
    return r.left + ((_v.x + 1) / 2) * r.width;
  }

  towerAt(x, z) {
    if (!this.game) return null;
    let best = null, bestD = Infinity;
    for (const t of this.game.towers) {
      const d = Math.hypot(t.x - x, t.z - z);
      if (d < t.footprint * 1.1 && d < bestD) { bestD = d; best = t; }
    }
    return best;
  }

  // ------------------------------------------------------------- camera ---
  resize() {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.vw = w; this.vh = h;
    this.fitDistance = null;
  }

  setInsets(right, top) { this.insetRight = right; this.insetTop = top; this.fitDistance = null; }

  computeFit() {
    const cam = this.camera;
    const pitch = 0.98;
    const P = this.menuMode ? 0 : this.insetRight;
    const full = this.vw + P;
    cam.aspect = full / this.vh;
    cam.setViewOffset(full, this.vh, P, 0, this.vw, this.vh);
    cam.updateProjectionMatrix();
    const maxX = 1 - (2 * P) / this.vw - 0.03, minX = -0.97;
    const maxY = 1 - (2 * this.insetTop) / this.vh, minY = -0.95;
    const corners = [[-WIDTH / 2 - 1, -HEIGHT / 2 - 1], [WIDTH / 2 + 1, -HEIGHT / 2 - 1], [-WIDTH / 2 - 1, HEIGHT / 2 + 1], [WIDTH / 2 + 1, HEIGHT / 2 + 1]];
    let lo = 10, hi = 400;
    for (let i = 0; i < 26; i++) {
      const D = (lo + hi) / 2;
      cam.position.set(0, Math.sin(pitch) * D, Math.cos(pitch) * D);
      cam.lookAt(0, 0, 0);
      cam.updateMatrixWorld(true);
      let fits = true;
      for (const [x, z] of corners) {
        _v.set(x, 0, z).project(cam);
        if (_v.x > maxX || _v.x < minX || _v.y > maxY || _v.y < minY) { fits = false; break; }
      }
      if (fits) hi = D; else lo = D;
    }
    // Recentre vertically: shift look target so top/bottom margins match.
    this.fitDistance = hi;
    this.pitch = pitch;
  }

  updateCamera(dt) {
    if (!this.fitDistance) this.computeFit();
    const cam = this.camera;
    if (this.menuMode) {
      this.orbit += dt * 0.05;
      const D = this.fitDistance * 0.78;
      const pitch = 0.72;
      cam.position.set(Math.sin(this.orbit) * Math.cos(pitch) * D, Math.sin(pitch) * D, Math.cos(this.orbit) * Math.cos(pitch) * D);
      cam.lookAt(0, 0, 2);
      return;
    }
    const D = this.fitDistance * this.zoom;
    const maxPan = (1 - this.zoom) * 34;
    this.pan.x = Math.max(-maxPan, Math.min(maxPan, this.pan.x));
    this.pan.y = Math.max(-maxPan * 0.7, Math.min(maxPan * 0.7, this.pan.y));
    const tx = this.pan.x, tz = this.pan.y + 1.2;
    cam.position.set(tx, Math.sin(this.pitch) * D, tz + Math.cos(this.pitch) * D);
    cam.lookAt(tx, 0, tz);
    if (this.fx.shakeAmt > 0) {
      const a = this.fx.shakeAmt;
      cam.position.x += (Math.random() - 0.5) * a; cam.position.y += (Math.random() - 0.5) * a; cam.position.z += (Math.random() - 0.5) * a;
    }
  }

  zoomBy(delta, clientX, clientY) {
    const before = this.pick(clientX, clientY);
    this.zoom = Math.max(0.45, Math.min(1, this.zoom * (delta > 0 ? 1.1 : 0.9)));
    if (before && delta < 0) {
      this.pan.x += (before.x - WIDTH / 2 - this.pan.x) * 0.12;
      this.pan.y += (before.z - HEIGHT / 2 - this.pan.y) * 0.12;
    }
    if (this.zoom >= 1) this.pan.set(0, 0);
  }

  // ------------------------------------------------------------- frame ----
  later(delay, fn) { this.timers.push({ at: this.time + delay, fn }); }

  update(dt, alpha = 1) {
    this.time += dt;
    this.alpha = alpha;
    if (this.timers.length) {
      const due = this.timers.filter((t) => t.at <= this.time);
      if (due.length) { this.timers = this.timers.filter((t) => t.at > this.time); for (const t of due) t.fn(); }
    }
    const game = this.game;
    if (!game) return;

    for (const tv of this.towerViews.values()) this.animateTower(tv, dt);
    this.updateSentries(dt);

    if (this.selRing.visible) { const k = 1 + Math.sin(this.time * 6) * 0.06; const f = this.selected ? this.selected.footprint * 1.05 : 1; this.selRing.scale.set(f * k, 1, f * k); }
    // A Field Officer buff starting or ending changes the selected tower's range.
    if (this.selected && !this.ghost && this.selected.range !== this.shownRange) this.showRangeFor(this.selected);
    for (const ev of this.enemyViews.values()) this.syncEnemy(ev, dt);

    for (let i = this.dying.length - 1; i >= 0; i--) {
      const ev = this.dying[i];
      ev.deathT += dt;
      const k = Math.min(1, ev.deathT / DISSOLVE_TIME);
      const rig = ev.rig;
      if (ev.enemy.flying) ev.root.position.y = Math.max(0, ev.root.position.y - dt * 3);
      // Disintegrate: the body flickers, stretches up and thins out into the floating dust.
      const s = 1 - k * k;
      rig.root.scale.set(s, 1 + k * 0.35, s);
      rig.root.position.y = (rig.root.position.y || 0) + dt * 0.8;
      rig.root.visible = k < 0.9 && !(k > 0.35 && Math.floor(ev.deathT * 40) % 3 === 0);
      if (k > 0.05 && k < 0.9 && Math.random() < dt * 40) this.dustFrom(ev, 3);
      if (k >= 1) { ev.root.removeFromParent(); disposeTree(ev.root); this.dying.splice(i, 1); }
    }

    for (const m of this.projViews.values()) {
      const p = m.userData.p;
      const [x, z] = toWorld(lerp(p.px ?? p.x, p.x, alpha), lerp(p.pz ?? p.z, p.z, alpha));
      if (p.kind === 'bolt') { m.position.set(x, 1.4, z); m.rotation.set(0, Math.atan2(p.vx, p.vz), 0); m.rotateZ(this.time * 30); }
      else { m.position.set(x, lerp(p.py ?? p.y ?? 1.6, p.y ?? 1.6, alpha), z); m.rotation.x += dt * 8; m.rotation.y += dt * 5; }
    }
    this.updateWorldBits(dt);
  }

  // ----------------------------------------------------- tower animation --
  animateTower(tv, dt) {
    const t = tv.tower, rig = tv.rig;
    let d = t.angle - tv.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    tv.yaw += d * Math.min(1, dt * 14);
    rig.root.rotation.y = tv.yaw;
    const ph = this.time + t.id * 1.7;
    // Once the game is over the towers stand down (no spinning guns behind the end screen).
    const live = this.menuMode || this.game?.state === 'playing';
    // Aim: raise the weapon while there is a target, lower it a bit when idle.
    const engaged = live && !!(t.firing || (t.stats.attack === 'spinup' && t.spin > 0.05));
    if (engaged) tv.idleT = 0; else tv.idleT = (tv.idleT || 0) + dt;
    const aimTarget = tv.idleT > 1.2 ? 0 : 1;
    tv.aim = (tv.aim ?? 0) + (aimTarget - (tv.aim ?? 0)) * Math.min(1, dt * 5);
    const lower = (1 - tv.aim) * 0.32;
    if (tv.recoil > 0) tv.recoil = Math.max(0, tv.recoil - dt * 10);
    const r = tv.recoil * (rig.model === 'minigunner' ? 0.45 : 1);
    // breathing + idle look-around
    rig.body.position.y = Math.sin(ph * 2) * 0.03;
    rig.torso.scale.y = 1 + Math.sin(ph * 2.2) * 0.012;
    rig.head.rotation.y = Math.sin(ph * 0.6) * 0.22 * (1 - tv.aim);
    rig.head.rotation.x = (rig.restHeadX || 0) + lower * 0.25;
    rig.body.position.z = -r * 0.1;
    rig.torso.rotation.x = -r * 0.05;
    if (rig.poseIdle) {
      // Blend the relaxed idle pose into the firing pose.
      const I = rig.poseIdle, A = rig.poseAim, k = tv.aim, mix = (a, b, i) => a[i] + (b[i] - a[i]) * k;
      rig.armR.rotation.set(mix(I.armR, A.armR, 0) - r * 0.2, mix(I.armR, A.armR, 1), mix(I.armR, A.armR, 2));
      rig.armL.rotation.set(mix(I.armL, A.armL, 0) - r * 0.15, mix(I.armL, A.armL, 1), mix(I.armL, A.armL, 2));
      rig.mount.position.set(mix(I.mount, A.mount, 0), mix(I.mount, A.mount, 1), mix(I.mount, A.mount, 2) - r * 0.32);
      rig.mount.rotation.set(mix(I.mountRot, A.mountRot, 0) - r * 0.14, mix(I.mountRot, A.mountRot, 1), mix(I.mountRot, A.mountRot, 2));
    } else {
      rig.armR.rotation.x = rig.restArmR + lower - r * 0.2;
      rig.armL.rotation.x = rig.restArmL + lower * 0.9 - r * 0.15;
      rig.mount.position.x = rig.restMountX;
      rig.mount.position.z = rig.restMountZ - r * 0.32 - lower * 0.35;
      rig.mount.position.y = rig.restMountY - lower * 0.9;
      rig.mount.rotation.x = lower * 0.55 - r * 0.14;
    }
    // Minigun: shake while spinning. Both branches above put the gun back at its
    // rest position every frame, so the jitter can't add up and walk it away.
    if (live && t.stats.attack === 'spinup' && t.spin > 0.2) {
      const j = t.spin * 0.04;
      rig.mount.position.x += (Math.random() - 0.5) * j;
      rig.body.position.y += (Math.random() - 0.5) * j;
    }
    // Engineer: hammering while she builds a sentry.
    if (tv.building > 0) {
      tv.building -= dt;
      const hit = Math.abs(Math.sin(this.time * 13));
      rig.armR.rotation.x = -0.4 - hit * 1.3;
      rig.armL.rotation.x = -0.6;
      rig.mount.position.y = rig.restMountY - 0.9; rig.mount.rotation.x = 0.7;
      rig.body.position.y = -0.12 * hit;
      rig.head.rotation.x = 0.35;
    }
    const spinning = !live ? 0 : t.stats.attack === 'spinup' ? t.spin : t.firing ? 0.6 : 0.05;
    for (const s of rig.spinners) s.rotation.z += dt * spinning * 34;
    tv.stars.visible = t.stunTimer > 0;
    if (tv.stars.visible) { tv.stars.rotation.y += dt * 5; rig.body.rotation.z = Math.sin(this.time * 12) * 0.08; } else rig.body.rotation.z = 0;
    if (tv.pop > 0) { tv.pop = Math.max(0, tv.pop - dt * 4); const k = 1 + Math.sin(tv.pop * Math.PI) * 0.15; rig.root.scale.set(k, 1 + Math.sin(tv.pop * Math.PI) * 0.25, k); }
    const buffed = t.buff.rally;
    if (buffed && Math.random() < dt * 6) this.fx.glow.spawn({ x: tv.root.position.x + (Math.random() - 0.5) * 1.5, y: 0.5, z: tv.root.position.z + (Math.random() - 0.5) * 1.5, vy: 3, size: 0.15, life: 0.5, color: '#ffd34a' });
  }

  /** Brass shell casings flicked out of the right side of the gun. */
  ejectCasing(tv) {
    if (!tv.rig?.weaponGroup) return;
    tv.rig.weaponGroup.updateMatrixWorld(true);
    const p = tv.rig.weaponGroup.localToWorld(_v.set(0.3, 0.3, 0.4));
    const yaw = tv.yaw + Math.PI / 2;
    this.fx.lit.spawn({ x: p.x, y: p.y, z: p.z, vx: Math.sin(yaw) * (2 + Math.random() * 1.5), vy: 3 + Math.random() * 2, vz: Math.cos(yaw) * (2 + Math.random() * 1.5), size: 0.09, sz: 0.18, life: 0.7, gravity: 22, spin: 20, color: '#d8a838' });
  }

  updateSentries(dt) {
    for (const sv of this.sentryViews.values()) {
      const s = sv.sentry, m = sv.model;
      let d = s.angle - sv.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      sv.yaw += d * Math.min(1, dt * 12);
      m.turret.rotation.y = sv.yaw;
      if (sv.rise < 1) { sv.rise = Math.min(1, sv.rise + dt * 3); const k = 1 - (1 - sv.rise) ** 3; m.root.scale.setScalar(m.root.userData.s * (0.2 + 0.8 * k)); m.root.position.y = (1 - k) * -0.6; }
      if (sv.recoil > 0) { sv.recoil = Math.max(0, sv.recoil - dt * 14); m.barrels.position.z = 0.5 * (s.tier >= 4 ? 1.25 : 1) - sv.recoil * 0.18; }
      if (!s.target) m.turret.rotation.y = sv.yaw + Math.sin(this.time * 0.9 + s.id) * 0.5; // idle scan
      if (m.shield) { m.shield.material.opacity = 0.16 + Math.sin(this.time * 3 + s.id) * 0.05 + sv.hurt * 0.3; m.shield.rotation.y += dt * 0.5; }
      if (sv.hurt > 0) sv.hurt = Math.max(0, sv.hurt - dt * 3);
      // lifespan bar
      sv.bar.visible = !this.menuMode;
      sv.bar.quaternion.copy(this.camera.quaternion);
      const k = Math.max(0, s.hp / s.maxHp);
      sv.fill.scale.x = 1.4 * k; sv.fill.position.x = -1.4 * (1 - k) / 2;
      sv.fill.material = k < 0.25 ? barMat.low : barMat.shield;
    }
    for (let i = this.dyingSentries.length - 1; i >= 0; i--) {
      const sv = this.dyingSentries[i];
      sv.dieT += dt;
      const k = Math.min(1, sv.dieT / 0.3);
      sv.model.root.scale.setScalar(sv.model.root.userData.s * (1 - k));
      sv.bar.visible = false;
      if (k >= 1) { this.scene.remove(sv.root); disposeTree(sv.root); this.dyingSentries.splice(i, 1); }
    }
  }

  /** Sample points on a zombie's body and blow them away as coloured voxel dust. */
  dustFrom(ev, n) {
    const pts = ev.dust;
    if (!pts || !pts.length) return;
    ev.root.updateMatrixWorld(true);
    for (let i = 0; i < n; i++) {
      const p = pts[(Math.random() * pts.length) | 0];
      _v.set(p.lx, p.ly, p.lz).applyMatrix4(p.mesh.matrixWorld);
      _dust.x = _v.x; _dust.y = _v.y; _dust.z = _v.z;
      _dust.vx = (Math.random() - 0.5) * 1.6 + ev.wind.x; _dust.vy = 1.2 + Math.random() * 2.2; _dust.vz = (Math.random() - 0.5) * 1.6 + ev.wind.z;
      _dust.size = 0.18 + Math.random() * 0.2; _dust.life = 0.8 + Math.random() * 0.7;
      _dust.r = p.r; _dust.g = p.g; _dust.b = p.b;
      this.fx.lit.spawn(_dust);
    }
  }

  /** Points on the zombie's body to blow away as dust. Plain numbers, no Color/Vector3 per point. */
  prepareDust(ev, count) {
    const pts = [];
    ev.rig.root.updateMatrixWorld(true);
    const meshes = [];
    ev.rig.root.traverse((o) => { if (o.isMesh && o.visible && o.geometry?.attributes?.color && o.parent?.visible !== false) meshes.push(o); });
    if (!meshes.length) return pts;
    for (let i = 0; i < count; i++) {
      const mesh = meshes[(Math.random() * meshes.length) | 0];
      const pos = mesh.geometry.attributes.position, colA = mesh.geometry.attributes.color;
      const j = (Math.random() * pos.count) | 0;
      pts.push({ mesh, lx: pos.getX(j), ly: pos.getY(j), lz: pos.getZ(j), r: colA.getX(j), g: colA.getY(j), b: colA.getZ(j) });
    }
    return pts;
  }

  updateWorldBits(dt) {
    for (let i = this.flyers.length - 1; i >= 0; i--) {
      const f = this.flyers[i];
      f.obj.position.x += f.vx * dt; f.life -= dt;
      if (f.life <= 0) { this.scene.remove(f.obj); disposeTree(f.obj); this.flyers.splice(i, 1); }
    }

    // flag + base shake
    if (this.world?.flag) {
      const flag = this.world.flag;
      const pos = flag.geometry.attributes.position;
      const base = flag.userData.base;
      for (let i = 0; i < pos.count; i++) {
        const x = base[i * 3];
        pos.setZ(i, Math.sin(x * 2.2 - this.time * 5) * 0.18 * (x / 2.4));
      }
      pos.needsUpdate = true;
    }
    // The bunker shudders when a zombie gets in.
    const bunker = this.world?.bunker;
    if (bunker) {
      if (this.baseShake > 0) {
        this.baseShake = Math.max(0, this.baseShake - dt);
        const a = this.fx.reducedMotion ? 0 : this.baseShake * 0.5;
        bunker.position.set((Math.random() - 0.5) * a, 0, (Math.random() - 0.5) * a);
      } else if (bunker.position.x || bunker.position.z) bunker.position.set(0, 0, 0);
    }
  }

  render(realDt) {
    this.updateCamera(realDt);
    this.fx.update(realDt, this.vw, this.vh);
    // World matrices are updated once here (not again inside render()), then
    // the zombies' parts are gathered into instanced batches.
    this.scene.updateMatrixWorld();
    this.batcher.update(this.actors);
    this.renderer.render(this.scene, this.camera);
  }
}
