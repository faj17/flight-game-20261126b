// Missions: what a sortie is for. Three missions with different goals, all
// flown in the same valley: rings to chase, a runway to land on, a clock to
// beat. Fuel and damage turn each sortie into decisions; the score is what
// the sortie earned. No drawing here: the renderer reads this state.

import { MISSIONS, SCORE } from './config.js';
import { createRings } from './terrain.js';
import { DEG } from './random.js';

export const MISSION_RING = 1;
export const MISSION_LANDED = 2;
export const MISSION_COMPLETE = 4;
export const MISSION_FAILED = 8;
export const MISSION_TIME_UP = 16;

export function createMission(missionDef, random) {
  const rings = createRings(missionDef.rings, random);
  const state = {
    def: missionDef,
    rings,
    nextRing: 0,
    score: 0,
    timeLeft: missionDef.timeLimit,
    landed: false,
    complete: false,
    failed: false,
    message: '',
    messageTime: 0,
  };

  function announce(text, seconds) {
    state.message = text;
    state.messageTime = seconds ?? 3;
  }

  function reset() {
    for (const ring of rings) ring.passed = false;
    state.nextRing = 0;
    state.score = 0;
    state.timeLeft = missionDef.timeLimit;
    state.landed = false;
    state.complete = false;
    state.failed = false;
    state.message = '';
    state.messageTime = 0;
  }

  /** Test a ring crossing for the segment from (px,py,pz) to the plane now. */
  function ringCrossing(plane) {
    return (px, py, pz) => {
      if (state.nextRing >= rings.length || state.complete) return 0;
      const ring = rings[state.nextRing];
      // The ring faces the flight direction: its plane is vertical, normal
      // along the course from the previous ring (or the runway heading).
      const prev = state.nextRing === 0
        ? { x: -700, z: 0 }
        : rings[state.nextRing - 1];
      const nx = ring.x - prev.x;
      const nz = ring.z - prev.z;
      const nl = Math.hypot(nx, nz) || 1;
      const ux = nx / nl;
      const uz = nz / nl;
      const d0 = (px - ring.x) * ux + (pz - ring.z) * uz;
      const d1 = (plane.x - ring.x) * ux + (plane.z - ring.z) * uz;
      if (d0 >= 0 || d1 <= 0) return 0; // crossed only when the segment spans the ring's plane
      const dx = plane.x - ring.x;
      const dz = plane.z - ring.z;
      const dy = plane.y - ring.y;
      // Distance from the ring's centre line, ignoring the crossing axis.
      const along = dx * ux + dz * uz;
      const side = dx * -uz + dz * ux;
      const dist = Math.hypot(side, dy);
      if (dist > ring.radius) {
        announce('MISSED RING — turn back and try again', 2.5);
        return 0;
      }
      ring.passed = true;
      state.nextRing += 1;
      state.score += SCORE.ring;
      if (missionDef.timeLimit > 0) state.timeLeft += SCORE.ringTimeBonus;
      if (state.nextRing >= rings.length) {
        state.score += SCORE.missionComplete;
        state.complete = true;
        announce(`COURSE COMPLETE  +${SCORE.missionComplete}`, 4);
        return MISSION_RING | MISSION_COMPLETE;
      }
      announce(`RING ${state.nextRing} OF ${rings.length}  +${SCORE.ring}`, 2.5);
      return MISSION_RING;
    };
  }

  /** Called when the plane touches down on the runway. */
  function onLanded(plane) {
    if (state.landed || state.complete) return 0;
    state.landed = true;
    const soft = plane.vspeed > -4.5;
    const bonus = soft ? SCORE.landingSoft : SCORE.landingFirm;
    state.score += bonus;
    if (missionDef.id === 'landing') {
      state.score += SCORE.missionComplete;
      state.complete = true;
      announce(soft ? `PERFECT LANDING  +${bonus}` : `LANDED — FIRM TOUCHDOWN  +${bonus}`, 4);
      return MISSION_LANDED | MISSION_COMPLETE;
    }
    announce(soft ? `TOUCHDOWN  +${bonus}` : `TOUCHDOWN — FIRM  +${bonus}`, 3);
    return MISSION_LANDED;
  }

  /** The clock, for the timed mission. Returns flags when time runs out. */
  function tick(dt) {
    if (state.messageTime > 0) state.messageTime -= dt;
    if (missionDef.timeLimit > 0 && !state.complete && !state.failed) {
      state.timeLeft -= dt;
      if (state.timeLeft <= 0) {
        state.timeLeft = 0;
        state.failed = true;
        announce('TIME UP — the course beat you', 4);
        return MISSION_TIME_UP | MISSION_FAILED;
      }
    }
    return 0;
  }

  return { state, reset, ringCrossing, onLanded, tick, announce };
}

/** The compass heading, in degrees, from the plane state. */
export function headingDeg(plane) {
  return ((plane.heading % 360) + 360) % 360;
}

/** Bearing from the plane to a target point, in degrees. */
export function bearingTo(plane, tx, tz) {
  const dx = tx - plane.x;
  const dz = tz - plane.z;
  return ((Math.atan2(dx, -dz) / DEG) % 360 + 360) % 360;
}
