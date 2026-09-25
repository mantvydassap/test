// Map layout for the parish of Kylänmäki. X = east, Z = south, metres.

export const WATER = 0;
export const MAP_HALF = 800;      // heightfield extent
export const PLAY_HALF = 735;     // player / vehicles are kept inside this

export const LAKES = [
  { name: 'Kotijärvi', x: -420, z: 220, r: 125, seed: 5, wobble: 0.1 },
  { name: 'Haukilampi', x: 265, z: 255, r: 85, seed: 9, wobble: 0.16 },
];

// Flattened building plots. h: 'auto' samples the terrain at the centre.
export const PADS = [
  { name: 'home', x: -228, z: 200, hx: 38, hz: 34, h: 'auto', blend: 30 },
  { name: 'sauna', x: -283, z: 206, hx: 8, hz: 8, h: 1.35, blend: 10 },
  { name: 'town', x: 510, z: -365, hx: 80, hz: 80, h: 'auto', blend: 45 },
  { name: 'farm', x: 35, z: -120, hx: 32, hz: 26, h: 'auto', blend: 30 },
  { name: 'neighbour1', x: 340, z: 452, hx: 18, hz: 16, h: 'auto', blend: 20 },
  { name: 'neighbour2', x: -520, z: 505, hx: 18, hz: 16, h: 'auto', blend: 20 },
  { name: 'neighbour3', x: 575, z: -60, hx: 16, hz: 18, h: 'auto', blend: 20 },
];

// Grain fields: no trees, golden colour.
export const FIELDS = [
  { x0: 128, x1: 250, z0: -10, z1: 90, color: 0 },
  { x0: 75, x1: 135, z0: -170, z1: -125, color: 1 },
  { x0: 360, x1: 470, z0: 470, z1: 560, color: 0 },
  { x0: -470, x1: -380, z0: 420, z1: 480, color: 1 },
];

export const ROADS = [
  {
    id: 'highway', name: 'Highway 13', type: 'asphalt', hw: 3.6, closed: true,
    pts: [
      [100, -520], [330, -505], [510, -365], [612, -150], [622, 100], [480, 420], [200, 560],
      [-150, 590], [-480, 560], [-640, 330], [-655, 0], [-560, -320], [-300, -520],
    ],
  },
  {
    id: 'homeroad', name: 'Kotitie', type: 'gravel', hw: 2.6, closed: false,
    pts: [[-214, 214], [-222, 245], [-224, 300], [-207, 400], [-182, 500], [-162, 560], [-150, 590]],
    joinEnd: 'highway',
  },
  {
    id: 'forestroad', name: 'Metsätie', type: 'gravel', hw: 2.4, closed: false,
    pts: [[-207, 196], [-180, 186], [-120, 150], [-20, 62], [72, -30], [200, -148], [330, -262], [440, -318], [524, -348]],
    joinEnd: 'highway',
  },
];

// Named places, for newspaper headlines and map labels.
export const PLACES = {
  home: { x: -228, z: 200 },
  town: { x: 510, z: -365 },
};
