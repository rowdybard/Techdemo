// The land around the frozen lake: snow banks, forested foothills and the mountains. One mesh,
// a polar grid around the lake whose rings are finest at the shoreline (where the camera and the
// village stand) and spread out to the far peaks, plus a small square grid over each island. Its
// shape is worked out once, in JS, when the lake is built (landHeight in lake.glsl.js): real
// positions, normals from the grid itself, and how far each point is from the water. So the vertex
// shader does nothing, and the fragment shader only dresses the ground as snow, bare rock or
// forest, lit by the moon and by the bursts, melting into the night haze with distance. It keeps
// its noise to a handful of lookups a pixel (the land covers half the screen).
import * as THREE from 'three';
import { valueNoiseGLSL, skyGLSL } from './glsl.js';
import { ISLANDS, LAKE, lakeDistance, landHeight } from './lake.glsl.js';
import { burstLightGLSL } from './burstlights.js';

const REACH = 5300; // metres from the shore to the far edge of the mesh
const SHARPNESS = 5; // how fast the rings spread out
const INNER = -45; // the mesh starts this far under the ice
const ISLAND_GRID = 28;

const vertexShader = /* glsl */ `
  attribute float aShore;       // metres from the water (negative under the ice)
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vShore;
  void main() {
    vWorld = position;
    vNormal = normal;
    vShore = aShore;
    gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec4 uMoon;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vShore;

  ${valueNoiseGLSL}
  ${skyGLSL}
  ${burstLightGLSL}

  void main() {
    vec2 p = vWorld.xz;
    vec3 toEye = cameraPosition - vWorld;
    float distance = length(toEye);
    vec3 view = toEye / distance;
    float near = 1.0 - smoothstep(30.0, 300.0, distance);

    // Close up: wind-packed snow, and ridges the wind has carved, running with it. Far off: the
    // big faces broken up, so they don't read as flat sheets.
    vec3 n = vNormal;
    float ridge = 0.0;
    if (near > 0.0) {
      n.xz += (vec2(valueNoise(p * 0.45), valueNoise(p * 0.45 + 31.0)) - 0.5) * 0.28 * near;
      ridge = sin(p.y * 2.6 + valueNoise(p * 0.6) * 5.0);
      n.z += ridge * 0.12 * near;
    } else {
      n.xz += (vec2(valueNoise(p * 0.012 + 9.0), valueNoise(p * 0.012 + 51.0)) - 0.5) * 0.55 * smoothstep(150.0, 1500.0, distance);
    }
    n = normalize(n);

    // What it is: snow on gentle slopes and high up, bare rock on the steep faces, forest on the
    // lower slopes (the pines themselves are pines.js; this is the forest floor and the mass of
    // the far trees). Gullies run down the fall line: snow lies in some, rock shows between.
    float height = vWorld.y;
    float breakup = valueNoise(p * 0.01) * 0.6 + valueNoise(p * 0.023 + 4.0) * 0.4 - 0.5;
    vec2 fall = n.xz / max(length(n.xz), 0.001);
    vec2 g = vec2(dot(p, vec2(-fall.y, fall.x)) * 0.03, height * 0.01) + 5.0;
    float gully = valueNoise(g) * 0.6 + valueNoise(g * 2.1 + 3.0) * 0.4 - 0.5;
    float snow = smoothstep(0.52, 0.82, n.y + breakup * 0.5 + height * 0.00035 + gully * 0.55);
    float trees = (1.0 - smoothstep(330.0, 560.0, height + breakup * 220.0)) * smoothstep(0.72, 0.9, n.y) * smoothstep(40.0, 140.0, vShore);
    vec3 snowAlbedo = vec3(0.8, 0.86, 0.96) * (near > 0.0 ? 0.9 + 0.1 * valueNoise(p * 0.8) : 0.95);
    vec3 rockAlbedo = vec3(0.045, 0.05, 0.065) * (0.7 + 0.6 * valueNoise(p * 0.03));
    vec3 forestAlbedo = mix(vec3(0.008, 0.016, 0.015), snowAlbedo, 0.08 + 0.2 * valueNoise(p * 0.5));
    vec3 albedo = mix(rockAlbedo, snowAlbedo, snow);
    albedo *= 1.0 - 0.09 * (ridge * 0.5 + 0.5) * near * snow;
    albedo = mix(albedo, forestAlbedo, trees * (1.0 - snow * 0.15));

    // Light: the moon, a cold fill from the sky, the village's windows on the snow round them,
    // and the bursts.
    vec3 moonColor = vec3(0.21, 0.27, 0.44) * uMoon.w;
    vec3 fill = (vec3(0.025, 0.036, 0.065) * uMoon.w + skyZenith() * 2.0) * (0.55 + 0.45 * n.y);
    float farSide = smoothstep(60.0, 220.0, ${LAKE.z.toFixed(1)} - p.y);
    float village = (1.0 - smoothstep(0.0, 120.0, abs(vShore - 30.0))) * (1.0 - smoothstep(430.0, 620.0, abs(p.x))) * farSide;
    vec3 bursts = burstDiffuse(vWorld, n);
    vec3 light = moonColor * max(dot(n, uMoon.xyz), 0.0) + fill + vec3(1.0, 0.5, 0.2) * 0.1 * village + bursts * 0.22;
    light *= mix(1.0, 0.62, near); // the snow at your feet is the darkest, so the eye goes to the lights across the lake
    vec3 color = albedo * light;

    // Sparkle: the odd crystal of snow catching the moon, near the eye.
    if (near > 0.0) {
      vec2 cell = floor(p * 14.0);
      float lucky = step(0.992, hash12(cell)) * near * snow;
      float facing = hash13(vec3(cell, floor(dot(view, vec3(31.0, 17.0, 23.0)))));
      color += (moonColor * 3.0 + bursts * 0.4) * lucky * smoothstep(0.7, 1.0, facing);
    }

    // Distance: aerial perspective in moonlight, the far ranges paler than the sky behind them.
    vec3 haze = skyGradient(normalize(vec3(-view.x, 0.03, -view.z))) + vec3(0.016, 0.024, 0.045) * uMoon.w;
    color = mix(color, haze, 1.0 - exp(-distance / 3600.0));

    gl_FragColor = vec4(color, 1.0);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// Normal at a grid point from its neighbours: (a2 - a1) x (b2 - b1), turned to face up.
function normalFrom(positions, normals, i, a1, a2, b1, b2) {
  const ax = positions[a2 * 3] - positions[a1 * 3];
  const ay = positions[a2 * 3 + 1] - positions[a1 * 3 + 1];
  const az = positions[a2 * 3 + 2] - positions[a1 * 3 + 2];
  const bx = positions[b2 * 3] - positions[b1 * 3];
  const by = positions[b2 * 3 + 1] - positions[b1 * 3 + 1];
  const bz = positions[b2 * 3 + 2] - positions[b1 * 3 + 2];
  let nx = ay * bz - az * by;
  let ny = az * bx - ax * bz;
  let nz = ax * by - ay * bx;
  const length = Math.hypot(nx, ny, nz) * (ny < 0 ? -1 : 1) || 1;
  nx /= length;
  ny /= length;
  nz /= length;
  normals[i * 3] = nx;
  normals[i * 3 + 1] = ny;
  normals[i * 3 + 2] = nz;
}

export function create(ctx) {
  const { scene, phone } = ctx;
  const [columns, rows] = phone ? [320, 72] : [640, 120];
  const across = columns + 1;
  const ringVerts = across * (rows + 1);
  const islandSide = ISLAND_GRID + 1;
  const total = ringVerts + ISLANDS.length * islandSide * islandSide;
  const positions = new Float32Array(total * 3);
  const normals = new Float32Array(total * 3);
  const shore = new Float32Array(total);

  // The rings: angle round the lake, distance out from the shoreline (finest at the shore). The
  // first and last column coincide, so there's no seam.
  const ringOut = (row) => INNER + (REACH - INNER) * ((Math.exp((SHARPNESS * row) / rows) - 1) / (Math.exp(SHARPNESS) - 1));
  for (let column = 0; column <= columns; column++) {
    const theta = (column / columns) * Math.PI * 2;
    const ux = Math.cos(theta);
    const uz = Math.sin(theta);
    const edge = 1 / Math.hypot(ux / LAKE.halfWidth, uz / LAKE.halfDepth);
    for (let row = 0; row <= rows; row++) {
      const i = row * across + column;
      const radius = edge + ringOut(row);
      const x = LAKE.x + ux * radius;
      const z = LAKE.z + uz * radius;
      positions[i * 3] = x;
      positions[i * 3 + 1] = landHeight(x, z);
      positions[i * 3 + 2] = z;
      shore[i] = lakeDistance(x, z);
    }
  }
  for (let row = 0; row <= rows; row++) {
    for (let column = 0; column <= columns; column++) {
      const left = row * across + (column > 0 ? column - 1 : columns - 1);
      const right = row * across + (column < columns ? column + 1 : 1);
      const inward = Math.max(row - 1, 0) * across + column;
      const outward = Math.min(row + 1, rows) * across + column;
      normalFrom(positions, normals, row * across + column, left, right, inward, outward);
    }
  }

  // The islands: a square grid over each.
  let v = ringVerts;
  for (const [ix, iz, radius] of ISLANDS) {
    const first = v;
    for (let r = 0; r < islandSide; r++) {
      for (let c = 0; c < islandSide; c++) {
        const x = ix + (c / ISLAND_GRID - 0.5) * radius * 3;
        const z = iz + (r / ISLAND_GRID - 0.5) * radius * 3;
        positions[v * 3] = x;
        positions[v * 3 + 1] = landHeight(x, z);
        positions[v * 3 + 2] = z;
        shore[v] = lakeDistance(x, z);
        v++;
      }
    }
    for (let r = 0; r < islandSide; r++) {
      for (let c = 0; c < islandSide; c++) {
        const at = (rr, cc) => first + Math.min(Math.max(rr, 0), ISLAND_GRID) * islandSide + Math.min(Math.max(cc, 0), ISLAND_GRID);
        normalFrom(positions, normals, at(r, c), at(r + 1, c), at(r - 1, c), at(r, c + 1), at(r, c - 1));
      }
    }
  }

  const index = new Uint32Array((columns * rows + ISLANDS.length * ISLAND_GRID * ISLAND_GRID) * 6);
  let j = 0;
  const quad = (a, b) => {
    index[j++] = a;
    index[j++] = a + 1;
    index[j++] = b;
    index[j++] = b;
    index[j++] = a + 1;
    index[j++] = b + 1;
  };
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) quad(row * across + column, (row + 1) * across + column);
  for (let k = 0; k < ISLANDS.length; k++) {
    const first = ringVerts + k * islandSide * islandSide;
    for (let r = 0; r < ISLAND_GRID; r++) for (let c = 0; c < ISLAND_GRID; c++) quad(first + r * islandSide + c, first + (r + 1) * islandSide + c);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('aShore', new THREE.BufferAttribute(shore, 1));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));

  const material = new THREE.ShaderMaterial({
    name: 'Land',
    uniforms: { ...ctx.sky.uniforms, ...ctx.burstLights.uniforms },
    vertexShader,
    fragmentShader,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false; // it rings the camera: always partly in view
  mesh.userData.mirrored = true; // part of what the ice reflects (mirror.js)
  scene.add(mesh);

  return {
    update() {},

    dispose() {
      scene.remove(mesh);
      geometry.dispose();
      material.dispose();
    },
  };
}
