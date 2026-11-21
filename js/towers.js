// ============================================================
// TOWERS - Placement, targeting, shooting, upgrading
// ============================================================
class Tower {
  constructor(typeName, gridCol, gridRow) {
    const def = TOWERS[typeName];
    this.typeName = typeName;
    this.name = def.name;
    this.gridCol = gridCol;
    this.gridRow = gridRow;
    this.x = gridCol * TILE_SIZE + TILE_SIZE / 2;
    this.y = gridRow * TILE_SIZE + TILE_SIZE / 2;
    this.baseCost = def.cost;
    this.totalSpent = def.cost;
    this.upgradeLevel = 0;
    this.placement = def.placement;
    this.image = null; // loaded externally

    // Clone base stats
    this.stats = { ...def.base };

    // Commander buff tracking
    this.buffedFirerate = 0;
    this.abilityActive = false;
    this.abilityCooldownTimer = 0;
    this.abilityActiveTimer = 0;

    // Firing state
    this.fireTimer = 0;
    this.burstRemaining = 0;
    this.burstTimer = 0;
    this.revUpTimer = 0;
    this.isRevved = false;
    this.target = null;
    this.angle = 0;

    // Beam (accelerator)
    this.chargeTimer = 0;
    this.isCharging = false;
    this.isFiring = false;
    this.beamCooldownTimer = 0;
    this.overchargeAccum = 0;
    this.beamTarget = null;

    // Selection
    this.selected = false;
  }

  getRange() {
    return this.stats.range * RANGE_SCALE;
  }

  canDetect(enemy) {
    if (enemy.hidden && !this.stats.detectHidden) return false;
    return true;
  }

