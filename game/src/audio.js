// Engine sound, synthesised with Web Audio: no audio files, nothing fetched.
// A low oscillator hum whose pitch follows the throttle, plus a wind hiss
// whose loudness follows airspeed. Starts on the first user gesture; every
// failure is swallowed, because sound must never break the game.

export function createAudio() {
  let ctx = null;
  let engine = null;
  let engineGain = null;
  let wind = null;
  let windGain = null;
  let started = false;

  function start() {
    if (started) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      engine = ctx.createOscillator();
      engine.type = 'sawtooth';
      engine.frequency.value = 55;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 320;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0.0;
      engine.connect(filter).connect(engineGain).connect(ctx.destination);
      engine.start();

      // Wind: filtered noise from a looping buffer.
      const len = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
      wind = ctx.createBufferSource();
      wind.buffer = buffer;
      wind.loop = true;
      const windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 700;
      windGain = ctx.createGain();
      windGain.gain.value = 0.0;
      wind.connect(windFilter).connect(windGain).connect(ctx.destination);
      wind.start();
      started = true;
    } catch {
      // No audio on this machine: fly silent.
    }
  }

  /** Call every frame with the plane state; silent when the game is paused. */
  function update(plane, running) {
    if (!started || !ctx) return;
    try {
      const t = ctx.currentTime;
      const target = running ? 0.045 + plane.throttle * 0.05 : 0.0;
      engineGain.gain.setTargetAtTime(target, t, 0.15);
      engine.frequency.setTargetAtTime(48 + plane.throttle * 70 + plane.speedKt * 0.25, t, 0.15);
      windGain.gain.setTargetAtTime(running ? Math.min(0.09, plane.speedKt * 0.00045) : 0.0, t, 0.2);
    } catch {
      // Ignore audio glitches.
    }
  }

  return { start, update };
}
