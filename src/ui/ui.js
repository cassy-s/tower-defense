// All DOM UI: menus, HUD, shop, inspector, wave preview, toasts, modals.
import { TOWERS, TOWER_ORDER } from '../config/towers.js';
import { ENEMIES, MODIFIERS } from '../config/enemies.js';
import { MAPS, MAP_ORDER } from '../config/maps.js';
import { DIFFICULTIES, DIFFICULTY_ORDER, getWave, isBossWave } from '../config/waves.js';
import { computeStats, ABILITIES, TARGETING, TARGETING_LABEL } from '../game/tower.js';
import { sentryRing } from '../game/sentry.js';
import { ICONS, icon, hydrateIcons } from './icons.js';

const $ = (sel) => document.querySelector(sel);
const fmt = (n) => Math.floor(n).toLocaleString('en-US');
const ROLE_COLOR = { Damage: 'orange', Splash: 'red', Support: 'blue', Economy: 'green' };

export class UI {
  constructor(app) {
    this.app = app;
    this.selectedMap = 'maple';
    this.selectedDiff = 'easy';
    this.cache = {};
    this.toasts = [];
    hydrateIcons();
    this.bindStatic();
  }

  // ------------------------------------------------------------ screens ---
  showScreen(id) {
    for (const s of document.querySelectorAll('.screen')) s.classList.toggle('active', s.id === `screen-${id}`);
    $('#hud').classList.toggle('hidden', id !== 'game');
    document.body.dataset.screen = id;
    if (id === 'maps') this.renderMaps();
    if (id === 'codex') this.renderCodex(this.codexTab || 'zombies');
  }

  setLoading(pct, text) {
    $('#load-fill').style.width = `${Math.round(pct * 100)}%`;
    if (text) $('#load-text').textContent = text;
  }

  bindStatic() {
    const click = (sel, fn) => $(sel).addEventListener('click', (e) => { this.app.sound('click'); fn(e); });
    click('#btn-play', () => this.showScreen('maps'));
    click('#btn-codex', () => this.showScreen('codex'));
    click('#btn-settings-title', () => this.openSettings(true));
    for (const b of document.querySelectorAll('[data-back]')) b.addEventListener('click', () => { this.app.sound('click'); this.showScreen(b.dataset.back); });
    $('#btn-start').addEventListener('click', () => this.deploy());
    click('#btn-continue', () => { if (this.run) this.app.startGame(null, null, this.run); });
    $('#btn-error-reload').addEventListener('click', () => location.reload());
    click('#btn-confirm-ok', () => this.confirmDone?.(true));
    click('#btn-confirm-cancel', () => this.confirmDone?.(false));
    for (const t of document.querySelectorAll('.tab')) t.addEventListener('click', () => { this.app.sound('click'); this.renderCodex(t.dataset.tab); });

    click('#btn-pause', () => this.app.setPaused(true));
    click('#btn-resume', () => this.app.setPaused(false));
    click('#btn-restart', () => this.app.restart());
    click('#btn-quit', () => this.app.quitToMenu());
    click('#btn-settings-done', () => this.closeSettings());
    click('#btn-end-retry', () => this.app.restart());
    click('#btn-end-menu', () => this.app.quitToMenu());
    click('#btn-mute', () => this.app.toggleMute());
    click('#btn-go', () => this.app.goPressed());
    click('#btn-speed', () => this.app.cycleSpeed());
    // Give the keyboard back to the game once a control has done its job, so
    // Space starts the wave (instead of toggling AUTO) and Escape works.
    $('#chk-auto').addEventListener('change', (e) => { this.app.setAuto(e.target.checked); e.target.blur(); });

    const vol = $('#set-volume');
    vol.value = this.app.settings.volume;
    vol.addEventListener('input', () => this.app.setVolume(+vol.value));
    vol.addEventListener('change', () => vol.blur());
    const q = $('#set-quality');
    q.value = this.app.settings.quality;
    q.addEventListener('change', () => { this.app.setQuality(q.value); q.blur(); });
  }

  openSettings(fromTitle) {
    $('#pause-title').textContent = fromTitle ? 'SETTINGS' : 'PAUSED';
    $('#pause-buttons').classList.toggle('hidden', fromTitle);
    $('#settings-buttons').classList.toggle('hidden', !fromTitle);
    $('#modal-pause').classList.remove('hidden');
  }
  closeSettings() { $('#modal-pause').classList.add('hidden'); }
  setMuteIcon(m) { $('#btn-mute .ico').innerHTML = m ? ICONS.mute : ICONS.sound; }

