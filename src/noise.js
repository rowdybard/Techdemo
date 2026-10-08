// The noise behind every sound (audio.js): deep brown noise, white noise, sparse crackle
// and the echo off the water. Made ahead of time, one piece per idle moment, at the rate
// most phones play at. Made in the first tap instead (the tap that starts the sound),
// its 650,000-odd samples held that tap's answer up by a few hundred ms on a phone.
const RATE = 48000;
let noise = null; // { brown, white, crackle, room: [left, right] } as Float32Arrays, once made
const made = { room: [] }; // the pieces finished so far
const NOISE_STEPS = [
  () => { made.brown = brownNoise(RATE * 4); },
  () => { made.white = whiteNoise(RATE * 2); },
  () => { made.crackle = crackleNoise(RATE * 2); },
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
