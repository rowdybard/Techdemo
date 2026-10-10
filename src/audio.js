// Sound, synthesised with Web Audio: nothing is downloaded. Every sound is built from a few
// noise buffers and oscillators made once:
//   bursts    a deep thump, a rumbling body and a sharp crack; farther shells are quieter
//             and duller (air soaks up the highs), and each is panned to where it burst
//   by type   crackle crackles (a wide swarm of sharp pops, sfx.js), glitter and willows hiss
//             as they fall, double breaks boom twice, crossettes pop as they split, whirlwinds
//             whirr, shapes and words are softer, eyes silent
//   launches  a mortar thump from the barge (no whistles: synthesised, they sounded fake)
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

import { makeNoiseSoon, noiseNow } from './noise.js';
import { swarm, whirr } from './sfx.js';

const SPEED_OF_SOUND = 343;
const MAX_VOICES = 32;
const SHAPES = new Set(['heart', 'star', 'text', 'initials', 'pumpkin', 'skull', 'bat', 'ghost', 'web']);
const HISSERS = new Set(['willow', 'palm', 'wisp', 'chrysanthemum', 'kamuro', 'fish', 'leaves']);

let shared = null; // { audio, brown, white, crackle, room } for the page's lifetime
let lastInput = 0; // when the person last touched the page (ms), for the idle sleep

// Buffers at the context's own rate (the length is kept, so on a 44.1 kHz phone the noise
// runs about a tenth slower, which no one can hear in noise).
function fillBuffers(page) {
  if (page.room) return;
  const { audio } = page;
  const n = noiseNow();
  const buffer = (channels) => {
    const b = audio.createBuffer(channels.length, channels[0].length, audio.sampleRate);
    for (let c = 0; c < channels.length; c++) b.copyToChannel(channels[c], c);
    return b;
  };
  page.brown = buffer([n.brown]);
  page.white = buffer([n.white]);
  page.crackle = buffer([n.crackle]);
  page.swarm = buffer([n.swarm]);
  page.room = buffer(n.room);
}

function sharedAudio() {
  if (shared) return shared;
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) return null;
  const audio = new Context();
  shared = { audio, brown: null, white: null, crackle: null, swarm: null, room: null }; // filled by fillBuffers
  addEventListener('pagehide', () => audio.close(), { once: true });
  // A page that isn't on screen makes no sound: a tab left open in the background, a
  // phone locked or switched to another app. Without this the sea kept playing under
  // whatever else was open. Coming back (or any tap) wakes it.
  const sleep = () => { if (audio.state === 'running') audio.suspend().catch(() => {}); };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) sleep();
    else wake();
  });
  addEventListener('pagehide', sleep);
  document.addEventListener('freeze', sleep); // Chrome puts idle background tabs to sleep
  return shared;
}

