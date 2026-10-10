// Sound recipes too involved for audio.js's one-line calls: the whirlwinds' whirr and the crackle swarm.
// Each builds the nodes of one voice: `add` registers every node (audio.js's voice() disconnects
// them all when the sound ends) and it returns { source, output } as voice() expects. They take
// the context and the page's buffers as arguments, so they can also be rendered offline (an
// OfflineAudioContext) and listened to outside the show.

// Whirlwinds: a soft whirring fizz as the sparks spin, with no pitch to it (tonal whistles sounded
// synthetic, and the owner asked for them gone). Noise in a broad band that swings up and down a
// few times a second, pulsing as it goes, swelling in and dying away over `length` seconds.
export function whirr(audio, add, page, when, { peak, length, air = 1 }) {
  const end = when + length;
  const source = add(audio.createBufferSource());
  source.buffer = page.white;
  source.loop = true;
  const band = add(audio.createBiquadFilter());
  band.type = 'bandpass';
  band.Q.value = 1.6;
  band.frequency.value = 1800 + 1400 * air;
  const swing = add(audio.createOscillator());
  swing.frequency.value = 5 + Math.random() * 3;
  const swingDepth = add(audio.createGain());
  swingDepth.gain.value = 700 * air;
  swing.connect(swingDepth).connect(band.frequency);
  const pulse = add(audio.createGain());
  pulse.gain.value = 0.7;
  const pulseOsc = add(audio.createOscillator());
  pulseOsc.frequency.value = 9 + Math.random() * 4;
  const pulseDepth = add(audio.createGain());
  pulseDepth.gain.value = 0.3;
  pulseOsc.connect(pulseDepth).connect(pulse.gain);
  const shape = add(audio.createGain());
  shape.gain.setValueAtTime(0.0001, when);
  shape.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), when + 0.25);
  shape.gain.exponentialRampToValueAtTime(0.0001, end);
  source.connect(band).connect(pulse).connect(shape);
  for (const osc of [swing, pulseOsc]) {
    osc.start(when);
    osc.stop(end + 0.05);
  }
  source.start(when, Math.random() * page.white.duration * 0.5);
  return { source, output: shape };
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
