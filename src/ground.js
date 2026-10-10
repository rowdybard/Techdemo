// Ground-show effects fired from tubes along the barge, besides the fountains:
//   shooters  comets fired continuously while each tube's aim sweeps side to side
//   candles   roman candles: coloured balls pumped up one after another
//   mines     sprays of comets bursting up from the deck in sequence across the barge
//   fans      paired tubes firing outward at alternate angles, drawing Vs
//   waterfall a curtain of silver-gold sparks pouring down the whole length of the barge from a
//             line high above it into the water (Deluxe)
// Each writes all of its particles at once, with later birth times, placed with the same
// closed-form motion the shader uses (see particles.js), and lights its tubes while it runs.
import { KIND } from './fireworks.glsl.js';
import { positionAt } from './particles.js';

const SHED = 5; // glitter left behind along each comet
const p = [0, 0, 0];
const dim = [0, 0, 0];

function pick(palette, i) {
  return palette[i % palette.length];
}

// How many particles one comet uses (its head and the glitter it sheds).
const PER_COMET = 1 + SHED;

// Writes one comet from (x, y, z) leaning `lean` radians across the barge, at `speed`.
// Its head is a plain spark in its colour (KIND.comet's white core is the rising shell's).
function comet(pool, i, config, born, x, y, z, lean, speed, color, radius, life, trail = 0.3) {
  const { physics, look } = config;
  const g = 9.81 * physics.gravity;
  const drag = 0.3;
  const vx = Math.sin(lean) * speed;
  const vy = Math.cos(lean) * speed;
  const vz = (Math.random() - 0.5) * 2;
  pool.set(i++, x, y, z, born, vx, vy, vz, drag,
    color[0], color[1], color[2], 1, 0.55, 0.2, life * 0.75, life, radius * look.sparkSize, trail, KIND.spark);
  for (let k = 0; k < SHED; k++) {
    const t = ((k + 0.5) / SHED) * life * 0.85;
    positionAt(p, x, y, z, vx, vy, vz, drag, t, g, physics.windX, physics.windZ);
    pool.set(i++, p[0], p[1], p[2], born + t, (Math.random() - 0.5) * 2, -1 - Math.random() * 2, (Math.random() - 0.5) * 2, 2.2,
      1, 0.6, 0.25, 0.9, 0.35, 0.1, 99, 0.6 + Math.random() * 0.5, 0.18 * look.sparkSize, 0.1, KIND.glitter);
  }
  return i;
}

// Launch speed that carries a comet to about `height`, allowing for drag.
function speedFor(config, height) {
  return Math.sqrt(2 * 9.81 * config.physics.gravity * height) * 1.25;
}

// smoke: how much smoke the effect gives off (smoke.js), 0 for none. sound: what it
// sounds like (audio.js): 'hiss', 'whoosh', 'pops', 'boom', 'bubble', 'thunder' or 'none'.
function light(record, start, hold, x, y, z, color, size, smoke = 1, sound = 'hiss') {
  record.smoke = smoke;
  record.sound = sound;
  record.time = start;
  record.hold = hold;
  record.x = x;
  record.y = y;
  record.z = z;
  record.r = color[0];
  record.g = color[1];
  record.b = color[2];
  record.size = size;
}

export function shooters(pool, config, phone, start, tubes, y, z, palette, lights) {
  const duration = 7;
  const every = phone ? 0.3 : 0.16;
  const shots = Math.floor(duration / every);
  const speed = speedFor(config, config.fountains.height * 1.8);
  let i = pool.begin(tubes.length * shots * PER_COMET);
  for (let t = 0; t < tubes.length; t++) {
    const color = pick(palette, t);
    const phase = (t / tubes.length) * Math.PI;
    for (let s = 0; s < shots; s++) {
      const time = s * every;
      // Each tube's aim swings ±50° and back, out of step with its neighbours.
      const lean = 0.87 * Math.sin((time / duration) * Math.PI * 3 + phase);
      i = comet(pool, i, config, start + time, tubes[t], y, z, lean, speed * (0.95 + Math.random() * 0.1), color, 0.9, 2.4);
    }
    light(lights[t], start, duration, tubes[t], y + 20, z, color, 18, 1, 'whoosh');
  }
  pool.end();
}

