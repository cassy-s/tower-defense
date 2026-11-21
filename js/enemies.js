// ============================================================
// ENEMIES - Spawning, movement along path, cash drops, death anim
// ============================================================
const ENEMY_BASE_SPEED = 60;

class Enemy {
  constructor(typeName, mods, hpScale) {
    const def = ENEMIES[typeName];
    if (!def) return;

    this.typeName = typeName;
    this.name = def.name;
    this.maxHP = Math.round(def.hp * (hpScale || 1));
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

    this.pathIndex = 0;
    this.x = 0;
    this.y = 0;
    this.alive = true;
    this.reachedEnd = false;
    this.distanceTraveled = 0;
    this.dying = false;
    this.deathTimer = 0;

    this.burnTimer = 0;
    this.burnDamage = 0;
    this.burnTickTimer = 0;
    this.slowTimer = 0;
    this.slowFactor = 1;
    this.stunTimer = 0;
    this.healthRegen = false;
    this.flashTimer = 0;

    // Animation state
    this.walkPhase = 0;
    this.heading = 0;
    this.facingRight = true;
    this.prevX = 0;
    this.prevY = 0;
    this.deathArmFlare = 0;

    // Cash drop tracking: 20 thresholds at 5% each
    this.cashThresholdsPaid = 0;

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

    this.radius = 16 * this.size;
  }

