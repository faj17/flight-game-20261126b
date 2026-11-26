// A small seeded random number generator (mulberry32): the same seed gives the
// same world, which is what makes the screenshot scenes repeatable.

export function createRandom(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smoothstep between 0 and 1 for a value t already in that range. */
export function smooth(t) {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

/** Linear interpolation. */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Wrap an angle in degrees to (-180, 180]. */
export function wrapAngle(a) {
  let v = a % 360;
  if (v > 180) v -= 360;
  if (v <= -180) v += 360;
  return v;
}

/** Smallest signed turn from `from` to `to`, in degrees. */
export function angleDelta(from, to) {
  return wrapAngle(to - from);
}

export const DEG = Math.PI / 180;
export const KT_TO_MS = 0.514444;
export const MS_TO_FT = 3.28084;
export const MS_TO_KT = 1.94384;
