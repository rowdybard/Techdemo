// The sand's height, in GLSL and in JS. The beach mesh takes its shape from it and the
// ocean reads its depth from it, so both copies must stay identical. They use only sines
// and exponentials, which the GPU and JS evaluate the same way.
//
// s is the distance up the beach from the resting waterline. The waterline wanders along
// the shore instead of running straight, the beach rises gently to low dunes, and the
// sea floor falls away to about 7 m deep.

export const SLOPE = 0.045;
const FLOOR = 7;

export const terrainGLSL = /* glsl */ `
  float shoreDistance(vec2 xz) {
    float x = xz.x;
    return xz.y + 5.0 * sin(x * 0.013) + 2.5 * sin(x * 0.037 + 0.4) - 2.5 * sin(0.4) + 1.2 * sin(x * 0.083);
  }

  float terrainHeight(vec2 xz) {
    float s = shoreDistance(xz);
    float x = xz.x;
    if (s < 0.0) return -${FLOOR.toFixed(1)} * (1.0 - exp(s * ${SLOPE} / ${FLOOR.toFixed(1)}));
    float dunes = smoothstep(32.0, 75.0, s) * (1.1 + 0.7 * sin(x * 0.05 + s * 0.02) * sin(x * 0.021 - 0.7) + 0.35 * sin(x * 0.13 + s * 0.09));
    return s * ${SLOPE} + dunes;
  }
`;

export function shoreDistance(x, z) {
  return z + 5 * Math.sin(x * 0.013) + 2.5 * Math.sin(x * 0.037 + 0.4) - 2.5 * Math.sin(0.4) + 1.2 * Math.sin(x * 0.083);
}

export function terrainHeight(x, z) {
  const s = shoreDistance(x, z);
  if (s < 0) return -FLOOR * (1 - Math.exp((s * SLOPE) / FLOOR));
  const t = Math.min(Math.max((s - 32) / 43, 0), 1);
  const ramp = t * t * (3 - 2 * t);
  const dunes = ramp * (1.1 + 0.7 * Math.sin(x * 0.05 + s * 0.02) * Math.sin(x * 0.021 - 0.7) + 0.35 * Math.sin(x * 0.13 + s * 0.09));
  return s * SLOPE + dunes;
}
