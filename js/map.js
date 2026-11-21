// ============================================================
// MAP - Path waypoints, procedural terrain, free placement
// ============================================================

var MAPS = {
  casual: {
    path: [
      { x: 0, y: 7 * TILE_SIZE + TILE_SIZE / 2 },
      { x: 4 * TILE_SIZE, y: 7 * TILE_SIZE + TILE_SIZE / 2 },
      { x: 4 * TILE_SIZE, y: 3 * TILE_SIZE + TILE_SIZE / 2 },
      { x: 10 * TILE_SIZE, y: 3 * TILE_SIZE + TILE_SIZE / 2 },
      { x: 10 * TILE_SIZE, y: 11 * TILE_SIZE + TILE_SIZE / 2 },
      { x: 15 * TILE_SIZE, y: 11 * TILE_SIZE + TILE_SIZE / 2 },
      { x: 15 * TILE_SIZE, y: 5 * TILE_SIZE + TILE_SIZE / 2 },
      { x: 20 * TILE_SIZE, y: 5 * TILE_SIZE + TILE_SIZE / 2 },
    ],
    bg: null,
  },
  molten: {
    path: [
      { x: 0, y: 2 * TILE_SIZE + TILE_SIZE / 2 },
      { x: 6 * TILE_SIZE, y: 2 * TILE_SIZE + TILE_SIZE / 2 },
      { x: 6 * TILE_SIZE, y: 8 * TILE_SIZE + TILE_SIZE / 2 },
      { x: 2 * TILE_SIZE, y: 8 * TILE_SIZE + TILE_SIZE / 2 },
      { x: 2 * TILE_SIZE, y: 13 * TILE_SIZE + TILE_SIZE / 2 },
      { x: 12 * TILE_SIZE, y: 13 * TILE_SIZE + TILE_SIZE / 2 },
      { x: 12 * TILE_SIZE, y: 6 * TILE_SIZE + TILE_SIZE / 2 },
      { x: 17 * TILE_SIZE, y: 6 * TILE_SIZE + TILE_SIZE / 2 },
      { x: 17 * TILE_SIZE, y: 12 * TILE_SIZE + TILE_SIZE / 2 },
      { x: 20 * TILE_SIZE, y: 12 * TILE_SIZE + TILE_SIZE / 2 },
    ],
    bg: null,
  },
  fallen: {
    path: [
      { x: 0, y: 12 * TILE_SIZE + TILE_SIZE / 2 },
      { x: 3 * TILE_SIZE, y: 12 * TILE_SIZE + TILE_SIZE / 2 },
      { x: 3 * TILE_SIZE, y: 4 * TILE_SIZE + TILE_SIZE / 2 },
      { x: 8 * TILE_SIZE, y: 4 * TILE_SIZE + TILE_SIZE / 2 },
      { x: 8 * TILE_SIZE, y: 10 * TILE_SIZE + TILE_SIZE / 2 },
      { x: 14 * TILE_SIZE, y: 10 * TILE_SIZE + TILE_SIZE / 2 },
      { x: 14 * TILE_SIZE, y: 2 * TILE_SIZE + TILE_SIZE / 2 },
      { x: 18 * TILE_SIZE, y: 2 * TILE_SIZE + TILE_SIZE / 2 },
      { x: 18 * TILE_SIZE, y: 8 * TILE_SIZE + TILE_SIZE / 2 },
      { x: 20 * TILE_SIZE, y: 8 * TILE_SIZE + TILE_SIZE / 2 },
    ],
    bg: null,
  },
};

// Seeded pseudo-random for consistent decoration placement
function seededRandom(seed) {
  var s = seed;
  return function() {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// Cached offscreen canvases per mode
var _mapCache = {};

function getMap(mode) {
  return MAPS[mode] || MAPS.casual;
}

function distToPathSegment(px, py, ax, ay, bx, by) {
  var dx = bx - ax, dy = by - ay;
  var lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.sqrt((px - ax) * (px - ax) + (py - ay) * (py - ay));
  var t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  var cx = ax + t * dx, cy = ay + t * dy;
  return Math.sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy));
}

