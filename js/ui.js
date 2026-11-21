// ============================================================
// UI - Menu screens, HUD, tower shop, upgrade panel, loadout
// ============================================================
class UI {
  constructor(game) {
    this.game = game;
    this.selectedLoadout = [];
    this.placingTower = null;
    this.setupMenuListeners();
  }

  setupMenuListeners() {
    document.getElementById('btn-play').addEventListener('click', () => {
      this.showScreen('mode-select');
    });

    document.querySelectorAll('.btn-mode').forEach(btn => {
      btn.addEventListener('click', () => {
        this.game.selectedMode = btn.dataset.mode;
        this.showLoadoutScreen();
      });
    });
    document.getElementById('btn-back-mode').addEventListener('click', () => {
      this.showScreen('main-menu');
    });

    document.getElementById('btn-back-loadout').addEventListener('click', () => {
      this.showScreen('mode-select');
    });
    document.getElementById('btn-start-game').addEventListener('click', () => {
      if (this.selectedLoadout.length > 0) {
        this.game.startGame(this.selectedLoadout);
      }
    });

    document.getElementById('btn-start-wave').addEventListener('click', () => {
      this.game.startNextWave();
    });
    document.getElementById('btn-pause').addEventListener('click', () => {
      this.game.togglePause();
      document.getElementById('btn-pause').textContent = this.game.paused ? 'Resume' : 'Pause';
    });
    document.querySelectorAll('.speed-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.game.gameSpeed = parseInt(btn.dataset.speed);
      });
    });

    document.getElementById('btn-close-upgrade').addEventListener('click', () => {
      this.hideUpgradePanel();
      this.game.towerManager.deselectAll();
    });
    document.getElementById('btn-sell-tower').addEventListener('click', () => {
      this.game.sellSelectedTower();
      this.hideUpgradePanel();
    });

    document.getElementById('btn-retry').addEventListener('click', () => {
      this.showLoadoutScreen();
    });
    document.getElementById('btn-menu').addEventListener('click', () => {
      this.showScreen('main-menu');
    });
  }

  showScreen(id) {
    document.querySelectorAll('.overlay').forEach(o => o.classList.remove('active'));
    document.getElementById('game-hud').classList.add('hidden');
    document.getElementById(id).classList.add('active');
  }

  showLoadoutScreen() {
    this.selectedLoadout = [];
    this.showScreen('loadout-screen');
    this.renderTowerGrid();
    this.updateLoadoutSlots();
  }

  renderTowerGrid() {
    const grid = document.getElementById('tower-grid');
    grid.innerHTML = '';
    for (const [key, def] of Object.entries(TOWERS)) {
      const card = document.createElement('div');
      card.className = 'tower-card';
      card.dataset.tower = key;
      card.innerHTML = '<img src="' + def.sprite + '" alt="' + def.name + '">' +
        '<div class="tower-card-name">' + def.name + '</div>' +
        '<div class="tower-card-cost">$' + def.cost + '</div>';
      card.addEventListener('click', () => this.toggleLoadoutTower(key));
      card.addEventListener('mouseenter', () => this.showTowerPreview(key));
      card.addEventListener('mouseleave', () => this.clearTowerPreview());
      grid.appendChild(card);
    }
  }

  toggleLoadoutTower(key) {
    const idx = this.selectedLoadout.indexOf(key);
    if (idx >= 0) {
      this.selectedLoadout.splice(idx, 1);
    } else if (this.selectedLoadout.length < 5) {
      this.selectedLoadout.push(key);
    }
    this.updateLoadoutSlots();
    document.querySelectorAll('.tower-card').forEach(c => {
      c.classList.toggle('selected', this.selectedLoadout.includes(c.dataset.tower));
    });
    document.getElementById('btn-start-game').disabled = this.selectedLoadout.length === 0;
  }

  updateLoadoutSlots() {
    const slots = document.querySelectorAll('.slot');
    slots.forEach((slot, i) => {
      if (i < this.selectedLoadout.length) {
        const def = TOWERS[this.selectedLoadout[i]];
        slot.innerHTML = '<img src="' + def.sprite + '" alt="' + def.name + '">';
        slot.classList.remove('empty');
      } else {
        slot.innerHTML = '';
        slot.classList.add('empty');
      }
    });
  }

  showTowerPreview(key) {
    const def = TOWERS[key];
    const s = def.base;
    const preview = document.getElementById('tower-preview');
    let info = '<strong>' + def.name + '</strong> - ' + def.role + ' | ' + def.placement + '<br>';
    info += 'Cost: $' + def.cost;
    if (s.damage) info += ' | Dmg: ' + s.damage;
    if (s.firerate) info += ' | Rate: ' + s.firerate + 's';
    info += ' | Range: ' + s.range;
    if (s.targetType === 'splash') info += ' | Splash: ' + s.splashRadius;
    if (s.income) info += ' | Income: $' + s.income + '/wave';
    if (s.firerateBuff) info += ' | Buff: ' + (s.firerateBuff * 100) + '% firerate';
    preview.innerHTML = info;
  }

  clearTowerPreview() {
    document.getElementById('tower-preview').innerHTML = '';
  }

  showGameHUD() {
    document.querySelectorAll('.overlay').forEach(o => o.classList.remove('active'));
    document.getElementById('game-hud').classList.remove('hidden');
    this.buildTowerShop();
  }

  buildTowerShop() {
    const shop = document.getElementById('tower-shop');
    shop.innerHTML = '';
    for (const key of this.game.loadout) {
      const def = TOWERS[key];
      const div = document.createElement('div');
      div.className = 'shop-tower';
      div.dataset.tower = key;
      div.innerHTML = '<img src="' + def.sprite + '" alt="' + def.name + '">' +
        '<div class="shop-tower-info">' +
        '<div class="shop-tower-name">' + def.name + '</div>' +
        '<div class="shop-tower-cost">$' + def.cost + '</div>' +
        '</div>';
      div.addEventListener('click', () => {
        if (this.game.cash >= def.cost) {
          this.placingTower = key;
        }
      });
      shop.appendChild(div);
    }
  }

  updateHUD() {
    const g = this.game;
    document.getElementById('hud-wave').textContent = g.currentWave + '/' + g.totalWaves;
    document.getElementById('hud-cash').textContent = '$' + Math.floor(g.cash);
    document.getElementById('hud-hp').textContent = '' + Math.ceil(g.baseHP);

    document.querySelectorAll('.shop-tower').forEach(div => {
      const def = TOWERS[div.dataset.tower];
      div.classList.toggle('cant-afford', g.cash < def.cost);
    });

    const waveBtn = document.getElementById('btn-start-wave');
    waveBtn.disabled = g.waveInProgress;
    waveBtn.textContent = g.waveInProgress ? 'Wave ' + g.currentWave + '...' : 'Start Wave';
  }

  showUpgradePanel(tower) {
    const panel = document.getElementById('upgrade-panel');
    panel.classList.remove('hidden');
    document.getElementById('upgrade-tower-name').textContent = tower.name + ' (Lv ' + tower.upgradeLevel + ')';

    const stats = document.getElementById('upgrade-stats');
    const s = tower.stats;
    let info = 'Damage: ' + (s.damage || 0) + ' | Range: ' + s.range;
    if (s.firerate) info += ' | Rate: ' + s.firerate.toFixed(2) + 's';
    if (s.income) info += ' | Income: $' + s.income + '/wave';
    info += '<br>Sell value: $' + tower.getSellValue();
    stats.innerHTML = info;

    const list = document.getElementById('upgrade-list');
    list.innerHTML = '';
    const def = TOWERS[tower.typeName];
    for (let i = 0; i < def.upgrades.length; i++) {
      const upg = def.upgrades[i];
      const btn = document.createElement('div');
      btn.className = 'upgrade-btn';
      if (i < tower.upgradeLevel) {
        btn.classList.add('purchased');
      } else if (i === tower.upgradeLevel) {
        if (this.game.cash < upg.cost) btn.classList.add('cant-afford');
        btn.addEventListener('click', () => {
          if (this.game.cash >= upg.cost) {
            this.game.cash -= upg.cost;
            tower.upgrade();
            this.showUpgradePanel(tower);
          }
        });
      } else {
        btn.classList.add('cant-afford');
      }
      btn.innerHTML = '<span class="upg-name">' + upg.name + '</span><span class="upg-cost">$' + upg.cost + '</span>';
      list.appendChild(btn);
    }
  }

  hideUpgradePanel() {
    document.getElementById('upgrade-panel').classList.add('hidden');
  }

  showGameOver(won) {
    const g = this.game;
    document.getElementById('game-hud').classList.add('hidden');
    document.getElementById('game-over-title').textContent = won ? 'VICTORY!' : 'GAME OVER';
    document.getElementById('game-over-info').textContent = won
      ? 'You conquered all ' + g.totalWaves + ' waves!'
      : 'You survived ' + g.currentWave + ' waves';
    this.showScreen('game-over');
  }
}
