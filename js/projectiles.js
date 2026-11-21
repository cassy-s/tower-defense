// ============================================================
// EFFECTS - Tracers, muzzle flashes, impact particles, floating text
// ============================================================

class Tracer {
  constructor(x1, y1, x2, y2, color, width) {
    this.x1 = x1; this.y1 = y1;
    this.x2 = x2; this.y2 = y2;
    this.color = color;
    this.width = width || 2;
    this.life = 0.1;
    this.maxLife = 0.1;
    this.alive = true;
  }
  update(dt) {
    this.life -= dt;
    if (this.life <= 0) this.alive = false;
  }
  draw(ctx) {
    if (!this.alive) return;
    const a = this.life / this.maxLife;
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.moveTo(this.x1, this.y1);
    ctx.lineTo(this.x2, this.y2);
    ctx.strokeStyle = this.color;
    ctx.lineWidth = this.width * a;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

class MuzzleFlash {
  constructor(x, y, color) {
    this.x = x; this.y = y;
    this.color = color || '#ffffaa';
    this.life = 0.06;
    this.maxLife = 0.06;
    this.radius = 6 + Math.random() * 4;
    this.alive = true;
  }
  update(dt) {
    this.life -= dt;
    if (this.life <= 0) this.alive = false;
  }
  draw(ctx) {
    if (!this.alive) return;
    const a = this.life / this.maxLife;
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius * (1 + (1 - a) * 0.5), 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

class Particle {
  constructor(x, y, color, life) {
    this.x = x; this.y = y;
    this.vx = (Math.random() - 0.5) * 120;
    this.vy = (Math.random() - 0.5) * 120;
    this.life = life || 0.3;
    this.maxLife = this.life;
    this.color = color;
    this.size = 1.5 + Math.random() * 2.5;
    this.alive = true;
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

class SplashCircle {
  constructor(x, y, radius, color) {
    this.x = x; this.y = y;
    this.maxRadius = radius;
    this.color = color || '#ff8800';
    this.life = 0.25;
    this.maxLife = 0.25;
    this.alive = true;
  }
  update(dt) {
    this.life -= dt;
    if (this.life <= 0) this.alive = false;
  }
  draw(ctx) {
    if (!this.alive) return;
    const pct = 1 - this.life / this.maxLife;
    const r = this.maxRadius * (0.3 + pct * 0.7);
    ctx.globalAlpha = this.life / this.maxLife * 0.4;
    ctx.beginPath();
    ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.fill();
    ctx.globalAlpha = this.life / this.maxLife * 0.6;
    ctx.beginPath();
    ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

class FloatingText {
  constructor(x, y, text, color) {
    this.x = x; this.y = y;
    this.text = text;
    this.color = color || '#44ff44';
    this.life = 1.0;
    this.maxLife = 1.0;
    this.alive = true;
    this.vy = -40;
  }
  update(dt) {
    this.y += this.vy * dt;
    this.life -= dt;
    if (this.life <= 0) this.alive = false;
  }
  draw(ctx) {
    if (!this.alive) return;
    const a = Math.min(1, this.life / (this.maxLife * 0.3));
    ctx.globalAlpha = a;
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#000';
    ctx.fillText(this.text, this.x + 1, this.y + 1);
    ctx.fillStyle = this.color;
    ctx.fillText(this.text, this.x, this.y);
    ctx.globalAlpha = 1;
  }
}

class EffectsManager {
  constructor() {
    this.effects = [];
  }

  addTracer(x1, y1, x2, y2, color, width) {
    this.effects.push(new Tracer(x1, y1, x2, y2, color, width));
  }

  addMuzzleFlash(x, y, color) {
    this.effects.push(new MuzzleFlash(x, y, color));
  }

  addImpact(x, y, color, count) {
    for (let i = 0; i < (count || 3); i++) {
      this.effects.push(new Particle(x, y, color));
    }
  }

  addSplash(x, y, radius, color) {
    this.effects.push(new SplashCircle(x, y, radius, color));
    for (let i = 0; i < 6; i++) {
      this.effects.push(new Particle(x, y, color || '#ff8800', 0.4));
    }
  }

  addFloatingText(x, y, text, color) {
    this.effects.push(new FloatingText(x, y, text, color));
  }

  update(dt) {
    for (const e of this.effects) e.update(dt);
    this.effects = this.effects.filter(e => e.alive);
  }

  draw(ctx) {
    for (const e of this.effects) e.draw(ctx);
  }
}
