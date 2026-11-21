// ============================================================
// ENGINE - Game loop, rendering, state management, audio
// ============================================================
class SoundManager {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  play(type) {
    if (!this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    gain.gain.value = 0.08;

    switch (type) {
      case 'shoot':
        osc.frequency.value = 800;
        osc.type = 'square';
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
        break;
      case 'explosion':
        osc.frequency.value = 150;
        osc.type = 'sawtooth';
        gain.gain.value = 0.12;
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
        break;
      case 'death':
        osc.frequency.value = 400;
        osc.type = 'sine';
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.15);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
        break;
      case 'wave':
        osc.frequency.value = 440;
        osc.type = 'sine';
        gain.gain.value = 0.1;
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(660, now + 0.1);
        osc.frequency.setValueAtTime(880, now + 0.2);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
        break;
      case 'place':
        osc.frequency.value = 600;
        osc.type = 'triangle';
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
        break;
    }
  }
}

class Game {
  constructor() {
    window.game = this;

    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.sound = new SoundManager();

    this.selectedMode = 'casual';
    this.loadout = [];
    this.cash = 600;
    this.baseHP = 100;
    this.currentWave = 0;
    this.totalWaves = 25;
    this.waveInProgress = false;
    this.gameOver = false;
    this.paused = false;
    this.gameSpeed = 1;
    this.gameStarted = false;

    this.towerManager = new TowerManager();
    this.enemyManager = new EnemyManager();
    this.effectsManager = new EffectsManager();
    this.ui = new UI(this);

    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());

    this.mouseX = 0;
    this.mouseY = 0;
    this.canvas.addEventListener('mousemove', e => this.onMouseMove(e));
    this.canvas.addEventListener('click', e => this.onClick(e));
    this.canvas.addEventListener('contextmenu', e => {
      e.preventDefault();
      this.ui.placingTower = null;
    });

    document.addEventListener('click', () => this.sound.resume(), { once: true });

