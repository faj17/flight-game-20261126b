// Every tuning number and colour in one place. Distances are metres, speeds are
// knots unless a name says m/s, altitudes are metres above sea level. The world is
// a 5 km valley: a runway on the valley floor, a lake to the west, a small city
// to the east, and a ring of mountains around it all.

export const STEP = 1 / 60;

export const PLANE = {
  // Speeds in knots.
  minSpeed: 38,
  cruiseSpeed: 120,
  maxSpeed: 185,
  stallSpeed: 55,
  // Throttle 0..1 maps to a target speed between idle and max.
  idleSpeed: 42,
  // Turn: full bank turns this many degrees per second at cruise.
  turnRate: 26,
  // Pitch authority, degrees per second at full stick.
  pitchRate: 22,
  rollRate: 95,
  // Climb: full up at cruise gives this vertical speed in m/s.
  climbRate: 9,
  // Fuel: percent per second at full throttle; 100% lasts ~7 minutes at cruise.
  fuelBurn: 0.28,
  // Damage taken by a hard touchdown, per m/s of vertical speed over the limit.
  hardLandingDamage: 14,
  // Vertical speed (m/s) a landing may have and still count as soft.
  softLandingVs: 4.5,
  // Speed (knots) a landing may have and still count.
  maxLandingSpeed: 95,
};

export const RUNWAY = {
  // Centre of the runway, on the valley floor.
  x: 0,
  z: 0,
  length: 900,
  width: 46,
  heading: 90, // degrees; the runway runs east-west.
};

export const WORLD = {
  size: 5200,
  lake: { x: -1150, z: 750, radius: 420, depth: -7 },
  city: { x0: 620, x1: 1350, z0: -420, z1: 420 },
  // Terrain grid used by the renderer: cell size and half-count around the plane.
  cell: 130,
  halfCells: 21,
};

export const MISSIONS = [
  {
    id: 'rings',
    name: 'RING RUN',
    blurb: 'Fly through all 8 golden rings in order. Smooth turns win: every ring is worth 500.',
    rings: 8,
    timeLimit: 0, // no clock
    fuelStart: 100,
  },
  {
    id: 'landing',
    name: 'RUNWAY LANDING',
    blurb: 'Bring the Kestrel home. Touch down on the runway, slow and gentle, heading east.',
    rings: 0,
    timeLimit: 0,
    fuelStart: 100,
  },
  {
    id: 'timed',
    name: 'TIMED COURSE',
    blurb: 'Six rings against a 150-second clock. Each ring adds 15 seconds. Beat the clock.',
    rings: 6,
    timeLimit: 150,
    fuelStart: 100,
  },
];

export const SCORE = {
  ring: 500,
  ringTimeBonus: 15,
  landingSoft: 1000,
  landingFirm: 400,
  missionComplete: 1500,
};

export const PALETTE = {
  skyTop: '#2f6fb2',
  skyMid: '#7db3dd',
  skyHorizon: '#cfe4f2',
  sun: '#fff3c4',
  grass: '#5d8a46',
  grassDry: '#7a9a52',
  sand: '#c9b078',
  rock: '#8a8378',
  snow: '#eef2f5',
  water: '#2e6da8',
  waterDeep: '#1f4e7d',
  asphalt: '#3c3f45',
  asphaltLine: '#e8e8e8',
  cityRoof: '#b0563a',
  cityWall: '#c8b49a',
  cityGlass: '#7fb2d9',
  ring: '#f2c94c',
  ringNext: '#ffd94d',
  ringDone: '#58b368',
  planeBody: '#d8443a',
  planeWing: '#e8e4da',
  planeTrim: '#1f2a44',
  canopy: '#9fd4e8',
  hud: '#eaf6ff',
  hudAmber: '#ffc857',
  hudRed: '#ff5a4e',
  hudGreen: '#7be495',
  panel: '#20242c',
  panelEdge: '#3a4150',
  gaugeFace: '#10141a',
  gaugeTick: '#dfe7ef',
  gaugeNeedle: '#ff5a4e',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

export const BEST_KEY = 'kestrel-courier.best';
