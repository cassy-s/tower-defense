// ============================================================
// UI - Menu screens, HUD, tower shop, upgrade panel, loadout
// ============================================================
class UI {
  constructor(game) {
    this.game = game;
    this.selectedLoadout = [];
    this.placingTower = null;
    this._lastCash = 0;
    this._upgradeRefreshTimer = null;
    this._currentUpgradeTower = null;
    this.setupMenuListeners();
  }

  setupMenuListeners() {
    document.getElementById('btn-play').addEventListener('click', function() {
      window.game.ui.showScreen('mode-select');
    });

    var modeButtons = document.querySelectorAll('.btn-mode');
    for (var i = 0; i < modeButtons.length; i++) {
      (function(btn) {
        btn.addEventListener('click', function() {
          window.game.selectedMode = btn.dataset.mode;
          window.game.ui.showLoadoutScreen();
        });
      })(modeButtons[i]);
    }
    document.getElementById('btn-back-mode').addEventListener('click', function() {
      window.game.ui.showScreen('main-menu');
    });

    document.getElementById('btn-back-loadout').addEventListener('click', function() {
      window.game.ui.showScreen('mode-select');
    });
    document.getElementById('btn-start-game').addEventListener('click', function() {
      if (window.game.ui.selectedLoadout.length > 0) {
        window.game.startGame(window.game.ui.selectedLoadout);
      }
    });

    document.getElementById('btn-start-wave').addEventListener('click', function() {
      window.game.startNextWave();
    });
    document.getElementById('btn-pause').addEventListener('click', function() {
      window.game.togglePause();
      document.getElementById('btn-pause').textContent = window.game.paused ? 'Resume' : 'Pause';
    });
    var speedButtons = document.querySelectorAll('.speed-btn');
    for (var j = 0; j < speedButtons.length; j++) {
      (function(btn) {
        btn.addEventListener('click', function() {
          var all = document.querySelectorAll('.speed-btn');
          for (var k = 0; k < all.length; k++) all[k].classList.remove('active');
          btn.classList.add('active');
          window.game.gameSpeed = parseInt(btn.dataset.speed);
        });
      })(speedButtons[j]);
    }

    document.getElementById('btn-close-upgrade').addEventListener('click', function() {
      window.game.ui.hideUpgradePanel();
      window.game.towerManager.deselectAll();
    });
    document.getElementById('btn-sell-tower').addEventListener('click', function() {
      window.game.sellSelectedTower();
      window.game.ui.hideUpgradePanel();
    });

    document.getElementById('btn-retry').addEventListener('click', function() {
      window.game.ui.showLoadoutScreen();
    });
    document.getElementById('btn-menu').addEventListener('click', function() {
      window.game.ui.showScreen('main-menu');
    });
  }

  showScreen(id) {
    var overlays = document.querySelectorAll('.overlay');
    for (var i = 0; i < overlays.length; i++) overlays[i].classList.remove('active');
    document.getElementById('game-hud').classList.add('hidden');
    document.getElementById(id).classList.add('active');
  }

  showLoadoutScreen() {
    this.selectedLoadout = [];
    this.showScreen('loadout-screen');
    this.renderTowerGrid();
    this.updateLoadoutSlots();
    this.clearTowerPreview();
  }

