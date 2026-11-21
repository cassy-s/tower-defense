// ============================================================
// TOWERS - Free placement, hitscan, targeting, upgrading
// ============================================================

class Tower {
  constructor(typeName, px, py) {
    const def = TOWERS[typeName];
    this.typeName = typeName;
    this.name = def.name;
    this.x = px;
    this.y = py;
    this.hitboxRadius = def.hitboxRadius || 20;
    this.baseCost = def.cost;
    this.totalSpent = def.cost;
    this.upgradeLevel = 0;
    this.placement = def.placement;
    this.image = null;

    this.stats = { ...def.base };

    this.abilityActive = false;
    this.abilityCooldownTimer = 0;
    this.abilityActiveTimer = 0;

    this.fireTimer = 0;
    this.burstRemaining = 0;
    this.burstTimer = 0;
    this.revUpTimer = 0;
    this.isRevved = false;
    this.target = null;
    this.angle = 0;
    this.targetAngle = 0;

    this.chargeTimer = 0;
    this.isCharging = false;
    this.isFiring = false;
    this.beamCooldownTimer = 0;
    this.overchargeAccum = 0;
    this.beamTarget = null;

    this.selected = false;

    // Shooting animation state
    this.recoilTimer = 0;
    this.recoilAmount = 0;
    this.fireScaleTimer = 0;
  }

  getRange() {
    return this.stats.range * RANGE_SCALE;
  }

  canDetect(enemy) {
    return !(enemy.hidden && !this.stats.detectHidden);
  }

  findTarget(enemies) {
    const range = this.getRange();
    let best = null;
    let bestProgress = -1;
    for (const e of enemies) {
      if (!e.alive || e.dying || e.reachedEnd) continue;
      if (!this.canDetect(e)) continue;
      const dx = e.x - this.x, dy = e.y - this.y;
      if (dx * dx + dy * dy <= range * range) {
        if (e.distanceTraveled > bestProgress) {
          bestProgress = e.distanceTraveled;
          best = e;
        }
      }
    }
    return best;
  }

  smoothRotate(dt) {
    let diff = this.targetAngle - this.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const rotSpeed = 10;
    if (Math.abs(diff) < rotSpeed * dt) {
      this.angle = this.targetAngle;
    } else {
      this.angle += Math.sign(diff) * rotSpeed * dt;
    }
  }

  update(dt, enemies, effectsManager, commanderBuffs) {
    var s = this.stats;

    // Decay recoil animation
    if (this.recoilTimer > 0) {
      this.recoilTimer -= dt;
      if (this.recoilTimer <= 0) {
        this.recoilTimer = 0;
        this.recoilAmount = 0;
      }
    }
    if (this.fireScaleTimer > 0) {
      this.fireScaleTimer -= dt;
      if (this.fireScaleTimer <= 0) this.fireScaleTimer = 0;
    }

    var firerateMult = 1;
    for (const buff of commanderBuffs) {
      const dx = this.x - buff.x, dy = this.y - buff.y;
      if (dx * dx + dy * dy <= buff.range * buff.range) {
        firerateMult *= (1 - buff.amount);
      }
    }

    if (s.targetType === "none" && !s.hasAbility) return;

    if (s.hasAbility) {
      if (this.abilityCooldownTimer > 0) this.abilityCooldownTimer -= dt;
      if (this.abilityActiveTimer > 0) {
        this.abilityActiveTimer -= dt;
        if (this.abilityActiveTimer <= 0) this.abilityActive = false;
      }
    }

    if (s.targetType === "beam") {
      this.updateBeam(dt, enemies, effectsManager, firerateMult);
      return;
    }

    if (s.targetType === "burst") {
      this.updateBurst(dt, enemies, effectsManager, firerateMult);
      return;
    }

    this.fireTimer -= dt;
    const target = this.findTarget(enemies);
    if (!target) {
      if (s.revUpTime) { this.isRevved = false; this.revUpTimer = 0; }
      return;
    }

    this.target = target;
    this.targetAngle = Math.atan2(target.y - this.y, target.x - this.x);
    this.smoothRotate(dt);

    if (s.revUpTime && !this.isRevved) {
      this.revUpTimer += dt;
      if (this.revUpTimer >= s.revUpTime) this.isRevved = true;
      else return;
    }

    if (this.fireTimer <= 0) {
      this.hitscan(target, effectsManager);
      this.fireTimer = s.firerate * firerateMult;
    }
  }

