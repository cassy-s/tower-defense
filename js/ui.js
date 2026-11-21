// ============================================================
// UI - Menu screens, HUD, tower shop, upgrade panel, loadout
// ============================================================
class UI {
  constructor(game) {
    this.game = game;
    this.selectedLoadout = [];
    this.placingTower = null;
    this._lastCash = 0;
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
      card.innerHTML = '<img src="' + portraitSrc + '" alt="' + def.name + '">' +
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
    var html = '<strong style="color:#ffcc00;font-size:0.95rem;">' + def.name + '</strong>';
    html += ' <span style="color:#555570;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;">' + def.role + '</span>';
    html += '<br><span style="color:#8888aa;">Cost: </span><span style="color:#44dd66;font-weight:700;">$' + def.cost + '</span>';
    if (s.damage) html += ' <span style="color:#555570;">|</span> <span style="color:#8888aa;">Dmg: </span><span style="color:#e8e8f0;font-weight:600;">' + s.damage + '</span>';
    if (s.firerate) html += ' <span style="color:#555570;">|</span> <span style="color:#8888aa;">Rate: </span><span style="color:#e8e8f0;font-weight:600;">' + s.firerate + 's</span>';
    html += ' <span style="color:#555570;">|</span> <span style="color:#8888aa;">Range: </span><span style="color:#e8e8f0;font-weight:600;">' + s.range + '</span>';
    if (s.targetType === 'splash') html += '<br><span style="color:#8888aa;">Splash Radius: </span><span style="color:#e8e8f0;font-weight:600;">' + s.splashRadius + '</span>';
    if (s.income) html += '<br><span style="color:#8888aa;">Income: </span><span style="color:#44dd66;font-weight:700;">$' + s.income + '/wave</span>';
    if (s.firerateBuff) html += '<br><span style="color:#8888aa;">Buff: </span><span style="color:#4488ff;font-weight:600;">' + (s.firerateBuff * 100) + '% firerate boost</span>';
    if (s.burnDamage) html += '<br><span style="color:#8888aa;">Burn: </span><span style="color:#ff6600;font-weight:600;">' + s.burnDamage + ' dmg/' + (s.burnDuration || 3) + 's</span>';
    preview.innerHTML = html;
  }

  clearTowerPreview() {
    document.getElementById('tower-preview').innerHTML = '<span style="color:#555570;">Hover over a tower to see its stats</span>';
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
        '</div>';
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
      cashEl.style.color = '#88ffaa';
      cashEl.style.textShadow = '0 0 8px rgba(68,221,102,0.5)';
      setTimeout(function() {
        cashEl.style.color = '';
        cashEl.style.textShadow = '';
      }, 300);
    }
    this._lastCash = g.cash;

    document.getElementById('hud-hp').textContent = '' + Math.ceil(g.baseHP);
    var maxHP = MODE_CONFIG[g.selectedMode].baseHP;
    var hpPct = Math.max(0, g.baseHP / maxHP * 100);
    var hpBar = document.getElementById('hp-bar');
    if (hpBar) {
      hpBar.style.width = hpPct + '%';
      if (hpPct < 25) {
        hpBar.style.background = 'linear-gradient(90deg, #ff2233 0%, #ff4455 100%)';
      } else if (hpPct < 50) {
        hpBar.style.background = 'linear-gradient(90deg, #ff6644 0%, #ffaa44 100%)';
      } else {
        hpBar.style.background = 'linear-gradient(90deg, #ff4455 0%, #ff8866 100%)';
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
  }

  showUpgradePanel(tower) {
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
    html += '<div style="margin-top:6px;color:#8888aa;font-size:0.72rem;">Sell: <span style="color:#ff7788;font-weight:700;">$' + tower.getSellValue() + '</span></div>';
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
    var g = this.game;
    document.getElementById('game-hud').classList.add('hidden');
    var title = document.getElementById('game-over-title');
    title.textContent = won ? 'VICTORY!' : 'DEFEATED';
    title.className = won ? 'victory' : 'defeat';
    var info = '';
    if (won) {
      info = 'You conquered all ' + g.totalWaves + ' waves!';
    } else {
      info = 'You survived ' + g.currentWave + ' of ' + g.totalWaves + ' waves.';
    }
    document.getElementById('game-over-info').textContent = info;
    this.showScreen('game-over');
  }
}
