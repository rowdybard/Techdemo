// Smoke. Every burst leaves smoke where its stars burned: each star's position late in
// its burn is worked out with the same motion the sparks use (drag, gravity, wind), so
// the smoke traces the shape and sag of the burst, hangs in curtains under willows and
// palms, and lies in a band under text, plus a small dense puff where the shell broke.
// The ground show leaves low smoke over the barges. Puffs ride the wind (faster higher
// up, as real wind is), drift apart, spread and thin as they spread, so a show clears
// downwind instead of piling up in one place. The burst lights
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
import { positionAt } from './particles.js';

const PUFFS = { desktop: 176, phone: 64 };
// Ground smoke gets its own part of the ring, so the barges (the side ones play almost
// all the time) can't crowd out the smoke from bursts or pile up without limit.
const GROUND_SHARE = 0.35;
const GROUND_EVERY = { desktop: 2, phone: 3.2 }; // seconds between puffs from each burning tube
const PER_SHELL = { desktop: 7, phone: 4 };
const SHELL_RECORDS = 64; // fireworks.js keeps this many burst records
const FOUNTAIN_RECORDS = 22; // the main barge's tubes and the two side barges' (fountains.js)
const HANGING = { willow: true, palm: true }; // sparks that fall a long way, leaving curtains
// How each type's stars fly (bursts.js): drag, launch speed as a share of burst size ×
// drag, and burn time as a share of the lifetime. Shapes and Halloween shells fly as peonies.
const STARS = {
  peony: [1.4, 1, 1], chrysanthemum: [1.3, 1, 1.1], willow: [1.1, 0.75, 1.9], strobe: [1.5, 1, 1.3], palm: [0.9, 1.1, 1.2],
  ring: [1.4, 1, 1], crossette: [1.1, 0.8, 0.8], crackle: [1.6, 0.8, 0.73], multibreak: [1.4, 1, 1],
};
const spot = [0, 0, 0];

// How much faster the air moves at height y than at 10 m (the wind's own height): the
// usual power law over open water, held to a sensible range. The shader uses the same.
function carryAt(y) {
  return Math.min(1.8, Math.max(0.75, Math.pow(Math.max(y, 2) / 10, 0.16)));
}
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
  const skyCount = Math.round(size * (1 - GROUND_SHARE));
  const cursors = [0, skyCount]; // sky puffs in [0, skyCount), ground puffs after
  let dirtyFrom = size;
  let dirtyTo = -1;
  let now = 0;

  // Claims the next slot of the sky or ground part if its puff has mostly faded (or is
  // still waiting to appear). Returns -1 when that part is busy.
  function claim(ground) {
    const which = ground ? 1 : 0;
    const slot = cursors[which];
    const o = slot * 4;
    if (now - origin.array[o + 3] < shape.array[o + 2] * 0.75) return -1;
    const next = slot + 1;
    cursors[which] = ground ? (next >= size ? skyCount : next) : (next >= skyCount ? 0 : next);
    return slot;
  }

  // One puff: where and when it appears, its starting radius, how fast it spreads (metres
  // per square-root second), how long it lasts, and its shape: stretched across and up,
  // tilted, and how fine its noise is.
  function puff(x, y, z, born, radius, growth, life, across, up, tilt, rise = 0, glow = 1, density = 1, ground = false) {
    const slot = claim(ground);
    if (slot < 0) return;
    const o = slot * 4;
    // Stored minus where the air will have got to when it's born (the wind now, carried
    // forward), scaled for its height; the shader adds the air's travel back on.
    const ahead = born - now;
    const air = ctx.wind ? ctx.wind.offset : null;
    const carry = carryAt(y);
    origin.array[o] = x - (air ? (air.x + config.physics.windX * ahead) * carry : 0);
    origin.array[o + 1] = y;
    origin.array[o + 2] = z - (air ? (air.z + config.physics.windZ * ahead) * carry : 0);
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

    // A small, dense puff where the shell broke (the bursting charge).
    puff(record.x, record.y, record.z, record.time + 0.1, reach * (0.12 + Math.random() * 0.05), 1.8 + Math.random(),
      life * (0.6 + Math.random() * 0.3), 1 + Math.random() * 0.4, 0.8 + Math.random() * 0.4, Math.random() * 6.28, 0, 1, 1.3);

    // The rest where stars burned out: spread evenly over the burst (a golden spiral,
    // turned at random), each placed late in its star's burn and born as the star gets there.
    const star = STARS[record.type] || STARS.peony;
    const { physics } = config;
    const drag = star[0] * physics.drag;
    const speed = reach * star[1] * drag;
    const burn = config.look.lifetime * star[2];
    const g = 9.81 * physics.gravity;
    const hanging = HANGING[record.type];
    const spin = Math.random() * 6.28;
    const n = count - 1;
    for (let k = 0; k < n; k++) {
      const up = 1 - (2 * (k + 0.5)) / n;
      const flat = Math.sqrt(1 - up * up);
      const a = k * 2.39996 + spin;
      const s = speed * (0.85 + Math.random() * 0.3);
      // Willow and palm stars fall a long way: the curtain of smoke hangs along the fall.
      const t = burn * (hanging ? 0.45 + Math.random() * 0.4 : 0.6 + Math.random() * 0.4);
      positionAt(spot, record.x, record.y, record.z, Math.cos(a) * flat * s, up * s, Math.sin(a) * flat * s, drag, t, g, physics.windX, physics.windZ);
      puff(spot[0], spot[1], spot[2], record.time + t * 0.85, reach * (0.15 + Math.random() * 0.07), 1.8 + Math.random() * 1.2,
        life * (0.55 + Math.random() * 0.45),
        hanging ? 0.55 + Math.random() * 0.25 : 0.8 + Math.random() * 0.6,
        hanging ? 1.8 + Math.random() * 0.8 : 0.7 + Math.random() * 0.5,
        hanging ? (Math.random() - 0.5) * 0.3 : Math.random() * 6.28, 0, 1, hanging ? 1 : 1.25);
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
    const count = Math.max(1, Math.min(6, Math.ceil(record.hold / every)));
    const output = 0.6 + Math.random() * 0.7; // tubes smoke unevenly
    for (let k = 0; k < count; k++) {
      puff(
        record.x + (Math.random() - 0.5) * 3,
        by + 2 + Math.random() * 2,
        record.z + (Math.random() - 0.5) * 3,
        record.time + 0.3 + k * every + Math.random() * 0.4,
        2 + Math.random() * 0.8,
        2 + Math.random() * 0.6,
        settings.linger * (0.45 + Math.random() * 0.25),
        1 + Math.random() * 0.3,
        0.9 + Math.random() * 0.3,
        (Math.random() - 0.5) * 0.3,
        0.4 + Math.random() * 0.6, // a little lift from the heat, then it lies low and drifts
        40, // lit strongly by the effect's own fire (its light is faint, made for the water)
        0.9 * record.smoke * output,
        true,
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
      // Fewer noise layers on the low quality tier (auto quality steps down on slow GPUs).
      uniforms.uOctaves.value = ctx.post && ctx.post.tier === 'low' ? 2 : phone ? 3 : 4;
    },

    dispose() {
      scene.remove(mesh);
      quad.dispose();
      material.dispose();
    },
  };
}
