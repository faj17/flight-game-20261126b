// The valley: one analytic height function, the runway, the lake, the city and
// the ring course. Nothing here draws or reads input; the renderer and the
// physics both ask this module what the ground does at (x, z).

import { RUNWAY, WORLD } from './config.js';
import { smooth } from './random.js';

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Ground height in metres at world (x, z). Rolling hills on the valley floor,
 * a mountain ring near the edge, a lake basin to the west, and a flattened
 * strip under the runway so a landing has somewhere level to aim for.
 */
export function groundHeight(x, z) {
  let h = 14 * Math.sin(x * 0.0016) * Math.cos(z * 0.0013)
    + 9 * Math.sin(x * 0.004 + 1.7) * Math.sin(z * 0.003 + 0.6)
    + 5 * Math.sin(x * 0.011 + 0.4) * Math.cos(z * 0.009 + 2.1)
    + 2.5 * Math.sin(x * 0.023) * Math.sin(z * 0.019 + 1.1);

  // Mountain ring: rises steeply past 1500 m from the centre.
  const r = Math.hypot(x, z);
  const ridge = smooth((r - 1500) / 1100);
  h += ridge * (170 + 90 * Math.sin(Math.atan2(z, x) * 5 + 1.3) * Math.sin(Math.atan2(z, x) * 3 - 0.5));

  // Lake basin west of the runway.
  const lake = WORLD.lake;
  const dl = Math.hypot(x - lake.x, z - lake.z) / lake.radius;
  if (dl < 1.4) h = h * (1 - smooth(1 - dl)) + lake.depth * smooth(1 - dl);

  // Flatten the runway strip: blend to 0 inside a rounded rectangle.
  const rx = Math.abs(x - RUNWAY.x) / (RUNWAY.length / 2);
  const rz = Math.abs(z - RUNWAY.z) / (RUNWAY.width / 2 + 60);
  const flat = smooth(1 - Math.max(rx, rz));
  h *= 1 - flat;

  return h;
}

/** True when (x, z) is over the lake's water. */
export function isWater(x, z) {
  const lake = WORLD.lake;
  return Math.hypot(x - lake.x, z - lake.z) < lake.radius * 0.96 && groundHeight(x, z) < 1;
}

/** True when (x, z) is on the paved runway surface. */
export function onRunway(x, z) {
  return Math.abs(x - RUNWAY.x) <= RUNWAY.length / 2 && Math.abs(z - RUNWAY.z) <= RUNWAY.width / 2;
}

/** True when (x, z) is inside the flattened runway apron. */
export function nearRunway(x, z) {
  return Math.abs(x - RUNWAY.x) <= RUNWAY.length / 2 + 80 && Math.abs(z - RUNWAY.z) <= RUNWAY.width / 2 + 80;
}

/**
 * The city: a fixed grid of blocks east of the runway, each with a footprint
 * and a height. Deterministic, so the skyline is the same every visit.
 */
export function createCity() {
  const blocks = [];
  const c = WORLD.city;
  let seed = 1234567;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let x = c.x0; x < c.x1; x += 95) {
    for (let z = c.z0; z < c.z1; z += 95) {
      if (rnd() < 0.28) continue; // gaps: streets and parks
      const w = 42 + rnd() * 26;
      const d = 42 + rnd() * 26;
      const h = 18 + rnd() * rnd() * 85; // a few towers, mostly low blocks
      blocks.push({ x: x + 47, z: z + 47, w, d, h, ground: groundHeight(x + 47, z + 47) });
    }
  }
  return blocks;
}

/** The ring course for a mission: rings hung in the sky along a loop. */
export function createRings(count, random) {
  const rings = [];
  // A loop that crosses the valley: start over the runway, swing out over the
  // lake, back across the city, and home. Altitudes stay between 90 and 260 m.
  const course = [
    { x: 500, z: -350, alt: 150 },
    { x: 1100, z: -700, alt: 200 },
    { x: 900, z: 600, alt: 170 },
    { x: -300, z: 1050, alt: 220 },
    { x: -1150, z: 750, alt: 140 },
    { x: -1300, z: -500, alt: 240 },
    { x: -600, z: -1100, alt: 180 },
    { x: 200, z: -700, alt: 130 },
  ];
  for (let i = 0; i < count; i += 1) {
    const c = course[i % course.length];
    const jitter = () => (random() - 0.5) * 90;
    rings.push({
      x: c.x + jitter(),
      z: c.z + jitter(),
      y: c.alt + (random() - 0.5) * 40,
      radius: 36,
      passed: false,
    });
  }
  return rings;
}

/** A few clouds: fixed world positions, drawn as soft billboards. */
export function createClouds(random) {
  const clouds = [];
  for (let i = 0; i < 26; i += 1) {
    clouds.push({
      x: (random() - 0.5) * 5200,
      z: (random() - 0.5) * 5200,
      y: 420 + random() * 260,
      size: 180 + random() * 260,
    });
  }
  return clouds;
}

export { clamp };