  updateBurst(dt, enemies, effectsManager, firerateMult) {
    const s = this.stats;
    const target = this.findTarget(enemies);

    if (this.burstRemaining > 0) {
      this.burstTimer -= dt;
      if (this.burstTimer <= 0) {
        const t = this.findTarget(enemies);
        if (t) {
          this.target = t;
          this.targetAngle = Math.atan2(t.y - this.y, t.x - this.x);
          this.smoothRotate(dt);
          this.hitscan(t, effectsManager);
        }
        this.burstRemaining--;
        this.burstTimer = s.firerate * firerateMult;
      }
      return;
    }

    if (!target) return;
    this.target = target;
    this.targetAngle = Math.atan2(target.y - this.y, target.x - this.x);
    this.smoothRotate(dt);

    this.fireTimer -= dt;
    if (this.fireTimer <= 0) {
      this.hitscan(target, effectsManager);
      this.burstRemaining = s.burstCount - 1;
      this.burstTimer = s.firerate * firerateMult;
      this.fireTimer = (s.burstCooldown || 0.5) * firerateMult;
    }
  }

  updateBeam(dt, enemies, effectsManager, firerateMult) {
    const s = this.stats;

    if (this.beamCooldownTimer > 0) {
      this.beamCooldownTimer -= dt;
      this.isFiring = false;
      this.isCharging = false;
      return;
    }

    const target = this.findTarget(enemies);
    if (!target) {
      this.isCharging = false;
      this.chargeTimer = 0;
      this.isFiring = false;
      return;
    }

    this.target = target;
    this.beamTarget = target;
    this.targetAngle = Math.atan2(target.y - this.y, target.x - this.x);
    this.smoothRotate(dt);

    if (!this.isFiring) {
      this.isCharging = true;
      this.chargeTimer += dt;
      if (this.chargeTimer >= s.chargeUpTime) {
        this.isFiring = true;
        this.overchargeAccum = 0;
        this.chargeTimer = 0;
      }
      return;
    }

    this.fireTimer -= dt;
    if (this.fireTimer <= 0) {
      target.takeDamage(s.damage);
      this.overchargeAccum += s.damage;
      this.fireTimer = s.firerate * firerateMult;
      if (this.overchargeAccum >= s.overcharge) {
        this.isFiring = false;
        this.isCharging = false;
        this.beamCooldownTimer = s.beamCooldown || 2.5;
        this.chargeTimer = 0;
      }
    }
  }

