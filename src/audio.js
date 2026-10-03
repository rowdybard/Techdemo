// Sound, synthesised with Web Audio: nothing is downloaded. Every sound is built from a few
// noise buffers and oscillators made once:
//   bursts    a deep thump, a rumbling body and a sharp crack; farther shells are quieter
//             and duller (air soaks up the highs), and each is panned to where it burst
//   by type   crackle crackles, glitter and willows hiss as they fall, double breaks boom
//             twice, crossettes pop as they split, shapes and words are softer, eyes silent
//   launches  a mortar thump from the barge, and now and then a whistle on the way up
//   ground    fountains hiss while they burn, mines thump, candles pop, shooters whoosh,
//             cauldrons bubble, lightning cracks and rolls
//   the sea   waves washing in under everything
// Everything goes through a shared echo (a procedural impulse response), so booms roll
// back off the water. Sound travels at 343 m/s, so each arrives after its flash.
//
// Audio starts after the first tap or key press (browsers require it). One AudioContext
// serves the page across rebuilds (Chromium keeps closed contexts in memory, so closing
// one per rebuild leaked); each app disconnects its own nodes on dispose. Each sound needs
// a few new nodes (a buffer source plays once), so this is the one module that allocates
// during the show; a voice cap bounds it, and every voice disconnects itself when done.

const SPEED_OF_SOUND = 343;
const MAX_VOICES = 32;
const SHAPES = new Set(['heart', 'star', 'text', 'pumpkin', 'skull', 'bat', 'ghost', 'web']);
const HISSERS = new Set(['willow', 'palm', 'wisp', 'chrysanthemum']);

let shared = null; // { audio, brown, white, crackle, room } for the page's lifetime

function sharedAudio() {
  if (shared) return shared;
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) return null;
  const audio = new Context();
  shared = {
    audio,
    brown: makeBrown(audio, 4),
    white: makeWhite(audio, 2),
    crackle: makeCrackle(audio, 2),
    room: makeRoom(audio, 2.8),
  };
  addEventListener('pagehide', () => audio.close(), { once: true });
  return shared;
}

