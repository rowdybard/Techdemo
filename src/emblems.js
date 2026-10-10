// Emblem shells: drawings in sparks that take the show's own colours. The first is a warrior's
// helmet in profile (a plain Corinthian helmet, no team's mark): the helmet in the palette's
// first colour, its plumed crest and the eye slit in the second, so Green & White draws a green
// helmet under a white crest. Drawn and flown like the Halloween shapes (halloween.js).
import { KIND } from './fireworks.glsl.js';
import { arc, drawing, fillLight, sample, shapeCount } from './halloween.js';

const pi = Math.PI;

// Facing right, in a -1..1 box. The crest's comb is a fan of strokes between its two edges.
const HELMET = sample((() => {
  const strokes = [];
  // Neck guard, the back of the dome, the brow, the nose guard, the cheek guard and chin, the jaw line.
  strokes.push({ color: 0, points: [[-0.52, -0.78], [-0.6, -0.66], [-0.62, -0.45], [-0.6, -0.2], [-0.55, 0.05], [-0.45, 0.25], [-0.3, 0.4],
    [-0.12, 0.48], [0.08, 0.5], [0.26, 0.45], [0.4, 0.34], [0.5, 0.2], [0.56, 0.06], [0.6, -0.02], [0.56, -0.08], [0.55, -0.42], [0.5, -0.5],
    [0.46, -0.47], [0.44, -0.56], [0.42, -0.72], [0.32, -0.84], [0.15, -0.82], [0.04, -0.72], [-0.08, -0.62], [-0.22, -0.66], [-0.38, -0.74], [-0.52, -0.78]] });
  // The brow band round the dome, and the seam where the cheek piece meets it.
  strokes.push({ color: 0, points: [[0.55, 0.03], [0.3, 0.15], [0, 0.17], [-0.3, 0.08], [-0.52, -0.1]] });
  strokes.push({ color: 0, points: [[0.06, -0.06], [-0.02, -0.34], [0.04, -0.66]] });
  // The eye slit, and the opening down the front of the face.
  strokes.push({ color: 1, points: [[0.18, -0.06], [0.26, -0.01], [0.36, 0.01], [0.46, -0.02], [0.5, -0.05], [0.44, -0.1], [0.34, -0.12], [0.24, -0.1], [0.18, -0.06]] });
  strokes.push({ color: 0, points: [[0.44, -0.13], [0.39, -0.33], [0.41, -0.5]] });
  // The crest: a plume sweeping back over the dome, closed at both ends, and its comb.
  const outer = arc(-0.12, 0.3, 0.72, 0.66, 0.12 * pi, 1.05 * pi, 34);
  const inner = arc(-0.12, 0.3, 0.58, 0.38, 0.12 * pi, 1.05 * pi, 26);
  strokes.push({ color: 1, points: outer });
  strokes.push({ color: 1, points: inner });
  strokes.push({ color: 1, points: [outer[0], inner[0]] });
  strokes.push({ color: 1, points: [outer[outer.length - 1], inner[inner.length - 1]] });
  for (let k = 1; k < 12; k++) {
    const a = (0.12 + (0.93 * k) / 12) * pi;
    strokes.push({ color: 1, points: [[-0.12 + Math.cos(a) * 0.6, 0.3 + Math.sin(a) * 0.4], [-0.12 + Math.cos(a) * 0.7, 0.3 + Math.sin(a) * 0.63]] });
  }
  return strokes;
})());

const colors = [null, null];

function helmet(pool, shell, config, palette, born, at, velocity, out) {
  colors[0] = palette[0];
  colors[1] = palette[1 % palette.length];
  drawing(pool, HELMET, shapeCount(shell), born, at, shell.size * 1.05, config, colors, config.look.lifetime * 1.4, KIND.spark);
  fillLight(out, born, at, colors[0], shell.size);
}

export const EMBLEM_TYPES = { helmet };