/** Marks the page as looked at, and lets the sound play again if it was put to sleep. */
function wake() {
  lastInput = performance.now();
  if (shared && !document.hidden && shared.audio.state === 'suspended') shared.audio.resume().catch(() => {});
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

  let starting = false;
  // Browsers want the context made and resumed in the tap itself. Everything else (the
  // noise buffers, the echo, whose impulse is analysed on the spot, and the sea) waits
  // until the page has painted, so the tap is answered at once.
  function start() {
    if (audio || starting || !settings.enabled) return;
    page = sharedAudio();
    if (!page) return;
    if (page.audio.state === 'suspended') page.audio.resume();
    starting = true;
    requestAnimationFrame(() => setTimeout(build, 0));
  }

  function build() {
    starting = false;
    if (signal.aborted || audio) return;
    fillBuffers(page);
    audio = page.audio;
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
  // Browsers only allow audio after a gesture; any touch also counts as being looked at.
  const touched = () => {
    wake();
    start();
  };
  for (const type of ['pointerdown', 'keydown', 'wheel', 'touchstart']) addEventListener(type, touched, { signal, passive: true });
  // The noise is made in idle moments once the show is up (not while it's still loading).
  if (settings.enabled) ctx.container.addEventListener('scene-ready', makeNoiseSoon, { once: true, signal });
  lastInput = performance.now();
  ctx.audioState = () => (audio ? audio.state : 'none');

  // The sea: low surf washing in sets (two slow swells beating), and a fizz of foam. On the
  // frozen lake it's a faint wind instead: the same sound at a tenth of the level.
  let seaBus = null;
  let heardPlace = null;
  function startSea() {
    seaBus = audio.createGain();
    seaBus.connect(master);
    sea.push(seaBus);
    const surf = loop(page.brown, 'lowpass', 520, 0.7, 0.07, seaBus);
    const fizz = loop(page.white, 'highpass', 3200, 0.5, 0.008, seaBus);
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

  function loop(buffer, type, frequency, q, level, out = master) {
    const source = audio.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = audio.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const gain = audio.createGain();
    gain.gain.value = level;
    source.connect(filter).connect(gain).connect(out);
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

  // A pitched tone that slides (thumps, ticks, the bell).
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
    if (b.crackle > 0) crackles(when + b.crackle, 0.45, loud * 0.8, air, pan); // a chrysanthemum's crackling tips
    if (type === 'crackle' || type === 'brew') {
      crackles(when + 0.5, 1.5, loud, air, pan); // its pops come 0.5 to 1.9 s after the break (bursts.js)
    } else if (type === 'strobe') {
      noise(page.crackle, when + 0.2, { peak: 0.25 * loud, attack: 0.05, decay: 2.2, type: 'bandpass', from: 1800, q: 1.2, pan, rate: 0.45 });
    } else if (HISSERS.has(type)) {
      noise(page.white, when + 0.15, { peak: 0.06 * loud, attack: 0.4, decay: 2.6, type: 'bandpass', from: 5200 * air + 800, q: 0.6, pan });
    } else if (type === 'whirl') {
      // Whirlwinds whirr as they spin: two soft fizzes, panned apart.
      for (const side of [-0.2, 0.2]) {
        const at = when + 0.1 + Math.random() * 0.1;
        const length = 1.8 + Math.random() * 0.5;
        voice(at, length, pan + side, (add) => whirr(audio, add, page, at, { peak: 0.08 * loud, length, air }));
      }
    } else if (type === 'multibreak') {
      boom(when + 0.9, loud * 0.7, air, pan, 0.8);
    } else if (type === 'crossette') {
      for (let k = 0; k < 4; k++) noise(page.white, when + 0.75 + k * 0.05, { peak: 0.22 * loud, decay: 0.07, type: 'bandpass', from: 1400, q: 1, pan: pan + (k - 1.5) * 0.08 });
    }
  }

  // A swarm of crackling pops, in two voices panned apart so it's wide, as a crackle shell is.
  function crackles(when, length, loud, air, pan) {
    for (const side of [-0.28, 0.28]) {
      voice(when + Math.random() * 0.06, length, Math.max(-0.9, Math.min(0.9, pan + side)), (add) => swarm(audio, add, page, when, { peak: 0.5 * loud, length, air }));
    }
  }

  // The countdown clock: a wooden tick each second, higher as zero nears (with a low thump on
  // the last three), then at zero a boom, and a bell struck under it.
  function tick(when, second) {
    const near = 1 - second / 10;
    tone(when, { from: 900 + 900 * near, to: 500 + 400 * near, peak: 0.2 + 0.2 * near, attack: 0.002, decay: 0.09, type: 'triangle' });
    noise(page.white, when, { peak: 0.08, decay: 0.03, type: 'highpass', from: 3500 });
    if (second <= 3) tone(when, { from: 150, to: 60, peak: 0.45, decay: 0.3 });
  }

  function midnight(when) {
    boom(when, 1, 1, 0, 1.5);
    for (const [ratio, peak, decay] of [[1, 0.3, 3.4], [2, 0.2, 2.6], [2.76, 0.16, 2], [5.4, 0.09, 1.2], [8.9, 0.05, 0.7]]) {
      tone(when, { from: 196 * ratio, to: 195 * ratio, peak, attack: 0.003, decay });
    }
    noise(page.white, when + 0.02, { peak: 0.3, attack: 0.1, decay: 1.6, type: 'bandpass', from: 1500, to: 6000, q: 0.5 });
  }

  let tickedSecond = Infinity; // the number the clock last sounded
  function clockSounds(time, when, muted) {
    const clock = ctx.countdown;
    if (!clock || !clock.active) {
      tickedSecond = Infinity;
      return;
    }
    const shown = Math.ceil(clock.remaining(time));
    if (shown >= tickedSecond) return;
    tickedSecond = shown;
    if (muted) return;
    if (shown >= 1 && shown <= 10) tick(when, shown);
    else if (shown <= 0) midnight(when);
  }

  function launchSound(b, loud, air, pan, when) {
    tone(when, { from: 120, to: 55, peak: 0.35 * loud, decay: 0.35, pan });
    noise(page.white, when, { peak: 0.18 * loud * air, decay: 0.22, from: 900, to: 300, pan });
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
      // Nobody has touched the page for a while (open, on screen, but left alone): stop the
      // sound until they do. The show keeps playing silently.
      if (audio.state === 'running' && performance.now() - lastInput > settings.idleSeconds * 1000) audio.suspend().catch(() => {});
      master.gain.value = settings.enabled ? settings.volume : 0;
      const bursts = ctx.fireworks ? ctx.fireworks.bursts : null;
      const ground = ctx.fountains ? ctx.fountains.lights : null;
      // Muted: skip the sounds, but keep up, so turning it up doesn't play a backlog.
      if (!settings.enabled || settings.volume <= 0) {
        clockSounds(time, 0, true);
        if (bursts) {
          heardBurst = latest(bursts, 'time', time);
          heardLaunch = latest(bursts, 'launch', time);
        }
        if (ground) heardGround = latest(ground, 'time', time);
        return;
      }
      const now = audio.currentTime;
      if (seaBus && ctx.place !== heardPlace) {
        heardPlace = ctx.place;
        seaBus.gain.setTargetAtTime(ctx.place === 'lake' ? 0.1 : 1, now, 1.5);
      }
      clockSounds(time, now, false);
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
      seaBus = null;
      heardPlace = null;
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

