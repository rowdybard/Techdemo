// Burst types. Each writes its particles into the pool, born at `born`, around the point
// `at` where the shell broke, and fills `out` with the burst's light for the scene.
// Effects that happen later (crossette splits, crackle pops, a second break) are written
// now too, with later birth times, at positions from the same motion formula.
import { KIND } from './fireworks.glsl.js';
import { positionAt, velocityAt } from './particles.js';
import { SHAPE_TYPES } from './shapes.js';
import { HALLOWEEN_TYPES } from './halloween.js';

const GOLDEN_ANGLE = 2.399963;
const GOLD = [1, 0.55, 0.16];
const SILVER = [0.95, 0.95, 1];

const dir = [0, 0, 0];
const p = [0, 0, 0];
const v = [0, 0, 0];
const axisA = [0, 0, 0];
const axisB = [0, 0, 0];

function pick(palette) {
  return palette[(Math.random() * palette.length) | 0];
}

function jitter(amount) {
  return 1 - amount + Math.random() * amount * 2;
}

// The k-th of `count` even directions over the sphere (a Fibonacci spiral).
function sphere(k, count, spin) {
  const y = 1 - (2 * (k + 0.5)) / count;
  const ring = Math.sqrt(Math.max(0, 1 - y * y));
  const angle = k * GOLDEN_ANGLE + spin;
  dir[0] = Math.cos(angle) * ring;
  dir[1] = y;
  dir[2] = Math.sin(angle) * ring;
  return dir;
}

function fillLight(out, born, at, color, size) {
  out.time = born;
  out.x = at[0];
  out.y = at[1];
  out.z = at[2];
  out.r = color[0];
  out.g = color[1];
  out.b = color[2];
  out.size = size;
}

// A sphere of sparks. The shared body of peony, chrysanthemum, willow and strobe.
function sphereBurst(pool, count, born, at, inherit, speed, drag, a, b, change, life, radius, trail, kind) {
  const spin = Math.random() * Math.PI * 2;
  let i = pool.begin(count);
  for (let k = 0; k < count; k++) {
    sphere(k, count, spin);
    const s = speed * jitter(0.1);
    const c = k % 2 === 0 ? a : b;
    const c2 = change || c;
    const l = life * jitter(0.15);
    pool.set(i++, at[0], at[1], at[2], born,
      dir[0] * s + inherit[0] * 0.3, dir[1] * s + inherit[1] * 0.3, dir[2] * s + inherit[2] * 0.3, drag,
      c[0], c[1], c[2], c2[0], c2[1], c2[2], l * 0.45, l, radius, trail, kind);
  }
  pool.end();
}

function peony(pool, shell, config, palette, born, at, velocity, out) {
  const { look, physics } = config;
  const drag = 1.4 * physics.drag;
  const a = pick(palette);
  const b = Math.random() < 0.3 ? pick(palette) : a;
  const change = Math.random() < 0.25 ? pick(palette) : null;
  const kind = look.glitter > 0 && Math.random() < 0.25 ? KIND.glitter : KIND.spark;
  sphereBurst(pool, shell.count, born, at, velocity, shell.size * drag, drag, a, b, change,
    look.lifetime, 0.4 * look.sparkSize, 0.07, kind);
  fillLight(out, born, at, a, shell.size);
}

function chrysanthemum(pool, shell, config, palette, born, at, velocity, out) {
  const { look, physics } = config;
  const drag = 1.3 * physics.drag;
  const a = pick(palette);
  const b = Math.random() < 0.4 ? pick(palette) : a;
  sphereBurst(pool, shell.count, born, at, velocity, shell.size * drag, drag, a, b, null,
    look.lifetime * 1.1, 0.35 * look.sparkSize, 0.4, KIND.spark);
  fillLight(out, born, at, a, shell.size);
}

function willow(pool, shell, config, palette, born, at, velocity, out) {
  const { look, physics } = config;
  const drag = 1.1 * physics.drag;
  sphereBurst(pool, Math.round(shell.count * 0.7), born, at, velocity, shell.size * 0.75 * drag, drag, GOLD, GOLD, null,
    look.lifetime * 1.9, 0.3 * look.sparkSize, 1.1, KIND.glitter);
  fillLight(out, born, at, GOLD, shell.size * 0.8);
}

function strobe(pool, shell, config, palette, born, at, velocity, out) {
  const { look, physics } = config;
  const drag = 1.5 * physics.drag;
  sphereBurst(pool, Math.round(shell.count * 0.6), born, at, velocity, shell.size * drag, drag, SILVER, SILVER, null,
    look.lifetime * 1.3, 0.45 * look.sparkSize, 0.03, KIND.strobe);
  fillLight(out, born, at, SILVER, shell.size);
}