  // --------------------------------------------------------------- maps ---
  renderMaps() {
    const list = $('#map-list');
    list.innerHTML = '';
    for (const id of MAP_ORDER) {
      const m = MAPS[id];
      const best = this.app.save.best[id] || {};
      const card = document.createElement('button');
      card.className = 'map-card' + (id === this.selectedMap ? ' selected' : '');
      card.innerHTML = `
        <div class="map-thumb"><img alt="" src="${this.app.mapThumb(id)}"><span class="map-tag tag-${m.theme}">${m.difficultyLabel}</span></div>
        <div class="map-info">
          <div class="map-name">${m.name}</div>
          <div class="map-blurb">${m.blurb}</div>
          <div class="medals">${DIFFICULTY_ORDER.map((d) => {
            const r = best[d];
            const won = r === 'win';
            return `<span class="medal ${won ? 'won' : r ? 'tried' : ''}" style="--c:${DIFFICULTIES[d].color}" title="${DIFFICULTIES[d].name}: ${won ? 'Beaten!' : r ? `Best wave ${r}` : 'Not played'}">${won ? icon('star') : r ? r : '–'}</span>`;
          }).join('')}</div>
        </div>`;
      card.addEventListener('click', () => { this.app.sound('click'); this.selectedMap = id; this.renderMaps(); });
      list.appendChild(card);
    }
    const dl = $('#diff-list');
    dl.innerHTML = '';
    for (const d of DIFFICULTY_ORDER) {
      const D = DIFFICULTIES[d];
      const b = document.createElement('button');
      b.className = 'diff-btn' + (d === this.selectedDiff ? ' selected' : '');
      b.style.setProperty('--c', D.color);
      b.innerHTML = `<b>${D.name.toUpperCase()}</b><small>${D.waves} waves</small>`;
      b.addEventListener('click', () => { this.app.sound('click'); this.selectedDiff = d; this.renderMaps(); });
      dl.appendChild(b);
    }
    const D = DIFFICULTIES[this.selectedDiff];
    $('#diff-desc').innerHTML = `
      <div>${icon('heart')} <b>${D.lives}</b> lives</div>
      <div>${icon('coin')} <b>$${D.startCash}</b> to start</div>
      <div>${icon('skull')} Zombies <b>${Math.round(D.hpMult * 100)}%</b> health</div>
      <div>${icon('star')} Final boss on wave <b>${D.waves}</b></div>`;
  }

  // ---------------------------------------------------------- field guide -
  renderCodex(tab) {
    this.codexTab = tab;
    for (const t of document.querySelectorAll('.tab')) t.classList.toggle('active', t.dataset.tab === tab);
    const grid = $('#codex-grid');
    grid.innerHTML = '';
    if (tab === 'zombies') {
      for (const [id, e] of Object.entries(ENEMIES)) {
        const traits = enemyTraits(e);
        const c = document.createElement('div');
        c.className = 'codex-card panel' + (e.boss ? ' boss' : '');
        c.innerHTML = `<div class="codex-img"><img alt="" src="${this.app.portraits.zombie(id)}"></div>
          <div class="codex-body"><div class="codex-name">${e.name}</div><div class="codex-blurb">${e.blurb}</div>
          <div class="codex-stats"><span>${icon('heart')} ${e.hp}</span><span>${icon('fast')} ${e.speed}</span>${e.armor ? `<span>${icon('shield')} ${Math.round(e.armor * 100)}%</span>` : ''}</div>
          <div class="chips">${traits}</div></div>`;
        grid.appendChild(c);
      }
    } else {
      for (const id of TOWER_ORDER) {
        const t = TOWERS[id];
        const c = document.createElement('div');
        c.className = `codex-card panel role-${ROLE_COLOR[t.role] || 'orange'}`;
        c.innerHTML = `<div class="codex-img"><img alt="" src="${this.app.portraits.tower(id, t.upgrades.length)}"></div>
          <div class="codex-body"><div class="codex-name">${t.name} <small>$${t.cost}</small></div><div class="codex-blurb">${t.description}</div>
          <ol class="codex-upgrades">${t.upgrades.map((u) => `<li><b>${u.name}</b> <span>$${fmt(u.cost)}</span><br><small>${u.desc}</small></li>`).join('')}</ol></div>`;
        grid.appendChild(c);
      }
    }
  }

