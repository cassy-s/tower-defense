// ============================================================
// MAP - Path waypoints, placement tiles, visual rendering
// ============================================================
const COLS = 20;
const ROWS = 15;

// Tile types: 0=grass, 1=path, 2=ground(placeable), 3=cliff(placeable), 4=water
const TILE_COLORS = {
  0: '#2d5a1e', // grass
  1: '#8b7355', // dirt path
  2: '#3a6b2a', // ground placement (slightly different green)
  3: '#6b6b7b', // cliff
  4: '#2a4a7a', // water
};

// Map definitions per mode
const MAPS = {
  casual: {
    // Path waypoints in pixel coords (enemies follow these)
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
    grid: null, // generated below
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
    grid: null,
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
    grid: null,
  },
};

// Generate grids from path
function generateGrid(mapDef) {
  const grid = [];
  for (let r = 0; r < ROWS; r++) {
    grid[r] = [];
    for (let c = 0; c < COLS; c++) {
      grid[r][c] = 0; // default grass
    }
  }

  // Mark path tiles
  const path = mapDef.path;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const ac = Math.floor(a.x / TILE_SIZE), ar = Math.floor(a.y / TILE_SIZE);
    const bc = Math.floor(b.x / TILE_SIZE), br = Math.floor(b.y / TILE_SIZE);
    if (ar === br) {
      const minC = Math.max(0, Math.min(ac, bc));
      const maxC = Math.min(COLS - 1, Math.max(ac, bc));
      for (let c = minC; c <= maxC; c++) {
        if (ar >= 0 && ar < ROWS) grid[ar][c] = 1;
      }
    } else {
      const minR = Math.max(0, Math.min(ar, br));
      const maxR = Math.min(ROWS - 1, Math.max(ar, br));
      for (let r = minR; r <= maxR; r++) {
        if (ac >= 0 && ac < COLS) grid[r][ac] = 1;
      }
    }
  }

  // Mark placement tiles adjacent to path
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c] === 0) {
        let nearPath = false;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && grid[nr][nc] === 1) {
              nearPath = true;
            }
          }
        }
        if (nearPath) grid[r][c] = 2; // ground placement
      }
    }
  }

  // Add some cliff tiles and water
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c] === 0) {
        // Corners and edges become cliff or water for variety
        if ((r < 2 || r > ROWS - 3) && (c < 2 || c > COLS - 3)) {
          grid[r][c] = 4; // water in corners
        } else if (grid[r][c] === 0 && ((r + c) % 7 === 0)) {
          grid[r][c] = 3; // scattered cliff tiles
        }
      }
    }
  }

  return grid;
}

// Initialize grids
for (const mode of Object.keys(MAPS)) {
  MAPS[mode].grid = generateGrid(MAPS[mode]);
}

function getMap(mode) {
  return MAPS[mode] || MAPS.casual;
}

function getGridDimensions() {
  return { cols: COLS, rows: ROWS, tileSize: TILE_SIZE };
}

function drawMap(ctx, mode, canvasWidth, canvasHeight) {
  const map = getMap(mode);
  const grid = map.grid;

  // Draw tiles
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const tile = grid[r][c];
      ctx.fillStyle = TILE_COLORS[tile] || TILE_COLORS[0];
      ctx.fillRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);

      // Grid lines for placement tiles
      if (tile === 2 || tile === 3) {
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }
  }

  // Draw path with slightly wider dirt look
  ctx.strokeStyle = '#9b8365';
  ctx.lineWidth = TILE_SIZE * 0.8;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(map.path[0].x, map.path[0].y);
  for (let i = 1; i < map.path.length; i++) {
    ctx.lineTo(map.path[i].x, map.path[i].y);
  }
  ctx.stroke();

  // Inner path line
  ctx.strokeStyle = '#a89070';
  ctx.lineWidth = TILE_SIZE * 0.5;
  ctx.beginPath();
  ctx.moveTo(map.path[0].x, map.path[0].y);
  for (let i = 1; i < map.path.length; i++) {
    ctx.lineTo(map.path[i].x, map.path[i].y);
  }
  ctx.stroke();
}

function canPlaceTower(mode, gridCol, gridRow, placementType, placedTowers) {
  const map = getMap(mode);
  const grid = map.grid;
  if (gridRow < 0 || gridRow >= ROWS || gridCol < 0 || gridCol >= COLS) return false;
  const tile = grid[gridRow][gridCol];

  if (placementType === "cliff") {
    if (tile !== 3) return false;
  } else {
    if (tile !== 2) return false;
  }

  // Check no tower already placed there
  for (const t of placedTowers) {
    if (t.gridCol === gridCol && t.gridRow === gridRow) return false;
  }
  return true;
}

