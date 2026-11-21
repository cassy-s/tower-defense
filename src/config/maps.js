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
    blurb: 'An overrun military checkpoint. The road spirals in and crosses itself.',
    difficultyLabel: 'Intermediate',
    theme: 'military',
    paths: [[
      [-3, 21], [11, 21], [11, 6], [52, 6], [52, 33], [21, 33], [21, 15], [40, 15], [40, 25], [61, 25],
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
    grass: ['#6fbf4a', '#74c34f', '#6bba47', '#78c552'], grassEdge: '#4f9a35',
    path: '#c9a26a', pathEdge: '#9c7a4a', pathDetail: '#b48e5a',
    sun: 2.6, sunColor: '#fff3dc', ambient: 1.25, hemiSky: '#cfe9ff', hemiGround: '#5d8a3a',
    props: { tree: 13, bush: 16, rock: 8, house: 4, car: 4, fence: 8, lamp: 6, mailbox: 4, flower: 50 },
  },
  military: {
    sky: '#c9c2a8', fog: '#d6cfb5', fogNear: 90, fogFar: 200,
    grass: ['#9aa35a', '#a0a860', '#959e56', '#a4ab64'], grassEdge: '#6f7a3c',
    path: '#7d7a74', pathEdge: '#4e4a44', pathDetail: '#6a6660',
    sun: 2.5, sunColor: '#fff0d0', ambient: 1.15, hemiSky: '#efe6c8', hemiGround: '#6b6a3a',
    props: { tent: 3, sandbags: 6, crate: 6, barrel: 6, tree: 6, rock: 4, tower: 2, car: 2, cone: 6, barrier: 5 },
  },
  graveyard: {
    sky: '#1b1d3a', fog: '#2a2d52', fogNear: 70, fogFar: 160,
    grass: ['#4a6844', '#51704a', '#466340', '#55744e'], grassEdge: '#2f4a2c',
    path: '#9a8f7c', pathEdge: '#5a5246', pathDetail: '#867b68',
    sun: 2.0, sunColor: '#b8c6ff', ambient: 1.7, hemiSky: '#5a63b0', hemiGround: '#1f2a1c',
    night: true,
    props: { grave: 24, deadtree: 5, rock: 6, lamp: 8, pumpkin: 10, crypt: 2, fence: 5, mushroom: 24 },
  },
};
