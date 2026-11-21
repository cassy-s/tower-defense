// ============================================================
// PROJECTILES - Movement, collision, splash damage, particles
// ============================================================

const PROJECTILE_SPEED = 500; // pixels per second

class Projectile {
  constructor(x, y, target, damage, options = {}) {
    this.x = x;
    this.y = y;
    this.target = target;
    this.damage = damage;
    this.speed = options.speed || PROJECTILE_SPEED;
    this.alive = true;
    this.splash = options.splash || false;
    this.splashRadius = (options.splashRadius || 0) * 16; // convert tile units to pixels
    this.maxHits = options.maxHits || 1;
    this.pierce = options.pierce || false;
    this.hitCount = 0;
    this.burnDamage = options.burnDamage || 0;
    this.burnDuration = options.burnDuration || 0;
    this.defenseMelt = options.defenseMelt || 0;
    this.color = options.color || '#ffff44';
    this.size = options.size || 3;
    this.hitEnemies = new Set();
    // For pierce projectiles - direction
    if (this.pierce && target) {
      const dx = target.x - x, dy = target.y - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      this.dirX = dist > 0 ? dx / dist : 1;
      this.dirY = dist > 0 ? dy / dist : 0;
    }
    this.maxRange = options.maxRange || 800;
    this.traveled = 0;
  }

  update(dt, enemies, particles) {
    if (!this.alive) return;

    if (this.pierce) {
      // Pierce: move in straight line, hit enemies along the way
      const move = this.speed * dt;
      this.x += this.dirX * move;
      this.y += this.dirY * move;
      this.traveled += move;

      // Check hits
      for (const e of enemies) {
        if (!e.alive || e.reachedEnd || this.hitEnemies.has(e)) continue;
        const dx = e.x - this.x, dy = e.y - this.y;
        if (dx * dx + dy * dy < (e.radius + this.size) * (e.radius + this.size)) {
          this.hitEnemies.add(e);
          this.hitCount++;
          e.takeDamage(this.damage, { defenseMelt: this.defenseMelt });
          if (this.burnDamage > 0) e.applyBurn(this.burnDamage, this.burnDuration);
          particles.push(new Particle(e.x, e.y, this.color));
          if (this.hitCount >= this.maxHits) { this.alive = false; return; }
        }
      }

      if (this.traveled > this.maxRange) this.alive = false;
    } else if (this.target && this.target.alive) {
      // Homing toward target
      const dx = this.target.x - this.x, dy = this.target.y - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < this.speed * dt) {
        // Hit
        this.x = this.target.x;
        this.y = this.target.y;
        this.onHit(enemies, particles);
      } else {
        this.x += (dx / dist) * this.speed * dt;
        this.y += (dy / dist) * this.speed * dt;
      }
    } else {
      // Target dead, just disappear or keep going to last position
      this.alive = false;
    }
  }

  onHit(enemies, particles) {
    if (this.splash && this.splashRadius > 0) {
      // Splash damage
      let hits = 0;
      for (const e of enemies) {
        if (!e.alive || e.reachedEnd) continue;
        const dx = e.x - this.x, dy = e.y - this.y;
        if (dx * dx + dy * dy < this.splashRadius * this.splashRadius) {
          e.takeDamage(this.damage, { defenseMelt: this.defenseMelt });
          if (this.burnDamage > 0) e.applyBurn(this.burnDamage, this.burnDuration);
          hits++;
          if (hits >= this.maxHits) break;
        }
      }
      // Explosion particle
      for (let i = 0; i < 8; i++) {
        particles.push(new Particle(this.x, this.y, '#ff8800', 2));
      }
    } else {
      // Single target
      this.target.takeDamage(this.damage, { defenseMelt: this.defenseMelt });
      if (this.burnDamage > 0) this.target.applyBurn(this.burnDamage, this.burnDuration);
      particles.push(new Particle(this.x, this.y, this.color));
    }
    this.alive = false;
  }

  draw(ctx) {
    if (!this.alive) return;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.fill();
  }
}

class Particle {
  constructor(x, y, color, life = 0.4) {
    this.x = x;
    this.y = y;
    this.vx = (Math.random() - 0.5) * 100;
    this.vy = (Math.random() - 0.5) * 100;
    this.life = life;
    this.maxLife = life;
    this.color = color;
    this.alive = true;
    this.size = 2 + Math.random() * 3;
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    if (this.life <= 0) this.alive = false;
  }

  draw(ctx) {
    if (!this.alive) return;
    ctx.globalAlpha = this.life / this.maxLife;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

class ProjectileManager {
  constructor() {
    this.projectiles = [];
    this.particles = [];
  }

  add(proj) {
    this.projectiles.push(proj);
  }

  update(dt, enemies) {
    for (const p of this.projectiles) {
      p.update(dt, enemies, this.particles);
    }
    for (const p of this.particles) {
      p.update(dt);
    }
    this.projectiles = this.projectiles.filter(p => p.alive);
    this.particles = this.particles.filter(p => p.alive);
  }

  draw(ctx) {
    for (const p of this.projectiles) p.draw(ctx);
    for (const p of this.particles) p.draw(ctx);
  }
}
