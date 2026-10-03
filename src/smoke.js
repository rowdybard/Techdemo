// Smoke. Every burst leaves smoke along where its sparks flew: a ragged shell of puffs
// around the break, sagging where sparks fell, long hanging curtains under willows and
// palms, and a wide band across the sky under text. The ground show leaves low haze over
// the barge. Puffs drift with the wind, rise a little, billow and tear into wisps over
// half a minute, so a busy show slowly builds a haze over the water. The burst lights
// (burstlights.js) light the puffs, so each new burst glows through the smoke of earlier
// ones in its own colour, and the lighthouse beams (lighthouse.js) light a band through
// any smoke they sweep across. Shaders are in smoke.glsl.js.
//
// Like the sparks, a puff's whole life is written once, when it's made: one instanced
// quad per puff in a fixed ring, all drawn in a single call. A puff is only replaced
// once it has mostly faded, so a finale fills the ring and the haze stops thickening
// there instead of puffs vanishing mid-air. That also caps how much smoke is ever drawn
// over the screen, which is what costs time on phones.
import * as THREE from 'three';
import { smokeFragment, smokeVertex } from './smoke.glsl.js';

const PUFFS = { desktop: 176, phone: 64 };
const GROUND_EVERY = { desktop: 1.1, phone: 2 }; // seconds between puffs from each burning tube
const PER_SHELL = { desktop: 7, phone: 4 };
const SHELL_RECORDS = 64; // fireworks.js keeps this many burst records
const FOUNTAIN_RECORDS = 14;
const HANGING = { willow: true, palm: true }; // sparks that fall a long way, leaving curtains
// Colour of smoke lit only by the sky: dusk-grey at dusk, near black at night.
const DUSK = new THREE.Color(0.15, 0.125, 0.14);
const NIGHT = new THREE.Color(0.012, 0.014, 0.022);