  findTarget(enemies) {
    const range = this.getRange();
    let best = null;
    let bestProgress = -1;

    for (const e of enemies) {
      if (!e.alive || e.reachedEnd) continue;
      if (!this.canDetect(e)) continue;
      const dx = e.x - this.x, dy = e.y - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= range) {
        // Target furthest along path (first / strongest targeting)
        if (e.distanceTraveled > bestProgress) {
          bestProgress = e.distanceTraveled;
          best = e;
        }
      }
    }
    return best;
  }

  update(dt, enemies, projectileManager, commanderBuffs) {
    const s = this.stats;

    // Apply commander buff
    let firerateMult = 1;
    for (const buff of commanderBuffs) {
      const dx = this.x - buff.x, dy = this.y - buff.y;
      if (dx * dx + dy * dy <= buff.range * buff.range) {
        firerateMult *= (1 - buff.amount);
      }
    }

    // Farm produces no projectiles
    if (s.targetType === "none" && !s.hasAbility) return;

    // Commander with ability
    if (s.hasAbility) {
      if (this.abilityCooldownTimer > 0) this.abilityCooldownTimer -= dt;
      if (this.abilityActiveTimer > 0) {
        this.abilityActiveTimer -= dt;
        if (this.abilityActiveTimer <= 0) this.abilityActive = false;
      }
    }

    // Beam (accelerator) logic
    if (s.targetType === "beam") {
      this.updateBeam(dt, enemies, projectileManager, firerateMult);
      return;
    }

    // Burst fire (soldier)
    if (s.targetType === "burst") {
      this.updateBurst(dt, enemies, projectileManager, firerateMult);
      return;
    }

    // Standard targeting
    this.fireTimer -= dt;
    const target = this.findTarget(enemies);
    if (!target) {
      // Rev-down for minigunner
      if (s.revUpTime) { this.isRevved = false; this.revUpTimer = 0; }
      return;
    }

    this.target = target;
    this.angle = Math.atan2(target.y - this.y, target.x - this.x);

    // Rev-up for minigunner
    if (s.revUpTime && !this.isRevved) {
      this.revUpTimer += dt;
      if (this.revUpTimer >= s.revUpTime) {
        this.isRevved = true;
      } else {
        return;
      }
    }

    // Aim time for demolitions
    if (s.aimTime && this.fireTimer <= 0 && this.fireTimer > -s.aimTime) {
      this.fireTimer -= 0; // just waiting
      return;
    }

    if (this.fireTimer <= 0) {
      this.fire(target, projectileManager);
      this.fireTimer = s.firerate * firerateMult;
    }
  }

  updateBurst(dt, enemies, projectileManager, firerateMult) {
    const s = this.stats;
    const target = this.findTarget(enemies);

    if (this.burstRemaining > 0) {
      this.burstTimer -= dt;
      if (this.burstTimer <= 0 && target) {
        this.target = target;
        this.angle = Math.atan2(target.y - this.y, target.x - this.x);
        this.fire(target, projectileManager);
        this.burstRemaining--;
        this.burstTimer = s.firerate * firerateMult;
      }
      return;
    }

    if (!target) return;
    this.target = target;
    this.angle = Math.atan2(target.y - this.y, target.x - this.x);

    this.fireTimer -= dt;
    if (this.fireTimer <= 0) {
      this.fire(target, projectileManager);
      this.burstRemaining = s.burstCount - 1;
      this.burstTimer = s.firerate * firerateMult;
      this.fireTimer = (s.burstCooldown || 0.5) * firerateMult;
    }
  }

  updateBeam(dt, enemies, projectileManager, firerateMult) {
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
    this.angle = Math.atan2(target.y - this.y, target.x - this.x);

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

    // Firing beam - tick damage
    this.fireTimer -= dt;
    if (this.fireTimer <= 0) {
      target.takeDamage(s.damage);
      this.overchargeAccum += s.damage;
      this.fireTimer = s.firerate * firerateMult;

      // Check overcharge
      if (this.overchargeAccum >= s.overcharge) {
        this.isFiring = false;
        this.isCharging = false;
        this.beamCooldownTimer = s.beamCooldown || 2.5;
        this.chargeTimer = 0;
      }
    }
  }

  fire(target, projectileManager) {
    const s = this.stats;
    const opts = {
      splash: s.targetType === "splash",
      splashRadius: s.splashRadius || 0,
      maxHits: s.maxHits || 999,
      pierce: s.targetType === "pierce",
      burnDamage: s.burnDamage || 0,
      burnDuration: s.burnDuration || 0,
      defenseMelt: s.defenseMelt || 0,
      color: this.getProjectileColor(),
      maxRange: this.getRange() * 1.5,
    };
    projectileManager.add(new Projectile(this.x, this.y, target, s.damage, opts));
  }

  getProjectileColor() {
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
    // Draw tower image or fallback
    if (this.image && this.image.complete) {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.drawImage(this.image, -TILE_SIZE / 2, -TILE_SIZE / 2, TILE_SIZE, TILE_SIZE);
      ctx.restore();
    } else {
      ctx.fillStyle = '#446';
      ctx.fillRect(this.x - TILE_SIZE / 2 + 4, this.y - TILE_SIZE / 2 + 4, TILE_SIZE - 8, TILE_SIZE - 8);
      ctx.fillStyle = '#aac';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(this.name.slice(0, 3), this.x, this.y + 4);
    }

    // Range circle when selected
    if (this.selected) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.getRange(), 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,100,0.3)';
      ctx.lineWidth = 2;
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
      ctx.arc(this.x, this.y, TILE_SIZE / 2 + 4, -Math.PI / 2, -Math.PI / 2 + pct * Math.PI * 2);
      ctx.strokeStyle = 'rgba(0,255,255,0.5)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Upgrade pips
    if (this.upgradeLevel > 0) {
      for (let i = 0; i < this.upgradeLevel; i++) {
        ctx.fillStyle = '#ffcc00';
        ctx.beginPath();
        ctx.arc(this.x - 10 + i * 6, this.y + TILE_SIZE / 2 + 2, 2, 0, Math.PI * 2);
        ctx.fill();
      }
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
      img.src = def.svg;
      this.towerImages[key] = img;
    }
  }

  placeTower(typeName, gridCol, gridRow) {
    const tower = new Tower(typeName, gridCol, gridRow);
    tower.image = this.towerImages[typeName];
    this.towers.push(tower);
    return tower;
  }

  removeTower(tower) {
    const idx = this.towers.indexOf(tower);
    if (idx >= 0) this.towers.splice(idx, 1);
  }

  getTowerAt(gridCol, gridRow) {
    return this.towers.find(t => t.gridCol === gridCol && t.gridRow === gridRow);
  }

  getPlacementCount(typeName) {
    return this.towers.filter(t => t.typeName === typeName).length;
  }

  update(dt, enemies, projectileManager) {
    // Collect commander buffs
    const commanderBuffs = [];
    for (const t of this.towers) {
      if (t.stats.firerateBuff) {
        const buffAmount = t.stats.firerateBuff;
        const abilityAmount = t.abilityActive ? (t.stats.abilityBuff || 0) : 0;
        commanderBuffs.push({
          x: t.x, y: t.y,
          range: t.getRange(),
          amount: buffAmount + abilityAmount,
        });
      }
    }

    for (const t of this.towers) {
      t.update(dt, enemies, projectileManager, commanderBuffs);
    }
  }

  draw(ctx) {
    for (const t of this.towers) {
      t.draw(ctx);
    }
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
