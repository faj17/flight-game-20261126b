// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. The game moves between six screens: title,
// play, paused, crashed, landed and mission complete.
//
// ?seed=N fixes the world. ?shot=chase|cockpit|landing|rings (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.

import { BEST_KEY, MISSIONS, STEP } from './config.js';
import { createRandom } from './random.js';
import { createCity, createClouds } from './terrain.js';
import { createPlane, EVENT_CRASHED, EVENT_DAMAGE, EVENT_FUEL_EMPTY, EVENT_LANDED, EVENT_STALL } from './physics.js';
import { createMission, MISSION_COMPLETE, MISSION_FAILED, MISSION_LANDED, MISSION_RING } from './missions.js';
import {
  ACTION_CAMERA, ACTION_CONFIRM, ACTION_MISSION1, ACTION_MISSION2, ACTION_MISSION3,
  ACTION_PAUSE, ACTION_RESTART, createInput,
} from './input.js';
import { createAudio } from './audio.js';
import {
  SCREEN_DONE, SCREEN_LANDED, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE,
  createRenderer,
} from './render.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);
const random = createRandom(seed);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const city = createCity();
const clouds = createClouds(random);
const world = { city, clouds };
const plane = createPlane();
const renderer = createRenderer(canvas, world);
const audio = createAudio();

let missionIndex = 0;
let mission = createMission(MISSIONS[missionIndex], random);

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score lasts this visit only.
  }
}

function runShot(name) {
  const state = { plane, mission };
  const scene = stageShot(name, state);
  let painted = 0;
  function paint() {
    renderer.draw(state, scene.screen, scene.best, scene.viewMode);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let viewMode = 'chase';
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();

  function announce(message) {
    status.textContent = message;
  }

  function startMission(index) {
    missionIndex = index;
    mission = createMission(MISSIONS[missionIndex], random);
    plane.reset();
    mission.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.start();
    announce(`Flying ${MISSIONS[missionIndex].name}.`);
  }

  function endRun(nextScreen, message) {
    screen = nextScreen;
    if (mission.state.score > best) {
      best = mission.state.score;
      saveBest(best);
    }
    announce(message);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MISSION1 && screen === SCREEN_TITLE) startMission(0);
    else if (actions & ACTION_MISSION2 && screen === SCREEN_TITLE) startMission(1);
    else if (actions & ACTION_MISSION3 && screen === SCREEN_TITLE) startMission(2);
    else if (actions & ACTION_CONFIRM && screen === SCREEN_TITLE) startMission(missionIndex);
    else if (actions & ACTION_CONFIRM && (screen === SCREEN_OVER || screen === SCREEN_LANDED || screen === SCREEN_DONE)) startMission(missionIndex);
    else if (actions & ACTION_RESTART && screen !== SCREEN_TITLE) startMission(missionIndex);
    else if (actions & ACTION_CAMERA && (screen === SCREEN_PLAY || screen === SCREEN_PAUSED)) {
      viewMode = viewMode === 'chase' ? 'cockpit' : 'chase';
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) return;
    const ctl = input.controls();
    const events = plane.step(STEP, ctl, mission.ringCrossing(plane.state));
    const missionEvents = mission.tick(STEP);
    audio.update(plane.state, screen === SCREEN_PLAY);
    if (events & EVENT_STALL) announce('Stall warning.');
    if (events & EVENT_FUEL_EMPTY) announce('Fuel empty.');
    if (events & EVENT_DAMAGE) announce('Hard touchdown — airframe damaged.');
    if (events & EVENT_LANDED) {
      const landed = mission.onLanded(plane.state);
      if (landed & MISSION_COMPLETE) endRun(SCREEN_DONE, `Mission complete. Score ${mission.state.score}.`);
      else if (landed & MISSION_LANDED) endRun(SCREEN_LANDED, `Landed. Score ${mission.state.score}.`);
    }
    if (missionEvents & MISSION_COMPLETE) endRun(SCREEN_DONE, `Mission complete. Score ${mission.state.score}.`);
    else if (missionEvents & MISSION_FAILED) endRun(SCREEN_OVER, `Time up. Score ${mission.state.score}.`);
    if (events & EVENT_CRASHED) endRun(SCREEN_OVER, `Crashed. Score ${mission.state.score}.`);
    if (plane.state.damage >= 100 && screen === SCREEN_PLAY) endRun(SCREEN_OVER, 'Airframe destroyed.');
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP && screen === SCREEN_PLAY) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    const state = { plane, mission };
    renderer.draw(state, screen, best, viewMode);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Kestrel Courier. Press 1, 2 or 3 to choose a mission.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
