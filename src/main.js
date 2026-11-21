// Entry point: wires the simulation, the 3D view and the UI together and
// runs the main loop.
import { Game } from './game/game.js';
import { TARGETING } from './game/tower.js';
import { View } from './render/view.js';
import { Portraits } from './render/portraits.js';
import { UI } from './ui/ui.js';
import { audio } from './audio.js';
import { TOWERS, TOWER_ORDER } from './config/towers.js';
import { ENEMIES } from './config/enemies.js';
import { MAP_ORDER } from './config/maps.js';
import { validateContent } from './config/schema.js';

const SAVE_KEY = 'blockade.save.v2';
const STEP = 1 / 60;

class App {
  constructor() {
    this.save = this.load();
    this.settings = this.save.settings;
    this.canvas = document.getElementById('scene');
    this.view = new View(this.canvas, document.getElementById('fx-layer'));
    this.view.onSound = (n) => audio.play(n);
    this.portraits = new Portraits();
    this.ui = new UI(this);
    this.speed = 1;
    this.paused = false;
    this.placing = null;
    this.game = null;
    this.mode = 'loading';
    this.mapThumbs = {};
    audio.setVolume(this.settings.volume);
    audio.setMuted(this.settings.muted);
    this.ui.setMuteIcon(this.settings.muted);
    this.applyQuality();
    this.bindInput();
    window.addEventListener('resize', () => { this.view.resize(); this.updateInsets(); });
    this.last = performance.now();
    this.acc = 0;
    requestAnimationFrame((t) => this.frame(t));
    this.boot();
  }