  hitscan(target, effectsManager) {
    var s = this.stats;
    var color = this.getTracerColor();

    // Trigger recoil animation
    this.recoilTimer = 0.12;
    this.recoilAmount = 5;
    this.fireScaleTimer = 0.08;

    effectsManager.addMuzzleFlash(this.x, this.y, color);

    if (s.targetType === "splash") {
      // Hit target + splash
      const splashR = (s.splashRadius || 0) * RANGE_SCALE;
      let hits = 0;
      const targetable = window.game ? window.game.enemyManager.getTargetableEnemies() : [target];
      for (const e of targetable) {
        const dx = e.x - target.x, dy = e.y - target.y;
        if (dx * dx + dy * dy <= splashR * splashR) {
          e.takeDamage(s.damage, { defenseMelt: s.defenseMelt || 0 });
          if (s.burnDamage) e.applyBurn(s.burnDamage, s.burnDuration || 0);
          hits++;
          if (hits >= (s.maxHits || 999)) break;
        }
      }
      effectsManager.addTracer(this.x, this.y, target.x, target.y, color);
      effectsManager.addSplash(target.x, target.y, splashR, color);
    } else if (s.targetType === "pierce") {
      // Hit up to maxHits enemies along a line through target
      const dx = target.x - this.x, dy = target.y - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const dirX = dist > 0 ? dx / dist : 1;
      const dirY = dist > 0 ? dy / dist : 0;
      const range = this.getRange() * 1.5;
      const endX = this.x + dirX * range;
      const endY = this.y + dirY * range;

      let hits = 0;
      const maxHits = s.maxHits || 3;
      const targetable = window.game ? window.game.enemyManager.getTargetableEnemies() : [target];
      // Sort by distance from tower along the fire line
      const lined = [];
      for (const e of targetable) {
        if (!this.canDetect(e)) continue;
        // Distance from enemy to the fire line
        const ex = e.x - this.x, ey = e.y - this.y;
        const proj = ex * dirX + ey * dirY;
        if (proj < 0 || proj > range) continue;
        const perpX = ex - proj * dirX, perpY = ey - proj * dirY;
        const perpDist = Math.sqrt(perpX * perpX + perpY * perpY);
        if (perpDist <= e.radius + 10) {
          lined.push({ enemy: e, proj: proj });
        }
      }
      lined.sort((a, b) => a.proj - b.proj);
      for (const { enemy } of lined) {
        enemy.takeDamage(s.damage, { defenseMelt: s.defenseMelt || 0 });
        if (s.burnDamage) enemy.applyBurn(s.burnDamage, s.burnDuration || 0);
        effectsManager.addImpact(enemy.x, enemy.y, color, 2);
        hits++;
        if (hits >= maxHits) break;
      }
      effectsManager.addTracer(this.x, this.y, endX, endY, color, 3);
    } else {
      // Single target hitscan
      target.takeDamage(s.damage, { defenseMelt: s.defenseMelt || 0 });
      if (s.burnDamage) target.applyBurn(s.burnDamage, s.burnDuration || 0);
      effectsManager.addTracer(this.x, this.y, target.x, target.y, color);
      effectsManager.addImpact(target.x, target.y, color, 3);
    }

    if (window.game) window.game.sound.play('shoot');
  }

  getTracerColor() {
    switch (this.typeName) {
      case 'grunt': return '#ffff44';
      case 'sniper': return '#ff4444';
      case 'paintballer': return '#44ff44';
      case 'demolitions': return '#ff8844';
      case 'soldier': return '#ffaa44';
      case 'pyromancer': return '#ff4400';
      case 'commander': return '#4488ff';
      case 'minigunner': return '#ffff00';
      case 'accel': return '#44ffff';
      default: return '#ffffff';
    }
  }

  upgrade() {
    const def = TOWERS[this.typeName];
    if (this.upgradeLevel >= def.upgrades.length) return null;
    const upg = def.upgrades[this.upgradeLevel];
    upg.apply(this.stats);
    this.upgradeLevel++;
    this.totalSpent += upg.cost;
    return upg;
  }

  getNextUpgrade() {
    const def = TOWERS[this.typeName];
    if (this.upgradeLevel >= def.upgrades.length) return null;
    return def.upgrades[this.upgradeLevel];
  }

  getSellValue() {
    return Math.floor(this.totalSpent * 0.7);
  }

