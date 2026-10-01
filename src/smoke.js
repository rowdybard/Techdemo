// Smoke. Every burst leaves a few big, soft puffs where it broke, and the ground show
// leaves low haze over the barge. Puffs drift with the wind, rise a little, spread and
// thin out over half a minute, so a busy show slowly builds a haze over the water. The
// burst lights (burstlights.js) light the puffs, so each new burst glows through the
// smoke of earlier ones in its own colour.
//
// Like the sparks, a puff's whole life is written once, when it's made: one instanced
// quad per puff in a fixed ring, all drawn in a single call. A puff is only replaced
// once it has mostly faded, so a finale fills the ring and the haze stops thickening
// there instead of puffs vanishing mid-air. That also caps how much smoke is ever drawn
// over the screen, which is what costs time on phones.
import * as THREE from 'three';
import { noiseGLSL } from './glsl.js';
import { BURST_LIGHTS, burstLightGLSL } from './burstlights.js';

const PUFFS = { desktop: 96, phone: 40 };
const PER_SHELL = { desktop: 4, phone: 3 };
const SHELL_RECORDS = 64; // fireworks.js keeps this many burst records
const FOUNTAIN_RECORDS = 14;
// Colour of smoke lit only by the sky: dusk-grey at dusk, near black at night.
const DUSK = new THREE.Color(0.075, 0.07, 0.085);
const NIGHT = new THREE.Color(0.012, 0.014, 0.022);

const vertexShader = /* glsl */ `
  ${burstLightGLSL}
  attribute vec4 aOrigin; // xyz, birth time
  attribute vec4 aShape; // start radius, growth, life, seed
  uniform float uTime;
  uniform vec3 uWind;
  uniform float uAmount;
  uniform vec3 uAmbient;
  uniform float uSceneLight;
  varying vec2 vUv;
  varying vec3 vLight;
  varying float vAlpha;
  varying float vSeed;

  void main() {
    float age = uTime - aOrigin.w;
    float life = aShape.z;
    if (age < 0.0 || age > life || uAmount <= 0.0) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // off screen: costs nothing to draw
      return;
    }
    float seed = aShape.w;
    // Carried by the wind (a little slower than the air), a slow drift of its own, and
    // a gentle rise as the warm smoke floats up.
    vec3 drift = vec3(sin(seed * 41.0), 0.0, cos(seed * 23.0)) * 0.5;
    vec3 center = aOrigin.xyz + (uWind * 0.85 + drift) * age;
    center.y += 0.3 * age;
    float radius = aShape.x + aShape.y * sqrt(age);

    // Fades in as it forms, fades out at the end of its life, and thins as it spreads.
    float fadeIn = smoothstep(0.0, 1.5, age);
    float fadeOut = 1.0 - smoothstep(life * 0.4, life, age);
    vAlpha = uAmount * fadeIn * fadeOut * pow(aShape.x / radius, 0.8);

    // Lit at its middle: the sky's glow, plus every firework light nearby. Light falls
    // off quickly, so a burst lights the smoke it's in, not smoke a few hundred metres off.
    vec3 light = uAmbient;
    for (int i = 0; i < ${BURST_LIGHTS}; i++) {
      float intensity = uBurstPosition[i].w;
      if (intensity <= 0.0) continue;
      vec3 offset = uBurstPosition[i].xyz - center;
      float reach = radius + 45.0;
      light += uBurstColor[i] * intensity * uSceneLight * 0.2 / (1.0 + dot(offset, offset) / (reach * reach));
    }
    vLight = light;

    // A quad facing the camera, turned by a random angle so puffs don't repeat.
    float angle = seed * 6.2832 + age * 0.015;
    vec2 corner = mat2(cos(angle), sin(angle), -sin(angle), cos(angle)) * position.xy;
    vec4 view = viewMatrix * vec4(center, 1.0);
    view.xy += corner * radius;
    gl_Position = projectionMatrix * view;
    vUv = position.xy;
    vSeed = seed;
  }
`;

const fragmentShader = /* glsl */ `
  ${noiseGLSL}
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vLight;
  varying float vAlpha;
  varying float vSeed;

  void main() {
    float r = length(vUv);
    if (r > 1.0) discard;
    // Billowy: a soft round body broken up by slowly churning noise.
    vec2 p = vUv * 1.7 + vSeed * 31.0;
    float churn = uTime * 0.03;
    float n = valueNoise(p + churn) * 0.55 + valueNoise(p * 2.1 - churn) * 0.3 + valueNoise(p * 4.3 + churn) * 0.15;
    float body = 1.0 - smoothstep(0.2, 1.0, r);
    float density = clamp(body * (0.35 + 1.2 * (n - 0.35)), 0.0, 1.0);
    float alpha = density * vAlpha;
    if (alpha < 0.004) discard;
    // Thicker parts catch a little more light. Kept under the bloom threshold, so lit
    // smoke glows softly instead of flaring.
    vec3 color = min(vLight * (0.8 + 0.4 * n), vec3(0.4));
    gl_FragColor = vec4(color, alpha);
  }
`;

