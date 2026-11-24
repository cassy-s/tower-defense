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
const RUN_KEY = 'blockade.run.v1';   // the game in progress (autosaved between waves)
const STEP = 1 / 60;
const MAX_FRAME = 0.25;              // longest real frame we try to catch up on (seconds)
const SELL_CONFIRM_MS = 1800;
const RESUME_AUTO_DELAY = 5;         // seconds before AUTO sends the first wave after CONTINUE

class App {
  constructor() {
    this.save = this.load();
    this.settings = this.save.settings;
    this.canvas = document.getElementById('scene');
    this.view = new View(this.canvas, document.getElementById('fx-layer'));
    // Only the real game makes noise: the title screen's background battle is silent.
    this.view.onSound = (n) => { if (this.mode === 'game') audio.play(n); };
    this.portraits = new Portraits();
    this.ui = new UI(this);
    this.speed = 1;
    this.paused = false;
    this.placing = null;
    this.game = null;
    this.mode = 'loading';
    this.mapThumbs = {};
    this.frameErrors = 0;
    this.seenErrors = new Set();
    audio.setVolume(this.settings.volume);
    audio.setMuted(this.settings.muted);
    this.ui.setMuteIcon(this.settings.muted);
    this.applyQuality();
    this.bindInput();
    window.addEventListener('resize', () => { this.view.resize(); this.updateInsets(); });
    window.addEventListener('beforeunload', () => this.saveRun());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.saveRun(); });
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

  /** The saved run, if there is one worth resuming. */
  savedRun() {
    try { const r = JSON.parse(localStorage.getItem(RUN_KEY)); return r && r.mapId ? r : null; } catch { return null; }
  }
  /** Autosave: only between waves, when the game can be restored exactly. */
  saveRun() {
    const g = this.game;
    if (this.mode !== 'game' || !g || !g.canSave) return false;
    try { localStorage.setItem(RUN_KEY, JSON.stringify(g.serialize())); } catch { return false; }
    this.runDirty = false;
    return true;
  }
  clearRun() { try { localStorage.removeItem(RUN_KEY); } catch { /* ignore */ } }

  // --------------------------------------------------------------- boot ---
  async boot() {
    const problems = validateContent();
    if (problems.length) console.warn(`[Blockade] ${problems.length} content problem(s):\n` + problems.join('\n'));
    const tick = () => new Promise((r) => setTimeout(r, 0));
    // Every portrait is drawn here, behind the loading bar, including the
    // upgraded ones: each takes 10-15 ms, which would drop frames mid-game.
    const upgraded = TOWER_ORDER.flatMap((id) => (TOWERS[id].upgrades || []).map((_, i) => [id, i + 1]));
    const jobs = [
      ...TOWER_ORDER.map((id) => [() => this.portraits.tower(id), 'Training soldiers…']),
      ...Object.keys(ENEMIES).map((id) => [() => this.portraits.zombie(id), 'Waking the dead…']),
      ...MAP_ORDER.map((id) => [() => this.mapThumb(id), 'Laying the roads…']),
      ...upgraded.map(([id, l]) => [() => this.portraits.tower(id, l), 'Handing out medals…']),
    ];
    for (let i = 0; i < jobs.length; i++) {
      jobs[i][0]();
      this.ui.setLoading((i + 1) / jobs.length, jobs[i][1]);
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
    this.ui.showContinue(this.savedRun());
  }

  // ------------------------------------------------------------- game -----
  /** Start a new game, or resume `saved` (a serialized run). */
  startGame(mapId, difficulty, saved = null) {
    audio.init();
    const seed = Date.now() & 0xffff;
    const g = saved ? Game.fromSave(saved, { seed }) : new Game({ mapId, difficulty, seed });
    if (!g) { this.clearRun(); this.ui.showContinue(null); return; }
    this.mode = 'game';
    this.speed = 1;
    this.paused = false;
    this.cancelPlacing();
    this.selectedTower = null;
    this.lastStart = { mapId: g.mapId, difficulty: g.difficultyId };
    this.game = g;
    this.acc = 0;
    this.view.setGame(g);
    this.view.zoom = 1; this.view.pan.set(0, 0);
    this.ui.showScreen('game');
    this.ui.bindGame(g);
    this.updateInsets();
    this.bindGameSounds(g);
    g.on('gameOver', ({ won }) => this.onGameOver(won));
    const dirty = () => { this.runDirty = true; };
    for (const ev of ['waveEnd', 'towerPlaced', 'towerUpgraded', 'towerSold']) g.on(ev, dirty);
    if (saved) {
      this.firstPlace = false;
      if (g.autoStart) {
        // AUTO stays on: give the player a moment to look around, then carry on.
        g.autoTimer = RESUME_AUTO_DELAY;
        this.ui.hint(`Resumed on wave <b>${g.wave}</b>. AUTO is on: the next wave starts in ${RESUME_AUTO_DELAY} seconds (<kbd>Space</kbd> sends it now).`);
      } else {
        this.ui.hint(`Resumed on wave <b>${g.wave}</b>. Press <b>START</b> (or <kbd>Space</kbd>) to send the next wave.`);
      }
    } else {
      this.ui.hint('Pick a tower on the right, then click open ground to deploy it. Press <b>START</b> when ready.');
      this.firstPlace = true;
    }
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
    this.clearRun();
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
    this.saveRun();
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
    if (this.mouse && this.mouseOnCanvas) this.updateGhost(this.mouse.x, this.mouse.y);
  }
  cancelPlacing() {
    this.placing = null;
    this.canvas.classList.remove('placing');
    this.view.hideGhost();
  }
  flashHint(html, ms = 1600) { this.ui.flash(html, ms); }

  select(t) {
    this.selectedTower = t;
    this.sellArmed = null;
    this.view.select(t);
    if (t) this.ui.openInspector(t, this.view.screenX(t) < (window.innerWidth - this.view.insetRight) / 2 ? 'right' : 'left');
    else this.ui.closeInspector();
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
  /** Delete key: the first press asks, a second press within a moment sells. */
  sellHotkey() {
    const t = this.selectedTower;
    if (!t) return;
    if (this.sellArmed === t && performance.now() < this.sellArmedUntil) { this.sellSelected(); this.ui.endFlash(); return; }
    this.sellArmed = t;
    this.sellArmedUntil = performance.now() + SELL_CONFIRM_MS;
    this.sound('click');
    this.flashHint(`Press <kbd>Del</kbd> again to sell ${t.def.name} for <b>$${t.sellValue.toLocaleString('en-US')}</b>${t.refundable ? ' (full refund)' : ''}`, SELL_CONFIRM_MS);
  }
  useAbility() { const t = this.selectedTower; if (t && !t.useAbility()) this.sound('error'); }
  cycleTargeting(dir) {
    const t = this.selectedTower;
    if (!t || t.stats.attack === 'none') return;
    const i = TARGETING.indexOf(t.targeting);
    t.targeting = TARGETING[(i + dir + TARGETING.length) % TARGETING.length];
    this.runDirty = true;
    this.sound('click');
  }

  updateGhost(cx, cy) {
    const p = this.view.pick(cx, cy);
    if (!p) return;
    const res = this.game.canPlace(this.placing, p.x, p.z);
    const buff = this.game.previewBuff(this.placing, p.x, p.z);
    this.view.showGhost(this.placing, p.x, p.z, res.ok, buff.rangeMult);
    this.ghostReason = res.ok ? null : res.reason;
  }

  /** Escape: close whatever is on top, one thing per press. */
  escapePressed() {
    if (this.ui.confirmOpen) { this.ui.confirmDone(false); return; }
    const pauseOpen = !document.getElementById('modal-pause').classList.contains('hidden');
    if (this.mode !== 'game') {
      if (pauseOpen) { this.ui.closeSettings(); return; }
      const screen = document.body.dataset.screen;
      if (screen === 'maps' || screen === 'codex') { this.sound('click'); this.ui.showScreen('title'); }
      return;
    }
    if (pauseOpen) { this.setPaused(false); return; }
    if (!document.getElementById('modal-end').classList.contains('hidden')) return;
    if (this.placing) this.cancelPlacing();
    else if (this.selectedTower) this.select(null);
    else this.setPaused(true);
  }

  bindInput() {
    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointermove', (e) => {
      this.mouse = { x: e.clientX, y: e.clientY };
      this.mouseOnCanvas = true;
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
    // The ghost only belongs on the map: hide it while the cursor is over the shop or a panel.
    c.addEventListener('pointerleave', () => {
      this.mouseOnCanvas = false;
      if (this.placing) this.view.hideGhost();
    });
    c.addEventListener('pointerdown', (e) => {
      if (this.mode !== 'game') return;
      audio.init();
      // Clicking the map takes focus away from any button or checkbox, so hotkeys go to the game.
      if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
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
        else this.updateGhost(e.clientX, e.clientY);
        return;
      }
      const t = this.view.towerAt(p.x, p.z);
      this.select(t || null);
      if (t) this.sound('click');
    });
    window.addEventListener('pointerup', () => { this.drag = null; });
    c.addEventListener('wheel', (e) => { if (this.mode === 'game') { e.preventDefault(); this.view.zoomBy(e.deltaY, e.clientX, e.clientY); } }, { passive: false });

    // How did the focused control get focus: Tab (keyboard) or a click/tap?
    window.addEventListener('pointerdown', () => { this.focusFromKeyboard = false; }, true);
    window.addEventListener('keydown', (e) => { if (e.key === 'Tab') this.focusFromKeyboard = true; }, true);

    window.addEventListener('keydown', (e) => {
      // Only text fields keep their keys. Checkboxes, sliders and dropdowns
      // must not swallow the game's hotkeys (or Escape).
      const el = e.target;
      const typing = (el.tagName === 'INPUT' && !['checkbox', 'radio', 'range', 'button', 'submit'].includes(el.type)) || el.tagName === 'TEXTAREA' || el.isContentEditable;
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'escape') { e.preventDefault(); this.escapePressed(); return; }

      if (this.ui.confirmOpen) return; // the dialog's own buttons handle Enter/Space
      if (this.mode === 'menu') {
        // Enter deploys from the map screen (unless a button has focus: then Enter presses that button).
        const onButton = el.tagName === 'BUTTON';
        if (k === 'enter' && !onButton && document.body.dataset.screen === 'maps') { e.preventDefault(); this.ui.deploy(); }
        return;
      }
      if (this.mode !== 'game') return;
      if (!document.getElementById('modal-end').classList.contains('hidden')) return;
      if (this.paused) return;
      // A control reached with the keyboard (Tab) keeps Space/Enter, so it can be
      // pressed. One that only has focus because it was clicked does not.
      // (:focus-visible can't tell: Chrome turns it on for a clicked button as soon as a key is pressed.)
      const control = el.tagName === 'BUTTON' || (el.tagName === 'INPUT' && el.type === 'checkbox');
      if (control && (k === ' ' || k === 'enter') && this.focusFromKeyboard) return;
      // Otherwise Space and the hotkeys belong to the game, not to whatever control
      // was clicked last (Space would otherwise also toggle AUTO or press a button).
      if (k === ' ' || el.tagName === 'SELECT' || (el.tagName === 'INPUT' && el.type === 'range')) el.blur?.();
      if (/^[0-9]$/.test(k)) {
        const idx = k === '0' ? 9 : +k - 1;
        if (TOWER_ORDER[idx]) this.beginPlacing(TOWER_ORDER[idx]);
      } else if (k === ' ') { e.preventDefault(); if (!e.repeat) this.goPressed(); }
      else if (k === 'f') this.cycleSpeed();
      else if (k === 'p') this.setPaused(true);
      else if (k === 'm') this.toggleMute();
      else if (k === 'u' || k === 'e') this.upgradeSelected();
      else if (k === 't') this.cycleTargeting(e.shiftKey ? -1 : 1);
      else if (k === 'delete') { if (!e.repeat) this.sellHotkey(); }
      else if (k === 'q') this.useAbility();
    });
  }

  // ------------------------------------------------------------- loop -----
  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    try {
      this.step(now);
      this.frameErrors = 0;
    } catch (err) {
      // Log each distinct error once (not 60 times a second), and tell the
      // player if the game is stuck instead of leaving a frozen screen.
      const key = String(err?.stack || err);
      if (!this.seenErrors.has(key)) { this.seenErrors.add(key); console.error('[Blockade] frame error:', err); }
      if (++this.frameErrors === 30) this.ui.showError(err);
    }
  }

  step(now) {
    const realDt = Math.min(MAX_FRAME, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    if (this.game && !this.paused && this.mode !== 'loading') {
      const speed = this.mode === 'menu' ? 1 : this.speed;
      this.acc += realDt * speed;
      // Enough steps to keep 3x speed honest even at ~4 fps, but never an
      // unbounded backlog (that would make a slow PC slower still).
      const maxSteps = Math.ceil((MAX_FRAME * 3) / STEP);
      let steps = 0;
      while (this.acc >= STEP && steps < maxSteps) {
        this.game.update(STEP);
        this.acc -= STEP;
        steps++;
      }
      if (this.acc >= STEP) this.acc = STEP * 0.999;
      if (this.runDirty) this.saveRun();
      // Draw moving things between the last two simulation steps.
      const alpha = this.game.state === 'playing' ? Math.min(1, this.acc / STEP) : 1;
      this.view.update(realDt * speed, alpha);
      if (this.mode === 'game') this.ui.update();
    }
    if (this.mode !== 'loading') this.view.render(this.paused ? 0 : realDt);
  }
}

// The loader in index.html may have reloaded a stale cached page as ?b=<build>; tidy the address bar.
if (/[?&]b=/.test(location.search)) history.replaceState(null, '', location.pathname + location.hash);

window.app = new App();