  renderTowerGrid() {
    var grid = document.getElementById('tower-grid');
    grid.innerHTML = '';
    var keys = Object.keys(TOWERS);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var def = TOWERS[key];
      var card = document.createElement('div');
      card.className = 'tower-card';
      card.dataset.tower = key;
      var portraitSrc = def.portrait || def.sprite;
      card.innerHTML = '<img class="tower-card-img" src="' + portraitSrc + '" alt="' + def.name + '">' +
        '<div class="tower-card-name">' + def.name + '</div>' +
        '<div class="tower-card-cost">$' + def.cost + '</div>' +
        '<div class="tower-card-role">' + def.role + '</div>';
      (function(k) {
        card.addEventListener('click', function() { window.game.ui.toggleLoadoutTower(k); });
        card.addEventListener('mouseenter', function() { window.game.ui.showTowerPreview(k); });
        card.addEventListener('mouseleave', function() { window.game.ui.clearTowerPreview(); });
      })(key);
      grid.appendChild(card);
    }
  }

  toggleLoadoutTower(key) {
    var idx = this.selectedLoadout.indexOf(key);
    if (idx >= 0) {
      this.selectedLoadout.splice(idx, 1);
    } else if (this.selectedLoadout.length < 5) {
      this.selectedLoadout.push(key);
    }
    this.updateLoadoutSlots();
    var cards = document.querySelectorAll('.tower-card');
    for (var i = 0; i < cards.length; i++) {
      var isSelected = this.selectedLoadout.indexOf(cards[i].dataset.tower) >= 0;
      if (isSelected) {
        cards[i].classList.add('selected');
      } else {
        cards[i].classList.remove('selected');
      }
    }
    document.getElementById('btn-start-game').disabled = this.selectedLoadout.length === 0;
  }

  updateLoadoutSlots() {
    var slots = document.querySelectorAll('.slot');
    for (var i = 0; i < slots.length; i++) {
      if (i < this.selectedLoadout.length) {
        var def = TOWERS[this.selectedLoadout[i]];
        var slotSrc = def.portrait || def.sprite;
        slots[i].innerHTML = '<img src="' + slotSrc + '" alt="' + def.name + '">';
        slots[i].classList.remove('empty');
      } else {
        slots[i].innerHTML = '';
        slots[i].classList.add('empty');
      }
    }
  }

  showTowerPreview(key) {
    var def = TOWERS[key];
    var s = def.base;
    var preview = document.getElementById('tower-preview');
    var html = '<span class="preview-name">' + def.name + '</span>';
    html += '<span class="preview-role">' + def.role + '</span>';
    html += '<div class="preview-stats">';
    html += '<span class="preview-stat"><span class="preview-stat-label">Cost: </span><span class="preview-stat-value money">$' + def.cost + '</span></span>';
    if (s.damage) {
      html += '<span class="preview-divider">|</span>';
      html += '<span class="preview-stat"><span class="preview-stat-label">Dmg: </span><span class="preview-stat-value">' + s.damage + '</span></span>';
    }
    if (s.firerate) {
      html += '<span class="preview-divider">|</span>';
      html += '<span class="preview-stat"><span class="preview-stat-label">Rate: </span><span class="preview-stat-value">' + s.firerate + 's</span></span>';
    }
    html += '<span class="preview-divider">|</span>';
    html += '<span class="preview-stat"><span class="preview-stat-label">Range: </span><span class="preview-stat-value">' + s.range + '</span></span>';
    if (s.targetType === 'splash') {
      html += '<span class="preview-divider">|</span>';
      html += '<span class="preview-stat"><span class="preview-stat-label">Splash: </span><span class="preview-stat-value">' + s.splashRadius + '</span></span>';
    }
    html += '</div>';
    if (s.income) {
      html += '<div class="preview-stats">';
      html += '<span class="preview-stat"><span class="preview-stat-label">Income: </span><span class="preview-stat-value money">$' + s.income + '/wave</span></span>';
      html += '</div>';
    }
    if (s.firerateBuff) {
      html += '<div class="preview-stats">';
      html += '<span class="preview-stat"><span class="preview-stat-label">Buff: </span><span class="preview-stat-value special">' + (s.firerateBuff * 100) + '% firerate boost</span></span>';
      html += '</div>';
    }
    if (s.burnDamage) {
      html += '<div class="preview-stats">';
      html += '<span class="preview-stat"><span class="preview-stat-label">Burn: </span><span class="preview-stat-value fire">' + s.burnDamage + ' dmg/' + (s.burnDuration || 3) + 's</span></span>';
      html += '</div>';
    }
    preview.innerHTML = html;
  }

  clearTowerPreview() {
    var preview = document.getElementById('tower-preview');
    preview.innerHTML = '<span class="preview-stat-label">Hover over a tower to see its stats</span>';
  }

  showGameHUD() {
    var overlays = document.querySelectorAll('.overlay');
    for (var i = 0; i < overlays.length; i++) overlays[i].classList.remove('active');
    document.getElementById('game-hud').classList.remove('hidden');
    this.buildTowerShop();
    this._lastCash = this.game.cash;
  }

  buildTowerShop() {
    var shop = document.getElementById('tower-shop');
    shop.innerHTML = '';
    for (var i = 0; i < this.game.loadout.length; i++) {
      var key = this.game.loadout[i];
      var def = TOWERS[key];
      var div = document.createElement('div');
      div.className = 'shop-tower';
      div.dataset.tower = key;
      var shopSrc = def.portrait || def.sprite;
      div.innerHTML = '<img src="' + shopSrc + '" alt="' + def.name + '">' +
        '<div class="shop-tower-info">' +
        '<div class="shop-tower-name">' + def.name + '</div>' +
        '<div class="shop-tower-cost">$' + def.cost + '</div>' +
        '</div>' +
        '<span class="shop-tooltip">' + def.name + ' - $' + def.cost + '</span>';
      (function(k, d) {
        div.addEventListener('click', function() {
          if (window.game.cash >= d.cost) {
            window.game.ui.placingTower = k;
          }
        });
      })(key, def);
      shop.appendChild(div);
    }
  }

  updateHUD() {
    var g = this.game;
    document.getElementById('hud-wave').textContent = g.currentWave + '/' + g.totalWaves;

    var cashEl = document.getElementById('hud-cash');
    cashEl.textContent = '$' + Math.floor(g.cash);
    if (g.cash > this._lastCash) {
      cashEl.style.color = '#6affaa';
      cashEl.style.textShadow = '0 0 10px rgba(61,220,111,0.5)';
      setTimeout(function() {
        cashEl.style.color = '';
        cashEl.style.textShadow = '';
      }, 350);
    }
    this._lastCash = g.cash;

    document.getElementById('hud-hp').textContent = '' + Math.ceil(g.baseHP);
    var maxHP = MODE_CONFIG[g.selectedMode].baseHP;
    var hpPct = Math.max(0, g.baseHP / maxHP * 100);
    var hpBar = document.getElementById('hp-bar');
    if (hpBar) {
      hpBar.style.width = hpPct + '%';
      // Smooth class-based transitions for HP bar color
      hpBar.classList.remove('hp-critical', 'hp-warning', 'hp-good');
      if (hpPct < 25) {
        hpBar.classList.add('hp-critical');
      } else if (hpPct < 50) {
        hpBar.classList.add('hp-warning');
      } else {
        hpBar.classList.add('hp-good');
      }
    }

    var shopTowers = document.querySelectorAll('.shop-tower');
    for (var i = 0; i < shopTowers.length; i++) {
      var def = TOWERS[shopTowers[i].dataset.tower];
      if (g.cash < def.cost) {
        shopTowers[i].classList.add('cant-afford');
      } else {
        shopTowers[i].classList.remove('cant-afford');
      }
    }

    var waveBtn = document.getElementById('btn-start-wave');
    waveBtn.disabled = g.waveInProgress;
    if (g.waveInProgress) {
      waveBtn.textContent = 'WAVE ' + g.currentWave + '...';
    } else if (g.currentWave >= g.totalWaves) {
      waveBtn.textContent = 'COMPLETE';
      waveBtn.disabled = true;
    } else {
      waveBtn.textContent = 'START WAVE';
    }

    // Auto-refresh upgrade panel afford state if open
    if (this._currentUpgradeTower && !document.getElementById('upgrade-panel').classList.contains('hidden')) {
      this._refreshUpgradeAfford();
    }
  }

  _refreshUpgradeAfford() {
    var tower = this._currentUpgradeTower;
    if (!tower) return;
    var def = TOWERS[tower.typeName];
    if (!def) return;
    var buttons = document.querySelectorAll('.upgrade-btn');
    for (var i = 0; i < buttons.length; i++) {
      if (i < tower.upgradeLevel) {
        // Already purchased, no change needed
        continue;
      } else if (i === tower.upgradeLevel) {
        var upg = def.upgrades[i];
        if (this.game.cash < upg.cost) {
          buttons[i].classList.add('cant-afford');
          buttons[i].classList.remove('next-upgrade');
          buttons[i].classList.add('next-upgrade');
        } else {
          buttons[i].classList.remove('cant-afford');
          if (!buttons[i].classList.contains('next-upgrade')) {
            buttons[i].classList.add('next-upgrade');
          }
        }
      }
      // Locked upgrades stay as-is
    }
  }

  showUpgradePanel(tower) {
    this._currentUpgradeTower = tower;
    var panel = document.getElementById('upgrade-panel');
    panel.classList.remove('hidden');
    document.getElementById('upgrade-tower-name').textContent = tower.name + ' Lv.' + tower.upgradeLevel;

    var stats = document.getElementById('upgrade-stats');
    var s = tower.stats;
    var html = '<div class="stat-row">';
    if (s.damage) html += '<div class="stat-item"><span class="stat-icon">&#9876;</span><span class="stat-value">' + s.damage + '</span><span class="stat-label"> dmg</span></div>';
    html += '<div class="stat-item"><span class="stat-icon">&#128269;</span><span class="stat-value">' + s.range + '</span><span class="stat-label"> range</span></div>';
    if (s.firerate) html += '<div class="stat-item"><span class="stat-icon">&#9201;</span><span class="stat-value">' + s.firerate.toFixed(2) + 's</span><span class="stat-label"> rate</span></div>';
    if (s.income) html += '<div class="stat-item"><span class="stat-icon">&#128176;</span><span class="stat-value">$' + s.income + '</span><span class="stat-label"> /wave</span></div>';
    html += '</div>';
    html += '<div class="stat-sell">Sell value: <span class="stat-sell-value">$' + tower.getSellValue() + '</span></div>';
    stats.innerHTML = html;

    var list = document.getElementById('upgrade-list');
    list.innerHTML = '';
    var def = TOWERS[tower.typeName];
    for (var i = 0; i < def.upgrades.length; i++) {
      var upg = def.upgrades[i];
      var btn = document.createElement('div');
      btn.className = 'upgrade-btn';
      if (i < tower.upgradeLevel) {
        btn.classList.add('purchased');
        btn.innerHTML = '<span class="upg-name"><span class="upg-status">✔</span>' + upg.name + '</span><span class="upg-cost">$' + upg.cost + '</span>';
      } else if (i === tower.upgradeLevel) {
        btn.classList.add('next-upgrade');
        if (this.game.cash < upg.cost) btn.classList.add('cant-afford');
        (function(upgrade, tw, ui) {
          btn.addEventListener('click', function() {
            if (window.game.cash >= upgrade.cost) {
              window.game.cash -= upgrade.cost;
              tw.upgrade();
              ui.showUpgradePanel(tw);
            }
          });
        })(upg, tower, this);
        btn.innerHTML = '<span class="upg-name">' + upg.name + '</span><span class="upg-cost">$' + upg.cost + '</span>';
      } else {
        btn.classList.add('locked');
        btn.innerHTML = '<span class="upg-name">' + upg.name + '</span><span class="upg-cost">$' + upg.cost + '</span>';
      }
      list.appendChild(btn);
    }
  }

  hideUpgradePanel() {
    this._currentUpgradeTower = null;
    document.getElementById('upgrade-panel').classList.add('hidden');
  }

  showGameOver(won) {
    var g = this.game;
    document.getElementById('game-hud').classList.add('hidden');
    var title = document.getElementById('game-over-title');
    title.textContent = won ? 'VICTORY!' : 'DEFEATED';
    title.className = won ? 'victory' : 'defeat';

    // Set background class on game-over overlay
    var gameOverEl = document.getElementById('game-over');
    gameOverEl.classList.remove('victory-bg', 'defeat-bg');
    gameOverEl.classList.add(won ? 'victory-bg' : 'defeat-bg');

    var info = '';
    if (won) {
      info = 'You conquered all ' + g.totalWaves + ' waves!';
    } else {
      info = 'You survived ' + g.currentWave + ' of ' + g.totalWaves + ' waves.';
    }
    document.getElementById('game-over-info').textContent = info;

    // Build stats display
    var statsEl = document.getElementById('game-over-stats');
    var statsHtml = '';
    statsHtml += '<div class="go-stat"><span class="go-stat-value gold-val">' + g.currentWave + '/' + g.totalWaves + '</span><span class="go-stat-label">Waves</span></div>';
    var towersPlaced = 0;
    if (g.towerManager && g.towerManager.towers) {
      towersPlaced = g.towerManager.towers.length;
    }
    statsHtml += '<div class="go-stat"><span class="go-stat-value">' + towersPlaced + '</span><span class="go-stat-label">Towers</span></div>';
    statsHtml += '<div class="go-stat"><span class="go-stat-value green-val">$' + Math.floor(g.cash) + '</span><span class="go-stat-label">Cash Left</span></div>';
    statsEl.innerHTML = statsHtml;

    this.showScreen('game-over');
  }
}