export function create(ctx) {
  const { scene, config, phone } = ctx;
  const settings = config.smoke;
  const size = phone ? PUFFS.phone : PUFFS.desktop;

  const quad = new THREE.InstancedBufferGeometry();
  quad.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  quad.setIndex([0, 1, 2, 0, 2, 3]);
  const origin = new THREE.InstancedBufferAttribute(new Float32Array(size * 4), 4);
  const shape = new THREE.InstancedBufferAttribute(new Float32Array(size * 4), 4);
  origin.setUsage(THREE.DynamicDrawUsage);
  shape.setUsage(THREE.DynamicDrawUsage);
  quad.setAttribute('aOrigin', origin);
  quad.setAttribute('aShape', shape);
  quad.instanceCount = size;
  // Unused puffs: born long ago, with no life left.
  for (let i = 0; i < size; i++) {
    origin.array[i * 4 + 3] = -1e6;
    shape.array[i * 4 + 2] = 1;
  }

  const uniforms = {
    ...ctx.burstLights.uniforms,
    uTime: { value: 0 },
    uWind: { value: new THREE.Vector3() },
    uAmount: { value: 0 },
    uAmbient: { value: new THREE.Color() },
    uSceneLight: { value: 1 },
  };
  const material = new THREE.ShaderMaterial({
    name: 'Smoke',
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(quad, material);
  mesh.frustumCulled = false; // positions live in the shader
  mesh.renderOrder = 1; // after the water, before the sparks, so sparks shine through
  scene.add(mesh);

  // The birth time last seen on each burst and ground-show record, to spot new ones.
  const seenShell = new Float64Array(SHELL_RECORDS).fill(NaN);
  const seenFountain = new Float64Array(FOUNTAIN_RECORDS).fill(NaN);
  let cursor = 0;
  let dirtyFrom = size;
  let dirtyTo = -1;
  let now = 0;

  // Claims the next slot if its puff has mostly faded (or is still waiting to appear).
  // Returns -1 when the ring is busy.
  function claim() {
    const o = cursor * 4;
    if (now - origin.array[o + 3] < shape.array[o + 2] * 0.75) return -1;
    const slot = cursor;
    cursor = (cursor + 1) % size;
    return slot;
  }

  function puff(x, y, z, born, radius, growth, life) {
    const slot = claim();
    if (slot < 0) return;
    const o = slot * 4;
    origin.array[o] = x;
    origin.array[o + 1] = y;
    origin.array[o + 2] = z;
    origin.array[o + 3] = born;
    shape.array[o] = radius;
    shape.array[o + 1] = growth;
    shape.array[o + 2] = life;
    shape.array[o + 3] = Math.random();
    if (slot < dirtyFrom) dirtyFrom = slot;
    if (slot > dirtyTo) dirtyTo = slot;
  }

  function upload(attribute) {
    attribute.clearUpdateRanges();
    attribute.addUpdateRange(dirtyFrom * 4, (dirtyTo - dirtyFrom + 1) * 4);
    attribute.needsUpdate = true;
  }

  // A shell's smoke: a few puffs scattered through where it broke, appearing as it bursts.
  function shellSmoke(record) {
    const lowTier = ctx.post && ctx.post.tier === 'low';
    const count = Math.max(1, Math.round((phone ? PER_SHELL.phone : PER_SHELL.desktop) * (lowTier ? 0.5 : 1)));
    const spread = record.size * 0.45;
    for (let k = 0; k < count; k++) {
      puff(
        record.x + (Math.random() - 0.5) * 2 * spread,
        record.y + (Math.random() - 0.6) * spread,
        record.z + (Math.random() - 0.5) * spread,
        record.time + 0.15 + Math.random() * 0.5,
        record.size * (0.28 + Math.random() * 0.14),
        2.2 + Math.random() * 1.6,
        settings.linger * (0.7 + Math.random() * 0.5),
      );
    }
  }

  // Ground-show smoke: low haze rolling off the barge over the effect's run.
  function groundSmoke(record) {
    const [, by] = config.show.bargePosition;
    for (let k = 0; k < 2; k++) {
      puff(
        record.x + (Math.random() - 0.5) * 6,
        by + 7 + Math.random() * 5,
        record.z + (Math.random() - 0.5) * 6,
        record.time + (0.2 + k * 0.5) * Math.max(record.hold, 1),
        9 + Math.random() * 4,
        2 + Math.random(),
        settings.linger * (0.6 + Math.random() * 0.4),
      );
    }
  }

  return {
    update(dt, time) {
      now = time;
      const bursts = ctx.fireworks ? ctx.fireworks.bursts : null;
      const fountains = ctx.fountains ? ctx.fountains.lights : null;
      if (bursts) {
        for (let i = 0; i < bursts.length && i < SHELL_RECORDS; i++) {
          const record = bursts[i];
          if (record.time === seenShell[i]) continue;
          seenShell[i] = record.time;
          if (settings.enabled && record.time > time - 1) shellSmoke(record);
        }
      }
      if (fountains) {
        for (let i = 0; i < fountains.length && i < FOUNTAIN_RECORDS; i++) {
          const record = fountains[i];
          if (record.time === seenFountain[i]) continue;
          seenFountain[i] = record.time;
          if (settings.enabled && record.time > time - 1) groundSmoke(record);
        }
      }
      if (dirtyTo >= dirtyFrom) {
        upload(origin);
        upload(shape);
        dirtyFrom = size;
        dirtyTo = -1;
      }

      mesh.visible = settings.enabled && settings.amount > 0;
      uniforms.uTime.value = time;
      uniforms.uWind.value.set(config.physics.windX, 0, config.physics.windZ);
      uniforms.uAmount.value = settings.amount * 0.32;
      uniforms.uAmbient.value.copy(DUSK).lerp(NIGHT, config.sky.timeOfDay);
      uniforms.uSceneLight.value = config.look.sceneLight;
    },

    dispose() {
      scene.remove(mesh);
      quad.dispose();
      material.dispose();
    },
  };
}
