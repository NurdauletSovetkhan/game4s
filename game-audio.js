function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function createAudioController() {
  const audioState = {
    ctx: null,
    enabled: false
  };

  function initAudio() {
    if (audioState.enabled) return;

    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;

    audioState.ctx = new Ctx();
    audioState.enabled = true;
  }

  function playTone({ freq = 440, duration = 0.12, type = 'sine', gain = 0.05, sweep = 0 }) {
    const ctx = audioState.ctx;
    if (!audioState.enabled || !ctx) return;

    const t0 = ctx.currentTime;
    const t1 = t0 + duration;

    const osc = ctx.createOscillator();
    const amp = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (sweep !== 0) {
      osc.frequency.linearRampToValueAtTime(Math.max(40, freq + sweep), t1);
    }

    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.015);
    amp.gain.exponentialRampToValueAtTime(0.0001, t1);

    osc.connect(amp);
    amp.connect(ctx.destination);

    osc.start(t0);
    osc.stop(t1 + 0.01);
  }

  function playShotSound(power) {
    const p = clamp(power, 0, 1);
    playTone({ freq: 180 + 160 * p, duration: 0.11, type: 'triangle', gain: 0.06 + 0.03 * p, sweep: 110 });
    playTone({ freq: 120 + 90 * p, duration: 0.17, type: 'sine', gain: 0.03, sweep: -30 });
  }

  function playCorrectSound() {
    playTone({ freq: 520, duration: 0.08, type: 'sine', gain: 0.05 });
    playTone({ freq: 660, duration: 0.1, type: 'sine', gain: 0.05 });
  }

  function playWrongSound() {
    playTone({ freq: 260, duration: 0.12, type: 'sawtooth', gain: 0.05, sweep: -90 });
  }

  function playCheckpointSound() {
    playTone({ freq: 360, duration: 0.07, type: 'triangle', gain: 0.04 });
    playTone({ freq: 450, duration: 0.1, type: 'triangle', gain: 0.04 });
  }

  function playHazardSound() {
    playTone({ freq: 170, duration: 0.16, type: 'square', gain: 0.06, sweep: -70 });
  }

  function playHoleCompleteSound() {
    playTone({ freq: 392, duration: 0.1, type: 'sine', gain: 0.05 });
    playTone({ freq: 494, duration: 0.1, type: 'sine', gain: 0.05 });
    playTone({ freq: 587, duration: 0.14, type: 'sine', gain: 0.06 });
  }

  return {
    initAudio,
    playTone,
    playShotSound,
    playCorrectSound,
    playWrongSound,
    playCheckpointSound,
    playHazardSound,
    playHoleCompleteSound
  };
}