export function create(ctx) {
  const { scene, config, phone } = ctx;
  const settings = config.smoke;
  const size = phone ? PUFFS.phone : PUFFS.desktop;

  const quad = new THREE.InstancedBufferGeometry();
  quad.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  quad.setIndex([0, 1, 2, 0, 2, 3]);
  const origin = new THREE.InstancedBufferAttribute(new Float32Array(size * 4), 4);
  const shape = new THREE.InstancedBufferAttribute(new Float32Array(size * 4), 4);
  const look = new THREE.InstancedBufferAttribute(new Float32Array(size * 4), 4);
  const extra = new THREE.InstancedBufferAttribute(new Float32Array(size * 4), 4);
  extra.setUsage(THREE.DynamicDrawUsage);
  quad.setAttribute('aExtra', extra);
  origin.setUsage(THREE.DynamicDrawUsage);
  shape.setUsage(THREE.DynamicDrawUsage);
  look.setUsage(THREE.DynamicDrawUsage);
  quad.setAttribute('aOrigin', origin);
  quad.setAttribute('aShape', shape);
  quad.setAttribute('aLook', look);
  quad.instanceCount = size;
  // Unused puffs: born long ago, with no life left.
  for (let i = 0; i < size; i++) {
    origin.array[i * 4 + 3] = -1e6;
    shape.array[i * 4 + 2] = 1;
  }

  const beam = ctx.lighthouse ? ctx.lighthouse.uniforms : {
    uBeamOrigin: { value: new THREE.Vector3() },
    uBeamDir: { value: new THREE.Vector3(1, 0, 0) },
    uBeamColor: { value: new THREE.Color(0, 0, 0) },
    uBeamShape: { value: new THREE.Vector2(1, 0.05) },
  };
  const uniforms = {
    ...ctx.burstLights.uniforms,
    ...beam,
    uTime: { value: 0 },
    uWindOffset: { value: new THREE.Vector3() },
    uAmount: { value: 0 },
    uAmbient: { value: new THREE.Color() },
    uSceneLight: { value: 1 },
    uOctaves: { value: phone ? 3 : 4 },
  };
  const material = new THREE.ShaderMaterial({
    name: 'Smoke',
    uniforms,
    vertexShader: smokeVertex,
    fragmentShader: smokeFragment,
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

  // One puff: where and when it appears, its starting radius, how fast it spreads (metres
  // per square-root second), how long it lasts, and its shape: stretched across and up,
  // tilted, and how fine its noise is.
  function puff(x, y, z, born, radius, growth, life, across, up, tilt, rise = 0, glow = 1, density = 1) {
    const slot = claim();
    if (slot < 0) return;
    const o = slot * 4;
    // Where the air will have got to when it's born (the wind now, carried forward).
    const ahead = born - now;
    const air = ctx.wind ? ctx.wind.offset : null;
    origin.array[o] = x - (air ? (air.x + config.physics.windX * ahead) * 0.85 : 0);
    origin.array[o + 1] = y;
    origin.array[o + 2] = z - (air ? (air.z + config.physics.windZ * ahead) * 0.85 : 0);
    origin.array[o + 3] = born;
    shape.array[o] = radius;
    shape.array[o + 1] = growth;
    shape.array[o + 2] = life;
    shape.array[o + 3] = Math.random();
    look.array[o] = across;
    look.array[o + 1] = up;
    look.array[o + 2] = tilt;
    look.array[o + 3] = 1.6 + Math.random() * 1.4;
    extra.array[o] = rise;
    extra.array[o + 1] = glow;
    extra.array[o + 2] = density;
    if (slot < dirtyFrom) dirtyFrom = slot;
    if (slot > dirtyTo) dirtyTo = slot;
  }

  function upload(attribute) {
    attribute.clearUpdateRanges();
    attribute.addUpdateRange(dirtyFrom * 4, (dirtyTo - dirtyFrom + 1) * 4);
    attribute.needsUpdate = true;
  }

  // A shell's smoke, appearing as it bursts, laid along where its sparks went.
  function shellSmoke(record) {
    const lowTier = ctx.post && ctx.post.tier === 'low';
    const count = Math.max(2, Math.round((phone ? PER_SHELL.phone : PER_SHELL.desktop) * (lowTier ? 0.5 : 1)));
    const reach = record.size;
    const life = settings.linger;
    const born = record.time + 0.2;

    if (record.type === 'text') {
      // A wide band where the letters were.
      const width = config.look.textWidth;
      for (let k = 0; k < count; k++) {
        const x = record.x + ((k + Math.random()) / count - 0.5) * width;
        puff(x, record.y + (Math.random() - 0.5) * 12, record.z, born + Math.random() * 0.6,
          width / count * (0.45 + Math.random() * 0.25), 2 + Math.random() * 1.5, life * (0.6 + Math.random() * 0.5),
          1.1 + Math.random() * 0.5, 0.75 + Math.random() * 0.3, (Math.random() - 0.5) * 0.3);
      }
      return;
    }

    // A thicker core where the shell broke.
    puff(record.x, record.y, record.z, born, reach * (0.18 + Math.random() * 0.08), 2.5 + Math.random(),
      life * (0.8 + Math.random() * 0.4), 1 + Math.random() * 0.5, 0.8 + Math.random() * 0.4, Math.random() * 6.28);

    for (let k = 1; k < count; k++) {
      if (HANGING[record.type]) {
        // Curtains hanging under the break, where the sparks fell and burned out.
        const a = Math.random() * Math.PI * 2;
        const out = reach * (0.3 + Math.random() * 0.5);
        puff(record.x + Math.cos(a) * out, record.y - reach * (0.25 + Math.random() * 0.5), record.z + Math.sin(a) * out * 0.5,
          born + 0.6 + Math.random() * 1.2, reach * (0.12 + Math.random() * 0.06), 1.8 + Math.random(),
          life * (0.6 + Math.random() * 0.5), 0.55 + Math.random() * 0.25, 1.7 + Math.random() * 0.8, (Math.random() - 0.5) * 0.35);
        continue;
      }
      // A ragged shell around the break, sagging toward the bottom where sparks fell.
      const a = Math.random() * Math.PI * 2;
      const up = Math.random() * 2 - 1;
      const flat = Math.sqrt(1 - up * up);
      const out = reach * (0.4 + Math.random() * 0.3);
      puff(record.x + Math.cos(a) * flat * out, record.y + up * out * 0.8 - reach * 0.15, record.z + Math.sin(a) * flat * out,
        born + Math.random() * 0.5, reach * (0.13 + Math.random() * 0.1), 2 + Math.random() * 1.8,
        life * (0.55 + Math.random() * 0.6), 0.8 + Math.random() * 1.1, 0.6 + Math.random() * 0.6, Math.random() * 6.28);
    }
  }

  // Ground-show smoke: while a tube burns it pours out smoke that rises as a glowing plume
  // (lit gold from inside by the effect's own light), leans downwind, and once the effect
  // stops hangs as a bank that greys and drifts off. Effects without smoke (lightning,
  // wisps, lanterns) say so with smoke 0 on their light.
  function groundSmoke(record) {
    if (!(record.smoke > 0)) return;
    const [, by] = config.show.bargePosition;
    const every = (phone ? GROUND_EVERY.phone : GROUND_EVERY.desktop) / Math.min(1, record.smoke + 0.3);
    const count = Math.max(1, Math.min(12, Math.ceil(record.hold / every)));
    const output = 0.6 + Math.random() * 0.7; // tubes smoke unevenly
    for (let k = 0; k < count; k++) {
      puff(
        record.x + (Math.random() - 0.5) * 3,
        by + 2 + Math.random() * 2,
        record.z + (Math.random() - 0.5) * 3,
        record.time + 0.3 + k * every + Math.random() * 0.4,
        3 + Math.random() * 1.2,
        3.2 + Math.random() * 1,
        settings.linger * (0.5 + Math.random() * 0.3),
        0.9 + Math.random() * 0.3,
        1.1 + Math.random() * 0.3,
        (Math.random() - 0.5) * 0.3,
        1.4 + Math.random() * 1.6,
        40, // lit strongly by the effect's own fire (its light is faint, made for the water)
        0.9 * record.smoke * output,
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
        upload(look);
        upload(extra);
        dirtyFrom = size;
        dirtyTo = -1;
      }

      mesh.visible = settings.enabled && settings.amount > 0;
      uniforms.uTime.value = time;
      if (ctx.wind) uniforms.uWindOffset.value.copy(ctx.wind.offset);
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
