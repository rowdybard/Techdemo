// The land around the frozen lake: snow banks, forested foothills and the mountains. One mesh,
// a polar grid around the lake whose rings are finest at the shoreline (where the camera and the
// village stand) and spread out to the far peaks. The vertex shader lifts each point to
// landHeight (lake.glsl.js); the fragment shader dresses it as snow, bare rock or forest, lit by
// the moon and by the bursts, and lets it melt into the night haze with distance. The islands
// out on the ice are small grids of the same mesh (their points carry their own positions).
import * as THREE from 'three';
import { valueNoiseGLSL, skyGLSL } from './glsl.js';
import { lakeGLSL, ISLANDS } from './lake.glsl.js';
import { burstLightGLSL } from './burstlights.js';

const REACH = 5300; // metres from the shore to the far edge of the mesh
const SHARPNESS = 5; // how fast the rings spread out
const INNER = -45; // the mesh starts this far under the ice

const vertexShader = /* glsl */ `
  attribute vec2 aPolar; // angle (0..1 round), ring (0..1 out)
  varying vec3 vWorld;
  varying vec3 vNormal;

  ${valueNoiseGLSL}
  ${lakeGLSL}

  void main() {
    vec2 p;
    float e = 1.0;
    if (aPolar.y < -5.0) {
      p = position.xz;                           // an island: the grid point is where it is
    } else {
      float theta = aPolar.x * 6.2831853;
      vec2 u = vec2(cos(theta), sin(theta));
      float edge = 1.0 / length(u / LAKE_AXES);
      float span = (exp(${SHARPNESS.toFixed(1)} * aPolar.y) - 1.0) / (exp(${SHARPNESS.toFixed(1)}) - 1.0);
      float ring = ${INNER.toFixed(1)} + ${(REACH - INNER).toFixed(1)} * span;
      p = LAKE_CENTER + u * (edge + ring);
      e = 1.5 + 0.004 * max(ring, 0.0);
    }
    float h = landHeight(p);
    vNormal = normalize(vec3(h - landHeight(p + vec2(e, 0.0)), e, h - landHeight(p + vec2(0.0, e))));
    vWorld = vec3(p.x, h, p.y);
    gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vNormal;

  ${valueNoiseGLSL}
  ${skyGLSL}
  ${lakeGLSL}
  ${burstLightGLSL}

  uniform vec4 uMoon;

  void main() {
    vec2 p = vWorld.xz;
    vec3 toEye = cameraPosition - vWorld;
    float distance = length(toEye);
    vec3 view = toEye / distance;
    float near = 1.0 - smoothstep(30.0, 300.0, distance);
    float mid = 1.0 - smoothstep(300.0, 2500.0, distance);

    // A little roughness in the normal near the eye: wind-packed snow, drifts.
    vec3 n = vNormal;
    n.xz += (vec2(valueNoise(p * 0.45), valueNoise(p * 0.45 + 31.0)) - 0.5) * 0.28 * near;
    n.xz += (vec2(valueNoise(p * 0.07 + 5.0), valueNoise(p * 0.07 + 17.0)) - 0.5) * 0.22 * mid;
    n = normalize(n);

    // What it is: snow on gentle slopes and high up, bare rock on the steep faces, forest on the
    // lower slopes (the pines themselves are pines.js; this is the forest floor and the mass of
    // the far trees).
    float height = vWorld.y;
    float breakup = fbm(p * 0.01) - 0.5;
    // Gullies run down the fall line: snow lies in some, bare rock shows between.
    vec2 fall = n.xz / max(length(n.xz), 0.001);
    float gully = fbm(vec2(dot(p, vec2(-fall.y, fall.x)) * 0.03, height * 0.01) + 5.0) - 0.5;
    float snow = smoothstep(0.52, 0.82, n.y + breakup * 0.5 + height * 0.00035 + gully * 0.55);
    float trees = (1.0 - smoothstep(330.0, 560.0, height + breakup * 220.0)) * smoothstep(0.72, 0.9, n.y) * smoothstep(40.0, 140.0, lakeDistance(p));
    vec3 snowAlbedo = vec3(0.8, 0.86, 0.96) * (0.9 + 0.1 * valueNoise(p * 0.8));
    vec3 rockAlbedo = vec3(0.045, 0.05, 0.065) * (0.7 + 0.6 * fbm(p * 0.03));
    vec3 forestAlbedo = mix(vec3(0.008, 0.016, 0.015), snowAlbedo, 0.08 + 0.2 * valueNoise(p * 0.5));
    vec3 albedo = mix(rockAlbedo, snowAlbedo, snow);
    albedo = mix(albedo, forestAlbedo, trees * (1.0 - snow * 0.15));

    // Light: the moon, a cold fill from the sky, and the bursts.
    vec3 moonColor = vec3(0.21, 0.27, 0.44) * uMoon.w;
    vec3 fill = (vec3(0.025, 0.036, 0.065) * uMoon.w + skyZenith() * 2.0) * (0.55 + 0.45 * n.y);
    // The village's windows light the snow around them.
    float farSide = smoothstep(60.0, 220.0, LAKE_CENTER.y - p.y);
    float village = (1.0 - smoothstep(0.0, 120.0, abs(lakeDistance(p) - 30.0))) * (1.0 - smoothstep(430.0, 620.0, abs(p.x))) * farSide;
    vec3 light = moonColor * max(dot(n, uMoon.xyz), 0.0) + fill + vec3(1.0, 0.5, 0.2) * 0.1 * village + burstDiffuse(vWorld, n) * 0.22;
    vec3 color = albedo * light;

    // Sparkle: the odd crystal of snow catching the moon, near the eye.
    vec2 cell = floor(p * 14.0);
    float lucky = step(0.992, hash12(cell)) * near * snow;
    float facing = hash13(vec3(cell, floor(dot(view, vec3(31.0, 17.0, 23.0)))));
    color += (moonColor * 3.0 + burstDiffuse(vWorld, n) * 0.4) * lucky * smoothstep(0.7, 1.0, facing);

    // Distance: aerial perspective in moonlight, the far ranges paler than the sky behind them.
    vec3 haze = skyGradient(normalize(vec3(-view.x, 0.03, -view.z))) + vec3(0.016, 0.024, 0.045) * uMoon.w;
    color = mix(color, haze, 1.0 - exp(-distance / 3600.0));

    gl_FragColor = vec4(color, 1.0);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function create(ctx) {
  const { scene, phone } = ctx;
  const [columns, rows] = phone ? [320, 72] : [640, 120];

  // Grid points are (angle, ring) pairs; the first and last column coincide, so there's no seam.
  const polar = new Float32Array((columns + 1) * (rows + 1) * 2);
  let i = 0;
  for (let row = 0; row <= rows; row++) {
    for (let column = 0; column <= columns; column++) {
      polar[i++] = column / columns;
      polar[i++] = row / rows;
    }
  }
  const index = new Uint32Array(columns * rows * 6);
  let j = 0;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const a = row * (columns + 1) + column;
      const b = a + columns + 1;
      index[j++] = a;
      index[j++] = a + 1;
      index[j++] = b;
      index[j++] = b;
      index[j++] = a + 1;
      index[j++] = b + 1;
    }
  }
  // The islands: a square grid over each, in the same buffers (aPolar.y of -9 marks them).
  const grid = 28;
  const islandVerts = ISLANDS.length * (grid + 1) * (grid + 1);
  const ringVerts = (columns + 1) * (rows + 1);
  const positions = new Float32Array((ringVerts + islandVerts) * 3);
  const polarAll = new Float32Array((ringVerts + islandVerts) * 2);
  polarAll.set(polar);
  const indexAll = new Uint32Array(index.length + ISLANDS.length * grid * grid * 6);
  indexAll.set(index);
  let v = ringVerts;
  let t = index.length;
  for (const [x, z, radius] of ISLANDS) {
    const first = v;
    for (let r = 0; r <= grid; r++) {
      for (let c = 0; c <= grid; c++) {
        positions[v * 3] = x + (c / grid - 0.5) * radius * 3;
        positions[v * 3 + 2] = z + (r / grid - 0.5) * radius * 3;
        polarAll[v * 2 + 1] = -9;
        v++;
      }
    }
    for (let r = 0; r < grid; r++) {
      for (let c = 0; c < grid; c++) {
        const a = first + r * (grid + 1) + c;
        const b = a + grid + 1;
        indexAll.set([a, a + 1, b, b, a + 1, b + 1], t);
        t += 6;
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aPolar', new THREE.BufferAttribute(polarAll, 2));
  geometry.setIndex(new THREE.BufferAttribute(indexAll, 1));

  const material = new THREE.ShaderMaterial({
    name: 'Land',
    uniforms: { ...ctx.sky.uniforms, ...ctx.burstLights.uniforms },
    vertexShader,
    fragmentShader,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false; // positions live in the shader
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