  // -------------------------------------------------------------- game ----
  bindGame(game) {
    this.game = game;
    this.cache = {};
    this.bossGroup = null;
    $('#hud-wave-max').textContent = `/ ${game.maxWaves}`;
    $('#chk-auto').checked = game.autoStart;
    this.closeInspector();
    $('#toast-stack').innerHTML = '';
    $('#modal-end').classList.add('hidden');
    $('#modal-pause').classList.add('hidden');
    this.buildShop();
    this.renderNextWave();
    this.hint(null);
    this.endFlash(); // no leftover message from the last game
    game.on('newEnemy', ({ type }) => {
      const e = ENEMIES[type];
      if (type === 'shambler') return;
      this.toast(`<img src="${this.app.portraits.zombie(type)}" alt=""><div><small>${e.boss ? 'BOSS INCOMING' : 'NEW ZOMBIE'}</small><b>${e.name}</b><span>${e.blurb}</span></div>`, e.boss ? 'boss' : 'intro', 6500);
    });
    game.on('waveStart', ({ wave }) => {
      this.hint(null);
      this.renderNextWave();
      if (isBossWave(wave)) this.banner(`BOSS WAVE ${wave}`, 'boss');
      else this.banner(`WAVE ${wave}`);
    });
    game.on('waveEnd', ({ wave, bonus, income }) => {
      this.toast(`<div class="mini">${icon('coin')}<b>Wave ${wave} cleared</b><span>+$${bonus}${income ? ` &nbsp;·&nbsp; +$${income} supplies` : ''}</span></div>`, 'cash', 2600);
      this.renderNextWave();
    });
    game.on('towerSold', ({ tower }) => { if (this.inspected === tower) this.closeInspector(); });
    game.on('towerUpgraded', ({ tower }) => { if (this.inspected === tower) this.renderInspector(true); });
  }

  buildShop() {
    const grid = $('#shop-grid');
    grid.innerHTML = '';
    this.shopCards = [];
    TOWER_ORDER.forEach((id, i) => {
      const t = TOWERS[id];
      const card = document.createElement('button');
      card.className = `shop-card role-${ROLE_COLOR[t.role] || 'orange'}`;
      card.dataset.type = id;
      card.innerHTML = `${i < 10 ? `<span class="hotkey">${(i + 1) % 10}</span>` : ''}<img alt="" src="${this.app.portraits.tower(id)}"><span class="shop-name">${t.name}</span><span class="price">$${fmt(t.cost)}</span>`;
      card.addEventListener('click', () => { this.app.sound('click'); this.app.beginPlacing(id); });
      card.addEventListener('mouseenter', () => this.showTowerTip(id, card));
      card.addEventListener('mouseleave', () => this.hideTip());
      grid.appendChild(card);
      this.shopCards.push({ id, card, cost: t.cost });
    });
  }

  showTowerTip(id, anchor) {
    const t = TOWERS[id];
    const s = computeStats(id, 0).stats;
    const tip = $('#tooltip');
    tip.innerHTML = `<div class="tip-head"><b>${t.name}</b><span class="tip-price">$${fmt(t.cost)}</span><span class="role role-${ROLE_COLOR[t.role]}">${t.role}</span></div>
      <p>${t.description}</p>
      <div class="tip-stats">${statLine(s)}</div>
      ${s.attack !== 'none' || s.aura ? rangeMap(s.range) : ''}
      ${t.limit ? `<div class="tip-limit">Limit: ${t.limit} per game</div>` : ''}`;
    tip.classList.remove('hidden');
    const r = anchor.getBoundingClientRect();
    const tr = tip.getBoundingClientRect();
    tip.style.left = `${Math.max(8, r.left - tr.width - 12)}px`;
    tip.style.top = `${Math.min(window.innerHeight - tr.height - 8, Math.max(8, r.top))}px`;
  }
  hideTip() { $('#tooltip').classList.add('hidden'); }

  renderNextWave() {
    const g = this.game;
    const el = $('#next-wave');
    const w = g.wave + 1;
    if (w > g.maxWaves) { el.innerHTML = `<div class="nw-title">FINAL WAVE</div><div class="nw-empty">Survive!</div>`; return; }
    const groups = getWave(w);
    const agg = new Map();
    for (const grp of groups) {
      const key = grp.type + (grp.mods || []).join(',');
      const a = agg.get(key) || { type: grp.type, mods: grp.mods || [], count: 0 };
      a.count += grp.count; agg.set(key, a);
    }
    el.innerHTML = `<div class="nw-title">${isBossWave(w) ? '<span class="boss-tag">BOSS</span> ' : ''}NEXT · WAVE ${w}</div>
      <div class="nw-list">${[...agg.values()].map((a) => `
        <div class="nw-item ${ENEMIES[a.type].boss ? 'boss' : ''}" title="${ENEMIES[a.type].name}${a.mods.length ? ' (' + a.mods.map((m) => MODIFIERS[m].name).join(', ') + ')' : ''}">
          <img alt="" src="${this.app.portraits.zombie(a.type)}"><b>${a.count}</b>
          ${a.mods.map((m) => `<i class="mod" style="background:${MODIFIERS[m].color}">${MODIFIERS[m].name[0]}</i>`).join('')}
        </div>`).join('')}</div>`;
  }

  // ---------------------------------------------------------- inspector ---
  // The panel is built once per tower and level. After that, update() only
  // changes text, classes and widths, so buttons are never replaced under the
  // cursor (a click needs press and release on the same element). UPGRADE and
  // SELL sit right under the header, so they stay in the same place as the
  // rest of the panel changes.
  openInspector(t, side = 'left') {
    this.inspected = t;
    const el = $('#inspector');
    el.classList.remove('hidden');
    el.classList.toggle('right', side === 'right');
    this.renderInspector(true);
  }
  closeInspector() { this.inspected = null; this.insp = null; $('#inspector').classList.add('hidden'); }

