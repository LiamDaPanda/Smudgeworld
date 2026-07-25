// All sound in Smudgeworld is synthesized with WebAudio at runtime — no audio
// files to download, so the installed PWA stays small and works offline.
//
// The mix is deliberately soft and papery to match the art: filtered noise for
// wind, short sine blips for birds, a filtered thump for footsteps.

const MUTE_KEY = "smudgeworld-muted";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let ambientGain: GainNode | null = null;
let waterGain: GainNode | null = null;
let muted = false;
let started = false;
let birdTimer = 0;

export function isMuted() {
  return muted;
}

/** Shared noise buffer — two seconds of white noise we re-use for all beds. */
function makeNoiseBuffer(audio: AudioContext): AudioBuffer {
  const len = audio.sampleRate * 2;
  const buf = audio.createBuffer(1, len, audio.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

/**
 * Boot the audio graph. Must be called from a user gesture (we call it from
 * the menu's ENTER button) or browsers will leave the context suspended.
 */
export function initAudio() {
  if (started) return;
  started = true;
  try {
    muted = localStorage.getItem(MUTE_KEY) === "1";
  } catch { /* storage blocked — default to unmuted */ }

  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC();
  } catch {
    ctx = null;
    return;
  }

  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.9;
  master.connect(ctx.destination);

  const noise = makeNoiseBuffer(ctx);

  // --- Wind bed: brown-ish noise through a low shelf, very quiet ---
  const windSrc = ctx.createBufferSource();
  windSrc.buffer = noise;
  windSrc.loop = true;
  const windFilter = ctx.createBiquadFilter();
  windFilter.type = "lowpass";
  windFilter.frequency.value = 420;
  windFilter.Q.value = 0.4;
  ambientGain = ctx.createGain();
  ambientGain.gain.value = 0.05;
  windSrc.connect(windFilter);
  windFilter.connect(ambientGain);
  ambientGain.connect(master);
  windSrc.start();

  // Slow LFO on the wind filter so it breathes instead of sitting static.
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.07;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 160;
  lfo.connect(lfoGain);
  lfoGain.connect(windFilter.frequency);
  lfo.start();

  // --- Water bed: brighter noise, gain driven by distance to the pond ---
  const waterSrc = ctx.createBufferSource();
  waterSrc.buffer = noise;
  waterSrc.loop = true;
  const waterFilter = ctx.createBiquadFilter();
  waterFilter.type = "bandpass";
  waterFilter.frequency.value = 1800;
  waterFilter.Q.value = 0.7;
  waterGain = ctx.createGain();
  waterGain.gain.value = 0;
  waterSrc.connect(waterFilter);
  waterFilter.connect(waterGain);
  waterGain.connect(master);
  waterSrc.start();
}

export function toggleMute(): boolean {
  muted = !muted;
  if (master && ctx) {
    master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, 0.05);
  }
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch { /* ignore */ }
  return muted;
}

/** Short pitched blip built from an oscillator + envelope. */
function blip(freq: number, dur: number, type: OscillatorType, vol: number, glideTo?: number) {
  if (!ctx || !master || muted) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (glideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(glideTo, now + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(vol, now + Math.min(0.012, dur * 0.3));
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  osc.connect(g);
  g.connect(master);
  osc.start(now);
  osc.stop(now + dur + 0.02);
}

/** Filtered noise burst — used for footsteps and the shutter mechanism. */
function noiseBurst(dur: number, cutoff: number, vol: number, type: BiquadFilterType = "lowpass") {
  if (!ctx || !master || muted) return;
  const now = ctx.currentTime;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    // Decaying noise so the burst has a natural tail
    data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = cutoff;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(filter);
  filter.connect(g);
  g.connect(master);
  src.start(now);
}

export function playFootstep() {
  // Slight random pitch so repeated steps don't sound machine-gunned
  noiseBurst(0.09, 220 + Math.random() * 120, 0.16);
}

export function playShutter() {
  // Mechanical two-part click: mirror slap then the shutter close
  noiseBurst(0.035, 2600, 0.34, "bandpass");
  setTimeout(() => noiseBurst(0.05, 1500, 0.26, "bandpass"), 70);
}

export function playUiTick() {
  blip(880, 0.05, "triangle", 0.06);
}

export function playSuccess() {
  // Rising three-note flourish for a captured snapshot
  blip(523, 0.14, "sine", 0.1);
  setTimeout(() => blip(659, 0.14, "sine", 0.1), 90);
  setTimeout(() => blip(784, 0.22, "sine", 0.11), 180);
}

export function playLevelUp() {
  blip(523, 0.16, "triangle", 0.11);
  setTimeout(() => blip(659, 0.16, "triangle", 0.11), 110);
  setTimeout(() => blip(784, 0.16, "triangle", 0.11), 220);
  setTimeout(() => blip(1046, 0.34, "triangle", 0.12), 330);
}

export function playSetComplete() {
  blip(392, 0.2, "sine", 0.1);
  setTimeout(() => blip(523, 0.2, "sine", 0.11), 130);
  setTimeout(() => blip(659, 0.2, "sine", 0.11), 260);
  setTimeout(() => blip(1046, 0.5, "sine", 0.13), 390);
}

export function playNearby() {
  // Soft two-note "something's here" cue when a smudge comes into range
  blip(660, 0.1, "sine", 0.07);
  setTimeout(() => blip(880, 0.13, "sine", 0.06), 80);
}

/**
 * Per-frame ambience. `waterDistance` drives the pond bed; `walking` and the
 * player's stride phase schedule footsteps; birds chirp on a random timer that
 * quiets down at night.
 */
export function updateAudio(dt: number, opts: {
  waterDistance: number;
  walking: boolean;
  strideHz: number;
  night: number; // 0 = day, 1 = full night
}) {
  if (!ctx || muted) return;

  if (waterGain) {
    // Audible from ~14 units out, peaking right at the water's edge
    const target = Math.max(0, 1 - opts.waterDistance / 14) * 0.09;
    waterGain.gain.setTargetAtTime(target, ctx.currentTime, 0.3);
  }

  if (ambientGain) {
    // Wind lifts slightly at night so the world feels cooler after dark
    ambientGain.gain.setTargetAtTime(0.05 + opts.night * 0.03, ctx.currentTime, 0.5);
  }

  // Birds by day, crickets by night
  birdTimer -= dt;
  if (birdTimer <= 0) {
    birdTimer = 1.6 + Math.random() * 4.5;
    if (opts.night < 0.5) {
      // Two or three quick descending chirps
      const base = 1800 + Math.random() * 1400;
      const n = 2 + Math.floor(Math.random() * 2);
      for (let i = 0; i < n; i++) {
        setTimeout(() => blip(base * (1 - i * 0.06), 0.07, "sine", 0.035, base * 0.7), i * 95);
      }
    } else {
      // Cricket: a rapid stutter of very short high blips
      for (let i = 0; i < 4; i++) {
        setTimeout(() => blip(2400, 0.02, "square", 0.012), i * 55);
      }
    }
  }
}

let stepAccum = 0;
/** Call each frame; emits footsteps in time with the player's stride. */
export function updateFootsteps(dt: number, walking: boolean, strideHz: number) {
  if (!walking) { stepAccum = 0; return; }
  stepAccum += dt * strideHz;
  if (stepAccum >= 1) {
    stepAccum -= 1;
    playFootstep();
  }
}