  takeDamage(amount, options) {
    if (!this.alive || this.dying) return;

    let dmg = amount * (1 - this.armor);
    if (options && options.defenseMelt) {
      this.armor = Math.max(0, this.armor - options.defenseMelt);
    }

    const oldHp = this.hp;
    this.hp -= dmg;
    this.flashTimer = 0.05;

    // Cash drop: check 5% thresholds crossed
    if (this.maxHP > 0 && window.game) {
      const oldThreshold = Math.floor((1 - oldHp / this.maxHP) * 20);
      const newPct = Math.max(0, this.hp) / this.maxHP;
      const newThreshold = Math.min(20, Math.floor((1 - newPct) * 20));
      if (newThreshold > this.cashThresholdsPaid) {
        const crossed = newThreshold - this.cashThresholdsPaid;
        const cashPerThreshold = this.maxHP * 0.05;
        const totalCash = Math.max(1, Math.floor(crossed * cashPerThreshold));
        this.cashThresholdsPaid = newThreshold;
        window.game.cash += totalCash;
        window.game.effectsManager.addFloatingText(
          this.x, this.y - this.radius - 5,
          '+$' + totalCash, '#44ff44'
        );
      }
    }

    if (this.hp <= 0) {
      this.hp = 0;
      this.dying = true;
      this.deathTimer = 0.3;
      if (window.game) window.game.sound.play('death');
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
    // Death animation
    if (this.dying) {
      this.deathTimer -= dt;
      this.deathArmFlare = Math.min(1, this.deathArmFlare + dt * 6);
      if (this.deathTimer <= 0) {
        this.alive = false;
        this.dying = false;
      }
      return;
    }

    if (!this.alive || this.reachedEnd) return;

    if (this.stunTimer > 0) { this.stunTimer -= dt; return; }

    if (this.burnTimer > 0) {
      this.burnTimer -= dt;
      this.burnTickTimer -= dt;
      if (this.burnTickTimer <= 0) {
        this.burnTickTimer = 0.5;
        this.takeDamage(this.burnDamage);
      }
    }

    if (this.healthRegen && this.hp < this.maxHP) {
      this.hp = Math.min(this.maxHP, this.hp + this.maxHP * 0.01 * dt);
    }

    var currentSpeed = this.baseSpeed;
    if (this.slowTimer > 0) {
      this.slowTimer -= dt;
      currentSpeed *= this.slowFactor;
    } else {
      this.slowFactor = 1;
    }

    this.prevX = this.x;
    this.prevY = this.y;

    var moveAmount = ENEMY_BASE_SPEED * currentSpeed * dt;
    this.distanceTraveled += moveAmount;
    var remaining = moveAmount;

    while (remaining > 0 && this.pathIndex < path.length - 1) {
      var b = path[this.pathIndex + 1];
      var curDx = b.x - this.x, curDy = b.y - this.y;
      var distToNext = Math.sqrt(curDx * curDx + curDy * curDy);

      if (remaining >= distToNext) {
        remaining -= distToNext;
        this.x = b.x;
        this.y = b.y;
        this.pathIndex++;
      } else {
        var ratio = remaining / distToNext;
        this.x += curDx * ratio;
        this.y += curDy * ratio;
        remaining = 0;
      }
    }

    // Calculate heading from movement direction
    var moveDx = this.x - this.prevX;
    var moveDy = this.y - this.prevY;
    if (Math.abs(moveDx) > 0.01 || Math.abs(moveDy) > 0.01) {
      this.heading = Math.atan2(moveDy, moveDx);
      if (Math.abs(moveDx) > 0.5) {
        this.facingRight = moveDx > 0;
      }
    }

    // Advance walk cycle based on distance traveled
    var swingSpeed = this.boss ? 1.5 : 3;
    this.walkPhase = (this.distanceTraveled * swingSpeed * 0.05) % (Math.PI * 2);

    if (this.pathIndex >= path.length - 1) this.reachedEnd = true;
    if (this.flashTimer > 0) this.flashTimer -= dt;
  }

  draw(ctx) {
    if (!this.alive && !this.dying) return;
    if (this.hidden && !this._drawForced) return;

    ctx.save();

    if (this.dying) {
      var deathPct = this.deathTimer / 0.3;
      ctx.globalAlpha = deathPct * (this.hidden ? 0.4 : 1.0);
      ctx.translate(this.x, this.y);
      ctx.scale(deathPct, deathPct);
      ctx.translate(-this.x, -this.y);
    } else {
      ctx.globalAlpha = this.hidden ? 0.4 : 1.0;
    }

    var r = this.radius;
    var baseColor = this.flashTimer > 0 ? '#ffffff' : this.color;

    // Animation values
    var armSwing = Math.sin(this.walkPhase) * 0.5;
    var legSwing = Math.sin(this.walkPhase) * 0.4;
    var bodyBob = Math.abs(Math.sin(this.walkPhase)) * r * 0.06;

    // Death: arms flare outward
    if (this.dying) {
      armSwing = this.deathArmFlare * 1.4;
      legSwing = 0;
      bodyBob = 0;
    }

    var cx = this.x;
    var cy = this.y - bodyBob;

    // Darken helper
    var darker = function(hex, amt) {
      var num = parseInt(hex.slice(1), 16);
      var R = Math.max(0, (num >> 16) - amt);
      var G = Math.max(0, ((num >> 8) & 0xff) - amt);
      var B = Math.max(0, (num & 0xff) - amt);
      return '#' + ((1 << 24) + (R << 16) + (G << 8) + B).toString(16).slice(1);
    };
    var lighter = function(hex, amt) {
      var num = parseInt(hex.slice(1), 16);
      var R = Math.min(255, (num >> 16) + amt);
      var G = Math.min(255, ((num >> 8) & 0xff) + amt);
      var B = Math.min(255, (num & 0xff) + amt);
      return '#' + ((1 << 24) + (R << 16) + (G << 8) + B).toString(16).slice(1);
    };

    var bodyW = r * 1.2;
    var bodyH = r * 1.4;
    var headR = r * 0.5;

    // Determine facing direction (with deadband to prevent flicker)
    var facingScale = this.facingRight ? 1 : -1;

    // Apply facing by mirroring around center
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(facingScale, 1);
    ctx.translate(-cx, -cy);

    // Shadow (ground level, not affected by shake)
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + bodyH * 0.5, bodyW * 0.7, bodyH * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();

    // Boss ground shake - only affects body/limbs, not shadow or health bar
    if (this.boss && !this.dying) {
      var shakeAmt = 2.0;
      var shakeX = Math.sin(this.walkPhase * 2.3) * shakeAmt;
      var shakeY = Math.abs(Math.sin(this.walkPhase * 2.3)) * shakeAmt * 0.5;
      ctx.translate(shakeX, shakeY);
    }

    // --- Legs (behind body) ---
    var legW = r * 0.28;
    var legH = r * 0.55;
    var legBaseY = cy + bodyH * 0.35;
    var legSpacing = bodyW * 0.22;
    var legColor = darker(baseColor, 45);

    // Left leg - swings opposite to right
    ctx.save();
    ctx.translate(cx - legSpacing, legBaseY);
    ctx.rotate(-legSwing);
    ctx.fillStyle = legColor;
    // Blocky leg with slight rounded corners
    var legRound = 1.5;
    ctx.beginPath();
    ctx.moveTo(-legW * 0.5 + legRound, 0);
    ctx.lineTo(legW * 0.5 - legRound, 0);
    ctx.quadraticCurveTo(legW * 0.5, 0, legW * 0.5, legRound);
    ctx.lineTo(legW * 0.5, legH - legRound);
    ctx.quadraticCurveTo(legW * 0.5, legH, legW * 0.5 - legRound, legH);
    ctx.lineTo(-legW * 0.5 + legRound, legH);
    ctx.quadraticCurveTo(-legW * 0.5, legH, -legW * 0.5, legH - legRound);
    ctx.lineTo(-legW * 0.5, legRound);
    ctx.quadraticCurveTo(-legW * 0.5, 0, -legW * 0.5 + legRound, 0);
    ctx.fill();
    ctx.restore();

    // Right leg
    ctx.save();
    ctx.translate(cx + legSpacing, legBaseY);
    ctx.rotate(legSwing);
    ctx.fillStyle = legColor;
    ctx.beginPath();
    ctx.moveTo(-legW * 0.5 + legRound, 0);
    ctx.lineTo(legW * 0.5 - legRound, 0);
    ctx.quadraticCurveTo(legW * 0.5, 0, legW * 0.5, legRound);
    ctx.lineTo(legW * 0.5, legH - legRound);
    ctx.quadraticCurveTo(legW * 0.5, legH, legW * 0.5 - legRound, legH);
    ctx.lineTo(-legW * 0.5 + legRound, legH);
    ctx.quadraticCurveTo(-legW * 0.5, legH, -legW * 0.5, legH - legRound);
    ctx.lineTo(-legW * 0.5, legRound);
    ctx.quadraticCurveTo(-legW * 0.5, 0, -legW * 0.5 + legRound, 0);
    ctx.fill();
    ctx.restore();

    // --- Arms (animated swing, drawn behind and in front of body) ---
    var armW = r * 0.28;
    var armH = r * 0.65;
    var armAttachY = cy - bodyH * 0.2;
    var armColor = darker(baseColor, 30);

    // Back arm (the one swinging backward in walk cycle)
    ctx.save();
    ctx.translate(cx - bodyW * 0.55, armAttachY);
    if (this.dying) {
      ctx.rotate(-(armSwing + 0.6));
    } else {
      ctx.rotate(armSwing);
    }
    ctx.fillStyle = armColor;
    ctx.beginPath();
    ctx.moveTo(-armW * 0.5 + 1.5, 0);
    ctx.lineTo(armW * 0.5 - 1.5, 0);
    ctx.quadraticCurveTo(armW * 0.5, 0, armW * 0.5, 1.5);
    ctx.lineTo(armW * 0.5, armH - 1.5);
    ctx.quadraticCurveTo(armW * 0.5, armH, armW * 0.5 - 1.5, armH);
    ctx.lineTo(-armW * 0.5 + 1.5, armH);
    ctx.quadraticCurveTo(-armW * 0.5, armH, -armW * 0.5, armH - 1.5);
    ctx.lineTo(-armW * 0.5, 1.5);
    ctx.quadraticCurveTo(-armW * 0.5, 0, -armW * 0.5 + 1.5, 0);
    ctx.fill();
    ctx.restore();

    // --- Body (blocky rectangle) ---
    ctx.fillStyle = baseColor;
    ctx.fillRect(cx - bodyW * 0.5, cy - bodyH * 0.4, bodyW, bodyH * 0.8);
    // Body shading (bottom half darker)
    ctx.fillStyle = darker(baseColor, 20);
    ctx.fillRect(cx - bodyW * 0.5, cy + bodyH * 0.1, bodyW, bodyH * 0.3);

    // Front arm (swings opposite direction)
    ctx.save();
    ctx.translate(cx + bodyW * 0.55, armAttachY);
    if (this.dying) {
      ctx.rotate(armSwing + 0.6);
    } else {
      ctx.rotate(-armSwing);
    }

    ctx.fillStyle = armColor;
    ctx.beginPath();
    ctx.moveTo(-armW * 0.5 + 1.5, 0);
    ctx.lineTo(armW * 0.5 - 1.5, 0);
    ctx.quadraticCurveTo(armW * 0.5, 0, armW * 0.5, 1.5);
    ctx.lineTo(armW * 0.5, armH - 1.5);
    ctx.quadraticCurveTo(armW * 0.5, armH, armW * 0.5 - 1.5, armH);
    ctx.lineTo(-armW * 0.5 + 1.5, armH);
    ctx.quadraticCurveTo(-armW * 0.5, armH, -armW * 0.5, armH - 1.5);
    ctx.lineTo(-armW * 0.5, 1.5);
    ctx.quadraticCurveTo(-armW * 0.5, 0, -armW * 0.5 + 1.5, 0);
    ctx.fill();
    ctx.restore();

    // --- Head (square with rounded corners for Roblox look) ---
    var hx = cx - headR;
    var hy = cy - bodyH * 0.4 - headR * 1.3;
    ctx.fillStyle = lighter(baseColor, 15);
    ctx.beginPath();
    ctx.moveTo(hx + 2, hy);
    ctx.lineTo(hx + headR * 2 - 2, hy);
    ctx.quadraticCurveTo(hx + headR * 2, hy, hx + headR * 2, hy + 2);
    ctx.lineTo(hx + headR * 2, hy + headR * 2 - 2);
    ctx.quadraticCurveTo(hx + headR * 2, hy + headR * 2, hx + headR * 2 - 2, hy + headR * 2);
    ctx.lineTo(hx + 2, hy + headR * 2);
    ctx.quadraticCurveTo(hx, hy + headR * 2, hx, hy + headR * 2 - 2);
    ctx.lineTo(hx, hy + 2);
    ctx.quadraticCurveTo(hx, hy, hx + 2, hy);
    ctx.fill();

    // Eyes (two dark dots) - always face forward (right side of face)
    ctx.fillStyle = '#111';
    ctx.fillRect(hx + headR * 1.0, hy + headR * 0.55, headR * 0.3, headR * 0.35);
    ctx.fillRect(hx + headR * 1.0, hy + headR * 1.1, headR * 0.3, headR * 0.35);
    // Eye highlight
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(hx + headR * 1.08, hy + headR * 0.6, headR * 0.12, headR * 0.12);

    // Armor plates for armored types
    if (this.armor > 0) {
      ctx.fillStyle = 'rgba(180,180,200,0.6)';
      ctx.fillRect(cx - bodyW * 0.45, cy - bodyH * 0.35, bodyW * 0.9, bodyH * 0.3);
      ctx.strokeStyle = '#888';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - bodyW * 0.45, cy - bodyH * 0.35, bodyW * 0.9, bodyH * 0.3);
    }

    // Boss crown
    if (this.boss) {
      ctx.fillStyle = '#ffcc00';
      var crownY = hy - 4;
      ctx.beginPath();
      ctx.moveTo(hx - 1, crownY + 5);
      ctx.lineTo(hx, crownY);
      ctx.lineTo(hx + headR * 0.5, crownY + 3);
      ctx.lineTo(hx + headR, crownY - 1);
      ctx.lineTo(hx + headR * 1.5, crownY + 3);
      ctx.lineTo(hx + headR * 2, crownY);
      ctx.lineTo(hx + headR * 2 + 1, crownY + 5);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#cc9900';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    // Restore facing transform
    ctx.restore();

    // Burn effect (not affected by facing flip)
    if (this.burnTimer > 0 && !this.dying) {
      ctx.strokeStyle = 'rgba(255,100,0,0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, bodyW * 0.9, bodyH * 0.7, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Burn-immune glow (molten types)
    if (this.burnImmune) {
      ctx.fillStyle = 'rgba(255,80,0,0.15)';
      ctx.beginPath();
      ctx.ellipse(cx, cy, bodyW * 0.8, bodyH * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Health bar (drawn after facing restore, so boss shake is already undone)
    if (!this.dying && this.hp < this.maxHP) {
      var barW = r * 2.5;
      var barH = 3;
      var barX = cx - barW / 2;
      var headTop = cy - bodyH * 0.4 - headR * 1.3;
      var barY = headTop - (this.boss ? 10 : 5);
      ctx.fillStyle = '#222';
      ctx.fillRect(barX - 0.5, barY - 0.5, barW + 1, barH + 1);
      ctx.fillStyle = '#333';
      ctx.fillRect(barX, barY, barW, barH);
      var hpPct = this.hp / this.maxHP;
      ctx.fillStyle = hpPct > 0.5 ? '#4c4' : hpPct > 0.25 ? '#cc4' : '#c44';
      ctx.fillRect(barX, barY, barW * hpPct, barH);
    }

    ctx.restore();
  }
}

class EnemyManager {
  constructor() {
    this.enemies = [];
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.spawnInterval = 0.5;
    this.waveActive = false;
    this.path = null;
    this.hpScale = 1;
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

    for (const e of this.enemies) e.update(dt, this.path);

    const newEnemies = [];
    for (const e of this.enemies) {
      if (e.dying && !e._spawned && e.spawnsOnDeath) {
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

    this.enemies = this.enemies.filter(e => e.alive || e.dying || e.reachedEnd);

    if (this.waveActive && this.spawnQueue.length === 0 &&
        this.enemies.every(e => (!e.alive && !e.dying) || e.reachedEnd)) {
      this.waveActive = false;
    }
  }

  isWaveComplete() {
    return !this.waveActive && this.spawnQueue.length === 0 &&
           this.enemies.filter(e => (e.alive || e.dying) && !e.reachedEnd).length === 0;
  }

  getReachedEnd() {
    const reached = this.enemies.filter(e => e.reachedEnd);
    this.enemies = this.enemies.filter(e => !e.reachedEnd);
    return reached;
  }

  getTargetableEnemies() {
    return this.enemies.filter(e => e.alive && !e.dying && !e.reachedEnd);
  }

  draw(ctx) {
    for (const e of this.enemies) {
      e._drawForced = true;
      e.draw(ctx);
      e._drawForced = false;
    }
  }
}