  renderInspector(full = false) {
    const t = this.inspected;
    if (!t) return;
    const key = `${t.id}|${t.level}`;
    if (full || !this.insp || this.insp.key !== key) this.buildInspector(t, key);
    this.refreshInspector(t);
  }

  buildInspector(t, key) {
    const el = $('#inspector');
    const s = t.stats;
    const next = t.nextUpgrade;
    const ability = s.ability ? ABILITIES[s.ability] : null;
    const diff = next ? statDiff(computeStats(t.type, t.level).stats, computeStats(t.type, t.level + 1).stats) : '';
    el.innerHTML = `
      <div class="insp-head role-${ROLE_COLOR[t.def.role]}">
        <img alt="" src="${this.app.portraits.tower(t.type, t.level)}">
        <div class="insp-title"><b>${t.def.name}</b>
          <div class="pips">${t.def.upgrades.map((u, i) => `<i class="${i < t.level ? 'on' : ''}" title="${u.name}"></i>`).join('')}</div>
          <small>${t.level ? t.def.upgrades[t.level - 1].name : 'Level 0'}</small>
        </div>
        <button class="icon-btn small" data-r="close" title="Close (Esc)" aria-label="Close">${ICONS.close}</button>
        <div class="insp-stun hidden" data-r="stun">STUNNED!</div>
      </div>
      <div class="insp-actions">
        ${next
          ? `<button class="btn up-btn" data-r="up" title="Upgrade (U)"><span class="lbl">${icon('up')} UPGRADE</span><span class="cost">$${fmt(next.cost)}</span></button>`
          : `<div class="maxed-pill">${icon('star')} MAX LEVEL</div>`}
        <button class="btn btn-red sell-btn" data-r="sell" title="Sell (Del, press twice)"><span class="lbl">SELL</span><span class="cost" data-r="sellv"></span></button>
      </div>
      ${next ? `
        <div class="upgrade-card" data-r="card">
          <div class="up-top"><small>NEXT UPGRADE · ${t.level + 1}/${t.maxLevel}</small><b>${next.name}</b></div>
          <p>${next.desc}</p>
          ${diff ? `<div class="up-diff">${diff}</div>` : ''}
        </div>` : ''}
      ${ability ? `<button class="btn btn-gold ability-btn" data-r="ability" title="${ability.desc}">${icon('star')} ${ability.name.toUpperCase()} <small data-r="abstate"></small><kbd>Q</kbd></button>` : ''}
      ${s.attack !== 'none' ? `<div class="insp-target"><span>TARGET <kbd>T</kbd></span><button class="tbtn" data-r="tprev" aria-label="Previous targeting">‹</button><b data-r="target"></b><button class="tbtn" data-r="tnext" aria-label="Next targeting">›</button></div>` : ''}
      <div class="insp-stats" data-r="stats"></div>
      ${s.scrapMax ? `<div class="scrap" title="Every hit fills the meter; when it is full she builds a sentry. Sentries keep the level they were built at: upgrades improve the ones built afterwards."><i data-r="scrapbar"></i><span data-r="scraptext"></span></div><div class="chips" data-r="builder"></div>` : ''}
      <div class="insp-record"><span>${icon('skull')} <b data-r="kills"></b> kills</span><span>${icon('sword')} <b data-r="dmg"></b> dmg</span></div>`;
    const r = {};
    for (const n of el.querySelectorAll('[data-r]')) r[n.dataset.r] = n;
    r.close.onclick = () => this.app.select(null);
    if (r.up) r.up.onclick = () => this.app.upgradeSelected();
    r.sell.onclick = () => this.app.sellSelected();
    if (r.ability) r.ability.onclick = () => this.app.useAbility();
    if (r.tprev) r.tprev.onclick = () => this.app.cycleTargeting(-1);
    if (r.tnext) r.tnext.onclick = () => this.app.cycleTargeting(1);
    this.insp = { key, r, cache: {} };
  }

