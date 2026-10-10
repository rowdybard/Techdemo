// The noise behind every sound (audio.js): deep brown noise, white noise, sparse crackle,
// a crackle shell's swarm of pops, and the echo off the water. Made ahead of time, one piece per idle moment, at the rate
// most phones play at. Made in the first tap instead (the tap that starts the sound),
// its 650,000-odd samples held that tap's answer up by a few hundred ms on a phone.
const RATE = 48000;
let noise = null; // { brown, white, crackle, swarm, room: [left, right] } as Float32Arrays, once made
const made = { room: [] }; // the pieces finished so far
const NOISE_STEPS = [
  () => { made.brown = brownNoise(RATE * 4); },
  () => { made.white = whiteNoise(RATE * 2); },
  () => { made.crackle = crackleNoise(RATE * 2); },
  () => { made.swarm = swarmNoise(RATE * 1.6); },
  () => { made.room.push(roomTail(RATE * 2.8, RATE * 0.12)); }, // the echo, left
  () => { made.room.push(roomTail(RATE * 2.8, RATE * 0.12)); }, // and right
];
let nextStep = 0;
let idleStarted = false;

function noiseStep() {
  NOISE_STEPS[nextStep++]();
  if (nextStep === NOISE_STEPS.length) noise = made;
}

/** Starts making the noise in idle moments (once per page). */
export function makeNoiseSoon() {
  if (idleStarted) return;
  idleStarted = true;
  const idle = window.requestIdleCallback || ((step) => setTimeout(step, 40));
  const step = () => {
    if (noise) return; // a tap finished it first
    noiseStep();
    if (!noise) idle(step, { timeout: 3000 });
  };
  idle(step, { timeout: 3000 });
}

/** The noise, finishing whatever isn't made yet. */
export function noiseNow() {
  while (!noise) noiseStep();
  return noise;
}

// Brown noise: white noise through a leaky integrator, deep enough for booms and surf.
function brownNoise(length) {
  const data = new Float32Array(length);
  let last = 0;
  for (let i = 0; i < length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    data[i] = last * 3.5;
  }
  return data;
}

function whiteNoise(length) {
  const data = new Float32Array(length);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return data;
}

// Sparse sharp clicks, like a crackle shell's tiny pops.
function crackleNoise(length) {
  const data = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    if (Math.random() < 0.0009) {
      const pop = 40 + Math.floor(Math.random() * 120);
      for (let k = 0; k < pop && i + k < length; k++) data[i + k] += (Math.random() * 2 - 1) * (1 - k / pop);
    }
  }
  return data;
}

// A crackle shell's swarm ("dragon eggs"): about 90 sharp snaps a second, scattered evenly. Each
// starts at full strength and dies in a millisecond or two; a few are loud and most are quiet,
// and some ring a little (a snap with a pitch to it), so it pops instead of fizzing.
function swarmNoise(length) {
  const data = new Float32Array(length);
  const pops = Math.round((length / RATE) * 90);
  for (let n = 0; n < pops; n++) {
    const at = Math.floor(Math.random() * (length - 800));
    const loud = 0.12 + 0.88 * Math.pow(Math.random(), 2.6);
    const decay = (0.0005 + Math.random() * 0.0016) * RATE; // samples
    const ring = Math.random() < 0.4 ? (2 * Math.PI * (1600 + Math.random() * 2600)) / RATE : 0;
    const span = Math.min(800, Math.ceil(decay * 6));
    for (let k = 0; k < span; k++) {
      const fade = Math.exp(-k / decay);
      const snap = (Math.random() * 2 - 1) * fade;
      data[at + k] += (ring ? snap * 0.5 + Math.sin(ring * k) * fade * 0.8 : snap) * loud;
    }
  }
  let top = 0;
  for (let i = 0; i < length; i++) top = Math.max(top, Math.abs(data[i]));
  const scale = 0.9 / (top || 1);
  for (let i = 0; i < length; i++) data[i] *= scale;
  return data;
}

// One channel of the echo off the water: a tail of noise, darker and sparser as it decays,
// with a gap before it (the first reflection comes back from far off).
function roomTail(length, gap) {
  const data = new Float32Array(length);
  let low = 0;
  for (let i = gap; i < length; i++) {
    const t = (i - gap) / (length - gap);
    low += (Math.random() * 2 - 1 - low) * (0.35 - 0.3 * t); // duller as it fades
    data[i] = low * Math.pow(1 - t, 2.4) * 0.6;
  }
  return data;
}
