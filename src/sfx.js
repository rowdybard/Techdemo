// Sound recipes too involved for audio.js's one-line calls: the whistle and the crackle swarm.
// Each builds the nodes of one voice: `add` registers every node (audio.js's voice() disconnects
// them all when the sound ends) and it returns { source, output } as voice() expects. They take
// the context and the page's buffers as arguments, so they can also be rendered offline (an
// OfflineAudioContext) and listened to outside the show.

/** A buzzy waveform for whistles: a fundamental and a few harmonics, made once per context. */
export function makeWhistleWave(audio) {
  const real = new Float32Array([0, 0, 0, 0, 0, 0]);
  const imag = new Float32Array([0, 1, 0.42, 0.2, 0.09, 0.04]);
  return audio.createPeriodicWave(real, imag);
}

// A whistle, as a whistle composition burning in a tube sounds: a bright, buzzy tone that rises
// quickly and then more slowly as the tube burns down, wrapped in a shriek of breath (noise in a
// tight band that follows the pitch), with a fast flutter and a slight waver, cut off when it
// burns out. `waver` is the vibrato depth (a share of the pitch); a whirlwind wavers more.
export function whistle(audio, add, page, when, { from, to, length, peak, air = 1, waver = 0.008, flutter = 0.25 }) {
  const end = when + length;
  const rise = length * 0.4; // time constant of the climb in pitch
  const tone = add(audio.createOscillator());
  tone.setPeriodicWave(page.whistleWave);
  tone.frequency.setValueAtTime(from, when);
  tone.frequency.setTargetAtTime(to, when, rise);
  const vibrato = add(audio.createOscillator());
  vibrato.frequency.value = 5 + Math.random() * 4;
  const vibratoDepth = add(audio.createGain());
  vibratoDepth.gain.value = (from + to) * 0.5 * waver;
  vibrato.connect(vibratoDepth).connect(tone.frequency);

  const breath = add(audio.createBufferSource());
  breath.buffer = page.white;
  breath.loop = true;
  // Two band-passes in a row: a tight band, so the breath hugs the pitch instead of hissing.
  const band = add(audio.createBiquadFilter());
  const band2 = add(audio.createBiquadFilter());
  for (const filter of [band, band2]) {
    filter.type = 'bandpass';
    filter.Q.value = 7;
    filter.frequency.setValueAtTime(from, when);
    filter.frequency.setTargetAtTime(to, when, rise);
    vibratoDepth.connect(filter.frequency);
  }

  const toneLevel = add(audio.createGain());
  toneLevel.gain.value = 0.5;
  const breathLevel = add(audio.createGain());
  breathLevel.gain.value = 5; // a narrow band of noise is quiet: brought up to sit with the tone
  // Far off, the highs are soaked up by the air.
  const dull = add(audio.createBiquadFilter());
  dull.type = 'lowpass';
  dull.frequency.value = 2400 + 9000 * air;
  tone.connect(toneLevel).connect(dull);
  breath.connect(band).connect(band2).connect(breathLevel).connect(dull);

  // A fast flutter (between 1 - 2 × flutter and 1), then the shape: a quick swell, a hold, and
  // a short cut-off as it burns out.
  const flutterGain = add(audio.createGain());
  flutterGain.gain.value = 1 - flutter;
  const flutterOsc = add(audio.createOscillator());
  flutterOsc.frequency.value = 13 + Math.random() * 9;
  const flutterDepth = add(audio.createGain());
  flutterDepth.gain.value = flutter;
  flutterOsc.connect(flutterDepth).connect(flutterGain.gain);
  const shape = add(audio.createGain());
  shape.gain.setValueAtTime(0.0001, when);
  shape.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), when + 0.07);
  shape.gain.setValueAtTime(Math.max(peak, 0.0002), Math.max(when + 0.08, end - 0.09));
  shape.gain.exponentialRampToValueAtTime(0.0001, end);
  dull.connect(flutterGain).connect(shape);

  for (const source of [vibrato, breath, flutterOsc]) {
    source.start(when, source === breath ? Math.random() * page.white.duration * 0.5 : 0);
    source.stop(end + 0.05);
  }
  tone.start(when);
  return { source: tone, output: shape };
}

// A crackle shell's swarm of pops ("dragon eggs"): the swarm buffer (noise.js: sharp snaps, a few
// loud and many quiet, some ringing) through a high-pass that keeps them crisp, swelling in and
// dying away over `length` seconds. Two of these, panned apart, make it wide.
export function swarm(audio, add, page, when, { peak, length, air = 1 }) {
  const source = add(audio.createBufferSource());
  source.buffer = page.swarm;
  source.loop = true;
  source.playbackRate.value = 0.9 + Math.random() * 0.25;
  const crisp = add(audio.createBiquadFilter());
  crisp.type = 'highpass';
  crisp.frequency.value = 500 + 1500 * air;
  const dull = add(audio.createBiquadFilter());
  dull.type = 'lowpass';
  dull.frequency.value = 3000 + 9000 * air;
  const shape = add(audio.createGain());
  shape.gain.setValueAtTime(0.0001, when);
  shape.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), when + 0.12);
  shape.gain.setValueAtTime(Math.max(peak, 0.0002), when + length * 0.45);
  shape.gain.exponentialRampToValueAtTime(0.0001, when + length);
  source.connect(crisp).connect(dull).connect(shape);
  source.start(when, Math.random() * page.swarm.duration);
  return { source, output: shape };
}
