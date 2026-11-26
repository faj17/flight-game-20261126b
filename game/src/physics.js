// The flight model: one plane, one fixed step, no drawing and no browser in
// it. Throttle sets a target speed; pitch trades speed for altitude; bank
// turns the heading; below stall speed the nose drops and the wing gives up.
// step() returns what happened as bit flags.

import { KT_TO_MS, MS_TO_KT, angleDelta, DEG, wrapAngle } from './random.js';
import { PLANE } from './config.js';
import { groundHeight, onRunway } from './terrain.js';

export const EVENT_RING = 1;
export const EVENT_LANDED = 2;
export const EVENT_CRASHED = 4;
export const EVENT_STALL = 8;
export const EVENT_FUEL_EMPTY = 16;
export const EVENT_DAMAGE = 32;

export function createPlane() {
  const state = {
    // Position in metres; y is altitude above sea level.
    x: -700, y: 160, z: 0,
    heading: 90, // degrees, 0 = north (-z), 90 = east (+x)
    pitch: 0, // degrees, positive = nose up
    roll: 0, // degrees, positive = bank right
    speedKt: 90,
    throttle: 0.6,
    fuel: 100,
    damage: 0,
    vspeed: 0, // m/s, positive = climbing
    altitudeAgl: 160,
    stalled: false,
    airborne: true,
    time: 0,
  };

  function reset(start) {
    state.x = start?.x ?? -700;
    state.y = start?.y ?? 160;
    state.z = start?.z ?? 0;
    state.heading = start?.heading ?? 90;
    state.pitch = 0;
    state.roll = 0;
    state.speedKt = start?.speedKt ?? 90;
    state.throttle = 0.6;
    state.fuel = 100;
    state.damage = 0;
    state.vspeed = 0;
    state.stalled = false;
    state.airborne = true;
    state.time = 0;
    state.altitudeAgl = state.y - groundHeight(state.x, state.z);
  }

  /**
   * One fixed step. `ctl` holds the pilot's inputs for this step:
   * pitch -1..1 (up positive), roll -1..1 (right positive), throttleDelta
   * -1..1, and `brake` to bleed speed on the ground. `onRing` is a callback
   * the missions module uses to test ring crossings; it returns an event flag.
   */
  function step(dt, ctl, onRing) {
    let events = 0;
    state.time += dt;

    // Throttle: the stick sets a target speed; the engine chases it.
    state.throttle = Math.max(0, Math.min(1, state.throttle + ctl.throttleDelta * dt * 0.55));
    if (state.fuel <= 0 && state.throttle > 0) {
      state.throttle = 0;
      events |= EVENT_FUEL_EMPTY;
    }
    const targetKt = state.fuel > 0
      ? PLANE.idleSpeed + state.throttle * (PLANE.maxSpeed - PLANE.idleSpeed)
      : PLANE.idleSpeed * 0.55; // gliding, no power
    const speedMs = state.speedKt * KT_TO_MS;
    const accel = (targetKt - state.speedKt) * 0.35 + (ctl.brake ? -22 : 0);
    state.speedKt = Math.max(0, state.speedKt + accel * dt);

    // Stall: below stall speed the wing stops flying and the nose drops.
    const wasStalled = state.stalled;
    state.stalled = state.airborne && state.speedKt < PLANE.stallSpeed;
    if (state.stalled && !wasStalled) events |= EVENT_STALL;

    // Roll and pitch answer the stick at every speed, weaker when slow.
    const authority = 0.35 + 0.65 * Math.min(1, state.speedKt / PLANE.cruiseSpeed);
    state.roll += ctl.roll * PLANE.rollRate * authority * dt;
    state.roll = Math.max(-75, Math.min(75, state.roll));
    // Gentle self-levelling when the stick is centred.
    if (ctl.roll === 0) state.roll *= Math.max(0, 1 - 0.8 * dt);
    const pitchTarget = state.stalled ? -14 : ctl.pitch * PLANE.pitchRate * 0.45;
    state.pitch += (pitchTarget - state.pitch) * Math.min(1, 3.2 * dt);
    state.pitch = Math.max(-30, Math.min(28, state.pitch));

    // A banked wing turns the heading; the turn tightens with bank and speed.
    const turnRate = Math.tan(state.roll * DEG) * 9.81 / Math.max(20, speedMs) / DEG;
    state.heading = wrapAngle(state.heading + turnRate * dt * 0.9);

    // Climb: pitch times speed, minus a sink that grows when slow or stalled.
    const climb = Math.sin(state.pitch * DEG) * speedMs;
    const sink = state.stalled ? 6 : Math.max(0, (PLANE.stallSpeed - state.speedKt)) * 0.12;
    state.vspeed = climb - sink;
    const prevX = state.x;
    const prevY = state.y;
    const prevZ = state.z;
    const hRad = state.heading * DEG;
    const pRad = state.pitch * DEG;
    state.x += Math.sin(hRad) * Math.cos(pRad) * speedMs * dt;
    state.z -= Math.cos(hRad) * Math.cos(pRad) * speedMs * dt;
    state.y += state.vspeed * dt;

    // Fuel burns with throttle; a dead tank is a glide, not a teleport.
    if (state.fuel > 0) {
      state.fuel = Math.max(0, state.fuel - PLANE.fuelBurn * (0.25 + state.throttle) * dt);
    }

    // Ring crossings, if the mission is watching.
    if (onRing) events |= onRing(prevX, prevY, prevZ);

    // Ground contact.
    const ground = groundHeight(state.x, state.z);
    state.altitudeAgl = state.y - ground;
    if (state.y <= ground) {
      state.y = ground;
      const onStrip = onRunway(state.x, state.z);
      const aligned = Math.abs(angleDelta(state.heading, 90)) < 25 || Math.abs(angleDelta(state.heading, 270)) < 25;
      const gentle = state.vspeed > -PLANE.softLandingVs;
      const slow = state.speedKt <= PLANE.maxLandingSpeed;
      const level = Math.abs(state.roll) < 18;
      if (state.airborne && onStrip && aligned && gentle && slow && level) {
        // Touchdown: roll out on the runway.
        state.airborne = false;
        state.pitch = 0;
        state.roll = 0;
        events |= EVENT_LANDED;
      } else if (state.airborne) {
        // Anything else at ground level is a crash; a hard runway hit is damage.
        if (onStrip && gentle && slow) {
          state.damage += Math.min(60, (-state.vspeed - PLANE.softLandingVs) * PLANE.hardLandingDamage);
          events |= EVENT_DAMAGE;
          state.airborne = false;
          state.pitch = 0;
          state.roll = 0;
          if (state.damage >= 100) events |= EVENT_CRASHED;
        } else {
          state.damage = 100;
          events |= EVENT_CRASHED;
        }
      } else {
        // Rolling on the ground: friction bleeds speed, steering follows the rudder.
        state.speedKt = Math.max(0, state.speedKt - 26 * dt);
        state.heading = wrapAngle(state.heading + ctl.roll * 14 * dt);
        if (state.speedKt > 55 && ctl.pitch > 0.4) {
          state.airborne = true; // rotate and lift off again
          state.y += 1;
        }
      }
    }

    // Out of the valley: turn the plane back gently instead of losing it.
    const r = Math.hypot(state.x, state.z);
    if (r > 2900) {
      const home = (Math.atan2(state.x, -state.z) / DEG + 180) % 360;
      state.heading = wrapAngle(state.heading + angleDelta(state.heading, home) * 0.5 * dt);
    }
    return events;
  }

  reset();
  return { state, reset, step };
}
