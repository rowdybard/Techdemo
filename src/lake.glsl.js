// The frozen lake's shape: where the shore runs and how high the land is. The lake is a wide
// oval with a wobbling shoreline; the land rises from it in a gentle snow bank, then forested
// foothills, then mountains, lower straight ahead (a valley, so the show has open sky) and taller
// to either side, with a few small islands out on the ice.
//
// The land's height is worked out once, in JS, when the lake is built: the land mesh gets real
// positions and normals, and every pine, house and reed is handed the height of the ground it
// stands on. Nothing re-solves the terrain per frame on the GPU (it used to, for every vertex of
// every tree, which is what made phones stutter). The GPU only needs lakeDistance (sines and a
// square root), for the ice and for colouring the snow.
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

// What the shaders need: the shoreline. (No noise needed.)
export const lakeGLSL = /* glsl */ `
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
`;

// --- The land's height, in JS -----------------------------------------------------------------
// Value noise as in glsl.js (the same hash and blend), so the mountains keep their look.

const fract = (x) => x - Math.floor(x);

function hash13(x, y, z) {
  x = fract(x * 0.1031);
  y = fract(y * 0.103);
  z = fract(z * 0.0973);
  const d = x * (y + 33.33) + y * (z + 33.33) + z * (x + 33.33);
  return fract((x + d + y + d) * (z + d));
}

function valueNoise(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash13(ix, iy, 0);
  const b = hash13(ix + 1, iy, 0);
  const c = hash13(ix, iy + 1, 0);
  const e = hash13(ix + 1, iy + 1, 0);
  return (a + (b - a) * ux) * (1 - uy) + (c + (e - c) * ux) * uy;
}

function fbm(x, y) {
  let sum = 0;
  let amplitude = 0.5;
  for (let i = 0; i < 5; i++) {
    sum += amplitude * valueNoise(x, y);
    x = x * 2.03 + 17.1;
    y = y * 2.03 + 17.1;
    amplitude *= 0.5;
  }
  return sum;
}

// Ridged noise: sharp crests where the plain noise crosses one half.
function ridged(x, y) {
  let sum = 0;
  let amplitude = 0.55;
  for (let i = 0; i < 3; i++) {
    const n = 1 - Math.abs(2 * valueNoise(x, y) - 1);
    sum += amplitude * n * n;
    const rx = 0.8 * x - 0.6 * y;
    const ry = 0.6 * x + 0.8 * y;
    x = rx * 2 + 11.7;
    y = ry * 2 + 11.7;
    amplitude *= 0.45;
  }
  return sum;
}

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// How high the islands lift the ground here (zero away from them).
function islandLift(x, z) {
  let lift = 0;
  for (const [ix, iz, radius, height] of ISLANDS) {
    const across = Math.hypot(x - ix, z - iz) / radius;
    if (across >= 1) continue;
    lift = Math.max(lift, height * (1 - smoothstep(0.3, 1, across)) * (0.8 + 0.4 * valueNoise(x * 0.06, z * 0.06)));
  }
  return lift;
}

/** Height of the ground (or the lake bed) at x, z, in metres. */
export function landHeight(x, z) {
  const d = lakeDistance(x, z);
  const out = Math.max(d, 0);
  // The bank: the lake bed shelves away under the ice, the snow rises gently from it.
  let h = d < 0 ? 0.35 + d * 0.2 : 0.35 + out * 0.045 + 0.6 * smoothstep(0, 8, out) * valueNoise(x * 0.08, z * 0.08);
  const foot = smoothstep(30, 900, out);
  if (foot > 0) {
    h += 190 * foot * (0.35 + 0.65 * fbm(x * 0.0045 + 7, z * 0.0045 + 7));
    h += 16 * foot * fbm(x * 0.012, z * 0.012);
  }
  const range = smoothstep(450, 3400, out);
  if (range > 0) {
    const valley = 0.5 + 0.5 * smoothstep(300, 2600, Math.abs(x));
    h += 1150 * range * valley * (0.25 + ridged(x * 0.0011 + 3, z * 0.0011 + 3)) * (0.55 + 0.9 * fbm(x * 0.0006 + 21, z * 0.0006 + 21));
  }
  // The village shelf on the far shore: flat, a little above the ice.
  const farSide = smoothstep(60, 220, LAKE.z - z);
  const shelf = smoothstep(-2, 8, d) * (1 - smoothstep(60, 150, d)) * (1 - smoothstep(520, 720, Math.abs(x))) * farSide;
  h = h + (2.4 + out * 0.02 - h) * shelf;
  return d < 30 ? Math.max(h, islandLift(x, z) - 1) : h;
}