  /** Cheap per-frame update: only touches what changed. */
  refreshInspector(t) {
    const { r, cache } = this.insp;
    const s = t.stats;
    const text = (k, v) => { if (cache[k] !== v) { cache[k] = v; r[k].textContent = v; } };
    const html = (k, v) => { if (cache[k] !== v) { cache[k] = v; r[k].innerHTML = v; } };
    const next = t.nextUpgrade;
    if (r.up) {
      const afford = this.game.cash >= next.cost;
      if (cache.afford !== afford) {
        cache.afford = afford;
        r.up.classList.toggle('btn-green', afford); r.up.classList.toggle('btn-disabled', !afford);
        r.card.classList.toggle('poor', !afford);
      }
    }
    text('sellv', `$${fmt(t.sellValue)}${t.refundable ? ' · FULL' : ''}`);
    const stunned = t.stunTimer > 0;
    if (cache.stun !== stunned) { cache.stun = stunned; r.stun.classList.toggle('hidden', !stunned); }
    if (r.ability) {
      const wait = Math.ceil(t.abilityTimer);
      const off = t.abilityTimer > 0 || stunned;
      if (cache.abOff !== off) { cache.abOff = off; r.ability.disabled = off; }
      text('abstate', stunned ? 'STUNNED' : t.abilityTimer > 0 ? `${wait}s` : 'READY');
    }
    if (r.target) text('target', TARGETING_LABEL[t.targeting]);
    html('stats', statGrid(t));
    if (r.scrapbar) {
      const pct = Math.min(100, (t.scrap / s.scrapMax) * 100);
      const w = `${pct.toFixed(1)}%`;
      if (cache.scrapW !== w) { cache.scrapW = w; r.scrapbar.style.width = w; }
      text('scraptext', `SCRAP ${Math.floor(t.scrap)}/${s.scrapMax}`);
      html('builder', builderChips(t));
    }
    text('kills', fmt(t.kills));
    text('dmg', fmt(t.damageDealt));
  }

  // ----------------------------------------------------------- continue ---
  showContinue(run) {
    const b = $('#btn-continue');
    if (!run || !MAPS[run.mapId] || !DIFFICULTIES[run.difficulty]) { b.classList.add('hidden'); this.run = null; return; }
    this.run = run;
    b.innerHTML = `CONTINUE <small>${MAPS[run.mapId].name} · ${DIFFICULTIES[run.difficulty].name} · wave ${run.wave}</small>`;
    b.classList.remove('hidden');
  }

  /** Start a new game. A saved run would be replaced by it, so ask first. */
  async deploy() {
    this.app.sound('click');
    const run = this.app.savedRun();
    if (run && MAPS[run.mapId] && DIFFICULTIES[run.difficulty]) {
      const ok = await this.confirm(
        `You have a saved run on <b>${MAPS[run.mapId].name}</b> (${DIFFICULTIES[run.difficulty].name}, wave ${run.wave}). A new game replaces it.`,
        'START NEW GAME',
      );
      if (!ok) return;
    }
    this.app.startGame(this.selectedMap, this.selectedDiff);
  }

  /** Yes/no dialog. Resolves true for OK, false for Cancel or Escape. */
  confirm(html, okLabel = 'OK') {
    const m = $('#modal-confirm');
    $('#confirm-text').innerHTML = html;
    $('#btn-confirm-ok').textContent = okLabel;
    m.classList.remove('hidden');
    $('#btn-confirm-cancel').focus();
    return new Promise((resolve) => { this.confirmDone = (v) => { m.classList.add('hidden'); this.confirmDone = null; resolve(v); }; });
  }
  get confirmOpen() { return !!this.confirmDone; }

  showError(err) {
    $('#error-text').textContent = String(err?.message || err);
    $('#modal-error').classList.remove('hidden');
  }

  // ------------------------------------------------------------- frame ----
  update() {
    const g = this.game;
    if (!g) return;
    const c = this.cache;
    const set = (k, sel, v) => { if (c[k] !== v) { c[k] = v; $(sel).textContent = v; } };
    set('lives', '#hud-lives', String(g.lives));
    set('cash', '#hud-cash', `$${fmt(g.cash)}`);
    set('wave', '#hud-wave', String(g.wave));
    const lowLives = g.lives <= g.maxLives * 0.25;
    if (c.low !== lowLives) { c.low = lowLives; $('.stat-pill.lives').classList.toggle('danger', lowLives); }

    for (const s of this.shopCards || []) {
      const def = TOWERS[s.id];
      const limited = !!def.limit && g.countOf(s.id) >= def.limit;
      const state = limited ? 'limit' : g.cash >= s.cost ? 'ok' : 'poor';
      if (s.state !== state) { s.state = state; s.card.classList.toggle('poor', state !== 'ok'); s.card.classList.toggle('limit', limited); }
      const sel = this.app.placing === s.id;
      if (s.sel !== sel) { s.sel = sel; s.card.classList.toggle('selected', sel); }
    }

    // GO button state
    const inProg = g.waveInProgress;
    const goState = g.state !== 'playing' ? 'over' : g.wave >= g.maxWaves ? 'last' : inProg ? 'early' : 'start';
    if (c.go !== goState) {
      c.go = goState;
      const btn = $('#btn-go');
      btn.classList.toggle('early', goState === 'early');
      btn.disabled = goState === 'over' || goState === 'last';
      $('#go-label').innerHTML = goState === 'start' ? 'START' : goState === 'early' ? 'SEND<br>NEXT' : goState === 'last' ? 'LAST<br>WAVE' : '—';
      btn.querySelector('.go-icon').innerHTML = goState === 'early' ? ICONS.fast : ICONS.play;
      btn.classList.toggle('pulse', goState === 'start');
    }
    if (c.speed !== this.app.speed) {
      c.speed = this.app.speed;
      const b = $('#btn-speed');
      b.textContent = `${c.speed}x`;
      b.setAttribute('aria-label', `Game speed ${c.speed}x (F to change)`);
    }

    this.updateBossBar(g, set);

    if (this.inspected) this.renderInspector(false);
    this.updateToasts();
  }