  // ------------------------------------------------------------ persist ---
  load() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch { /* ignore */ }
    return { best: s.best || {}, settings: { volume: 0.5, muted: false, quality: 'high', ...(s.settings || {}) } };
  }
  persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch { /* ignore */ } }

  // --------------------------------------------------------------- boot ---
  async boot() {
    const problems = validateContent();
    if (problems.length) console.warn(`[Blockade] ${problems.length} content problem(s):\n` + problems.join('\n'));
    const tick = () => new Promise((r) => setTimeout(r, 0));
    const jobs = [
      ...TOWER_ORDER.map((id) => () => this.portraits.tower(id)),
      ...Object.keys(ENEMIES).map((id) => () => this.portraits.zombie(id)),
      ...MAP_ORDER.map((id) => () => this.mapThumb(id)),
    ];
    for (let i = 0; i < jobs.length; i++) {
      jobs[i]();
      this.ui.setLoading((i + 1) / jobs.length, i < TOWER_ORDER.length ? 'Training soldiers…' : i < TOWER_ORDER.length + Object.keys(ENEMIES).length ? 'Waking the dead…' : 'Laying the roads…');
      if (i % 3 === 0) await tick();
    }
    this.startMenu();
  }

  mapThumb(id) {
    if (!this.mapThumbs[id]) this.mapThumbs[id] = this.portraits.map(new Game({ mapId: id }));
    return this.mapThumbs[id];
  }

  // ------------------------------------------------------------- menu -----
  startMenu() {
    this.mode = 'menu';
    this.speed = 1;
    this.paused = false;
    this.cancelPlacing();
    const g = new Game({ mapId: 'maple', difficulty: 'easy', cashOverride: 1e7, seed: 7 });
    g.lives = g.maxLives = 1e9;
    g.autoStart = true;
    // Attract mode: a defended street with zombies marching through.
    const plan = [
      ['rifleman', 9, 14, 2], ['marksman', 21, 22, 2], ['riveter', 17, 27, 1], ['grenadier', 33, 16, 2], ['flamer', 42, 15, 1],
      ['tesla', 49, 25, 2], ['gatling', 25, 35, 1], ['officer', 37, 23, 1], ['scatter', 9, 26, 1], ['depot', 33, 4, 3], ['rifleman', 50, 36, 3],
    ];
    for (const [type, x, z, lvl] of plan) {
      const t = g.placeTower(type, x, z);
      if (t) for (let i = 0; i < lvl; i++) g.upgradeTower(t);
    }
    g.on('waveEnd', ({ wave }) => { if (wave >= 12) g.wave = 3; });
    g.startNextWave(); g.wave = 3; g.startNextWave();
    this.game = g;
    this.view.setGame(g, { menu: true });
    this.view.fitDistance = null;
    this.ui.game = null;
    this.ui.showScreen('title');
  }

  // ------------------------------------------------------------- game -----
  startGame(mapId, difficulty) {
    audio.init();
    this.mode = 'game';
    this.speed = 1;
    this.paused = false;
    this.cancelPlacing();
    this.selectedTower = null;
    this.lastStart = { mapId, difficulty };
    const g = new Game({ mapId, difficulty, seed: Date.now() & 0xffff });
    this.game = g;
    this.view.setGame(g);
    this.view.zoom = 1; this.view.pan.set(0, 0);
    this.ui.showScreen('game');
    this.ui.bindGame(g);
    this.updateInsets();
    this.bindGameSounds(g);
    g.on('gameOver', ({ won }) => this.onGameOver(won));
    this.ui.hint('Pick a tower on the right, then click the grass to deploy it. Press <b>START</b> when ready.');
    this.firstPlace = true;
  }

  bindGameSounds(g) {
    g.on('waveStart', () => audio.play('wave'));
    g.on('waveEnd', () => audio.play('waveEnd'));
    g.on('explode', () => audio.play('explode'));
    g.on('towerPlaced', () => audio.play('place'));
    g.on('towerUpgraded', () => audio.play('upgrade'));
    g.on('towerSold', () => audio.play('sell'));
  }

  onGameOver(won) {
    audio.play(won ? 'win' : 'lose');
    const g = this.game;
    const b = (this.save.best[g.mapId] ||= {});
    const prev = b[g.difficultyId];
    if (won) b[g.difficultyId] = 'win';
    else if (prev !== 'win' && (!prev || g.wave > prev)) b[g.difficultyId] = g.wave;
    this.persist();
    this.cancelPlacing();
    this.select(null);
    clearTimeout(this.endTimer);
    this.endTimer = setTimeout(() => { if (this.game === g && this.mode === 'game') this.ui.showEnd(won, g); }, 900);
  }

  restart() {
    document.getElementById('modal-end').classList.add('hidden');
    document.getElementById('modal-pause').classList.add('hidden');
    if (this.lastStart) this.startGame(this.lastStart.mapId, this.lastStart.difficulty);
  }

  quitToMenu() {
    document.getElementById('modal-end').classList.add('hidden');
    document.getElementById('modal-pause').classList.add('hidden');
    this.ui.closeInspector();
    this.startMenu();
  }

  updateInsets() {
    const shop = document.getElementById('shop');
    const w = this.mode === 'game' && shop ? shop.getBoundingClientRect().width + 16 : 0;
    this.view.setInsets(w, 74);
  }

  // ---------------------------------------------------------- controls ----
  sound(n) { audio.init(); audio.play(n); }
  setPaused(p) {
    if (this.mode !== 'game' || this.game.state !== 'playing') p = false;
    this.paused = p;
    if (p) this.ui.openSettings(false); else this.ui.closeSettings();
  }
  toggleMute() { audio.init(); this.settings.muted = !this.settings.muted; audio.setMuted(this.settings.muted); this.ui.setMuteIcon(this.settings.muted); this.persist(); }
  setVolume(v) { audio.init(); this.settings.volume = v; audio.setVolume(v); this.persist(); }
  setQuality(q) { this.settings.quality = q; this.applyQuality(); this.persist(); }
  applyQuality() {
    const high = this.settings.quality !== 'low';
    const r = this.view.renderer;
    r.shadowMap.enabled = high;
    r.setPixelRatio(high ? Math.min(window.devicePixelRatio, 2) : 1);
    this.view.fx.quality = high ? 1 : 0.5;
    this.view.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
    this.view.resize();
  }
  cycleSpeed() { this.speed = this.speed === 1 ? 2 : this.speed === 2 ? 3 : 1; }
  setAuto(v) { if (this.game) this.game.autoStart = v; if (v && this.game && !this.game.waveInProgress) this.game.startNextWave(); }
  goPressed() {
    const g = this.game;
    if (!g || this.mode !== 'game' || g.state !== 'playing') return;
    audio.init();
    if (g.startNextWave()) this.ui.hint(null);
  }

  beginPlacing(type) {
    if (this.mode !== 'game' || this.game.state !== 'playing') return;
    const g = this.game;
    const def = TOWERS[type];
    if (g.cash < def.cost) { this.sound('error'); this.flashHint(`Need <b>$${def.cost}</b> for ${def.name}`); return; }
    if (def.limit && g.countOf(type) >= def.limit) { this.sound('error'); this.flashHint(`Only ${def.limit} ${def.name}s allowed`); return; }
    if (this.placing === type) { this.cancelPlacing(); return; }
    this.select(null);
    this.placing = type;
    this.canvas.classList.add('placing');
    if (this.mouse) this.updateGhost(this.mouse.x, this.mouse.y);
  }
  cancelPlacing() {
    this.placing = null;
    this.canvas.classList.remove('placing');
    this.view.hideGhost();
  }
  flashHint(html) {
    this.ui.hint(html);
    clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => this.ui.hint(null), 1600);
  }

  select(t) {
    this.selectedTower = t;
    this.view.select(t);
    if (t) this.ui.openInspector(t); else this.ui.closeInspector();
  }
  upgradeSelected() {
    const t = this.selectedTower;
    if (!t) return;
    if (!this.game.upgradeTower(t)) this.sound('error');
  }
  sellSelected() {
    const t = this.selectedTower;
    if (!t) return;
    this.game.sellTower(t);
    this.select(null);
  }
  useAbility() { const t = this.selectedTower; if (t && !t.useAbility()) this.sound('error'); }
  cycleTargeting(dir) {
    const t = this.selectedTower;
    if (!t) return;
    const i = TARGETING.indexOf(t.targeting);
    t.targeting = TARGETING[(i + dir + TARGETING.length) % TARGETING.length];
    this.sound('click');
  }

  updateGhost(cx, cy) {
    const p = this.view.pick(cx, cy);
    if (!p) return;
    const res = this.game.canPlace(this.placing, p.x, p.z);
    this.view.showGhost(this.placing, p.x, p.z, res.ok);
    this.ghostReason = res.ok ? null : res.reason;
  }

  bindInput() {
    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointermove', (e) => {
      this.mouse = { x: e.clientX, y: e.clientY };
      if (this.drag) {
        const k = 0.09 * this.view.zoom;
        this.view.pan.x -= (e.clientX - this.drag.x) * k;
        this.view.pan.y -= (e.clientY - this.drag.y) * k;
        this.drag = { x: e.clientX, y: e.clientY, moved: true };
        return;
      }
      if (this.mode !== 'game') return;
      if (this.placing) { this.updateGhost(e.clientX, e.clientY); return; }
      const p = this.view.pick(e.clientX, e.clientY);
      const t = p && this.view.towerAt(p.x, p.z);
      c.classList.toggle('hovering', !!t);
    });
    c.addEventListener('pointerdown', (e) => {
      if (this.mode !== 'game') return;
      audio.init();
      if (e.button === 2 || e.button === 1) {
        if (this.placing && e.button === 2) { this.cancelPlacing(); return; }
        this.drag = { x: e.clientX, y: e.clientY, moved: false };
        return;
      }
      if (e.button !== 0) return;
      const p = this.view.pick(e.clientX, e.clientY);
      if (!p) return;
      if (this.placing) {
        const type = this.placing;
        const res = this.game.canPlace(type, p.x, p.z);
        if (!res.ok) { this.sound('error'); this.flashHint(res.reason); return; }
        this.game.placeTower(type, p.x, p.z);
        if (this.firstPlace) { this.firstPlace = false; if (this.game.wave === 0) this.ui.hint('Nice! Press <b>START</b> (or <kbd>Space</kbd>) to send the first wave.'); }
        if (!e.shiftKey || this.game.cash < TOWERS[type].cost) this.cancelPlacing();
        return;
      }
      const t = this.view.towerAt(p.x, p.z);
      this.select(t || null);
      if (t) this.sound('click');
    });
    window.addEventListener('pointerup', () => { this.drag = null; });
    c.addEventListener('wheel', (e) => { if (this.mode === 'game') { e.preventDefault(); this.view.zoomBy(e.deltaY, e.clientX, e.clientY); } }, { passive: false });

    window.addEventListener('keydown', (e) => {
      if (this.mode !== 'game' || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      const k = e.key.toLowerCase();
      if (k === 'escape') {
        if (this.placing) this.cancelPlacing();
        else if (this.selectedTower) this.select(null);
        else this.setPaused(!this.paused);
        return;
      }
      if (this.paused) return;
      if (/^[0-9]$/.test(k)) {
        const idx = k === '0' ? 9 : +k - 1;
        if (TOWER_ORDER[idx]) this.beginPlacing(TOWER_ORDER[idx]);
      } else if (k === ' ') { e.preventDefault(); this.goPressed(); }
      else if (k === 'f') this.cycleSpeed();
      else if (k === 'p') this.setPaused(true);
      else if (k === 'm') this.toggleMute();
      else if (k === 'u' || k === 'e') this.upgradeSelected();
      else if (k === 't' || k === 'tab') { e.preventDefault(); this.cycleTargeting(1); }
      else if (k === 'delete' || k === 'backspace') this.sellSelected();
      else if (k === 'q') this.useAbility();
    });
  }

  // ------------------------------------------------------------- loop -----
  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    try { this.step(now); } catch (err) { console.error('[Blockade] frame error:', err); }
  }

  step(now) {
    const realDt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (this.game && !this.paused && this.mode !== 'loading') {
      const speed = this.mode === 'menu' ? 1 : this.speed;
      this.acc += realDt * speed;
      let steps = 0;
      while (this.acc >= STEP && steps < 12) {
        this.game.update(STEP);
        this.acc -= STEP;
        steps++;
      }
      if (steps >= 12) this.acc = 0;
      this.view.update(realDt * speed);
      if (this.mode === 'game') this.ui.update();
    }
    if (this.mode !== 'loading') this.view.render(this.paused ? 0 : realDt);
  }
}

window.app = new App();
