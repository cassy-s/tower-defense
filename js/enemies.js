// ============================================================
// ENEMIES - Spawning, movement along path, modifiers
// ============================================================
const ENEMY_BASE_SPEED = 60; // pixels per second at speed 1.0

class Enemy {
  constructor(typeName, mods = [], hpScale = 1) {
    const def = ENEMIES[typeName];
    if (!def) { console.error("Unknown enemy type:", typeName); return; }

    this.typeName = typeName;
    this.name = def.name;
    this.maxHP = Math.round(def.hp * hpScale);
    this.hp = this.maxHP;
    this.speed = def.speed;
    this.baseSpeed = def.speed;
    this.color = def.color;
    this.size = def.size || 1;
    this.hidden = def.hidden || false;
    this.armor = def.armor || 0;
    this.burnImmune = def.burnImmune || false;
    this.boss = def.boss || false;
    this.spawnsOnDeath = def.spawnsOnDeath || null;
    this.mods = mods || [];

    // Position along path
    this.pathIndex = 0; // current segment
    this.x = 0;
    this.y = 0;
    this.progress = 0; // 0-1 along total path
    this.alive = true;
    this.reachedEnd = false;
    this.distanceTraveled = 0;

    // Status effects
    this.burnTimer = 0;
    this.burnDamage = 0;
    this.burnTickTimer = 0;
    this.slowTimer = 0;
    this.slowFactor = 1;
    this.stunTimer = 0;
    this.healthRegen = false;

    // Apply modifiers
    for (const mod of this.mods) {
      switch (mod) {
        case 'bloated':
          this.maxHP = Math.round(this.maxHP * 2);
          this.hp = this.maxHP;
          this.speed *= 0.8;
          this.baseSpeed *= 0.8;
          this.size *= 1.15;
          break;
        case 'nimble':
          this.maxHP = Math.round(this.maxHP * 0.7);
          this.hp = this.maxHP;
          this.speed *= 1.5;
          this.baseSpeed *= 1.5;
          break;
        case 'hidden':
          this.hidden = true;
          break;
        case 'healthRegen':
          this.healthRegen = true;
          break;
        case 'freezeImmune':
          this.freezeImmune = true;
          break;
      }
    }

    // Visual
    this.radius = 10 * this.size;
    this.flashTimer = 0;
  }

  takeDamage(amount, options = {}) {
    if (!this.alive) return;

    // Armor reduces damage
    let dmg = amount * (1 - this.armor);
    if (options.defenseMelt) {
      this.armor = Math.max(0, this.armor - options.defenseMelt);
    }

    this.hp -= dmg;
    this.flashTimer = 0.1;

    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
    }
  }

  applyBurn(damage, duration) {
    if (this.burnImmune) return;
    this.burnDamage = Math.max(this.burnDamage, damage);
    this.burnTimer = Math.max(this.burnTimer, duration);
  }

  applySlow(factor, duration) {
    if (this.freezeImmune) return;
    this.slowFactor = Math.min(this.slowFactor, factor);
    this.slowTimer = Math.max(this.slowTimer, duration);
  }

  update(dt, path) {
    if (!this.alive || this.reachedEnd) return;

    // Stun
    if (this.stunTimer > 0) {
      this.stunTimer -= dt;
      return;
    }

    // Burn tick
    if (this.burnTimer > 0) {
      this.burnTimer -= dt;
      this.burnTickTimer -= dt;
      if (this.burnTickTimer <= 0) {
        this.burnTickTimer = 0.5;
        this.takeDamage(this.burnDamage);
      }
    }

    // Health regen
    if (this.healthRegen && this.hp < this.maxHP) {
      this.hp = Math.min(this.maxHP, this.hp + this.maxHP * 0.01 * dt);
    }

    // Slow
    let currentSpeed = this.baseSpeed;
    if (this.slowTimer > 0) {
      this.slowTimer -= dt;
      currentSpeed *= this.slowFactor;
    } else {
      this.slowFactor = 1;
    }

    // Move along path
    const moveAmount = ENEMY_BASE_SPEED * currentSpeed * dt;
    this.distanceTraveled += moveAmount;
    let remaining = moveAmount;

    while (remaining > 0 && this.pathIndex < path.length - 1) {
      const a = path[this.pathIndex];
      const b = path[this.pathIndex + 1];
      const dx = b.x - a.x, dy = b.y - a.y;
      const segLen = Math.sqrt(dx * dx + dy * dy);

      const curDx = b.x - this.x, curDy = b.y - this.y;
      const distToNext = Math.sqrt(curDx * curDx + curDy * curDy);

      if (remaining >= distToNext) {
        remaining -= distToNext;
        this.x = b.x;
        this.y = b.y;
        this.pathIndex++;
      } else {
        const ratio = remaining / distToNext;
        this.x += curDx * ratio;
        this.y += curDy * ratio;
        remaining = 0;
      }
    }

    if (this.pathIndex >= path.length - 1) {
      this.reachedEnd = true;
    }

    // Flash timer
    if (this.flashTimer > 0) this.flashTimer -= dt;
  }

  draw(ctx, canDetectHidden) {
    if (!this.alive) return;
    if (this.hidden && !canDetectHidden) return;

    ctx.save();
    ctx.globalAlpha = this.hidden ? 0.4 : 1.0;

    // Body
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = this.flashTimer > 0 ? '#ffffff' : this.color;
    ctx.fill();

    // Boss outline
    if (this.boss) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#ffcc00';
      ctx.stroke();
    }

    // Burn effect
    if (this.burnTimer > 0) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius + 3, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,100,0,0.6)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // HP bar
    if (this.hp < this.maxHP) {
      const barW = this.radius * 2.5;
      const barH = 4;
      const barX = this.x - barW / 2;
      const barY = this.y - this.radius - 8;
      ctx.fillStyle = '#333';
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = this.hp / this.maxHP > 0.5 ? '#4c4' : this.hp / this.maxHP > 0.25 ? '#cc4' : '#c44';
      ctx.fillRect(barX, barY, barW * (this.hp / this.maxHP), barH);
    }

    ctx.restore();
  }
}

