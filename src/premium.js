// Deluxe's showpiece shells, each unlike anything in the free set: the gold crown (kamuro), the
// colour-changing dahlia, Saturn, swimming fish, whirlwinds and falling leaves. Like every burst
// (bursts.js) each writes all of its particles at once; the fish, the whirlwinds and the leaves move
// with the shader's wobbling kinds (KIND.swim, whirl, flutter in fireworks.glsl.js), so nothing is
// simulated on the CPU.
import { KIND } from './fireworks.glsl.js';
import { positionAt } from './particles.js';

const GOLDEN_ANGLE = 2.399963;
const CROWN_GOLD = [0.85, 0.48, 0.14];
const DRIP_GOLD = [0.8, 0.42, 0.12];
const SILVER = [0.95, 0.95, 1];
const WHITE = [1, 0.96, 0.9];
const AUTUMN = [[1, 0.62, 0.2], [1, 0.45, 0.12], [0.95, 0.75, 0.35]];

const dir = [0, 0, 0];
const p = [0, 0, 0];

function pick(palette) {
  return palette[(Math.random() * palette.length) | 0];
}

// Three colours from the palette, each different from the last where the palette allows.
function threeColours(palette) {
  const a = pick(palette);
  let b = pick(palette);
  if (b === a && palette.length > 1) b = palette[(palette.indexOf(a) + 1) % palette.length];
  let c = pick(palette);
  if (c === b) c = palette.length > 2 ? palette[(palette.indexOf(b) + 1) % palette.length] : WHITE;
  return [a, b, c];
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

// Gold crown: a big, dense crown of heavy gold glitter that hangs in the sky and slowly droops.
// Every branch burns a long glittering tail and drips sparkles as it falls, and its tip flashes
// white just before it goes out. Bigger, denser and far longer-lived than a willow.
function kamuro(pool, shell, config, palette, born, at, velocity, out) {
  const { look, physics } = config;
  const g = 9.81 * physics.gravity;
  const drag = 1.25 * physics.drag;
  const branches = Math.round(shell.count * 0.55);
  const drips = 4;
  const life = look.lifetime * 2.3;
  const spin = Math.random() * Math.PI * 2;
  let i = pool.begin(branches * (1 + drips));
  for (let k = 0; k < branches; k++) {
    sphere(k, branches, spin);
    const s = shell.size * 1.05 * drag * jitter(0.08);
    const vx = dir[0] * s + velocity[0] * 0.3;
    const vy = dir[1] * s + velocity[1] * 0.3;
    const vz = dir[2] * s + velocity[2] * 0.3;
    const l = life * jitter(0.1);
    pool.set(i++, at[0], at[1], at[2], born, vx, vy, vz, drag,
      CROWN_GOLD[0], CROWN_GOLD[1], CROWN_GOLD[2], WHITE[0], WHITE[1], WHITE[2], l * 0.86, l, 0.34 * look.sparkSize, 1.5, KIND.glitter);
    for (let q = 0; q < drips; q++) {
      const t = 0.7 + q * 0.6 + Math.random() * 0.3;
      positionAt(p, at[0], at[1], at[2], vx, vy, vz, drag, t, g, physics.windX, physics.windZ);
      pool.set(i++, p[0], p[1], p[2], born + t, (Math.random() - 0.5) * 1.5, -0.5 - Math.random(), (Math.random() - 0.5) * 1.5, 2.6,
        DRIP_GOLD[0], DRIP_GOLD[1], DRIP_GOLD[2], DRIP_GOLD[0], DRIP_GOLD[1], DRIP_GOLD[2], 99, 1.4 + Math.random() * 0.8, 0.22 * look.sparkSize, 0.35, KIND.glitter);
    }
  }
  pool.end();
  fillLight(out, born, at, CROWN_GOLD, shell.size * 1.2);
}

// Colour-changing dahlia: a bright core (the pistil) of one colour inside a shell of big stars of
// another, which change to a third colour mid-flight in a wave from the top down.
function dahlia(pool, shell, config, palette, born, at, velocity, out) {
  const { look, physics } = config;
  const drag = 1.35 * physics.drag;
  const [core, petal, turned] = threeColours(palette);
  const petals = Math.round(shell.count * 0.55);
  const pistil = Math.round(shell.count * 0.35);
  const life = look.lifetime * 1.2;
  const spin = Math.random() * Math.PI * 2;
  let i = pool.begin(petals + pistil);
  for (let k = 0; k < petals; k++) {
    sphere(k, petals, spin);
    const s = shell.size * drag * jitter(0.08);
    const l = life * jitter(0.1);
    const changeAt = l * (0.36 + (1 - dir[1]) * 0.1); // the top turns first
    pool.set(i++, at[0], at[1], at[2], born, dir[0] * s + velocity[0] * 0.3, dir[1] * s + velocity[1] * 0.3, dir[2] * s + velocity[2] * 0.3, drag,
      petal[0], petal[1], petal[2], turned[0], turned[1], turned[2], changeAt, l, 0.55 * look.sparkSize, 0.22, KIND.spark);
  }
  for (let k = 0; k < pistil; k++) {
    sphere(k, pistil, spin + 1);
    const s = shell.size * 0.42 * drag * jitter(0.15);
    pool.set(i++, at[0], at[1], at[2], born, dir[0] * s, dir[1] * s, dir[2] * s, drag,
      core[0], core[1], core[2], core[0], core[1], core[2], 99, life * 0.8 * jitter(0.1), 0.32 * look.sparkSize, 0.05, KIND.spark);
  }
  pool.end();
  fillLight(out, born, at, petal, shell.size);
}

// Saturn: a bright planet, a tight ball of stars, with a wide ring round it, tilted toward the
// beach so it reads as a ring, and rolled a little, as Saturn is drawn.
function saturn(pool, shell, config, palette, born, at, velocity, out) {
  const { look, physics } = config;
  const drag = 1.4 * physics.drag;
  const planet = pick(palette);
  const band = Math.random() < 0.5 ? CROWN_GOLD : SILVER;
  const ball = Math.round(shell.count * 0.45);
  const ring = Math.round(shell.count * 0.5);
  const tilt = 0.08 + Math.random() * 0.14;
  const roll = (Math.random() - 0.5) * 0.6;
  // The ring's plane: across (rolled), and back-and-up (tilted toward the viewer).
  const ax = Math.cos(roll);
  const ay = Math.sin(roll);
  const bx = -Math.sin(roll) * Math.sin(tilt);
  const by = Math.cos(roll) * Math.sin(tilt);
  const bz = Math.cos(tilt);
  const spin = Math.random() * Math.PI * 2;
  let i = pool.begin(ball + ring);
  for (let k = 0; k < ball; k++) {
    sphere(k, ball, spin);
    const s = shell.size * 0.34 * drag * jitter(0.12);
    pool.set(i++, at[0], at[1], at[2], born, dir[0] * s, dir[1] * s, dir[2] * s, drag,
      planet[0], planet[1], planet[2], planet[0], planet[1], planet[2], 99, look.lifetime * 1.35 * jitter(0.1), 0.42 * look.sparkSize, 0.04, KIND.spark);
  }
  const speed = shell.size * 0.8 * drag;
  for (let k = 0; k < ring; k++) {
    const angle = (k / ring) * Math.PI * 2;
    const c = Math.cos(angle) * speed * jitter(0.03);
    const s = Math.sin(angle) * speed * jitter(0.03);
    pool.set(i++, at[0], at[1], at[2], born, ax * c + bx * s, ay * c + by * s, bz * s, drag,
      band[0], band[1], band[2], band[0], band[1], band[2], 99, look.lifetime * 1.35 * jitter(0.08), 0.38 * look.sparkSize, 0.1, KIND.spark);
  }
  pool.end();
  fillLight(out, born, at, planet, shell.size);
}

// Swimming fish: a swarm of small gold and silver sparks that wriggle off in every direction,
// each at its own speed, so they fill the burst instead of making a shell of it.
function fish(pool, shell, config, palette, born, at, velocity, out) {
  const { look, physics } = config;
  const drag = 0.8 * physics.drag;
  const count = Math.round(shell.count * 0.6);
  const tint = pick(palette);
  const spin = Math.random() * Math.PI * 2;
  let i = pool.begin(count);
  for (let k = 0; k < count; k++) {
    sphere(k, count, spin);
    const s = shell.size * drag * (0.4 + Math.random() * 0.6);
    const c = k % 5 === 0 ? tint : k % 2 ? CROWN_GOLD : SILVER;
    pool.set(i++, at[0], at[1], at[2], born, dir[0] * s, dir[1] * s, dir[2] * s, drag,
      c[0], c[1], c[2], c[0], c[1], c[2], 99, look.lifetime * (1 + Math.random() * 0.6), 0.38 * look.sparkSize, 0.3, KIND.swim);
  }
  pool.end();
  fillLight(out, born, at, CROWN_GOLD, shell.size * 0.8);
}

// Whirlwinds: a few dozen bright sparks thrown up and out that spin round and round their paths
// as they go (they whistle: audio.js).
function whirl(pool, shell, config, palette, born, at, velocity, out) {
  const { look, physics } = config;
  const drag = 1.0 * physics.drag;
  const count = 48;
  const tint = pick(palette);
  const spin = Math.random() * Math.PI * 2;
  let i = pool.begin(count);
  for (let k = 0; k < count; k++) {
    sphere(k, count, spin);
    const s = shell.size * 1.0 * drag * jitter(0.2);
    const c = k % 3 === 0 ? tint : k % 2 ? CROWN_GOLD : SILVER;
    pool.set(i++, at[0], at[1], at[2], born, dir[0] * s, (dir[1] * 0.7 + 0.3) * s, dir[2] * s, drag,
      c[0], c[1], c[2], c[0], c[1], c[2], 99, look.lifetime * 1.4 * jitter(0.1), 0.65 * look.sparkSize, 0.3, KIND.whirl);
  }
  pool.end();
  fillLight(out, born, at, tint, shell.size * 0.8);
}

// Falling leaves: amber and gold sparks thrown out wide, which then flutter down slowly, swaying
// and glinting as they turn, for long after the break.
function leaves(pool, shell, config, palette, born, at, velocity, out) {
  const { look, physics } = config;
  const drag = 1.5 * physics.drag;
  const count = Math.round(shell.count * 0.9);
  const spin = Math.random() * Math.PI * 2;
  let i = pool.begin(count);
  for (let k = 0; k < count; k++) {
    sphere(k, count, spin);
    const s = shell.size * 0.6 * drag * jitter(0.25);
    const c = Math.random() < 0.25 ? pick(palette) : AUTUMN[k % AUTUMN.length];
    pool.set(i++, at[0], at[1], at[2], born, dir[0] * s, dir[1] * s, dir[2] * s, drag,
      c[0], c[1], c[2], c[0], c[1], c[2], 99, look.lifetime * 3.2 * jitter(0.2), 0.75 * look.sparkSize, 0.1, KIND.flutter);
  }
  pool.end();
  fillLight(out, born, at, AUTUMN[0], shell.size * 0.9);
}

export const PREMIUM_TYPES = { kamuro, dahlia, saturn, fish, whirl, leaves };