function distToPath(mode, px, py) {
  var path = getMap(mode).path;
  var minDist = Infinity;
  for (var i = 0; i < path.length - 1; i++) {
    var d = distToPathSegment(px, py, path[i].x, path[i].y, path[i + 1].x, path[i + 1].y);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

function canPlaceAtPosition(mode, x, y, hitboxRadius, placedTowers) {
  if (x - hitboxRadius < 0 || x + hitboxRadius > MAP_W ||
      y - hitboxRadius < 0 || y + hitboxRadius > MAP_H) return false;
  if (distToPath(mode, x, y) < PATH_BUFFER + hitboxRadius) return false;
  for (var i = 0; i < placedTowers.length; i++) {
    var t = placedTowers[i];
    var dx = t.x - x, dy = t.y - y;
    var minDist = t.hitboxRadius + hitboxRadius;
    if (dx * dx + dy * dy < minDist * minDist) return false;
  }
  return true;
}

// ---- Procedural map rendering ----

var MAP_THEMES = {
  casual: {
    bgBase: '#3a7a2e',
    bgDark: '#2d6422',
    bgLight: '#4a8a3a',
    pathMain: '#9b8365',
    pathEdge: '#6b5a42',
    pathLight: '#b8a080',
    pathDots: '#8a7355',
    grassColors: ['#4a9a3a', '#3d8530', '#55a845', '#378028'],
    treeCanopy: ['#2a6a1e', '#357a28', '#1f5516', '#3a8a2e'],
    treeTrunk: '#5a4030',
    rockColors: ['#888888', '#777777', '#999999', '#6a6a6a'],
    flowerColors: ['#ff6688', '#ffaa44', '#ffff66', '#88aaff', '#ff88cc', '#ffffff'],
    waterColor: '#3388bb',
    waterEdge: '#2277aa',
    waterShine: 'rgba(150,220,255,0.3)',
  },
  molten: {
    bgBase: '#2a1a10',
    bgDark: '#1e1008',
    bgLight: '#3a2818',
    pathMain: '#4a3a2a',
    pathEdge: '#2a1a10',
    pathLight: '#5a4a38',
    pathDots: '#3a2a1a',
    grassColors: ['#3a2818', '#2e1e10', '#4a3020', '#342218'],
    treeCanopy: [],
    treeTrunk: '#3a2a1a',
    rockColors: ['#555040', '#4a4535', '#5a5545', '#3f3a2f'],
    flowerColors: [],
    lavaColors: ['#ff4400', '#ff6600', '#ff8800', '#cc3300'],
    lavaGlow: 'rgba(255,100,0,0.15)',
    emberColors: ['#ff4400', '#ff6600', '#ffaa00', '#ff2200'],
  },
  fallen: {
    bgBase: '#16122a',
    bgDark: '#0e0a1e',
    bgLight: '#1e1636',
    pathMain: '#3a3050',
    pathEdge: '#221a38',
    pathLight: '#4a4060',
    pathDots: '#302848',
    grassColors: ['#1a1630', '#161228', '#201a38', '#141025'],
    treeCanopy: [],
    treeTrunk: '#2a2040',
    rockColors: ['#444460', '#3a3a55', '#50506a', '#333350'],
    flowerColors: [],
    crystalColors: ['#8855cc', '#aa77ff', '#6633aa', '#bb99ff', '#7744bb'],
    crystalGlow: 'rgba(140,80,220,0.12)',
    runeColors: ['#8855cc', '#6633aa', '#aa77ff'],
  },
};

function _renderMapToCache(mode) {
  var canvas = document.createElement('canvas');
  canvas.width = MAP_W;
  canvas.height = MAP_H;
  var ctx = canvas.getContext('2d');
  var theme = MAP_THEMES[mode] || MAP_THEMES.casual;
  var map = getMap(mode);
  var path = map.path;
  var rng = seededRandom(mode === 'casual' ? 42 : mode === 'molten' ? 137 : 271);
  var pathW = TILE_SIZE * 0.8;

  // 1. Base terrain fill
  ctx.fillStyle = theme.bgBase;
  ctx.fillRect(0, 0, MAP_W, MAP_H);

  // 2. Terrain texture - subtle noise grid
  for (var gx = 0; gx < MAP_COLS; gx++) {
    for (var gy = 0; gy < MAP_ROWS; gy++) {
      var r = rng();
      if (r < 0.4) {
        ctx.fillStyle = theme.bgDark;
        ctx.globalAlpha = 0.15 + rng() * 0.2;
        ctx.fillRect(gx * TILE_SIZE, gy * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        ctx.globalAlpha = 1;
      } else if (r < 0.6) {
        ctx.fillStyle = theme.bgLight;
        ctx.globalAlpha = 0.1 + rng() * 0.15;
        ctx.fillRect(gx * TILE_SIZE, gy * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        ctx.globalAlpha = 1;
      }
    }
  }

  // Fine noise speckle
  for (var si = 0; si < 600; si++) {
    var sx = rng() * MAP_W;
    var sy = rng() * MAP_H;
    var sc = theme.grassColors[Math.floor(rng() * theme.grassColors.length)];
    ctx.fillStyle = sc;
    ctx.globalAlpha = 0.15 + rng() * 0.2;
    ctx.fillRect(sx, sy, 2 + rng() * 3, 2 + rng() * 3);
    ctx.globalAlpha = 1;
  }

  // 3. Draw path - darker edge first, then main, then highlights
  // Edge (wider)
  ctx.strokeStyle = theme.pathEdge;
  ctx.lineWidth = pathW + 8;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(path[0].x, path[0].y);
  for (var i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
  ctx.stroke();

  // Main path
  ctx.strokeStyle = theme.pathMain;
  ctx.lineWidth = pathW;
  ctx.beginPath();
  ctx.moveTo(path[0].x, path[0].y);
  for (var i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
  ctx.stroke();

  // Path center highlight
  ctx.strokeStyle = theme.pathLight;
  ctx.lineWidth = pathW * 0.35;
  ctx.globalAlpha = 0.3;
  ctx.beginPath();
  ctx.moveTo(path[0].x, path[0].y);
  for (var i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Path texture dots along the route
  for (var i = 0; i < path.length - 1; i++) {
    var ax = path[i].x, ay = path[i].y;
    var bx = path[i + 1].x, by = path[i + 1].y;
    var segLen = Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay));
    var dots = Math.floor(segLen / 8);
    for (var d = 0; d < dots; d++) {
      var t = rng();
      var px = ax + (bx - ax) * t;
      var py = ay + (by - ay) * t;
      var offX = (rng() - 0.5) * pathW * 0.7;
      var offY = (rng() - 0.5) * pathW * 0.7;
      ctx.fillStyle = theme.pathDots;
      ctx.globalAlpha = 0.15 + rng() * 0.2;
      ctx.beginPath();
      ctx.arc(px + offX, py + offY, 1 + rng() * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // 4. Mode-specific decorations
  if (mode === 'casual') {
    _drawCasualDecorations(ctx, theme, path, rng, pathW);
  } else if (mode === 'molten') {
    _drawMoltenDecorations(ctx, theme, path, rng, pathW);
  } else if (mode === 'fallen') {
    _drawFallenDecorations(ctx, theme, path, rng, pathW);
  }

  // 5. Entry / exit indicators
  _drawEntryExit(ctx, path, mode);

  return canvas;
}

function _isOnPath(px, py, path, buffer) {
  for (var i = 0; i < path.length - 1; i++) {
    if (distToPathSegment(px, py, path[i].x, path[i].y, path[i + 1].x, path[i + 1].y) < buffer) {
      return true;
    }
  }
  return false;
}

// ---- CASUAL decorations ----
function _drawCasualDecorations(ctx, theme, path, rng, pathW) {
  var avoidR = pathW * 0.7 + 20;

  // Grass tufts
  for (var i = 0; i < 200; i++) {
    var gx = rng() * MAP_W;
    var gy = rng() * MAP_H;
    if (_isOnPath(gx, gy, path, avoidR)) continue;
    var gc = theme.grassColors[Math.floor(rng() * theme.grassColors.length)];
    ctx.strokeStyle = gc;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.5 + rng() * 0.4;
    for (var j = 0; j < 3; j++) {
      var bx = gx + (rng() - 0.5) * 6;
      ctx.beginPath();
      ctx.moveTo(bx, gy);
      ctx.lineTo(bx + (rng() - 0.5) * 4, gy - 4 - rng() * 5);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // Trees (top-down: shadow circle + canopy circle)
  for (var i = 0; i < 35; i++) {
    var tx = 20 + rng() * (MAP_W - 40);
    var ty = 20 + rng() * (MAP_H - 40);
    if (_isOnPath(tx, ty, path, avoidR + 15)) continue;
    var tr = 10 + rng() * 10;
    var cc = theme.treeCanopy[Math.floor(rng() * theme.treeCanopy.length)];

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.beginPath();
    ctx.ellipse(tx + 2, ty + 3, tr * 1.1, tr * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();

    // Canopy
    ctx.fillStyle = cc;
    ctx.beginPath();
    ctx.arc(tx, ty, tr, 0, Math.PI * 2);
    ctx.fill();

    // Canopy highlight
    ctx.fillStyle = 'rgba(100,180,80,0.2)';
    ctx.beginPath();
    ctx.arc(tx - tr * 0.25, ty - tr * 0.25, tr * 0.5, 0, Math.PI * 2);
    ctx.fill();

    // Trunk peek
    ctx.fillStyle = theme.treeTrunk;
    ctx.beginPath();
    ctx.arc(tx, ty, tr * 0.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Rocks
  for (var i = 0; i < 20; i++) {
    var rx = rng() * MAP_W;
    var ry = rng() * MAP_H;
    if (_isOnPath(rx, ry, path, avoidR + 5)) continue;
    var rc = theme.rockColors[Math.floor(rng() * theme.rockColors.length)];
    var rr = 3 + rng() * 5;
    ctx.fillStyle = rc;
    ctx.beginPath();
    ctx.ellipse(rx, ry, rr * (0.8 + rng() * 0.4), rr * (0.6 + rng() * 0.3), rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.beginPath();
    ctx.ellipse(rx - 1, ry - 1, rr * 0.3, rr * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Flowers
  for (var i = 0; i < 50; i++) {
    var fx = rng() * MAP_W;
    var fy = rng() * MAP_H;
    if (_isOnPath(fx, fy, path, avoidR)) continue;
    var fc = theme.flowerColors[Math.floor(rng() * theme.flowerColors.length)];
    ctx.fillStyle = fc;
    ctx.globalAlpha = 0.7 + rng() * 0.3;
    ctx.beginPath();
    ctx.arc(fx, fy, 1.5 + rng() * 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Water ponds (1-2 small)
  for (var i = 0; i < 2; i++) {
    var wx = 60 + rng() * (MAP_W - 120);
    var wy = 60 + rng() * (MAP_H - 120);
    if (_isOnPath(wx, wy, path, avoidR + 30)) continue;
    var ww = 20 + rng() * 25;
    var wh = 15 + rng() * 18;

    ctx.fillStyle = theme.waterEdge;
    ctx.beginPath();
    ctx.ellipse(wx, wy, ww + 3, wh + 3, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = theme.waterColor;
    ctx.beginPath();
    ctx.ellipse(wx, wy, ww, wh, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = theme.waterShine;
    ctx.beginPath();
    ctx.ellipse(wx - ww * 0.2, wy - wh * 0.3, ww * 0.35, wh * 0.25, -0.3, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ---- MOLTEN decorations ----
function _drawMoltenDecorations(ctx, theme, path, rng, pathW) {
  var avoidR = pathW * 0.7 + 20;

  // Lava cracks in ground
  for (var i = 0; i < 40; i++) {
    var cx = rng() * MAP_W;
    var cy = rng() * MAP_H;
    if (_isOnPath(cx, cy, path, avoidR - 10)) continue;
    var lc = theme.lavaColors[Math.floor(rng() * theme.lavaColors.length)];
    ctx.strokeStyle = lc;
    ctx.lineWidth = 1 + rng() * 1.5;
    ctx.globalAlpha = 0.3 + rng() * 0.3;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    var segs = 2 + Math.floor(rng() * 4);
    for (var j = 0; j < segs; j++) {
      cx += (rng() - 0.5) * 20;
      cy += (rng() - 0.5) * 20;
      ctx.lineTo(cx, cy);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Lava pools
  for (var i = 0; i < 5; i++) {
    var lx = 40 + rng() * (MAP_W - 80);
    var ly = 40 + rng() * (MAP_H - 80);
    if (_isOnPath(lx, ly, path, avoidR + 20)) continue;
    var lr = 12 + rng() * 18;
    var lh = lr * (0.6 + rng() * 0.3);

    // Glow
    ctx.fillStyle = theme.lavaGlow;
    ctx.beginPath();
    ctx.ellipse(lx, ly, lr + 8, lh + 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // Dark crust edge
    ctx.fillStyle = '#1a0800';
    ctx.beginPath();
    ctx.ellipse(lx, ly, lr + 2, lh + 2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Lava surface
    var lavaGrad = ctx.createRadialGradient(lx, ly, 0, lx, ly, lr);
    lavaGrad.addColorStop(0, '#ff8800');
    lavaGrad.addColorStop(0.5, '#ff5500');
    lavaGrad.addColorStop(1, '#cc2200');
    ctx.fillStyle = lavaGrad;
    ctx.beginPath();
    ctx.ellipse(lx, ly, lr, lh, 0, 0, Math.PI * 2);
    ctx.fill();

    // Hot spot
    ctx.fillStyle = 'rgba(255,220,100,0.3)';
    ctx.beginPath();
    ctx.ellipse(lx - lr * 0.2, ly - lh * 0.2, lr * 0.3, lh * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Dark rocks / boulders
  for (var i = 0; i < 25; i++) {
    var rx = rng() * MAP_W;
    var ry = rng() * MAP_H;
    if (_isOnPath(rx, ry, path, avoidR + 5)) continue;
    var rc = theme.rockColors[Math.floor(rng() * theme.rockColors.length)];
    var rr = 4 + rng() * 8;
    ctx.fillStyle = rc;
    ctx.beginPath();
    ctx.ellipse(rx, ry, rr, rr * (0.6 + rng() * 0.3), rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
    // Ember glow on some
    if (rng() < 0.3) {
      ctx.fillStyle = 'rgba(255,100,0,0.15)';
      ctx.beginPath();
      ctx.arc(rx, ry, rr + 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Ash/ember specks
  for (var i = 0; i < 80; i++) {
    var ex = rng() * MAP_W;
    var ey = rng() * MAP_H;
    var ec = theme.emberColors[Math.floor(rng() * theme.emberColors.length)];
    ctx.fillStyle = ec;
    ctx.globalAlpha = 0.1 + rng() * 0.2;
    ctx.beginPath();
    ctx.arc(ex, ey, 0.5 + rng() * 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

// ---- FALLEN decorations ----
function _drawFallenDecorations(ctx, theme, path, rng, pathW) {
  var avoidR = pathW * 0.7 + 20;

  // Corrupted rune circles
  for (var i = 0; i < 6; i++) {
    var rx = 50 + rng() * (MAP_W - 100);
    var ry = 50 + rng() * (MAP_H - 100);
    if (_isOnPath(rx, ry, path, avoidR + 15)) continue;
    var rr = 15 + rng() * 20;
    var rc = theme.runeColors[Math.floor(rng() * theme.runeColors.length)];

    // Glow
    ctx.fillStyle = theme.crystalGlow;
    ctx.beginPath();
    ctx.arc(rx, ry, rr + 6, 0, Math.PI * 2);
    ctx.fill();

    // Ring
    ctx.strokeStyle = rc;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.25 + rng() * 0.15;
    ctx.beginPath();
    ctx.arc(rx, ry, rr, 0, Math.PI * 2);
    ctx.stroke();

    // Inner symbols (small lines)
    for (var j = 0; j < 4; j++) {
      var a = (j / 4) * Math.PI * 2 + rng() * 0.3;
      ctx.beginPath();
      ctx.moveTo(rx + Math.cos(a) * rr * 0.3, ry + Math.sin(a) * rr * 0.3);
      ctx.lineTo(rx + Math.cos(a) * rr * 0.7, ry + Math.sin(a) * rr * 0.7);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // Crystals (tall pointed shapes, top-down view = diamond/hexagon)
  for (var i = 0; i < 20; i++) {
    var cx = 15 + rng() * (MAP_W - 30);
    var cy = 15 + rng() * (MAP_H - 30);
    if (_isOnPath(cx, cy, path, avoidR + 8)) continue;
    var cc = theme.crystalColors[Math.floor(rng() * theme.crystalColors.length)];
    var cs = 4 + rng() * 7;

    // Glow
    ctx.fillStyle = theme.crystalGlow;
    ctx.beginPath();
    ctx.arc(cx, cy, cs + 4, 0, Math.PI * 2);
    ctx.fill();

    // Crystal shape (diamond)
    ctx.fillStyle = cc;
    ctx.globalAlpha = 0.7 + rng() * 0.3;
    ctx.beginPath();
    ctx.moveTo(cx, cy - cs);
    ctx.lineTo(cx + cs * 0.5, cy);
    ctx.lineTo(cx, cy + cs * 0.6);
    ctx.lineTo(cx - cs * 0.5, cy);
    ctx.closePath();
    ctx.fill();

    // Highlight
    ctx.fillStyle = 'rgba(200,180,255,0.3)';
    ctx.beginPath();
    ctx.moveTo(cx, cy - cs);
    ctx.lineTo(cx + cs * 0.2, cy - cs * 0.3);
    ctx.lineTo(cx - cs * 0.15, cy - cs * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Dark rocks
  for (var i = 0; i < 18; i++) {
    var rx = rng() * MAP_W;
    var ry = rng() * MAP_H;
    if (_isOnPath(rx, ry, path, avoidR + 5)) continue;
    var rc = theme.rockColors[Math.floor(rng() * theme.rockColors.length)];
    var rr = 3 + rng() * 6;
    ctx.fillStyle = rc;
    ctx.beginPath();
    ctx.ellipse(rx, ry, rr, rr * (0.6 + rng() * 0.3), rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  // Corrupted fog wisps
  for (var i = 0; i < 15; i++) {
    var wx = rng() * MAP_W;
    var wy = rng() * MAP_H;
    if (_isOnPath(wx, wy, path, avoidR - 5)) continue;
    var wr = 20 + rng() * 30;
    ctx.fillStyle = 'rgba(100,60,160,0.04)';
    ctx.beginPath();
    ctx.ellipse(wx, wy, wr, wr * (0.5 + rng() * 0.3), rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  // Soul specks
  for (var i = 0; i < 60; i++) {
    var sx = rng() * MAP_W;
    var sy = rng() * MAP_H;
    var sc = theme.crystalColors[Math.floor(rng() * theme.crystalColors.length)];
    ctx.fillStyle = sc;
    ctx.globalAlpha = 0.06 + rng() * 0.1;
    ctx.beginPath();
    ctx.arc(sx, sy, 0.5 + rng() * 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

// Entry/exit arrows
function _drawEntryExit(ctx, path, mode) {
  var entryColor, exitColor;
  if (mode === 'molten') {
    entryColor = '#ff6600';
    exitColor = '#ff2200';
  } else if (mode === 'fallen') {
    entryColor = '#8855cc';
    exitColor = '#cc3366';
  } else {
    entryColor = '#44cc44';
    exitColor = '#cc4444';
  }

  // Entry - green/themed arrow
  var ep = path[0];
  var ep2 = path[1];
  var eAngle = Math.atan2(ep2.y - ep.y, ep2.x - ep.x);
  ctx.save();
  ctx.translate(ep.x + Math.cos(eAngle) * 10, ep.y + Math.sin(eAngle) * 10);
  ctx.rotate(eAngle);
  ctx.fillStyle = entryColor;
  ctx.globalAlpha = 0.7;
  ctx.beginPath();
  ctx.moveTo(10, 0);
  ctx.lineTo(-6, -8);
  ctx.lineTo(-6, 8);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();

  // Exit - red/themed X
  var xp = path[path.length - 1];
  ctx.strokeStyle = exitColor;
  ctx.lineWidth = 3;
  ctx.globalAlpha = 0.6;
  ctx.lineCap = 'round';
  var xr = 8;
  ctx.beginPath();
  ctx.moveTo(xp.x - xr - 5, xp.y - xr);
  ctx.lineTo(xp.x - xr - 5 + xr * 2, xp.y + xr);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(xp.x - xr - 5, xp.y + xr);
  ctx.lineTo(xp.x - xr - 5 + xr * 2, xp.y - xr);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawMap(ctx, mode) {
  if (!_mapCache[mode]) {
    _mapCache[mode] = _renderMapToCache(mode);
  }
  ctx.drawImage(_mapCache[mode], 0, 0);
}
