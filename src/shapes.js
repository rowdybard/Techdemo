// Shape bursts: a heart, a star, and text, facing the beach. Each spark flies out with
// velocity proportional to its point on the shape, so drag brings it to rest on the shape
// (a spark with velocity v and drag k coasts v / k). Text is drawn once on a small canvas,
// sampled for lit pixels, and the canvas is dropped; the points are kept until the text
// changes. This is the "client's name in fireworks" feature.
import { KIND } from './fireworks.glsl.js';

const MAX_POINTS = 1600;
const HEART_RED = [1, 0.12, 0.3];
const INITIALS_GOLD = [1, 0.78, 0.42];
const textPoints = new Float32Array(MAX_POINTS * 2); // x, y in -1..1, kept between shells
let textCount = 0;
let sampledText = null;

function pick(palette) {
  return palette[(Math.random() * palette.length) | 0];
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

// Writes `count` sparks whose resting offsets are shape points (x, y) times `scale`, in
// the vertical plane facing the beach.
function shapeBurst(pool, count, pointAt, born, at, scale, config, color, life, radius = 0.45) {
  const { look, physics } = config;
  const drag = 2.2 * physics.drag;
  let i = pool.begin(count);
  for (let k = 0; k < count; k++) {
    pointAt(k, count);
    const x = point[0] * scale * (0.98 + Math.random() * 0.04);
    const y = point[1] * scale * (0.98 + Math.random() * 0.04);
    pool.set(i++, at[0], at[1], at[2], born, x * drag, y * drag + 2, (Math.random() - 0.5) * 2, drag,
      color[0], color[1], color[2], color[0], color[1], color[2], 99, life * (0.9 + Math.random() * 0.2),
      radius * look.sparkSize, 0.05, KIND.spark);
  }
  pool.end();
}

const point = [0, 0];

function heartPoint(k, count) {
  const t = (k / count) * Math.PI * 2;
  point[0] = (16 * Math.sin(t) ** 3) / 17;
  point[1] = (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17;
}

function starPoint(k, count) {
  // Walk the outline of a five-pointed star, corner to corner.
  const edge = Math.floor((k / count) * 10);
  const along = (k / count) * 10 - edge;
  const r0 = edge % 2 === 0 ? 1 : 0.42;
  const r1 = edge % 2 === 0 ? 0.42 : 1;
  const a0 = Math.PI / 2 + (edge * Math.PI) / 5;
  const a1 = a0 + Math.PI / 5;
  point[0] = Math.cos(a0) * r0 * (1 - along) + Math.cos(a1) * r1 * along;
  point[1] = Math.sin(a0) * r0 * (1 - along) + Math.sin(a1) * r1 * along;
}

// Spread over the whole list: the points run row by row, so taking only the first ones
// would drop the bottom of every letter.
function textPoint(k, count) {
  const j = Math.floor((k * textCount) / count) * 2;
  point[0] = textPoints[j];
  point[1] = textPoints[j + 1];
}

// Samples the text into textPoints. Runs only when the text changes.
function sampleText(text) {
  sampledText = text;
  textCount = 0;
  const width = 640;
  const height = 160;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  let size = 120;
  g.font = `800 ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  const measured = g.measureText(text).width;
  if (measured > width * 0.94) size = Math.floor((size * width * 0.94) / measured);
  g.font = `800 ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#fff';
  g.fillText(text, width / 2, height / 2);
  const pixels = g.getImageData(0, 0, width, height).data;
  // The canvas is no longer needed; no texture was made from it.
  canvas.width = 0;
  canvas.height = 0;

  // Every lit pixel on a 3 px grid, then a random subset that fits.
  const lit = [];
  for (let y = 0; y < height; y += 3) {
    for (let x = 0; x < width; x += 3) if (pixels[(y * width + x) * 4 + 3] > 128) lit.push(x, y);
  }
  const available = lit.length / 2;
  const keep = Math.min(available, MAX_POINTS);
  for (let n = 0; n < keep; n++) {
    const from = ((n * available) / keep) | 0; // evenly through the list, so every letter gets its share
    textPoints[n * 2] = (lit[from * 2] - width / 2) / (width / 2);
    textPoints[n * 2 + 1] = -(lit[from * 2 + 1] - height / 2) / (width / 2);
  }
  textCount = keep;
}

function heart(pool, shell, config, palette, born, at, velocity, out) {
  const color = config.look.palette === 'custom' ? pick(palette) : HEART_RED;
  shapeBurst(pool, Math.round(shell.count * 0.7), heartPoint, born, at, shell.size * 0.9, config, color, config.look.lifetime * 1.1);
  fillLight(out, born, at, color, shell.size);
}

function star(pool, shell, config, palette, born, at, velocity, out) {
  const color = pick(palette);
  shapeBurst(pool, Math.round(shell.count * 0.7), starPoint, born, at, shell.size, config, color, config.look.lifetime * 1.1);
  fillLight(out, born, at, color, shell.size);
}

function text(pool, shell, config, palette, born, at, velocity, out) {
  const words = config.look.text.trim().slice(0, 24) || 'HELLO';
  if (words !== sampledText) sampleText(words);
  if (textCount === 0) return;
  const color = pick(palette);
  const count = Math.min(Math.max(textCount, 300), Math.round(shell.count * 2.2));
  shapeBurst(pool, count, textPoint, born, at, (config.look.textWidth / 2) * (shell.textScale || 1), config, color, config.look.lifetime * 1.5, 0.3);
  fillLight(out, born, at, color, shell.size * 1.3);
}

// Deluxe's keepsake: a big heart with initials inside it (S + J), held a little longer than other
// bursts. The director puts the initials in look.text just before; they're drawn in the heart's own
// plane, so they stay inside it from any view.
function initials(pool, shell, config, palette, born, at, velocity, out) {
  const frame = config.look.palette === 'custom' ? pick(palette) : HEART_RED;
  shapeBurst(pool, Math.round(shell.count * 1.4), heartPoint, born, at, shell.size * 1.05, config, frame, config.look.lifetime * 1.6);
  const words = config.look.text.trim().slice(0, 8);
  if (words) {
    if (words !== sampledText) sampleText(words);
    const count = Math.min(Math.max(textCount, 200), Math.round(shell.count * 1.4));
    if (textCount > 0) shapeBurst(pool, count, textPoint, born + 0.2, at, shell.size * 1.3, config, INITIALS_GOLD, config.look.lifetime * 1.7, 0.32);
  }
  fillLight(out, born, at, frame, shell.size * 1.2);
}

export const SHAPE_TYPES = { heart, star, text, initials };