    this.lastTime = performance.now();
    requestAnimationFrame(t => this.loop(t));
  }

  resizeCanvas() {
    const scaleX = window.innerWidth / MAP_W;
    const scaleY = window.innerHeight / MAP_H;
    const scale = Math.min(scaleX, scaleY);
    if (this.canvas.width !== MAP_W) this.canvas.width = MAP_W;
    if (this.canvas.height !== MAP_H) this.canvas.height = MAP_H;
    this.canvas.style.width = (MAP_W * scale) + 'px';
    this.canvas.style.height = (MAP_H * scale) + 'px';
    this.canvasScale = scale;
  }

  getCanvasCoords(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / this.canvasScale,
      y: (e.clientY - rect.top) / this.canvasScale,
    };
  }

  onMouseMove(e) {
    const { x, y } = this.getCanvasCoords(e);
    this.mouseX = x;
    this.mouseY = y;
  }

  onClick(e) {
    if (!this.gameStarted || this.gameOver) return;
    const { x, y } = this.getCanvasCoords(e);

    if (this.ui.placingTower) {
      this.tryPlaceTower(this.ui.placingTower, x, y);
      return;
    }

    const tower = this.towerManager.getTowerAt(x, y);
    if (tower) {
      this.towerManager.deselectAll();
      tower.selected = true;
      this.selectedTower = tower;
      this.ui.showUpgradePanel(tower);
    } else {
      this.towerManager.deselectAll();
      this.selectedTower = null;
      this.ui.hideUpgradePanel();
    }
  }

  tryPlaceTower(typeName, px, py) {
    const def = TOWERS[typeName];
    if (this.cash < def.cost) return;

    if (def.base.placementLimit) {
      if (this.towerManager.getPlacementCount(typeName) >= def.base.placementLimit) return;
    }

    const radius = def.hitboxRadius || 20;
    if (!canPlaceAtPosition(this.selectedMode, px, py, radius, this.towerManager.towers)) return;

    this.cash -= def.cost;
    this.towerManager.placeTower(typeName, px, py);
    this.sound.play('place');
    this.ui.placingTower = null;
  }

  startGame(loadout) {
    this.loadout = loadout;
    const config = MODE_CONFIG[this.selectedMode];
    this.cash = config.startCash;
    this.baseHP = config.baseHP;
    this.totalWaves = config.waves;
    this.currentWave = 0;
    this.waveInProgress = false;
    this.gameOver = false;
    this.paused = false;
    this.gameSpeed = 1;
    this.gameStarted = true;
    this.selectedTower = null;

    this.towerManager = new TowerManager();
    this.enemyManager = new EnemyManager();
    this.effectsManager = new EffectsManager();

    this.ui.showGameHUD();
    this.ui.updateHUD();
  }

  startNextWave() {
    if (this.waveInProgress || this.gameOver) return;
    if (this.currentWave >= this.totalWaves) return;

    const waveData = WAVES[this.selectedMode][this.currentWave];
    if (!waveData) return;

    this.currentWave++;
    this.waveInProgress = true;
    const map = getMap(this.selectedMode);
    const config = MODE_CONFIG[this.selectedMode];
    this.enemyManager.startWave(waveData, config.hpScale, map.path);
    this.sound.play('wave');
  }

  sellSelectedTower() {
    if (!this.selectedTower) return;
    this.cash += this.selectedTower.getSellValue();
    this.towerManager.removeTower(this.selectedTower);
    this.selectedTower = null;
  }

  togglePause() {
    this.paused = !this.paused;
  }

  update(dt) {
    if (this.paused || !this.gameStarted || this.gameOver) return;

    dt *= this.gameSpeed;

    this.enemyManager.update(dt);

    const reached = this.enemyManager.getReachedEnd();
    for (const e of reached) {
      this.baseHP -= e.boss ? 10 : 1;
    }

    const targetable = this.enemyManager.getTargetableEnemies();
    this.towerManager.update(dt, targetable, this.effectsManager);
    this.effectsManager.update(dt);

    if (this.waveInProgress && this.enemyManager.isWaveComplete()) {
      this.waveInProgress = false;
      // Farm income only (no wave bonus — cash comes from enemy kills)
      this.cash += this.towerManager.getIncome();
      if (this.currentWave >= this.totalWaves) {
        this.gameOver = true;
        setTimeout(() => this.ui.showGameOver(true), 1000);
        return;
      }
    }

    if (this.baseHP <= 0) {
      this.baseHP = 0;
      this.gameOver = true;
      setTimeout(() => this.ui.showGameOver(false), 500);
    }

    this.ui.updateHUD();
  }

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, MAP_W, MAP_H);

    if (!this.gameStarted) return;

    drawMap(ctx, this.selectedMode);

    // Placement preview
    if (this.ui.placingTower) {
      const def = TOWERS[this.ui.placingTower];
      const radius = def.hitboxRadius || 20;
      const mx = this.mouseX, my = this.mouseY;
      const canPlace = canPlaceAtPosition(this.selectedMode, mx, my, radius, this.towerManager.towers) && this.cash >= def.cost;

      // Range circle
      const range = def.base.range * RANGE_SCALE;
      ctx.beginPath();
      ctx.arc(mx, my, range, 0, Math.PI * 2);
      ctx.fillStyle = canPlace ? 'rgba(100,255,100,0.08)' : 'rgba(255,100,100,0.08)';
      ctx.fill();
      ctx.strokeStyle = canPlace ? 'rgba(100,255,100,0.25)' : 'rgba(255,100,100,0.25)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Hitbox circle
      ctx.beginPath();
      ctx.arc(mx, my, radius, 0, Math.PI * 2);
      ctx.fillStyle = canPlace ? 'rgba(100,255,100,0.2)' : 'rgba(255,100,100,0.2)';
      ctx.fill();
      ctx.strokeStyle = canPlace ? 'rgba(100,255,100,0.5)' : 'rgba(255,100,100,0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Ghost tower
      const img = this.towerManager.towerImages[this.ui.placingTower];
      if (img && img.complete) {
        ctx.globalAlpha = 0.6;
        ctx.drawImage(img, mx - TILE_SIZE / 2, my - TILE_SIZE / 2, TILE_SIZE, TILE_SIZE);
        ctx.globalAlpha = 1;
      }
    }

    this.towerManager.draw(ctx);
    this.enemyManager.draw(ctx);
    this.effectsManager.draw(ctx);
  }

  loop(time) {
    const dt = Math.min((time - this.lastTime) / 1000, 0.05);
    this.lastTime = time;
    this.update(dt);
    this.render();
    requestAnimationFrame(t => this.loop(t));
  }
}

const game = new Game();