// A few thick comets thrown mostly upward and outward, shedding glitter as they fall.
// Drawn as plain sparks, not KIND.comet, whose white-hot core is for the rising shell:
// on the fronds it turned every colour white.
function palm(pool, shell, config, palette, born, at, velocity, out) {
  const { look, physics } = config;
  const g = 9.81 * physics.gravity;
  const drag = 0.9 * physics.drag;
  const color = Math.random() < 0.5 ? GOLD : pick(palette);
  const fronds = 7 + ((Math.random() * 4) | 0);
  const shed = 22;
  const life = look.lifetime * 1.2;
  const spin = Math.random() * Math.PI * 2;
  let i = pool.begin(fronds * (1 + shed));
  for (let f = 0; f < fronds; f++) {
    const angle = spin + (f / fronds) * Math.PI * 2;
    const rise = 0.35 + Math.random() * 0.35;
    const flat = Math.sqrt(1 - rise * rise);
    const s = shell.size * drag * 1.1 * jitter(0.1);
    const vx = Math.cos(angle) * flat * s + velocity[0] * 0.3;
    const vy = rise * s + velocity[1] * 0.3;
    const vz = Math.sin(angle) * flat * s + velocity[2] * 0.3;
    pool.set(i++, at[0], at[1], at[2], born, vx, vy, vz, drag,
      color[0], color[1], color[2], color[0], color[1], color[2], 99, life, 1.8 * look.sparkSize, 1.0, KIND.spark);
    for (let k = 0; k < shed; k++) {
      const t = ((k + 0.5) / shed) * life * 0.8;
      positionAt(p, at[0], at[1], at[2], vx, vy, vz, drag, t, g, physics.windX, physics.windZ);
      pool.set(i++, p[0], p[1], p[2], born + t, (Math.random() - 0.5) * 3, -1 - Math.random() * 2, (Math.random() - 0.5) * 3, 2,
        GOLD[0], GOLD[1], GOLD[2], GOLD[0], GOLD[1], GOLD[2], 99, 1.0 + Math.random() * 0.8, 0.3 * look.sparkSize, 0.25, KIND.glitter);
    }
  }
  pool.end();
  fillLight(out, born, at, color, shell.size);
}

// A flat ring on a random tilt, with a small core of sparks.
function ring(pool, shell, config, palette, born, at, velocity, out) {
  const { look, physics } = config;
  const drag = 1.4 * physics.drag;
  const a = pick(palette);
  const b = pick(palette);
  // Two axes spanning the ring's plane, tilted toward the viewer so it reads as a ring.
  const tilt = (Math.random() * 0.9 + 0.3) * (Math.random() < 0.5 ? 1 : -1);
  const turn = (Math.random() - 0.5) * 1.2;
  axisA[0] = Math.cos(turn);
  axisA[1] = 0;
  axisA[2] = Math.sin(turn);
  axisB[0] = -Math.sin(turn) * Math.sin(tilt);
  axisB[1] = Math.cos(tilt);
  axisB[2] = Math.cos(turn) * Math.sin(tilt);
  const count = Math.round(shell.count * 0.45);
  const core = Math.round(count * 0.25);
  const speed = shell.size * drag;
  let i = pool.begin(count + core);
  for (let k = 0; k < count; k++) {
    const angle = (k / count) * Math.PI * 2;
    const c = Math.cos(angle) * speed;
    const s = Math.sin(angle) * speed;
    pool.set(i++, at[0], at[1], at[2], born,
      axisA[0] * c + axisB[0] * s, axisA[1] * c + axisB[1] * s, axisA[2] * c + axisB[2] * s, drag,
      a[0], a[1], a[2], a[0], a[1], a[2], 99, look.lifetime * jitter(0.08), 0.45 * look.sparkSize, 0.12, KIND.spark);
  }
  const spin = Math.random() * 6.28;
  for (let k = 0; k < core; k++) {
    sphere(k, core, spin);
    const s = speed * 0.3 * jitter(0.2);
    pool.set(i++, at[0], at[1], at[2], born, dir[0] * s, dir[1] * s, dir[2] * s, drag,
      b[0], b[1], b[2], b[0], b[1], b[2], 99, look.lifetime * 0.8, 0.35 * look.sparkSize, 0.05, KIND.spark);
  }
  pool.end();
  fillLight(out, born, at, a, shell.size);
}

