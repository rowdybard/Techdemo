// Halloween shells: a jack-o'-lantern, a skull, a bat, a ghost and a spider web drawn in
// sparks; a witch's brew that boils over into popping bubbles; eyes that open in the dark
// and blink out; and a will-o'-the-wisp willow that drifts from ghost green to violet.
//
// The drawings are strokes (lines and arcs in a -1..1 box) sampled once, at load, into
// evenly spaced points, each tagged with which colour it takes (a pumpkin's face is
// yellow, its stem green). Like the heart and star, each spark flies out with velocity
// proportional to its point, so drag brings it to rest on the drawing.
import { KIND } from './fireworks.glsl.js';
import { positionAt } from './particles.js';

const POINTS = 720; // samples per drawing
const GOLDEN_ANGLE = 2.399963;

const ORANGE = [1, 0.4, 0.04];
const CANDLE = [1, 0.82, 0.25];
const STEM = [0.3, 0.85, 0.12];
const BONE = [0.92, 0.94, 0.82];
const SLIME = [0.3, 1, 0.2];
const VIOLET = [0.6, 0.18, 1];
const BLOOD = [1, 0.08, 0.05];
const ECTO = [0.6, 1, 0.75];
const SILVER = [0.85, 0.88, 1];

const p = [0, 0, 0];
const dir = [0, 0, 0];

// --- Drawings ----------------------------------------------------------------------