export function create(ctx) {
  const { config, camera, signal } = ctx;
  const settings = config.sound;
  let page = null;
  let audio = null;
  let master = null;
  let compressor = null;
  let bus = null;
  let echo = null;
  let echoLevel = null;
  const sea = [];
  let voices = 0;
  let heardBurst = -1e9;
  let heardLaunch = -1e9;
  let heardGround = -1e9;
  let groundVoices = 0;

  function start() {
    if (audio || !settings.enabled) return;
    page = sharedAudio();
    if (!page) return;
    audio = page.audio;
    if (audio.state === 'suspended') audio.resume();
    compressor = audio.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.ratio.value = 5;
    master = audio.createGain();
    master.gain.value = settings.volume;
    master.connect(compressor).connect(audio.destination);
    // Every sound goes to the bus; the bus feeds the speakers and the echo.
    bus = audio.createGain();
    bus.connect(master);
    echo = audio.createConvolver();
    echo.buffer = page.room;
    echoLevel = audio.createGain();
    echoLevel.gain.value = 0.35;
    bus.connect(echo).connect(echoLevel).connect(master);
    startSea();
    const bursts = ctx.fireworks ? ctx.fireworks.bursts : [];
    heardBurst = latest(bursts, 'time', Infinity);
    heardLaunch = latest(bursts, 'launch', Infinity);
    heardGround = ctx.fountains ? latest(ctx.fountains.lights, 'time', Infinity) : heardGround;
  }
  // Browsers only allow audio after a gesture.
  addEventListener('pointerdown', start, { signal });
  addEventListener('keydown', start, { signal });

  // The sea: low surf washing in sets (two slow swells beating), and a fizz of foam.
  function startSea() {
    const surf = loop(page.brown, 'lowpass', 520, 0.7, 0.07);
    const fizz = loop(page.white, 'highpass', 3200, 0.5, 0.008);
    for (const [frequency, depth] of [[0.085, 0.045], [0.13, 0.025]]) {
      const swell = audio.createOscillator();
      swell.frequency.value = frequency;
      const amount = audio.createGain();
      amount.gain.value = depth;
      swell.connect(amount).connect(surf.gain.gain);
      swell.start();
      sea.push(swell, amount);
    }
    sea.push(...surf.nodes, ...fizz.nodes);
  }

  function loop(buffer, type, frequency, q, level) {
    const source = audio.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = audio.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const gain = audio.createGain();
    gain.gain.value = level;
    source.connect(filter).connect(gain).connect(master);
    source.start(0, Math.random() * buffer.duration);
    return { gain, nodes: [source, filter, gain] };
  }

  // --- Voices --------------------------------------------------------------------

  // A voice: `build(add)` makes its nodes (registering each with add) and returns
  // { source, output }. It's panned, sent to the bus, and disconnects itself when done.
  function voice(when, length, pan, build) {
    if (voices >= MAX_VOICES) return false;
    voices++;
    const nodes = [];
    const add = (node) => { nodes.push(node); return node; };
    const { source, output } = build(add);
    let last = output;
    if (audio.createStereoPanner) {
      const panner = add(audio.createStereoPanner());
      panner.pan.value = pan;
      last = last.connect(panner);
    }
    last.connect(bus);
    source.onended = () => {
      for (const node of nodes) node.disconnect();
      voices--;
    };
    source.stop(when + length + 0.05);
    return true;
  }

  function envelope(add, when, peak, attack, decay) {
    const gain = add(audio.createGain());
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), when + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + attack + decay);
    return gain;
  }

  // Filtered noise with an envelope; the filter can sweep.
  function noise(buffer, when, { peak, attack = 0.005, decay, type = 'lowpass', from, to = from, q = 0.7, pan = 0, rate = 1 }) {
    voice(when, attack + decay, pan, (add) => {
      const source = add(audio.createBufferSource());
      source.buffer = buffer;
      source.loop = attack + decay > buffer.duration * 0.45; // long sounds outlast the buffer
      source.playbackRate.value = rate;
      const filter = add(audio.createBiquadFilter());
      filter.type = type;
      filter.Q.value = q;
      filter.frequency.setValueAtTime(from, when);
      if (to !== from) filter.frequency.exponentialRampToValueAtTime(to, when + attack + decay * 0.7);
      const gain = envelope(add, when, peak, attack, decay);
      source.connect(filter).connect(gain);
      source.start(when, Math.random() * (buffer.duration * 0.5));
      return { source, output: gain };
    });
  }

  // A pitched tone that slides (thumps, whistles).
  function tone(when, { from, to, peak, attack = 0.004, decay, pan = 0, type = 'sine' }) {
    voice(when, attack + decay, pan, (add) => {
      const source = add(audio.createOscillator());
      source.type = type;
      source.frequency.setValueAtTime(from, when);
      source.frequency.exponentialRampToValueAtTime(to, when + attack + decay * 0.8);
      const gain = envelope(add, when, peak, attack, decay);
      source.connect(gain);
      source.start(when);
      return { source, output: gain };
    });
  }

  // --- Recipes -------------------------------------------------------------------

  function boom(when, loud, air, pan, size = 1) {
    tone(when, { from: 72 * (1.1 - 0.2 * size), to: 36, peak: 0.85 * loud, decay: 0.9, pan });
    noise(page.brown, when, { peak: 0.75 * loud, attack: 0.008, decay: 2.2, from: 200 + 1400 * air, to: 80, pan });
    noise(page.white, when, { peak: 0.32 * loud * air, decay: 0.09, type: 'highpass', from: 1800, pan });
  }

  function burstSound(b, when, loud, air, pan) {
    const type = b.type;
    if (type === 'eyes') return;
    boom(when, loud * (SHAPES.has(type) ? 0.6 : 1), air, pan, Math.min(1.4, b.size / 60));
    if (type === 'crackle' || type === 'brew') {
      noise(page.crackle, when + 0.6, { peak: 0.45 * loud, attack: 0.05, decay: 1.8, type: 'highpass', from: 2200 * air + 600, pan, rate: 0.9 + Math.random() * 0.2 });
    } else if (type === 'strobe') {
      noise(page.crackle, when + 0.2, { peak: 0.25 * loud, attack: 0.05, decay: 2.2, type: 'bandpass', from: 1800, q: 1.2, pan, rate: 0.45 });
    } else if (HISSERS.has(type)) {
      noise(page.white, when + 0.15, { peak: 0.06 * loud, attack: 0.4, decay: 2.6, type: 'bandpass', from: 5200 * air + 800, q: 0.6, pan });
    } else if (type === 'multibreak') {
      boom(when + 0.9, loud * 0.7, air, pan, 0.8);
    } else if (type === 'crossette') {
      for (let k = 0; k < 4; k++) noise(page.white, when + 0.75 + k * 0.05, { peak: 0.22 * loud, decay: 0.07, type: 'bandpass', from: 1400, q: 1, pan: pan + (k - 1.5) * 0.08 });
    }
  }

  function launchSound(b, loud, air, pan, when) {
    tone(when, { from: 120, to: 55, peak: 0.35 * loud, decay: 0.35, pan });
    noise(page.white, when, { peak: 0.18 * loud * air, decay: 0.22, from: 900, to: 300, pan });
    // About one shell in six whistles on the way up.
    if (fract(Math.sin(b.time * 91.7) * 4371.3) < 0.17) {
      const climb = Math.max(0.8, (b.time - b.launch) * 0.85);
      tone(when + 0.05, { from: 650, to: 2400, peak: 0.045 * loud, attack: 0.08, decay: climb, pan, type: 'triangle' });
    }
  }

  function groundSound(g, when, loud, air, pan) {
    const hold = Math.max(0.3, g.hold);
    switch (g.sound) {
      case 'hiss':
        if (groundVoices >= 3) return;
        noise(page.white, when, { peak: 0.09 * loud, attack: 0.5, decay: hold, type: 'bandpass', from: 3400 * air + 700, q: 0.5, pan });
        noise(page.brown, when, { peak: 0.12 * loud, attack: 0.5, decay: hold, from: 300, pan });
        groundVoices++;
        setTimeout(() => { groundVoices--; }, (hold + (when - audio.currentTime)) * 1000);
        break;
      case 'whoosh':
        for (let t = 0; t < hold; t += 0.45) {
          noise(page.white, when + t, { peak: 0.06 * loud, attack: 0.08, decay: 0.32, type: 'bandpass', from: 700, to: 2600 * air + 400, q: 1.1, pan });
        }
        break;
      case 'pops':
        for (let t = 0; t < hold; t += 0.55) {
          tone(when + t, { from: 140, to: 70, peak: 0.22 * loud, decay: 0.18, pan });
          noise(page.white, when + t, { peak: 0.1 * loud * air, decay: 0.05, type: 'highpass', from: 1500, pan });
        }
        break;
      case 'boom':
        boom(when, loud * 0.55, air, pan, 0.7);
        break;
      case 'bubble':
        noise(page.brown, when, { peak: 0.14 * loud, attack: 0.6, decay: hold, from: 420, q: 4, pan });
        noise(page.crackle, when + 0.3, { peak: 0.2 * loud, attack: 0.3, decay: hold, type: 'lowpass', from: 900, pan, rate: 0.35 });
        break;
      case 'thunder':
        noise(page.white, when, { peak: 0.6 * loud, decay: 0.14, type: 'highpass', from: 1100, pan });
        noise(page.brown, when + 0.05, { peak: 1.1 * loud, attack: 0.12, decay: 3.6, from: 380, to: 90, pan });
        break;
      default:
        break;
    }
  }

  // Where a sound comes from, as seen from the camera: delay, loudness, brightness, pan.
  const heard = { delay: 0, loud: 0, air: 0, pan: 0 };
  function listen(x, y, z, size) {
    const dx = x - camera.position.x;
    const dy = y - camera.position.y;
    const dz = z - camera.position.z;
    const distance = Math.max(Math.hypot(dx, dy, dz), 1);
    const m = camera.matrixWorld.elements; // its first column points to the camera's right
    heard.delay = distance / SPEED_OF_SOUND / Math.max(config.loop.timeScale, 0.1);
    heard.loud = Math.min(1, size * (300 / Math.max(distance, 100)));
    heard.air = 1 / (1 + distance / 450);
    heard.pan = Math.max(-0.85, Math.min(0.85, ((dx * m[0] + dy * m[1] + dz * m[2]) / distance) * 1.4));
    return heard;
  }

  return {
    update(dt, time) {
      if (!audio) return;
      master.gain.value = settings.enabled ? settings.volume : 0;
      const bursts = ctx.fireworks ? ctx.fireworks.bursts : null;
      const ground = ctx.fountains ? ctx.fountains.lights : null;
      // Muted: skip the sounds, but keep up, so turning it up doesn't play a backlog.
      if (!settings.enabled || settings.volume <= 0) {
        if (bursts) {
          heardBurst = latest(bursts, 'time', time);
          heardLaunch = latest(bursts, 'launch', time);
        }
        if (ground) heardGround = latest(ground, 'time', time);
        return;
      }
      const now = audio.currentTime;
      const [, by, bz] = config.show.bargePosition;
      if (bursts) {
        for (let i = 0; i < bursts.length; i++) {
          const b = bursts[i];
          if (b.launch > heardLaunch && b.launch <= time) {
            const h = listen(b.x, by, bz, 1);
            launchSound(b, h.loud, h.air, h.pan, now + (b.launch - time) + h.delay);
          }
          if (b.time > heardBurst && b.time <= time) {
            const h = listen(b.x, b.y, b.z, b.size / 60);
            burstSound(b, now + (b.time - time) + h.delay, h.loud, h.air, h.pan);
          }
        }
        heardBurst = latest(bursts, 'time', time);
        heardLaunch = latest(bursts, 'launch', time);
      }
      if (ground) {
        for (let i = 0; i < ground.length; i++) {
          const g = ground[i];
          if (g.time > heardGround && g.time <= time && g.sound && g.sound !== 'none') {
            const h = listen(g.x, by + 4, g.z, 1);
            groundSound(g, now + (g.time - time) + h.delay, h.loud, h.air, h.pan);
          }
        }
        heardGround = latest(ground, 'time', time);
      }
    },

    dispose() {
      // Sounds still playing end on their own and disconnect themselves.
      for (const node of sea) {
        if (node.stop) node.stop();
        node.disconnect();
      }
      sea.length = 0;
      for (const node of [bus, echo, echoLevel, master, compressor]) if (node) node.disconnect();
      audio = null;
      master = null;
      compressor = null;
      bus = null;
      echo = null;
      echoLevel = null;
    },
  };
}

