// The screenshot scenes behind ?shot=chase|cockpit|landing|rings. Each one
// plays the real rules forward from a fresh world for a fixed number of
// steps, steered by a simple autopilot (point the nose at the next ring or
// the runway, hold altitude with the pitch, keep the throttle at cruise),
// so the frame is what a real flight looks like and the same seed always
// gives the same frame.

import { STEP } from './config.js';
import { angleDelta, wrapAngle } from './random.js';
import { EVENT_CRASHED, EVENT_LANDED } from './physics.js';
import { SCREEN_OVER, SCREEN_PLAY } from './render.js';

/** Steer toward a target point at a target altitude; returns controls. */
function autopilot(plane, tx, tz, targetAlt) {
  const dx = tx - plane.x;
  const dz = tz - plane.z;
  const bearing = (Math.atan2(dx, -dz) * 180) / Math.PI;
  const rel = angleDelta(plane.heading, bearing);
  const roll = Math.max(-1, Math.min(1, rel / 70));
  const altErr = targetAlt - plane.y;
  const pitch = Math.max(-1, Math.min(1, altErr / 60 + (plane.vspeed < 0 ? 0.15 : 0)));
  const throttleDelta = plane.speedKt < 105 ? 1 : plane.speedKt > 125 ? -1 : 0;
  return { pitch, roll, throttleDelta, brake: false };
}

function fly(state, seconds, steer) {
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const ctl = steer(state.plane.state);
    const events = state.plane.step(STEP, ctl, state.mission.ringCrossing(state.plane.state));
    state.mission.tick(STEP);
    if (events & EVENT_CRASHED) break;
    if (events & EVENT_LANDED) break;
  }
}

/**
 * Set `state` (plane + mission) to the named scene and return the screen to
 * draw over it, the camera mode, and the best score to show.
 */
export function stageShot(name, state) {
  const plane = state.plane;
  const mission = state.mission;
  plane.reset();
  mission.reset();

  if (name === 'cockpit') {
    // Early in the run toward the first ring, cockpit instruments lit,
    // horizon near level so the panel reads clearly.
    fly(state, 10, (p) => {
      const ring = mission.state.rings[0];
      return autopilot(p, ring.x, ring.z, ring.y);
    });
    // Level the wings for the frame so the panel reads clearly; the render
    // is still the live game at this exact state.
    plane.state.roll = 0;
    plane.state.pitch = 0;
    return { screen: SCREEN_PLAY, viewMode: 'cockpit', best: mission.state.score };
  }
  if (name === 'landing') {
    // Final approach: low over the runway threshold, gear-down slow, runway ahead.
    plane.reset({ x: -1400, y: 120, z: 60, heading: 90, speedKt: 85 });
    plane.state.throttle = 0.35;
    fly(state, 9, (p) => {
      const ctl = autopilot(p, 0, 0, 45);
      ctl.throttleDelta = p.speedKt < 80 ? 1 : -1;
      return ctl;
    });
    return { screen: SCREEN_PLAY, viewMode: 'chase', best: mission.state.score };
  }
  if (name === 'rings') {
    // Threading the course: third ring dead ahead over the city.
    fly(state, 46, (p) => {
      const ring = mission.state.rings[Math.min(mission.state.nextRing, mission.state.rings.length - 1)];
      return autopilot(p, ring.x, ring.z, ring.y);
    });
    return { screen: SCREEN_PLAY, viewMode: 'chase', best: mission.state.score };
  }
  // Default: chase — the hero shot. Climbing out over the valley, first ring
  // ahead, runway behind, mountains and lake in view.
  fly(state, 20, (p) => {
    const ring = mission.state.rings[0];
    return autopilot(p, ring.x, ring.z, ring.y);
  });
  return { screen: SCREEN_PLAY, viewMode: 'chase', best: mission.state.score };
}

export { wrapAngle };