  draw(ctx) {
    var drawSize = TILE_SIZE;

    // Calculate recoil offset along the angle direction (kick backward)
    var recoilOffset = 0;
    if (this.recoilTimer > 0) {
      var recoilPct = this.recoilTimer / 0.12;
      recoilOffset = this.recoilAmount * recoilPct;
    }
    var recoilDx = -Math.cos(this.angle) * recoilOffset;
    var recoilDy = -Math.sin(this.angle) * recoilOffset;

    // Calculate scale pulse
    var scaleBonus = 0;
    if (this.fireScaleTimer > 0) {
      var scalePct = this.fireScaleTimer / 0.08;
      scaleBonus = 0.12 * scalePct;
    }
    var totalScale = 1 + scaleBonus;

    if (this.image && this.image.complete) {
      ctx.save();
      ctx.translate(this.x + recoilDx, this.y + recoilDy);
      if (this.stats.targetType !== 'none') ctx.rotate(this.angle);
      ctx.scale(totalScale, totalScale);
      ctx.drawImage(this.image, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
      ctx.restore();
    } else {
      ctx.save();
      ctx.translate(this.x + recoilDx, this.y + recoilDy);
      ctx.scale(totalScale, totalScale);
      ctx.fillStyle = '#446';
      ctx.fillRect(-drawSize / 2 + 4, -drawSize / 2 + 4, drawSize - 8, drawSize - 8);
      ctx.fillStyle = '#aac';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(this.name.slice(0, 3), 0, 4);
      ctx.restore();
    }

    if (this.selected) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.getRange(), 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,100,0.3)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Hitbox circle
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.hitboxRadius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Beam effect
    if (this.isFiring && this.beamTarget && this.beamTarget.alive) {
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.beamTarget.x, this.beamTarget.y);
      ctx.strokeStyle = 'rgba(0,255,255,0.7)';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Charging indicator
    if (this.isCharging && this.stats.chargeUpTime) {
      const pct = this.chargeTimer / this.stats.chargeUpTime;
      ctx.beginPath();
      ctx.arc(this.x, this.y, drawSize / 2 + 4, -Math.PI / 2, -Math.PI / 2 + pct * Math.PI * 2);
      ctx.strokeStyle = 'rgba(0,255,255,0.5)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Upgrade pips
    if (this.upgradeLevel > 0) {
      for (let i = 0; i < this.upgradeLevel; i++) {
        ctx.fillStyle = '#ffcc00';
        ctx.beginPath();
        ctx.arc(this.x - 10 + i * 6, this.y + drawSize / 2 + 2, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Commander buff aura
    if (this.stats.firerateBuff && this.stats.targetType !== "none") {
      // Only show when selected already drawn via range circle
    }
  }
}

class TowerManager {
  constructor() {
    this.towers = [];
    this.towerImages = {};
    this.loadImages();
  }

  loadImages() {
    for (const [key, def] of Object.entries(TOWERS)) {
      const img = new Image();
      img.src = def.sprite;
      this.towerImages[key] = img;
    }
  }

  placeTower(typeName, px, py) {
    const tower = new Tower(typeName, px, py);
    tower.image = this.towerImages[typeName];
    this.towers.push(tower);
    return tower;
  }

  removeTower(tower) {
    const idx = this.towers.indexOf(tower);
    if (idx >= 0) this.towers.splice(idx, 1);
  }

  getTowerAt(px, py) {
    for (const t of this.towers) {
      const dx = t.x - px, dy = t.y - py;
      if (dx * dx + dy * dy <= t.hitboxRadius * t.hitboxRadius) return t;
    }
    return null;
  }

  getPlacementCount(typeName) {
    return this.towers.filter(t => t.typeName === typeName).length;
  }

  update(dt, enemies, effectsManager) {
    const commanderBuffs = [];
    for (const t of this.towers) {
      if (t.stats.firerateBuff) {
        const abilityAmount = t.abilityActive ? (t.stats.abilityBuff || 0) : 0;
        commanderBuffs.push({
          x: t.x, y: t.y,
          range: t.getRange(),
          amount: t.stats.firerateBuff + abilityAmount,
        });
      }
    }
    for (const t of this.towers) {
      t.update(dt, enemies, effectsManager, commanderBuffs);
    }
  }

  draw(ctx) {
    for (const t of this.towers) t.draw(ctx);
  }

  getIncome() {
    let income = 0;
    for (const t of this.towers) {
      if (t.stats.income) income += t.stats.income;
    }
    return income;
  }

  deselectAll() {
    for (const t of this.towers) t.selected = false;
  }
}
