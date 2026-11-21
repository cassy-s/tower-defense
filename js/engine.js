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
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.sound = new SoundManager();

    // State
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

    // Managers
    this.towerManager = new TowerManager();
    this.enemyManager = new EnemyManager();
    this.projectileManager = new ProjectileManager();
    this.ui = new UI(this);

    // Canvas sizing
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());

    // Input
    this.mouseX = 0;
    this.mouseY = 0;
    this.canvas.addEventListener('mousemove', e => this.onMouseMove(e));
    this.canvas.addEventListener('click', e => this.onClick(e));
    this.canvas.addEventListener('contextmenu', e => {
      e.preventDefault();
      this.ui.placingTower = null;
    });

    // Resume audio on first click
    document.addEventListener('click', () => this.sound.resume(), { once: true });

    // Start render loop
    this.lastTime = performance.now();
    requestAnimationFrame(t => this.loop(t));
  }

  resizeCanvas() {
    const { cols, rows, tileSize } = getGridDimensions();
    // Fit canvas to map size, scaled to fit window
    const mapW = cols * tileSize;
    const mapH = rows * tileSize;
    const scaleX = window.innerWidth / mapW;
    const scaleY = window.innerHeight / mapH;
    const scale = Math.min(scaleX, scaleY);

    this.canvas.width = mapW;
    this.canvas.height = mapH;
    this.canvas.style.width = (mapW * scale) + 'px';
    this.canvas.style.height = (mapH * scale) + 'px';
    this.canvasScale = scale;
  }

  getCanvasCoords(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / this.canvasScale;
    const y = (e.clientY - rect.top) / this.canvasScale;
    return { x, y };
  }

  onMouseMove(e) {
    const { x, y } = this.getCanvasCoords(e);
    this.mouseX = x;
    this.mouseY = y;
  }

  onClick(e) {
    if (!this.gameStarted || this.gameOver) return;
    const { x, y } = this.getCanvasCoords(e);
    const { col, row } = this.ui.canvasToGrid(x, y);

    if (this.ui.placingTower) {
      this.tryPlaceTower(this.ui.placingTower, col, row);
      return;
    }

    // Check if clicking on existing tower
    const tower = this.towerManager.getTowerAt(col, row);
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

  tryPlaceTower(typeName, col, row) {
    const def = TOWERS[typeName];
    if (this.cash < def.cost) return;

    // Check placement limit
    if (def.base.placementLimit) {
      if (this.towerManager.getPlacementCount(typeName) >= def.base.placementLimit) return;
    }

    if (!canPlaceTower(this.selectedMode, col, row, def.placement, this.towerManager.towers)) return;

    this.cash -= def.cost;
    this.towerManager.placeTower(typeName, col, row);
    this.sound.play('place');

    // Keep placing if shift held? For now just deselect
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

    // Reset managers
    this.towerManager = new TowerManager();
    this.enemyManager = new EnemyManager();
    this.projectileManager = new ProjectileManager();

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

    // Update enemies
    this.enemyManager.update(dt);

    // Check enemies that reached end
    const reached = this.enemyManager.getReachedEnd();
    for (const e of reached) {
      const dmg = e.boss ? 10 : 1;
      this.baseHP -= dmg;
    }

    // Track kills for cash (enemies die in takeDamage, we detect here)
    // Actually cash comes from wave bonuses and farms, not individual kills
    // But let's give small cash per kill for fun
    const alive = this.enemyManager.getAliveEnemies();

    // Update towers
    this.towerManager.update(dt, this.enemyManager.enemies, this.projectileManager);

    // Update projectiles
    this.projectileManager.update(dt, this.enemyManager.enemies);

    // Check wave complete
    if (this.waveInProgress && this.enemyManager.isWaveComplete()) {
      this.waveInProgress = false;
      // Wave bonus
      const bonus = getWaveBonus(this.selectedMode, this.currentWave - 1);
      this.cash += bonus;
      // Farm income
      this.cash += this.towerManager.getIncome();

      // Check victory
      if (this.currentWave >= this.totalWaves) {
        this.gameOver = true;
        setTimeout(() => this.ui.showGameOver(true), 1000);
        return;
      }
    }

    // Check game over
    if (this.baseHP <= 0) {
      this.baseHP = 0;
      this.gameOver = true;
      setTimeout(() => this.ui.showGameOver(false), 500);
    }

    this.ui.updateHUD();
  }

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    if (!this.gameStarted) return;

    // Draw map
    drawMap(ctx, this.selectedMode, this.canvas.width, this.canvas.height);

    // Draw placement preview
    if (this.ui.placingTower) {
      const { col, row } = this.ui.canvasToGrid(this.mouseX, this.mouseY);
      const def = TOWERS[this.ui.placingTower];
      const canPlace = canPlaceTower(this.selectedMode, col, row, def.placement, this.towerManager.towers);

      // Range preview
      const range = def.base.range * 16;
      const cx = col * TILE_SIZE + TILE_SIZE / 2;
      const cy = row * TILE_SIZE + TILE_SIZE / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, range, 0, Math.PI * 2);
      ctx.fillStyle = canPlace ? 'rgba(100,255,100,0.1)' : 'rgba(255,100,100,0.1)';
      ctx.fill();
      ctx.strokeStyle = canPlace ? 'rgba(100,255,100,0.3)' : 'rgba(255,100,100,0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Tile highlight
      ctx.fillStyle = canPlace ? 'rgba(100,255,100,0.3)' : 'rgba(255,100,100,0.3)';
      ctx.fillRect(col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE);

      // Ghost tower image
      const img = this.towerManager.towerImages[this.ui.placingTower];
      if (img && img.complete) {
        ctx.globalAlpha = 0.6;
        ctx.drawImage(img, col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        ctx.globalAlpha = 1;
      }
    }

    // Draw towers
    this.towerManager.draw(ctx);

    // Draw enemies
    this.enemyManager.draw(ctx);

    // Draw projectiles and particles
    this.projectileManager.draw(ctx);
  }

  loop(time) {
    const dt = Math.min((time - this.lastTime) / 1000, 0.05); // cap at 50ms
    this.lastTime = time;

    this.update(dt);
    this.render();

    requestAnimationFrame(t => this.loop(t));
  }
}

// Initialize
const game = new Game();