export function candles(pool, config, phone, start, tubes, y, z, palette, lights) {
  const balls = phone ? 6 : 9;
  const every = 0.55;
  const speed = speedFor(config, config.fountains.height * 1.9);
  let i = pool.begin(tubes.length * balls * PER_COMET);
  for (let t = 0; t < tubes.length; t++) {
    const offset = (t % 2) * every * 0.5 + t * 0.08; // neighbours alternate, rippling down the barge
    for (let b = 0; b < balls; b++) {
      const color = pick(palette, t + b);
      const lean = (Math.random() - 0.5) * 0.12;
      // A star, not a bulb: small, with a tail (at 1.7 m and the short tail they read as fat glowing bulbs).
      i = comet(pool, i, config, start + offset + b * every, tubes[t], y, z, lean, speed * (0.9 + Math.random() * 0.2), color, 1.0, 2.6, 0.5);
    }
    light(lights[t], start, balls * every + 1, tubes[t], y + 25, z, pick(palette, t), 18, 0.6, 'pops');
  }
  pool.end();
}

export function mines(pool, config, phone, start, tubes, y, z, palette, lights) {
  const stars = phone ? 26 : 48;
  const gap = 0.32;
  const order = tubes.length * 2 - 1; // left to right, then back
  const speed = speedFor(config, config.fountains.height * 1.6);
  let i = pool.begin(order * stars * PER_COMET);
  for (let m = 0; m < order; m++) {
    const t = m < tubes.length ? m : order - 1 - m;
    // Dimmer per comet: dozens leave the same point at once and would add up to white.
    const color = pick(palette, m);
    dim[0] = color[0] * 0.32;
    dim[1] = color[1] * 0.32;
    dim[2] = color[2] * 0.32;
    for (let s = 0; s < stars; s++) {
      const lean = (Math.random() - 0.5) * 1.1; // a wide cone, straight up the middle
      i = comet(pool, i, config, start + m * gap, tubes[t], y, z, lean, speed * (0.7 + Math.random() * 0.4), dim, 0.6, 1.8);
    }
  }
  for (let t = 0; t < tubes.length; t++) light(lights[t], start + t * gap, 2.5, tubes[t], y + 18, z, pick(palette, t), 22, 1, 'boom');
  pool.end();
}

export function fans(pool, config, phone, start, tubes, y, z, palette, lights) {
  const volleys = phone ? 10 : 16;
  const every = 0.3;
  const speed = speedFor(config, config.fountains.height * 1.7);
  let i = pool.begin(tubes.length * volleys * PER_COMET);
  for (let v = 0; v < volleys; v++) {
    const open = 0.35 + 0.35 * Math.sin((v / volleys) * Math.PI); // the Vs open up and close again
    for (let t = 0; t < tubes.length; t++) {
      // Pairs of tubes fire away from each other; every other volley swaps sides.
      const outward = (t % 2 === 0 ? -1 : 1) * (v % 2 === 0 ? 1 : -1);
      i = comet(pool, i, config, start + v * every, tubes[t], y, z, outward * open, speed, pick(palette, v), 0.9, 2.2);
    }
  }
  for (let t = 0; t < tubes.length; t++) light(lights[t], start, volleys * every, tubes[t], y + 20, z, pick(palette, t), 16, 1, 'whoosh');
  pool.end();
}

// Sparks pour from a line high over the barge, end to end, and fall into the water: a sheet of
// light along the whole barge. They start silver-white and redden as they fall.
export function waterfall(pool, config, phone, start, tubes, y, z, palette, lights) {
  const { look } = config;
  const duration = 8;
  const top = y + config.fountains.height;
  const spacing = tubes.length > 1 ? tubes[1] - tubes[0] : 10;
  const left = tubes[0] - spacing / 2;
  const width = tubes[tubes.length - 1] + spacing / 2 - left;
  // Strands, like real falls hung from a line, so it reads as falling streams and not a sheet.
  const strands = phone ? 28 : 44;
  const perSecond = Math.round(width * (phone ? 1.6 : 2.9)); // by the metre, so a short curtain isn't a solid slab
  const count = Math.round(perSecond * duration);
  let i = pool.begin(count);
  for (let k = 0; k < count; k++) {
    const t = (k / count) * duration;
    const born = start + t + Math.random() / perSecond;
    const fall = 5.5 + Math.random() * 0.5; // long enough to reach the water
    const x = left + ((k % strands) + 0.5 + (Math.random() - 0.5) * 0.25) * (width / strands);
    pool.set(i++, x, top + (Math.random() - 0.5) * 0.6, z + (Math.random() - 0.5) * 1.5, born,
      (Math.random() - 0.5) * 0.3, -1 - Math.random() * 1.5, (Math.random() - 0.5) * 0.4, 0.9,
      0.34, 0.27, 0.17, 0.34, 0.15, 0.04, fall * 0.55, fall, 0.22 * look.sparkSize, 0.45, KIND.glitter);
  }
  pool.end();
  const glow = [0.4, 0.28, 0.1]; // as dim as a fountain's: a whole barge of them lights the shore
  for (let t = 0; t < tubes.length; t++) light(lights[t], start, duration, tubes[t], (top + y) / 2, z, glow, 14, 0.5, 'hiss');
}
