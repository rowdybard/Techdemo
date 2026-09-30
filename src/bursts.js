// Burst types. Each writes its particles into the pool, born at `born`, around the point
// `at` where the shell broke, and fills `out` with the burst's light for the scene.
import { KIND } from './fireworks.glsl.js';

const GOLDEN_ANGLE = 2.399963;

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

// Peony: a sphere of sparks that coast out, hang, and fade.
function peony(pool, shell, config, palette, born, at, velocity, out) {
  const { look, physics } = config;
  const drag = 1.4 * physics.drag;
  const speed = shell.size * drag; // sparks coast about shell.size metres before drag holds them
  const a = pick(palette);
  const b = Math.random() < 0.3 ? pick(palette) : a; // sometimes two colours
  const change = Math.random() < 0.25 ? pick(palette) : null; // sometimes a colour change
  const glitter = look.glitter > 0 && Math.random() < 0.25 ? KIND.glitter : KIND.spark;
  const count = shell.count;
  const spin = Math.random() * Math.PI * 2;
  const radius = 0.4 * look.sparkSize;

  let i = pool.begin(count);
  for (let k = 0; k < count; k++) {
    // Even directions over the sphere (a Fibonacci spiral), then a little jitter.
    const y = 1 - (2 * (k + 0.5)) / count;
    const ring = Math.sqrt(1 - y * y);
    const angle = k * GOLDEN_ANGLE + spin;
    const s = speed * (0.9 + Math.random() * 0.2);
    const c = k % 2 === 0 ? a : b;
    const c2 = change || c;
    const life = look.lifetime * (0.85 + Math.random() * 0.3);
    pool.set(i++, at[0], at[1], at[2], born,
      Math.cos(angle) * ring * s + velocity[0] * 0.3, y * s + velocity[1] * 0.3, Math.sin(angle) * ring * s + velocity[2] * 0.3, drag,
      c[0], c[1], c[2], c2[0], c2[1], c2[2], life * 0.5,
      life, radius, 0.07, glitter);
  }
  pool.end();
  fillLight(out, born, at, a, shell.size);
}

const TYPES = { peony };

export function burst(pool, shell, config, palette, born, at, velocity, out) {
  (TYPES[shell.type] || peony)(pool, shell, config, palette, born, at, velocity, out);
}
