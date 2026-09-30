// Firework sound, synthesised with Web Audio: a deep boom for each burst and a crackle
// for crackle shells. Sound travels at 343 m/s, so each boom arrives a little after its
// flash, as it does on a real beach. Audio starts only after the first tap or key press
// (browsers require it), caps how many sounds play at once, and disconnects each sound's
// nodes when it ends.
//
// One AudioContext serves the whole page and outlives app rebuilds: Chromium keeps
// closed AudioContexts in memory, so closing one per rebuild leaked (the Shift+R test
// showed it). Each app disconnects its own nodes on dispose; the context closes when the
// page goes away.
//
// Each sound needs a few new audio nodes (a buffer source can only play once), so this is
// the one place that allocates during the show; the noise buffers are made once.

const SPEED_OF_SOUND = 343;
const MAX_VOICES = 10;

let shared = null; // { audio, noise, crackle } for the page's lifetime

function sharedAudio() {
  if (shared) return shared;
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) return null;
  const audio = new Context();
  shared = { audio, noise: makeNoise(audio, 2.5), crackle: makeCrackle(audio, 1.8) };
  addEventListener('pagehide', () => audio.close(), { once: true });
  return shared;
}

export function create(ctx) {
  const { config, camera, signal } = ctx;
  const settings = config.sound;
  let audio = null;
  let master = null;
  let compressor = null;
  let noise = null;
  let crackle = null;
  let voices = 0;
  let heard = -1e9; // time of the newest burst already given a sound

  function start() {
    if (audio || !settings.enabled) return;
    const page = sharedAudio();
    if (!page) return;
    ({ audio, noise, crackle } = page);
    if (audio.state === 'suspended') audio.resume();
    compressor = audio.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.ratio.value = 6;
    master = audio.createGain();
    master.gain.value = settings.volume;
    master.connect(compressor).connect(audio.destination);
    heard = ctx.fireworks ? latestBurst(ctx.fireworks.bursts, Infinity) : heard;
  }
  // Browsers only allow audio after a gesture.
  addEventListener('pointerdown', start, { signal });
  addEventListener('keydown', start, { signal });

  function play(buffer, when, volume, filterFrom, filterTo, length) {
    if (voices >= MAX_VOICES) return;
    voices++;
    const source = audio.createBufferSource();
    source.buffer = buffer;
    const filter = audio.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterFrom, when);
    filter.frequency.exponentialRampToValueAtTime(filterTo, when + length * 0.6);
    const gain = audio.createGain();
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(volume, when + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + length);
    source.connect(filter).connect(gain).connect(master);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
      voices--;
    };
    source.start(when, Math.random() * 0.5);
    source.stop(when + length + 0.05);
  }

  return {
    update(dt, time) {
      if (!audio) return;
      master.gain.value = settings.enabled ? settings.volume : 0;
      if (!settings.enabled || !ctx.fireworks) return;
      const bursts = ctx.fireworks.bursts;
      for (let i = 0; i < bursts.length; i++) {
        const b = bursts[i];
        if (b.time <= heard || b.time > time) continue;
        const distance = Math.hypot(b.x - camera.position.x, b.y - camera.position.y, b.z - camera.position.z);
        const when = Math.max(audio.currentTime, audio.currentTime + (b.time - time) + distance / SPEED_OF_SOUND / Math.max(config.loop.timeScale, 0.1));
        const loudness = Math.min(1, (b.size / 60) * (300 / Math.max(distance, 100)));
        play(noise, when, 0.9 * loudness, 900, 70, 2.2);
        if (b.type === 'crackle') play(crackle, when + 0.7, 0.5 * loudness, 9000, 3000, 1.6);
      }
      heard = latestBurst(bursts, time);
    },

    dispose() {
      // Sounds still playing end on their own and disconnect themselves.
      if (master) master.disconnect();
      if (compressor) compressor.disconnect();
      audio = null;
      master = null;
      compressor = null;
    },
  };
}

function latestBurst(bursts, before) {
  let latest = -1e9;
  for (let i = 0; i < bursts.length; i++) if (bursts[i].time <= before && bursts[i].time > latest) latest = bursts[i].time;
  return latest;
}

// Brown-ish noise: white noise run through a leaky integrator, deep enough for a boom.
function makeNoise(audio, seconds) {
  const buffer = audio.createBuffer(1, Math.floor(audio.sampleRate * seconds), audio.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    data[i] = last * 3.5;
  }
  return buffer;
}

// Sparse sharp clicks, like a crackle shell's tiny pops.
function makeCrackle(audio, seconds) {
  const buffer = audio.createBuffer(1, Math.floor(audio.sampleRate * seconds), audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    if (Math.random() < 0.0009) {
      const length = 40 + Math.floor(Math.random() * 120);
      for (let k = 0; k < length && i + k < data.length; k++) data[i + k] += (Math.random() * 2 - 1) * (1 - k / length);
    }
  }
  return buffer;
}