  /**
   * One bar for every boss on the field. The group is remembered until all of
   * them are dead, so killing one of two bosses doesn't make the bar jump back
   * up: dead bosses still count, at zero health.
   */
  updateBossBar(g, set) {
    const c = this.cache;
    const group = (this.bossGroup ||= new Set());
    for (const e of g.enemies) if (e.boss && e.alive) group.add(e);
    const alive = [...group].filter((e) => e.alive);
    if (!alive.length) group.clear();
    const on = alive.length > 0;
    if (on !== c.boss) { c.boss = on; $('#boss-bar').classList.toggle('hidden', !on); }
    if (!on) return;
    let hp = 0, max = 0, sh = 0, shMax = 0;
    for (const e of group) { if (e.alive) { hp += e.hp; sh += e.shield; } max += e.maxHp; shMax += e.maxShield; }
    const names = [...new Set([...group].map((e) => e.def.name.toUpperCase()))];
    let name = names.length === 1 ? names[0] : names.join(' + ');
    if (group.size > names.length) name += ` ×${group.size}`;
    if (alive.length < group.size) name += ` (${alive.length} left)`;
    if (alive.some((e) => e.enraged)) name += ' — ENRAGED';
    set('bossName', '#boss-name', name);
    const fill = `${((hp / max) * 100).toFixed(1)}%`, shield = shMax ? `${((sh / shMax) * 100).toFixed(1)}%` : '0';
    if (c.bossFill !== fill) { c.bossFill = fill; $('#boss-fill').style.width = fill; }
    if (c.bossShield !== shield) { c.bossShield = shield; $('#boss-shield').style.width = shield; }
  }

  // ------------------------------------------------------------ toasts ----
  toast(html, kind = '', ms = 3000) {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.innerHTML = html;
    $('#toast-stack').appendChild(el);
    requestAnimationFrame(() => el.classList.add('in'));
    this.toasts.push({ el, until: performance.now() + ms });
    while (this.toasts.length > 3) this.dropToast(this.toasts[0]);
  }
  dropToast(t) {
    this.toasts.splice(this.toasts.indexOf(t), 1);
    t.el.classList.remove('in');
    setTimeout(() => t.el.remove(), 300);
  }
  updateToasts() {
    const now = performance.now();
    for (const t of this.toasts.slice()) if (now > t.until) this.dropToast(t);
  }

  banner(text, kind = '') {
    const el = document.createElement('div');
    el.className = `wave-banner ${kind}`;
    el.textContent = text;
    $('#hud').appendChild(el);
    setTimeout(() => el.remove(), 2200);
  }

  /** The standing hint (or null to clear it). A flash() shows on top of it and then gives it back. */
  hint(text) {
    this.baseHint = text || null;
    if (!this.flashing) this.showHint(this.baseHint);
  }
  /** A short message (an error, a confirmation prompt) that disappears after `ms`. */
  flash(text, ms = 1600) {
    clearTimeout(this.flashTimer);
    this.flashing = true;
    this.showHint(text);
    this.flashTimer = setTimeout(() => this.endFlash(), ms);
  }
  endFlash() {
    clearTimeout(this.flashTimer);
    this.flashing = false;
    this.showHint(this.baseHint);
  }
  showHint(text) {
    const h = $('#hint');
    if (!text) { h.classList.add('hidden'); return; }
    h.innerHTML = text;
    h.classList.remove('hidden');
  }

  showEnd(won, game) {
    const m = $('#modal-end');
    m.classList.remove('hidden');
    m.classList.toggle('won', won);
    $('#end-banner').textContent = won ? 'VICTORY!' : 'OVERRUN!';
    $('#end-sub').textContent = won
      ? `${MAPS[game.mapId].name} on ${game.difficulty.name} — the bunker held.`
      : `The horde broke through on wave ${game.wave} of ${game.maxWaves}.`;
    // Sold towers still count. No MVP if nothing killed anything.
    const all = [...game.towers, ...game.retired];
    const best = Math.max(0, ...all.map((t) => t.kills));
    const mvp = best > 0 ? all.find((t) => t.kills === best) : null;
    $('#end-stats').innerHTML = `
      <div><span>Waves</span><b>${game.wave} / ${game.maxWaves}</b></div>
      <div><span>Zombies killed</span><b>${fmt(game.stats.kills)}</b></div>
      <div><span>Cash earned</span><b>$${fmt(game.stats.earned)}</b></div>
      <div><span>Towers built</span><b>${game.stats.built}</b></div>
      ${mvp ? `<div class="mvp"><img src="${this.app.portraits.tower(mvp.type, mvp.level)}" alt=""><span>MVP</span><b>${mvp.def.name} · ${fmt(mvp.kills)} kills${game.towers.includes(mvp) ? '' : ' (sold)'}</b></div>` : ''}`;
  }
}