class EnemyManager {
  constructor() {
    this.enemies = [];
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.spawnInterval = 0.5; // seconds between spawns
    this.waveActive = false;
  }

  startWave(waveData, hpScale, path) {
    this.spawnQueue = [];
    for (const group of waveData) {
      for (let i = 0; i < group.count; i++) {
        this.spawnQueue.push({ type: group.type, mods: group.mods || [] });
      }
    }
    this.spawnTimer = 0;
    this.waveActive = true;
    this.path = path;
    this.hpScale = hpScale;
  }

  update(dt) {
    // Spawn enemies
    if (this.spawnQueue.length > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        const info = this.spawnQueue.shift();
        const enemy = new Enemy(info.type, info.mods, this.hpScale);
        enemy.x = this.path[0].x;
        enemy.y = this.path[0].y;
        this.enemies.push(enemy);
        this.spawnTimer = this.spawnInterval;
      }
    }

    // Update all enemies
    for (const e of this.enemies) {
      e.update(dt, this.path);
    }

    // Check for dead enemies that spawn on death
    const newEnemies = [];
    for (const e of this.enemies) {
      if (!e.alive && e.spawnsOnDeath && !e._spawned) {
        e._spawned = true;
        for (let i = 0; i < e.spawnsOnDeath.count; i++) {
          const spawn = new Enemy(e.spawnsOnDeath.type, [], this.hpScale);
          spawn.x = e.x + (Math.random() - 0.5) * 20;
          spawn.y = e.y + (Math.random() - 0.5) * 20;
          spawn.pathIndex = e.pathIndex;
          newEnemies.push(spawn);
        }
      }
    }
    this.enemies.push(...newEnemies);

    // Remove dead enemies (after a delay for particles)
    this.enemies = this.enemies.filter(e => e.alive || e.reachedEnd);

    // Check wave completion
    if (this.waveActive && this.spawnQueue.length === 0 && this.enemies.every(e => !e.alive || e.reachedEnd)) {
      this.waveActive = false;
    }
  }

  isWaveComplete() {
    return !this.waveActive && this.spawnQueue.length === 0 && this.enemies.filter(e => e.alive && !e.reachedEnd).length === 0;
  }

  getReachedEnd() {
    const reached = this.enemies.filter(e => e.reachedEnd);
    this.enemies = this.enemies.filter(e => !e.reachedEnd);
    return reached;
  }

  draw(ctx) {
    for (const e of this.enemies) {
      e.draw(ctx, true); // always draw for now; towers handle detection
    }
  }

  getAliveEnemies() {
    return this.enemies.filter(e => e.alive && !e.reachedEnd);
  }
}
