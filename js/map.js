// ============================================================
// MAP - Path waypoints, background images, free placement
// ============================================================

const MAPS = {
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

// Load background images
(function loadMapBackgrounds() {
  const bgFiles = {
    casual: 'assets/maps/casual_bg.png',
    molten: 'assets/maps/molten_bg.png',
    fallen: 'assets/maps/fallen_bg.png',
  };
  for (const [mode, src] of Object.entries(bgFiles)) {
    const img = new Image();
    img.src = src;
    MAPS[mode].bg = img;
  }
})();

function getMap(mode) {
  return MAPS[mode] || MAPS.casual;
}

function distToPathSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.sqrt((px - ax) * (px - ax) + (py - ay) * (py - ay));
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy));
}

function distToPath(mode, px, py) {
  const path = getMap(mode).path;
  let minDist = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const d = distToPathSegment(px, py, path[i].x, path[i].y, path[i + 1].x, path[i + 1].y);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

function canPlaceAtPosition(mode, x, y, hitboxRadius, placedTowers) {
  if (x - hitboxRadius < 0 || x + hitboxRadius > MAP_W ||
      y - hitboxRadius < 0 || y + hitboxRadius > MAP_H) return false;
  if (distToPath(mode, x, y) < PATH_BUFFER + hitboxRadius) return false;
  for (const t of placedTowers) {
    const dx = t.x - x, dy = t.y - y;
    const minDist = t.hitboxRadius + hitboxRadius;
    if (dx * dx + dy * dy < minDist * minDist) return false;
  }
  return true;
}

function drawMap(ctx, mode) {
  const map = getMap(mode);
  if (map.bg && map.bg.complete && map.bg.naturalWidth > 0) {
    ctx.drawImage(map.bg, 0, 0, MAP_W, MAP_H);
  } else {
    ctx.fillStyle = mode === 'molten' ? '#3a2a1a' : mode === 'fallen' ? '#1a1a2a' : '#2d5a1e';
    ctx.fillRect(0, 0, MAP_W, MAP_H);
    ctx.strokeStyle = '#9b8365';
    ctx.lineWidth = TILE_SIZE * 0.8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(map.path[0].x, map.path[0].y);
    for (let i = 1; i < map.path.length; i++) ctx.lineTo(map.path[i].x, map.path[i].y);
    ctx.stroke();
    ctx.strokeStyle = '#a89070';
    ctx.lineWidth = TILE_SIZE * 0.5;
    ctx.beginPath();
    ctx.moveTo(map.path[0].x, map.path[0].y);
    for (let i = 1; i < map.path.length; i++) ctx.lineTo(map.path[i].x, map.path[i].y);
    ctx.stroke();
  }
}