// ---------------------------------------------------------------- helpers ---
function enemyTraits(e) {
  const chips = [];
  if (e.boss) chips.push('<i class="chip red">Boss</i>');
  if (e.hidden) chips.push('<i class="chip purple">Hidden</i>');
  if (e.flying) chips.push('<i class="chip sky">Flying</i>');
  if (e.armor) chips.push(`<i class="chip grey">Armor ${Math.round(e.armor * 100)}%</i>`);
  if (e.shield) chips.push('<i class="chip blue">Shield</i>');
  if (e.immune?.includes('burn')) chips.push('<i class="chip orange">Fireproof</i>');
  for (const a of e.abilities || []) {
    const label = { spit: 'Stuns towers', haste: 'Speeds allies', heal: 'Heals allies', summon: 'Summons', slam: 'Ground slam', enrage: 'Enrages', deathSpawn: 'Splits on death' }[a.type];
    if (label) chips.push(`<i class="chip">${label}</i>`);
  }
  return chips.join('');
}

function statLine(s) {
  if (s.attack === 'none') return `<span class="ts">${icon('coin')}<em>Income</em><b>$${s.income}/wave</b></span>`;
  const dmg = `${s.damage}${s.pellets > 1 && s.attack === 'spread' ? '×' + s.pellets : ''}${s.burst > 1 ? '×' + s.burst : ''}`;
  return [[icon('target'), 'Damage', dmg], [icon('clock'), 'Rate', `${(1 / s.cooldown).toFixed(2)}/s`], [icon('range'), 'Range', s.range]]
    .map(([i, l, v]) => `<span class="ts">${i}<em>${l}</em><b>${v}</b></span>`).join('');
}

function traitChips(s, buff = {}) {
  const c = [];
  if (s.detectHidden || buff.grantHidden) c.push(`<i class="chip purple">${icon('eye')} Hidden</i>`);
  if (s.detectFlying) c.push(`<i class="chip sky">${icon('wing')} Flying</i>`);
  if (s.armorPierce) c.push(`<i class="chip grey">${icon('shield')} Pierce ${Math.round(s.armorPierce * 100)}%</i>`);
  if (s.splashRadius && s.attack === 'splash') c.push(`<i class="chip orange">Blast ${s.splashRadius}</i>`);
  if (s.cluster) c.push(`<i class="chip orange">Cluster ×${s.cluster}</i>`);
  if (s.attack === 'pierce') c.push(`<i class="chip">Pierce ${s.pierce}</i>`);
  if (s.attack === 'chain') c.push(`<i class="chip blue">${icon('bolt')} Chains ${s.chains}</i>`);
  if (s.burnDamage) c.push(`<i class="chip orange">${icon('fire')} Burn ${s.burnDamage}/s</i>`);
  if (s.slow) c.push(`<i class="chip sky">Slow ${Math.round(s.slow * 100)}%</i>`);
  if (s.bossMult > 1) c.push(`<i class="chip red">×${s.bossMult} vs Boss</i>`);
  if (s.aura) c.push(`<i class="chip gold">Aura: ${Math.round((1 - (s.aura.cooldownMult || 1)) * 100)}% faster${s.aura.rangeMult ? ', +' + Math.round((s.aura.rangeMult - 1) * 100) + '% range' : ''}${s.aura.grantHidden ? ', hidden sight' : ''}</i>`);
  if (buff.cooldownMult < 1) c.push(`<i class="chip gold">Buffed ${Math.round((1 - buff.cooldownMult) * 100)}%</i>`);
  return c.join('');
}

function statGrid(t) {
  const s = t.stats;
  if (s.attack === 'none') return `<div class="sg"><span>${icon('coin')} Income</span><b>$${s.income}/wave</b></div>${traitChips(s, t.buff) ? `<div class="chips">${traitChips(s, t.buff)}</div>` : ''}`;
  const dmg = `${s.damage}${s.attack === 'spread' ? ' ×' + s.pellets : ''}${s.burst > 1 ? ' ×' + s.burst : ''}`;
  const note = t.dpsNote;
  return `
    <div class="sg"><span>${icon('target')} Damage</span><b>${dmg}</b></div>
    <div class="sg"><span>${icon('clock')} Fire rate${s.attack === 'spinup' ? ' (max)' : ''}</span><b>${(1 / t.effectiveCooldown).toFixed(2)}/s</b></div>
    <div class="sg"><span>${icon('range')} Range</span><b>${+t.range.toFixed(1)}</b></div>
    <div class="sg"><span>${icon('sword')} DPS${note ? ` <small>(${note})</small>` : ''}</span><b>${t.dps.toFixed(1)}</b></div>
    <div class="chips">${traitChips(s, t.buff)}</div>`;
}

