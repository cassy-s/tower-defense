// ============================================================
// EFFECTS - Tracers, muzzle flashes, impact particles, floating text,
//           beam effects, burn particles
// ============================================================

// Helper: parse hex color to rgb components
function _hexToRGB(hex) {
  var num = parseInt(hex.charAt(0) === '#' ? hex.slice(1) : hex, 16);
  return { r: (num >> 16) & 0xff, g: (num >> 8) & 0xff, b: num & 0xff };
}

// ---- TRACER (glow + core line) ----
var Tracer = function(x1, y1, x2, y2, color, width) {
  this.x1 = x1; this.y1 = y1;
  this.x2 = x2; this.y2 = y2;
  this.color = color;
  this.width = width || 2;
  this.life = 0.12;
  this.maxLife = 0.12;
  this.alive = true;
};
Tracer.prototype.update = function(dt) {
  this.life -= dt;
  if (this.life <= 0) this.alive = false;
};
Tracer.prototype.draw = function(ctx) {
  if (!this.alive) return;
  var a = this.life / this.maxLife;
  var rgb = _hexToRGB(this.color);

  // Outer glow
  ctx.globalAlpha = a * 0.25;
  ctx.beginPath();
  ctx.moveTo(this.x1, this.y1);
  ctx.lineTo(this.x2, this.y2);
  ctx.strokeStyle = 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',0.4)';
  ctx.lineWidth = (this.width + 6) * a;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Mid glow
  ctx.globalAlpha = a * 0.5;
  ctx.beginPath();
  ctx.moveTo(this.x1, this.y1);
  ctx.lineTo(this.x2, this.y2);
  ctx.strokeStyle = 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',0.6)';
  ctx.lineWidth = (this.width + 2) * a;
  ctx.stroke();

  // Core bright line
  ctx.globalAlpha = a * 0.9;
  ctx.beginPath();
  ctx.moveTo(this.x1, this.y1);
  ctx.lineTo(this.x2, this.y2);
  ctx.strokeStyle = this.color;
  ctx.lineWidth = this.width * a;
  ctx.stroke();

  // Hot white center for thick tracers
  if (this.width >= 3) {
    ctx.globalAlpha = a * 0.6;
    ctx.beginPath();
    ctx.moveTo(this.x1, this.y1);
    ctx.lineTo(this.x2, this.y2);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
};

// ---- MUZZLE FLASH (multi-layer, sparks) ----
var MuzzleFlash = function(x, y, color) {
  this.x = x; this.y = y;
  this.color = color || '#ffffaa';
  this.life = 0.08;
  this.maxLife = 0.08;
  this.radius = 7 + Math.random() * 5;
  this.alive = true;
  this.angle = Math.random() * Math.PI * 2;
  // Spawn sparks
  this.sparks = [];
  var sparkCount = 3 + Math.floor(Math.random() * 3);
  for (var i = 0; i < sparkCount; i++) {
    var sa = Math.random() * Math.PI * 2;
    var sv = 60 + Math.random() * 100;
    this.sparks.push({
      x: x, y: y,
      vx: Math.cos(sa) * sv,
      vy: Math.sin(sa) * sv,
      life: 0.06 + Math.random() * 0.06,
      size: 1 + Math.random() * 1.5,
    });
  }
};
MuzzleFlash.prototype.update = function(dt) {
  this.life -= dt;
  if (this.life <= 0) this.alive = false;
  for (var i = 0; i < this.sparks.length; i++) {
    var s = this.sparks[i];
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.life -= dt;
  }
};
MuzzleFlash.prototype.draw = function(ctx) {
  if (!this.alive) return;
  var a = this.life / this.maxLife;
  var pct = 1 - a;
  var rgb = _hexToRGB(this.color);

  // Outer glow
  ctx.globalAlpha = a * 0.3;
  ctx.beginPath();
  ctx.arc(this.x, this.y, this.radius * (1.4 + pct * 0.8), 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',0.3)';
  ctx.fill();

  // Middle ring
  ctx.globalAlpha = a * 0.6;
  ctx.beginPath();
  ctx.arc(this.x, this.y, this.radius * (1 + pct * 0.5), 0, Math.PI * 2);
  ctx.fillStyle = this.color;
  ctx.fill();

  // Bright core
  ctx.globalAlpha = a * 0.9;
  ctx.beginPath();
  ctx.arc(this.x, this.y, this.radius * 0.4 * (1 + pct * 0.3), 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  // Sparks
  for (var i = 0; i < this.sparks.length; i++) {
    var s = this.sparks[i];
    if (s.life <= 0) continue;
    ctx.globalAlpha = (s.life / 0.12) * 0.8;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.size * (s.life / 0.12), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 1;
};

// ---- PARTICLE (gravity, trail, fade with size) ----
var Particle = function(x, y, color, life, options) {
  this.x = x; this.y = y;
  var spread = (options && options.spread) || 120;
  this.vx = (Math.random() - 0.5) * spread;
  this.vy = (Math.random() - 0.5) * spread - (options && options.upward ? 40 : 0);
  this.gravity = (options && options.gravity !== undefined) ? options.gravity : 80;
  this.life = life || 0.35;
  this.maxLife = this.life;
  this.color = color;
  this.size = (options && options.size) || (1.5 + Math.random() * 3);
  this.alive = true;
  this.trail = [];
  this.trailMax = (options && options.trailLength) || 3;
};
Particle.prototype.update = function(dt) {
  // Store trail
  if (this.trailMax > 0) {
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > this.trailMax) this.trail.shift();
  }
  this.x += this.vx * dt;
  this.y += this.vy * dt;
  this.vy += this.gravity * dt;
  this.vx *= 0.98;
  this.life -= dt;
  if (this.life <= 0) this.alive = false;
};
Particle.prototype.draw = function(ctx) {
  if (!this.alive) return;
  var pct = this.life / this.maxLife;
  var currentSize = this.size * pct;

  // Trail
  if (this.trail.length > 1) {
    for (var i = 0; i < this.trail.length - 1; i++) {
      var tp = i / this.trail.length;
      ctx.globalAlpha = pct * tp * 0.3;
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.trail[i].x, this.trail[i].y, currentSize * tp * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Main particle
  ctx.globalAlpha = pct * 0.9;
  ctx.fillStyle = this.color;
  ctx.beginPath();
  ctx.arc(this.x, this.y, currentSize, 0, Math.PI * 2);
  ctx.fill();

  // Bright center
  if (currentSize > 1.5) {
    ctx.globalAlpha = pct * 0.4;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(this.x, this.y, currentSize * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 1;
};

// ---- SPLASH CIRCLE (shockwave ring, debris) ----
var SplashCircle = function(x, y, radius, color) {
  this.x = x; this.y = y;
  this.maxRadius = radius;
  this.color = color || '#ff8800';
  this.life = 0.3;
  this.maxLife = 0.3;
  this.alive = true;
};
SplashCircle.prototype.update = function(dt) {
  this.life -= dt;
  if (this.life <= 0) this.alive = false;
};
SplashCircle.prototype.draw = function(ctx) {
  if (!this.alive) return;
  var pct = 1 - this.life / this.maxLife;
  var r = this.maxRadius * (0.2 + pct * 0.8);
  var rgb = _hexToRGB(this.color);

  // Inner fill
  ctx.globalAlpha = (1 - pct) * 0.15;
  ctx.beginPath();
  ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',0.3)';
  ctx.fill();

  // Outer glow
  ctx.globalAlpha = (1 - pct) * 0.2;
  ctx.beginPath();
  ctx.arc(this.x, this.y, r + 4, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',0.2)';
  ctx.lineWidth = 6;
  ctx.stroke();

  // Shockwave ring (bright leading edge)
  ctx.globalAlpha = (1 - pct) * 0.6;
  ctx.beginPath();
  ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
  ctx.strokeStyle = this.color;
  ctx.lineWidth = 2.5 * (1 - pct);
  ctx.stroke();

  // Inner bright ring
  ctx.globalAlpha = (1 - pct) * 0.3;
  ctx.beginPath();
  ctx.arc(this.x, this.y, r * 0.6, 0, Math.PI * 2);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.globalAlpha = 1;
};

// ---- FLOATING TEXT (scale animation, shadow, size by amount) ----
var FloatingText = function(x, y, text, color) {
  this.x = x; this.y = y;
  this.text = text;
  this.color = color || '#44ff44';
  this.life = 1.0;
  this.maxLife = 1.0;
  this.alive = true;
  this.vy = -35;
  this.scale = 0;
  // Determine font size from text (bigger cash = bigger text)
  var num = parseInt(text.replace(/[^0-9]/g, ''), 10);
  if (num >= 100) {
    this.fontSize = 16;
  } else if (num >= 20) {
    this.fontSize = 14;
  } else {
    this.fontSize = 12;
  }
};
FloatingText.prototype.update = function(dt) {
  this.y += this.vy * dt;
  this.vy *= 0.97;
  this.life -= dt;
  // Scale-up animation (spring in first 0.15s)
  var elapsed = this.maxLife - this.life;
  if (elapsed < 0.15) {
    this.scale = elapsed / 0.15;
    this.scale = 1 + (1 - this.scale) * 0.3; // overshoot
  } else {
    this.scale = 1;
  }
  if (this.life <= 0) this.alive = false;
};
FloatingText.prototype.draw = function(ctx) {
  if (!this.alive) return;
  var fadeStart = this.maxLife * 0.35;
  var a = this.life < fadeStart ? this.life / fadeStart : 1;

  ctx.save();
  ctx.translate(this.x, this.y);
  ctx.scale(this.scale, this.scale);

  ctx.font = 'bold ' + this.fontSize + 'px sans-serif';
  ctx.textAlign = 'center';

  // Drop shadow
  ctx.globalAlpha = a * 0.5;
  ctx.fillStyle = '#000000';
  ctx.fillText(this.text, 1, 1);

  // Outline
  ctx.globalAlpha = a * 0.7;
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.strokeText(this.text, 0, 0);

  // Main text
  ctx.globalAlpha = a;
  ctx.fillStyle = this.color;
  ctx.fillText(this.text, 0, 0);

  ctx.restore();
  ctx.globalAlpha = 1;
};

// ---- BURN PARTICLE (fire drifting upward) ----
var BurnParticle = function(x, y) {
  this.x = x + (Math.random() - 0.5) * 10;
  this.y = y + (Math.random() - 0.5) * 6;
  this.vx = (Math.random() - 0.5) * 15;
  this.vy = -20 - Math.random() * 30;
  this.life = 0.3 + Math.random() * 0.3;
  this.maxLife = this.life;
  this.size = 1.5 + Math.random() * 2;
  this.alive = true;
  var r = Math.random();
  if (r < 0.4) {
    this.color = '#ff4400';
  } else if (r < 0.7) {
    this.color = '#ff6600';
  } else {
    this.color = '#ffaa00';
  }
};
BurnParticle.prototype.update = function(dt) {
  this.x += this.vx * dt;
  this.y += this.vy * dt;
  this.vx *= 0.95;
  this.life -= dt;
  if (this.life <= 0) this.alive = false;
};
BurnParticle.prototype.draw = function(ctx) {
  if (!this.alive) return;
  var pct = this.life / this.maxLife;
  var s = this.size * pct;

  // Glow
  ctx.globalAlpha = pct * 0.2;
  ctx.fillStyle = this.color;
  ctx.beginPath();
  ctx.arc(this.x, this.y, s + 2, 0, Math.PI * 2);
  ctx.fill();

  // Core
  ctx.globalAlpha = pct * 0.7;
  ctx.fillStyle = this.color;
  ctx.beginPath();
  ctx.arc(this.x, this.y, s, 0, Math.PI * 2);
  ctx.fill();

  // Flicker - bright center
  if (Math.random() < 0.5) {
    ctx.globalAlpha = pct * 0.4;
    ctx.fillStyle = '#ffdd88';
    ctx.beginPath();
    ctx.arc(this.x, this.y, s * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 1;
};

// ---- BEAM EFFECT (pulsating energy beam with particles) ----
var BeamEffect = function(x1, y1, x2, y2, color) {
  this.x1 = x1; this.y1 = y1;
  this.x2 = x2; this.y2 = y2;
  this.color = color || '#44ffff';
  this.life = 0.08;
  this.maxLife = 0.08;
  this.alive = true;
  this.phase = Math.random() * Math.PI * 2;
};
BeamEffect.prototype.update = function(dt) {
  this.life -= dt;
  this.phase += dt * 20;
  if (this.life <= 0) this.alive = false;
};
BeamEffect.prototype.draw = function(ctx) {
  if (!this.alive) return;
  var a = this.life / this.maxLife;
  var rgb = _hexToRGB(this.color);
  var pulse = 0.7 + Math.sin(this.phase) * 0.3;
  var baseWidth = 4 * pulse;

  // Outer glow
  ctx.globalAlpha = a * 0.15;
  ctx.beginPath();
  ctx.moveTo(this.x1, this.y1);
  ctx.lineTo(this.x2, this.y2);
  ctx.strokeStyle = 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',0.2)';
  ctx.lineWidth = baseWidth + 12;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Mid glow
  ctx.globalAlpha = a * 0.3;
  ctx.beginPath();
  ctx.moveTo(this.x1, this.y1);
  ctx.lineTo(this.x2, this.y2);
  ctx.strokeStyle = 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',0.5)';
  ctx.lineWidth = baseWidth + 6;
  ctx.stroke();

  // Core beam
  ctx.globalAlpha = a * 0.8;
  ctx.beginPath();
  ctx.moveTo(this.x1, this.y1);
  ctx.lineTo(this.x2, this.y2);
  ctx.strokeStyle = this.color;
  ctx.lineWidth = baseWidth;
  ctx.stroke();

  // White-hot center
  ctx.globalAlpha = a * 0.5;
  ctx.beginPath();
  ctx.moveTo(this.x1, this.y1);
  ctx.lineTo(this.x2, this.y2);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = baseWidth * 0.3;
  ctx.stroke();

  // Particles along beam
  var dx = this.x2 - this.x1, dy = this.y2 - this.y1;
  var len = Math.sqrt(dx * dx + dy * dy);
  if (len > 0) {
    var nx = -dy / len, ny = dx / len;
    var count = Math.min(8, Math.floor(len / 20));
    for (var i = 0; i < count; i++) {
      var t = Math.random();
      var px = this.x1 + dx * t;
      var py = this.y1 + dy * t;
      var wobble = (Math.random() - 0.5) * (baseWidth + 4);
      px += nx * wobble;
      py += ny * wobble;
      ctx.globalAlpha = a * (0.3 + Math.random() * 0.4);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(px, py, 1 + Math.random() * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.globalAlpha = 1;
};

// ---- EFFECTS MANAGER ----
var EffectsManager = function() {
  this.effects = [];
};

EffectsManager.prototype.addTracer = function(x1, y1, x2, y2, color, width) {
  this.effects.push(new Tracer(x1, y1, x2, y2, color, width));
};

EffectsManager.prototype.addMuzzleFlash = function(x, y, color) {
  this.effects.push(new MuzzleFlash(x, y, color));
};

EffectsManager.prototype.addImpact = function(x, y, color, count) {
  var n = count || 5;
  for (var i = 0; i < n; i++) {
    this.effects.push(new Particle(x, y, color, 0.25 + Math.random() * 0.15, {
      spread: 100 + Math.random() * 60,
      gravity: 60 + Math.random() * 40,
      trailLength: 2,
    }));
  }
};

EffectsManager.prototype.addSplash = function(x, y, radius, color) {
  this.effects.push(new SplashCircle(x, y, radius, color));
  // Debris particles flying outward
  var debrisCount = 8 + Math.floor(Math.random() * 4);
  for (var i = 0; i < debrisCount; i++) {
    this.effects.push(new Particle(x, y, color || '#ff8800', 0.35 + Math.random() * 0.15, {
      spread: 150 + Math.random() * 80,
      gravity: 50,
      trailLength: 3,
      size: 2 + Math.random() * 2,
    }));
  }
};

EffectsManager.prototype.addFloatingText = function(x, y, text, color) {
  this.effects.push(new FloatingText(x, y, text, color));
};

EffectsManager.prototype.addBurnParticles = function(x, y, count) {
  var n = count || 2;
  for (var i = 0; i < n; i++) {
    this.effects.push(new BurnParticle(x, y));
  }
};

EffectsManager.prototype.addBeam = function(x1, y1, x2, y2, color) {
  this.effects.push(new BeamEffect(x1, y1, x2, y2, color));
};

EffectsManager.prototype.update = function(dt) {
  for (var i = 0; i < this.effects.length; i++) {
    this.effects[i].update(dt);
  }
  this.effects = this.effects.filter(function(e) { return e.alive; });
};

EffectsManager.prototype.draw = function(ctx) {
  for (var i = 0; i < this.effects.length; i++) {
    this.effects[i].draw(ctx);
  }
};
