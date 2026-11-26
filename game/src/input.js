// Keyboard and mouse input. Held keys give a control deflection; one-shot
// presses (start, pause, camera, mission select) are queued as bit flags and
// taken once by the loop, so a press between two frames is never lost and
// never counted twice. The mouse steers too: hold the left button and the
// stick follows the pointer.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_CAMERA = 4;
export const ACTION_MISSION1 = 8;
export const ACTION_MISSION2 = 16;
export const ACTION_MISSION3 = 32;
export const ACTION_RESTART = 64;

const PITCH_UP = new Set(['ArrowUp', 'KeyW']);
const PITCH_DOWN = new Set(['ArrowDown', 'KeyS']);
const ROLL_LEFT = new Set(['ArrowLeft', 'KeyA']);
const ROLL_RIGHT = new Set(['ArrowRight', 'KeyD']);
const THROTTLE_UP = new Set(['ShiftLeft', 'ShiftRight', 'Equal', 'NumpadAdd']);
const THROTTLE_DOWN = new Set(['ControlLeft', 'ControlRight', 'Minus', 'NumpadSubtract']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const CAMERA = new Set(['KeyC']);
const RESTART = new Set(['KeyR']);
const BRAKE = new Set(['KeyB']);

export function createInput(target) {
  const held = new Set();
  let actions = 0;
  let mouseDown = false;
  let mouseX = 0.5;
  let mouseY = 0.5;

  window.addEventListener('keydown', (event) => {
    if (PITCH_UP.has(event.code) || PITCH_DOWN.has(event.code)
      || ROLL_LEFT.has(event.code) || ROLL_RIGHT.has(event.code)
      || THROTTLE_UP.has(event.code) || THROTTLE_DOWN.has(event.code)
      || BRAKE.has(event.code) || CONFIRM.has(event.code)) {
      event.preventDefault();
    }
    held.add(event.code);
    if (event.repeat) return;
    if (CONFIRM.has(event.code)) actions |= ACTION_CONFIRM;
    else if (PAUSE.has(event.code)) actions |= ACTION_PAUSE;
    else if (CAMERA.has(event.code)) actions |= ACTION_CAMERA;
    else if (RESTART.has(event.code)) actions |= ACTION_RESTART;
    else if (event.code === 'Digit1') actions |= ACTION_MISSION1;
    else if (event.code === 'Digit2') actions |= ACTION_MISSION2;
    else if (event.code === 'Digit3') actions |= ACTION_MISSION3;
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  window.addEventListener('blur', () => {
    held.clear();
    mouseDown = false;
  });
  target.addEventListener('pointerdown', (event) => {
    mouseDown = true;
    mouseX = event.clientX / window.innerWidth;
    mouseY = event.clientY / window.innerHeight;
    actions |= ACTION_CONFIRM;
  });
  target.addEventListener('pointermove', (event) => {
    mouseX = event.clientX / window.innerWidth;
    mouseY = event.clientY / window.innerHeight;
  });
  window.addEventListener('pointerup', () => {
    mouseDown = false;
  });

  function has(set) {
    for (const code of set) if (held.has(code)) return true;
    return false;
  }

  return {
    /** Control deflections for this frame: pitch/roll -1..1, throttle -1..1. */
    controls() {
      let pitch = (has(PITCH_UP) ? 1 : 0) - (has(PITCH_DOWN) ? 1 : 0);
      let roll = (has(ROLL_RIGHT) ? 1 : 0) - (has(ROLL_LEFT) ? 1 : 0);
      if (mouseDown) {
        // The pointer is the stick: away from centre is the deflection.
        roll = Math.max(-1, Math.min(1, (mouseX - 0.5) * 3));
        pitch = Math.max(-1, Math.min(1, (0.5 - mouseY) * 3));
      }
      const throttleDelta = (has(THROTTLE_UP) ? 1 : 0) - (has(THROTTLE_DOWN) ? 1 : 0);
      return { pitch, roll, throttleDelta, brake: has(BRAKE) };
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