function builderChips(t) {
  const s = t.stats, u = s.unit || {};
  return `<i class="chip gold">Sentries ${t.sentryCount}/${s.maxUnits}</i><i class="chip">Sentry ${u.damage} dmg · ${(1 / u.cooldown).toFixed(1)}/s · ${u.lifespan}s</i>${u.hidden ? '<i class="chip purple">Sees hidden</i>' : ''}${u.shield ? '<i class="chip sky">Shielded</i>' : ''}${u.rocket ? `<i class="chip red">Rockets ${u.rocket.damage}×${u.rocket.count}</i>` : ''}`;
}

const DIFF_LABEL = {
  damage: 'Damage', cooldown: 'Fire rate', range: 'Range', pierce: 'Pierce', pellets: 'Pellets', burst: 'Burst', splashRadius: 'Blast radius',
  maxHits: 'Max hits', chains: 'Chain jumps', burnDamage: 'Burn', burnDuration: 'Burn time', armorPierce: 'Armor pierce', income: 'Income', spinUp: 'Spin-up',
  coneAngle: 'Cone', cluster: 'Cluster', bossMult: 'Boss damage', projectileSize: 'Bolt size',
  maxUnits: 'Sentries', buildRange: 'Build range', scrapMax: 'Scrap/sentry', deadzone: 'Dead zone',
  chainFalloff: 'Damage kept per jump',
};
// Kept short so two fit on a row of the upgrade card.
const UNIT_LABEL = { damage: 'Sentry dmg', cooldown: 'Sentry rate', range: 'Sentry range', health: 'Sentry HP', lifespan: 'Sentry life' };
function fmtDiff(k, v) {
  if (k === 'cooldown') return +(1 / v).toFixed(2) + '/s';
  if (k === 'armorPierce' || k === 'chainFalloff') return Math.round(v * 100) + '%';
  if (k === 'income') return '$' + v;
  if (k === 'spinUp' || k === 'lifespan') return v + 's';
  return v;
}
function statDiff(a, b) {
  const out = [];
  const line = (label, from, to) => out.push(`<span><em>${label}</em> ${from} → <b>${to}</b></span>`);
  // Build range: show where sentries really go (never closer than the dead zone allows).
  const val = (s, k) => (k === 'buildRange' && s.scrapMax ? +sentryRing(s).outer.toFixed(1) : s[k]);
  for (const k of Object.keys(DIFF_LABEL)) {
    const from = val(a, k), to = val(b, k);
    if (from === to || to === undefined) continue;
    line(DIFF_LABEL[k], fmtDiff(k, from), fmtDiff(k, to));
  }
  if (!a.detectHidden && b.detectHidden) out.push('<span><b>+ Sees hidden</b></span>');
  if (!a.detectFlying && b.detectFlying) out.push('<span><b>+ Hits flying</b></span>');
  if (!a.ability && b.ability) out.push(`<span><b>+ ${ABILITIES[b.ability].name} ability</b></span>`);
  if (JSON.stringify(a.aura) !== JSON.stringify(b.aura) && b.aura) out.push('<span><b>Stronger aura</b></span>');
  // Builder towers: most of an upgrade's effect is on the sentries.
  const ua = a.unit || {}, ub = b.unit || {};
  for (const k of Object.keys(UNIT_LABEL)) {
    if (ub[k] === undefined || ua[k] === ub[k]) continue;
    line(UNIT_LABEL[k], ua[k] === undefined ? '–' : fmtDiff(k, ua[k]), fmtDiff(k, ub[k]));
  }
  if (!ua.hidden && ub.hidden) out.push('<span><b>+ Sentries see hidden</b></span>');
  if (!ua.shield && ub.shield) out.push('<span><b>+ Sentry shield (stun immune)</b></span>');
  if (!ua.rocket && ub.rocket) out.push(`<span><b>+ Rockets ${ub.rocket.damage}×${ub.rocket.count}</b></span>`);
  return out.join('');
}

/** Tiny map with the tower's range drawn to scale, for the shop tooltip. */
function rangeMap(range) {
  const W = 64, H = 40;
  return `<div class="tip-range"><svg viewBox="0 0 ${W} ${H}" aria-hidden="true"><rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="2"/><circle cx="${W / 2}" cy="${H / 2}" r="${range}"/><circle class="dot" cx="${W / 2}" cy="${H / 2}" r="1"/></svg><span>Range ${range} on a ${W}-stud-wide map</span></div>`;
}

export { TARGETING };