// Comets that fly out, then each split into four smaller comets in a cross.
function crossette(pool, shell, config, palette, born, at, velocity, out) {
  const { look, physics } = config;
  const g = 9.81 * physics.gravity;
  const drag = 1.1 * physics.drag;
  const color = pick(palette);
  const comets = 10;
  const split = 0.75;
  const spin = Math.random() * 6.28;
  let i = pool.begin(comets * 5);
  for (let c = 0; c < comets; c++) {
    sphere(c, comets, spin);
    const s = shell.size * 0.8 * drag;
    const vx = dir[0] * s;
    const vy = dir[1] * s;
    const vz = dir[2] * s;
    pool.set(i++, at[0], at[1], at[2], born, vx, vy, vz, drag,
      color[0], color[1], color[2], color[0], color[1], color[2], 99, split, 1.5 * look.sparkSize, 0.35, KIND.spark);
    positionAt(p, at[0], at[1], at[2], vx, vy, vz, drag, split, g, physics.windX, physics.windZ);
    velocityAt(v, vx, vy, vz, drag, split, g, physics.windX, physics.windZ);
    // Two directions across the comet's path, for the cross.
    const len = Math.hypot(v[0], v[2]) || 1;
    for (let q = 0; q < 4; q++) {
      const angle = (q / 4) * Math.PI * 2 + c;
      const side = Math.cos(angle) * shell.size * 0.55 * drag;
      const up = Math.sin(angle) * shell.size * 0.55 * drag;
      pool.set(i++, p[0], p[1], p[2], born + split,
        v[0] + (-v[2] / len) * side, v[1] + up, v[2] + (v[0] / len) * side, drag * 1.2,
        color[0], color[1], color[2], GOLD[0], GOLD[1], GOLD[2], 0.8, look.lifetime * 0.8, 1.0 * look.sparkSize, 0.45, KIND.spark);
    }
  }
  pool.end();
  fillLight(out, born, at, color, shell.size);
}

// Gold sparks that each burst into tiny crackling pops a moment later.
function crackle(pool, shell, config, palette, born, at, velocity, out) {
  const { look, physics } = config;
  const g = 9.81 * physics.gravity;
  const drag = 1.6 * physics.drag;
  const count = Math.round(shell.count * 0.4);
  const pops = Math.round(count * 2.5);
  const speed = shell.size * 0.8 * drag;
  const spin = Math.random() * 6.28;
  sphereBurst(pool, count, born, at, velocity, speed, drag, GOLD, GOLD, null, 1.9, 0.3 * look.sparkSize, 0.15, KIND.glitter);
  let i = pool.begin(pops);
  for (let k = 0; k < pops; k++) {
    sphere(k % count, count, spin);
    const delay = 0.5 + Math.random() * 1.4;
    const s = speed * jitter(0.15);
    positionAt(p, at[0], at[1], at[2], dir[0] * s, dir[1] * s, dir[2] * s, drag, delay, g, physics.windX, physics.windZ);
    pool.set(i++, p[0] + (Math.random() - 0.5) * 4, p[1] + (Math.random() - 0.5) * 4, p[2] + (Math.random() - 0.5) * 4, born + delay,
      0, -1, 0, 3, 1, 0.95, 0.85, 1, 0.95, 0.85, 99, 0.22, 0.8 * look.sparkSize, 0, KIND.pop);
  }
  pool.end();
  fillLight(out, born, at, GOLD, shell.size * 0.7);
}

// A burst with a second, different burst inside it a moment later.
function multibreak(pool, shell, config, palette, born, at, velocity, out) {
  const { look, physics } = config;
  const drag = 1.4 * physics.drag;
  const a = pick(palette);
  let b = pick(palette);
  if (b === a) b = palette[(palette.indexOf(a) + 1) % palette.length];
  sphereBurst(pool, Math.round(shell.count * 0.7), born, at, velocity, shell.size * drag, drag, a, a, null,
    look.lifetime, 0.4 * look.sparkSize, 0.1, KIND.spark);
  sphereBurst(pool, Math.round(shell.count * 0.45), born + 0.9, at, velocity, shell.size * 0.55 * drag, drag, b, b, null,
    look.lifetime * 0.9, 0.35 * look.sparkSize, 0.2, look.glitter > 0 ? KIND.glitter : KIND.spark);
  fillLight(out, born, at, a, shell.size);
}

export const BURST_TYPES = { peony, chrysanthemum, willow, palm, ring, crossette, strobe, crackle, multibreak, ...SHAPE_TYPES, ...HALLOWEEN_TYPES };

export function burst(pool, shell, config, palette, born, at, velocity, out) {
  (BURST_TYPES[shell.type] || peony)(pool, shell, config, palette, born, at, velocity, out);
}
