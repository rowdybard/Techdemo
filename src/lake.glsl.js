// The frozen lake's shape, in GLSL and in JS: where the shore runs and how high the land is.
// The lake is a wide oval with a wobbling shoreline; the land rises from it in a gentle snow
// bank, then forested foothills, then mountains, lower straight ahead (a valley, so the show
// has open sky) and taller to either side. The land mesh takes its shape from landHeight, and
// the pines and houses stand on it by calling the same function in their vertex shaders, so
// nothing floats or sinks. The JS copy of lakeDistance (sines and a square root only, which
// the GPU and JS evaluate alike) is for placing things along the shore.
//
// World layout, as everywhere: +Y up, the lake toward -Z, the camera on the near bank.

export const LAKE = { x: 0, z: -301, halfWidth: 1000, halfDepth: 279 };

// Small snowy islands with pines, out on the ice: x, z, radius and height in metres. They give the
// view layers (something between you and the far shore) and something for the ice to reflect.
export const ISLANDS = [[-52, -66, 22, 4.6], [64, -158, 28, 5.2], [-132, -246, 36, 7], [150, -300, 24, 4.2]];

const wobble = (x, z) => 14 * Math.sin(x * 0.0045 + 1) + 9 * Math.sin(x * 0.013 + z * 0.011 + 2) + 5 * Math.sin(z * 0.03 - x * 0.009);

/** Metres outward from the shoreline: negative out on the ice, positive on land. */
export function lakeDistance(x, z) {
  const dx = x - LAKE.x;
  const dz = z - LAKE.z;
  const length = Math.hypot(dx, dz);
  if (length < 1e-3) return -LAKE.halfDepth;
  const ux = dx / length;
  const uz = dz / length;
  const edge = 1 / Math.hypot(ux / LAKE.halfWidth, uz / LAKE.halfDepth);
  return length - edge - wobble(x, z);
}

// Needs noiseGLSL (valueNoise, fbm) in the same shader.
export const lakeGLSL = /* glsl */ `
  const vec4 ISLANDS[${ISLANDS.length}] = vec4[${ISLANDS.length}](${ISLANDS.map((i) => `vec4(${i.map((n) => n.toFixed(1)).join(', ')})`).join(', ')});

  const vec2 LAKE_CENTER = vec2(${LAKE.x.toFixed(1)}, ${LAKE.z.toFixed(1)});
  const vec2 LAKE_AXES = vec2(${LAKE.halfWidth.toFixed(1)}, ${LAKE.halfDepth.toFixed(1)});

  float lakeDistance(vec2 p) {
    vec2 d = p - LAKE_CENTER;
    float len = max(length(d), 0.001);
    vec2 u = d / len;
    float edge = 1.0 / length(u / LAKE_AXES);
    float wobble = 14.0 * sin(p.x * 0.0045 + 1.0) + 9.0 * sin(p.x * 0.013 + p.y * 0.011 + 2.0) + 5.0 * sin(p.y * 0.03 - p.x * 0.009);
    return len - edge - wobble;
  }

  // Ridged noise: sharp crests where the plain noise crosses one half.
  float ridged(vec2 p) {
    float sum = 0.0;
    float amplitude = 0.55;
    for (int i = 0; i < 3; i++) {
      float n = 1.0 - abs(2.0 * valueNoise(p) - 1.0);
      sum += amplitude * n * n;
      p = mat2(0.8, 0.6, -0.6, 0.8) * p * 2.0 + 11.7;
      amplitude *= 0.45;
    }
    return sum;
  }

  // How high the islands lift the ground here (zero away from them).
  float islandLift(vec2 p) {
    float lift = 0.0;
    for (int i = 0; i < ${ISLANDS.length}; i++) {
      vec4 island = ISLANDS[i];
      float across = length(p - island.xy) / island.z;
      lift = max(lift, island.w * (1.0 - smoothstep(0.3, 1.0, across)) * (0.8 + 0.4 * valueNoise(p * 0.06)));
    }
    return lift;
  }

  float landHeight(vec2 p) {
    float d = lakeDistance(p);
    float out_ = max(d, 0.0);
    // The bank: the lake bed shelves away under the ice, the snow rises gently from it.
    float h = d < 0.0 ? 0.35 + d * 0.2 : 0.35 + out_ * 0.045 + 0.6 * smoothstep(0.0, 8.0, out_) * valueNoise(p * 0.08);

    float foot = smoothstep(30.0, 900.0, out_);
    float range = smoothstep(450.0, 3400.0, out_);
    float valley = 0.5 + 0.5 * smoothstep(300.0, 2600.0, abs(p.x));
    h += 190.0 * foot * (0.35 + 0.65 * fbm(p * 0.0045 + 7.0));
    h += 1150.0 * range * valley * (0.25 + ridged(p * 0.0011 + 3.0)) * (0.55 + 0.9 * fbm(p * 0.0006 + 21.0));
    h += 16.0 * foot * fbm(p * 0.012);

    // The village shelf on the far shore: flat, a little above the ice, with a road along it.
    float farSide = smoothstep(60.0, 220.0, LAKE_CENTER.y - p.y);
    float shelf = smoothstep(-2.0, 8.0, d) * (1.0 - smoothstep(60.0, 150.0, d)) * (1.0 - smoothstep(520.0, 720.0, abs(p.x))) * farSide;
    h = mix(h, 2.4 + max(d, 0.0) * 0.02, shelf);
    return max(h, islandLift(p) - 1.0);
  }
`;