function latest(records, key, before) {
  let newest = -1e9;
  for (let i = 0; i < records.length; i++) {
    const t = records[i][key];
    if (t !== undefined && t <= before && t > newest) newest = t;
  }
  return newest;
}

function fract(x) {
  return x - Math.floor(x);
}

// Brown noise: white noise through a leaky integrator, deep enough for booms and surf.
function makeBrown(audio, seconds) {
  const buffer = audio.createBuffer(1, Math.floor(audio.sampleRate * seconds), audio.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    data[i] = last * 3.5;
  }
  return buffer;
}

function makeWhite(audio, seconds) {
  const buffer = audio.createBuffer(1, Math.floor(audio.sampleRate * seconds), audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
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

// The echo off the water: a stereo tail of noise, darker and sparser as it decays, with a
// gap before it (the first reflection comes back from far off).
function makeRoom(audio, seconds) {
  const length = Math.floor(audio.sampleRate * seconds);
  const buffer = audio.createBuffer(2, length, audio.sampleRate);
  const gap = Math.floor(audio.sampleRate * 0.12);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    let low = 0;
    for (let i = gap; i < length; i++) {
      const t = (i - gap) / (length - gap);
      low += (Math.random() * 2 - 1 - low) * (0.35 - 0.3 * t); // duller as it fades
      data[i] = low * Math.pow(1 - t, 2.4) * 0.6;
    }
  }
  return buffer;
}