export function arc(cx, cy, rx, ry, from, to, steps) {
  const points = [];
  for (let s = 0; s <= steps; s++) {
    const a = from + ((to - from) * s) / steps;
    points.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return points;
}

function mirror(half) {
  // A right half, top to bottom, made into a closed outline.
  return [...half, ...half.slice().reverse().map(([x, y]) => [-x, y])];
}

// Samples strokes ({ points, color: index }) into POINTS evenly spaced (x, y, colour).
export function sample(strokes) {
  const segments = [];
  let total = 0;
  for (const stroke of strokes) {
    for (let i = 1; i < stroke.points.length; i++) {
      const a = stroke.points[i - 1];
      const b = stroke.points[i];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      segments.push({ a, b, length, color: stroke.color });
      total += length;
    }
  }
  const out = new Float32Array(POINTS * 3);
  let s = 0;
  let before = 0;
  for (let n = 0; n < POINTS; n++) {
    const d = ((n + 0.5) / POINTS) * total;
    while (s < segments.length - 1 && before + segments[s].length < d) before += segments[s++].length;
    const { a, b, length, color } = segments[s];
    const f = length > 0 ? Math.min(1, (d - before) / length) : 0;
    out[n * 3] = a[0] + (b[0] - a[0]) * f;
    out[n * 3 + 1] = a[1] + (b[1] - a[1]) * f;
    out[n * 3 + 2] = color;
  }
  return out;
}

const tau = Math.PI * 2;

// Ribbed pumpkin, triangle eyes and nose, a zigzag grin (colour 1), and a stem (colour 2).
const PUMPKIN = sample([
  { color: 0, points: arc(0, 0, 1, 1, 0, tau, 90).map(([x, y]) => [x * (1 + 0.05 * Math.cos(Math.atan2(y, x) * 6)), y * 0.78]) },
  { color: 0, points: arc(0, 0, 0.42, 0.74, Math.PI * 0.62, Math.PI * 1.38, 16) },
  { color: 0, points: arc(0, 0, 0.42, 0.74, -Math.PI * 0.38, Math.PI * 0.38, 16) },
  { color: 1, points: [[-0.5, 0.12], [-0.3, 0.42], [-0.12, 0.12], [-0.5, 0.12]] },
  { color: 1, points: [[0.5, 0.12], [0.3, 0.42], [0.12, 0.12], [0.5, 0.12]] },
  { color: 1, points: [[-0.08, -0.04], [0, 0.1], [0.08, -0.04], [-0.08, -0.04]] },
  { color: 1, points: [[-0.6, -0.2], [-0.42, -0.34], [-0.3, -0.22], [-0.15, -0.38], [0, -0.24], [0.15, -0.38], [0.3, -0.22], [0.42, -0.34], [0.6, -0.2], [0.35, -0.55], [-0.35, -0.55], [-0.6, -0.2]] },
  { color: 2, points: [[-0.04, 0.74], [0.02, 0.96], [0.14, 1.0], [0.08, 0.74]] },
]);

// Cranium and jaw, round eye sockets (colour 1), a nose and teeth.
const SKULL = sample([
  { color: 0, points: [...arc(0, 0.22, 0.8, 0.78, -0.62, Math.PI + 0.62, 50), [-0.48, -0.52], [-0.4, -0.86], [0.4, -0.86], [0.48, -0.52], [0.65, -0.24]] },
  { color: 1, points: arc(-0.32, 0.06, 0.2, 0.22, 0, tau, 20) },
  { color: 1, points: arc(0.32, 0.06, 0.2, 0.22, 0, tau, 20) },
  { color: 0, points: [[0, -0.12], [-0.09, -0.32], [0.09, -0.32], [0, -0.12]] },
  { color: 0, points: [[-0.26, -0.6], [0.26, -0.6]] },
  { color: 0, points: [[-0.13, -0.6], [-0.13, -0.84]] },
  { color: 0, points: [[0, -0.6], [0, -0.86]] },
  { color: 0, points: [[0.13, -0.6], [0.13, -0.84]] },
]);

// Spread wings with scalloped trailing edges, pointed ears, and red eyes (colour 1).
const BAT = sample([
  { color: 0, points: mirror([[0, 0.2], [0.06, 0.36], [0.12, 0.2], [0.26, 0.22], [0.5, 0.4], [0.78, 0.48], [1, 0.3], [0.86, 0.08], [0.72, 0.12], [0.62, -0.06], [0.46, 0.0], [0.36, -0.16], [0.2, -0.06], [0.1, -0.3], [0, -0.36]]) },
  { color: 1, points: arc(-0.05, 0.1, 0.025, 0.025, 0, tau, 6) },
  { color: 1, points: arc(0.05, 0.1, 0.025, 0.025, 0, tau, 6) },
]);

// A sheet with a domed head and a wavy hem, hollow eyes and an O of a mouth.
const GHOST = sample([
  { color: 0, points: [...arc(0, 0.25, 0.62, 0.68, 0, Math.PI, 36), [-0.62, -0.7], ...arc(-0.413, -0.7, 0.207, 0.14, Math.PI, tau, 8), ...arc(0, -0.7, 0.207, 0.14, Math.PI, 0, 8), ...arc(0.413, -0.7, 0.207, 0.14, Math.PI, tau, 8), [0.62, 0.25]] },
  { color: 1, points: arc(-0.22, 0.3, 0.1, 0.16, 0, tau, 14) },
  { color: 1, points: arc(0.22, 0.3, 0.1, 0.16, 0, tau, 14) },
  { color: 1, points: arc(0, -0.08, 0.12, 0.16, 0, tau, 14) },
]);

// Eight spokes and four sagging rings, with a spider (colour 1) in the middle.
const WEB = sample((() => {
  const strokes = [];
  for (let s = 0; s < 8; s++) {
    const a = (s / 8) * tau + 0.2;
    strokes.push({ color: 0, points: [[0, 0], [Math.cos(a), Math.sin(a)]] });
  }
  for (const r of [0.28, 0.5, 0.72, 0.95]) {
    const ring = [];
    for (let s = 0; s <= 8; s++) {
      const a0 = (s / 8) * tau + 0.2;
      ring.push([Math.cos(a0) * r, Math.sin(a0) * r]);
      if (s < 8) {
        const mid = a0 + tau / 16;
        ring.push([Math.cos(mid) * r * 0.86, Math.sin(mid) * r * 0.86]); // the silk sags toward the hub
      }
    }
    strokes.push({ color: 0, points: ring });
  }
  strokes.push({ color: 1, points: arc(0, 0, 0.09, 0.11, 0, tau, 12) });
  for (const side of [-1, 1]) {
    for (const lift of [0.1, 0.03, -0.04, -0.11]) strokes.push({ color: 1, points: [[side * 0.06, lift * 0.5], [side * 0.2, lift + 0.08], [side * 0.26, lift - 0.04]] });
  }
  return strokes;
})());

// --- Writers -----------------------------------------------------------------------

export function fillLight(out, born, at, color, size) {
  out.time = born;
  out.x = at[0];
  out.y = at[1];
  out.z = at[2];
  out.r = color[0];
  out.g = color[1];
  out.b = color[2];
  out.size = size;
}

// Writes `count` sparks coming to rest on `drawing`, `scale` metres from middle to edge.
export function drawing(pool, shape, count, born, at, scale, config, colors, life, kind) {
  const { look, physics } = config;
  const drag = 2.2 * physics.drag;
  let i = pool.begin(count);
  for (let k = 0; k < count; k++) {
    const j = Math.floor((k * POINTS) / count) * 3;
    const x = shape[j] * scale * (0.98 + Math.random() * 0.04);
    const y = shape[j + 1] * scale * (0.98 + Math.random() * 0.04);
    const c = colors[shape[j + 2]];
    pool.set(i++, at[0], at[1], at[2], born, x * drag, y * drag + 2, (Math.random() - 0.5) * 2, drag,
      c[0], c[1], c[2], c[0], c[1], c[2], 99, life * (0.9 + Math.random() * 0.2), 0.42 * look.sparkSize, 0.05, kind);
  }
  pool.end();
}

function spherical(k, count, spin) {
  const y = 1 - (2 * (k + 0.5)) / count;
  const ring = Math.sqrt(Math.max(0, 1 - y * y));
  const angle = k * GOLDEN_ANGLE + spin;
  dir[0] = Math.cos(angle) * ring;
  dir[1] = y;
  dir[2] = Math.sin(angle) * ring;
}

const PUMPKIN_COLORS = [ORANGE, CANDLE, STEM];
const SKULL_COLORS = [BONE, SLIME];
const BAT_COLORS = [VIOLET, BLOOD];
const GHOST_COLORS = [ECTO, ECTO];
const WEB_COLORS = [SILVER, VIOLET];

export function shapeCount(shell) {
  return Math.min(POINTS, Math.round(shell.count * 1.1));
}

function pumpkin(pool, shell, config, palette, born, at, velocity, out) {
  drawing(pool, PUMPKIN, shapeCount(shell), born, at, shell.size, config, PUMPKIN_COLORS, config.look.lifetime * 1.3, KIND.spark);
  fillLight(out, born, at, ORANGE, shell.size);
}

function skull(pool, shell, config, palette, born, at, velocity, out) {
  drawing(pool, SKULL, shapeCount(shell), born, at, shell.size * 0.9, config, SKULL_COLORS, config.look.lifetime * 1.3, KIND.spark);
  fillLight(out, born, at, BONE, shell.size * 0.8);
}

function bat(pool, shell, config, palette, born, at, velocity, out) {
  drawing(pool, BAT, Math.round(shapeCount(shell) * 0.8), born, at, shell.size * 1.1, config, BAT_COLORS, config.look.lifetime * 1.2, KIND.spark);
  fillLight(out, born, at, VIOLET, shell.size);
}

// Flickers like a strobe, so it seems to come and go.
function ghost(pool, shell, config, palette, born, at, velocity, out) {
  drawing(pool, GHOST, shapeCount(shell), born, at, shell.size * 0.9, config, GHOST_COLORS, config.look.lifetime * 1.5, KIND.strobe);
  fillLight(out, born, at, ECTO, shell.size * 0.7);
}

function web(pool, shell, config, palette, born, at, velocity, out) {
  // The web is the longest drawing, so it gets more sparks to keep its threads unbroken.
  drawing(pool, WEB, Math.min(POINTS, Math.round(shell.count * 1.7)), born, at, shell.size, config, WEB_COLORS, config.look.lifetime * 1.4, KIND.glitter);
  fillLight(out, born, at, SILVER, shell.size * 0.8);
}

// Bubbling green that turns violet, then boils over into popping bubbles.
function brew(pool, shell, config, palette, born, at, velocity, out) {
  const { look, physics } = config;
  const g = 9.81 * physics.gravity;
  const drag = 1.5 * physics.drag;
  const count = Math.round(shell.count * 0.55);
  const pops = Math.round(count * 1.6);
  const speed = shell.size * 0.85 * drag;
  const spin = Math.random() * tau;
  const life = look.lifetime * 1.2;
  let i = pool.begin(count + pops);
  for (let k = 0; k < count; k++) {
    spherical(k, count, spin);
    const s = speed * (0.9 + Math.random() * 0.2);
    pool.set(i++, at[0], at[1], at[2], born, dir[0] * s, dir[1] * s, dir[2] * s, drag,
      SLIME[0], SLIME[1], SLIME[2], VIOLET[0], VIOLET[1], VIOLET[2], life * 0.4, life * (0.85 + Math.random() * 0.3),
      0.38 * look.sparkSize, 0.25, KIND.spark);
  }
  for (let k = 0; k < pops; k++) {
    spherical(k % count, count, spin);
    const delay = 0.6 + Math.random() * 1.6;
    const s = speed * (0.85 + Math.random() * 0.3);
    positionAt(p, at[0], at[1], at[2], dir[0] * s, dir[1] * s, dir[2] * s, drag, delay, g, physics.windX, physics.windZ);
    const c = k % 3 === 0 ? VIOLET : SLIME;
    pool.set(i++, p[0] + (Math.random() - 0.5) * 5, p[1] + (Math.random() - 0.5) * 5, p[2] + (Math.random() - 0.5) * 5, born + delay,
      0, 0.5, 0, 3, c[0], c[1], c[2], c[0], c[1], c[2], 99, 0.3, 1.1 * look.sparkSize, 0, KIND.pop);
  }
  pool.end();
  fillLight(out, born, at, SLIME, shell.size);
}

// Pairs of eyes that open one by one across the dark, stare, blink once, and go out.
// They appear where they look from (no flight), with heavy drag so they hardly sink.
function eyes(pool, shell, config, palette, born, at, velocity, out) {
  const { look } = config;
  const drag = 6;
  const pairs = 9;
  const dots = 6; // sparks per eye
  const spread = shell.size * 1.1;
  let i = pool.begin(pairs * 2 * dots * 2);
  for (let e = 0; e < pairs; e++) {
    // Spread over a disc facing the beach, golden-angle so they don't bunch.
    const r = spread * Math.sqrt((e + 0.5) / pairs);
    const a = e * GOLDEN_ANGLE + Math.random();
    const cx = at[0] + Math.cos(a) * r;
    const cy = at[1] + Math.sin(a) * r * 0.7;
    const opens = born + 0.2 + Math.random() * 1.8;
    const stare = 0.8 + Math.random() * 1.0;
    const c = e % 3 === 0 ? CANDLE : e % 3 === 1 ? BLOOD : SLIME;
    const gap = 2.2 + Math.random();
    for (let side = -1; side <= 1; side += 2) {
      for (let d = 0; d < dots; d++) {
        const x = cx + side * gap + (Math.random() - 0.5) * 1.3;
        const y = cy + (Math.random() - 0.5) * 0.6; // eyes are wider than tall
        // Open, a quick blink, then open again a little longer.
        for (let glance = 0; glance < 2; glance++) {
          const from = glance === 0 ? opens : opens + stare + 0.14;
          const hold = glance === 0 ? stare : 0.6 + Math.random() * 0.4;
          pool.set(i++, x, y, at[2], from, 0, 0, 0, drag,
            c[0] * 0.8, c[1] * 0.8, c[2] * 0.8, c[0] * 0.8, c[1] * 0.8, c[2] * 0.8, 99, hold, 0.5 * look.sparkSize, 0, KIND.spark);
        }
      }
    }
  }
  pool.end();
  fillLight(out, born + 0.4, at, BLOOD, shell.size * 0.45);
}

// A slow, drooping willow in ghost green that fades to violet.
function wisp(pool, shell, config, palette, born, at, velocity, out) {
  const { look, physics } = config;
  const drag = 1.05 * physics.drag;
  const count = Math.round(shell.count * 0.5);
  const spin = Math.random() * tau;
  const speed = shell.size * 0.6 * drag;
  const life = look.lifetime * 2.1;
  let i = pool.begin(count);
  for (let k = 0; k < count; k++) {
    spherical(k, count, spin);
    const s = speed * (0.9 + Math.random() * 0.2);
    pool.set(i++, at[0], at[1], at[2], born, dir[0] * s, dir[1] * s, dir[2] * s, drag,
      ECTO[0], ECTO[1], ECTO[2], VIOLET[0], VIOLET[1], VIOLET[2], life * 0.45, life * (0.85 + Math.random() * 0.3),
      0.3 * look.sparkSize, 1.3, KIND.glitter);
  }
  pool.end();
  fillLight(out, born, at, ECTO, shell.size * 0.7);
}

export const HALLOWEEN_TYPES = { pumpkin, skull, bat, ghost, web, brew, eyes, wisp };
