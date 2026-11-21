// ============================================================================
// MAPS — the playfield is WIDTH x HEIGHT studs. Paths are lists of [x, z]
// waypoints (x to the right, z towards the bottom of the screen). A map can
// have several paths; zombies alternate between them. All paths must end at
// the same base.
// ============================================================================

export const WIDTH = 64;
export const HEIGHT = 40;
export const PATH_WIDTH = 3.8;

export const MAPS = {
  maple: {
    name: 'Maple Street',
    blurb: 'A quiet suburb on its very worst day. Long, winding road.',
    difficultyLabel: 'Beginner',
    theme: 'suburb',
    paths: [[
      [-3, 8], [13, 8], [13, 31], [29, 31], [29, 11], [45, 11], [45, 32], [56, 32], [56, 20], [61, 20],
    ]],
    seed: 11,
  },
  quarantine: {
    name: 'Quarantine Zone',
    blurb: 'An overrun military checkpoint. Tighter turns, less room to build.',
    difficultyLabel: 'Intermediate',
    theme: 'military',
    paths: [[
      [-3, 33], [10, 33], [10, 8], [24, 8], [24, 27], [39, 27], [39, 7], [53, 7], [53, 21], [61, 21],
    ]],
    seed: 23,
  },
  hollow: {
    name: 'Hollow Graveyard',
    blurb: 'Two crypts, one gate. The dead come from both sides at night.',
    difficultyLabel: 'Advanced',
    theme: 'graveyard',
    paths: [
      [[-3, 9], [17, 9], [17, 21], [33, 21], [33, 7], [48, 7], [48, 30], [61, 30]],
      [[-3, 33], [17, 33], [17, 21], [33, 21], [33, 7], [48, 7], [48, 30], [61, 30]],
    ],
    seed: 37,
  },
};

export const MAP_ORDER = Object.keys(MAPS);

// Visual themes: colors, lighting and which props get scattered around.
export const THEMES = {
  suburb: {
    sky: '#9fd3f0', fog: '#bfe3f5', fogNear: 90, fogFar: 200,
    grass: ['#6fbf4a', '#79c653', '#68b545', '#82cc5a'], grassEdge: '#4f9a35',
    path: '#c9a26a', pathEdge: '#9c7a4a', pathDetail: '#b48e5a',
    sun: 2.6, sunColor: '#fff3dc', ambient: 1.25, hemiSky: '#cfe9ff', hemiGround: '#5d8a3a',
    props: { tree: 13, bush: 16, rock: 8, house: 4, car: 4, fence: 8, lamp: 6, mailbox: 4, flower: 50 },
  },
  military: {
    sky: '#c9c2a8', fog: '#d6cfb5', fogNear: 90, fogFar: 200,
    grass: ['#9aa35a', '#a3aa62', '#8f9a52', '#adb26c'], grassEdge: '#6f7a3c',
    path: '#8a8378', pathEdge: '#5e5950', pathDetail: '#7a7468',
    sun: 2.5, sunColor: '#fff0d0', ambient: 1.15, hemiSky: '#efe6c8', hemiGround: '#6b6a3a',
    props: { tent: 4, sandbags: 9, crate: 10, barrel: 10, tree: 6, rock: 6, tower: 2, car: 3, cone: 12, barrier: 8 },
  },
  graveyard: {
    sky: '#1b1d3a', fog: '#2a2d52', fogNear: 70, fogFar: 160,
    grass: ['#3f5a3a', '#46613f', '#3a5236', '#4b6644'], grassEdge: '#2a3d27',
    path: '#6b6358', pathEdge: '#4a443c', pathDetail: '#5c554b',
    sun: 1.7, sunColor: '#b3c3ff', ambient: 1.35, hemiSky: '#5a63b0', hemiGround: '#1f2a1c',
    night: true,
    props: { grave: 30, deadtree: 9, rock: 8, lamp: 8, pumpkin: 10, crypt: 2, fence: 10, mushroom: 30 },
  },
};
