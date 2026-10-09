// Light from the fireworks on the water and sand. Each frame this picks the brightest
// live bursts and writes them into fixed-size uniform arrays that the ocean and beach
// shaders share. Plain uniforms instead of three.js lights, because changing the number
// of lights would recompile every shader mid-show.
import * as THREE from 'three';
import { STRIKES } from './haunt.js';

export const BURST_LIGHTS = 8;

// Shared GLSL. Needs the uniforms below; returns light arriving from the bursts.
export const burstLightGLSL = /* glsl */ `
  uniform vec4 uBurstPosition[${BURST_LIGHTS}]; // xyz, intensity
  uniform vec3 uBurstColor[${BURST_LIGHTS}];

  // Mirror-like reflection toward the eye along direction r: a tight glint and a softer
  // sheen. On rippled water, the many tilted facets draw this out into a long streak.
  vec3 burstReflection(vec3 p, vec3 r, float sharpness) {
    vec3 sum = vec3(0.0);
    for (int i = 0; i < ${BURST_LIGHTS}; i++) {
      float intensity = uBurstPosition[i].w;
      if (intensity <= 0.0) continue;
      vec3 toLight = normalize(uBurstPosition[i].xyz - p);
      float facing = max(dot(r, toLight), 0.0);
      sum += uBurstColor[i] * intensity * (pow(facing, sharpness) * 4.0 + pow(facing, sharpness * 0.12) * 0.12);
    }
    return sum;
  }

  // Soft light falling on a surface with normal n. It falls off with distance, so a burst
  // over the barge tints the beach instead of repainting it in the burst's colour.
  vec3 burstDiffuse(vec3 p, vec3 n) {
    vec3 sum = vec3(0.0);
    for (int i = 0; i < ${BURST_LIGHTS}; i++) {
      float intensity = uBurstPosition[i].w;
      if (intensity <= 0.0) continue;
      vec3 offset = uBurstPosition[i].xyz - p;
      float distance = length(offset);
      float falloff = 1.0 / (1.0 + distance * distance / 40000.0); // half strength at 200 m
      sum += uBurstColor[i] * intensity * falloff * (0.35 + 0.65 * max(dot(n, offset / distance), 0.0));
    }
    return sum;
  }
`;

export function create(ctx) {
  const { config } = ctx;
  const positions = [];
  const colors = [];
  for (let i = 0; i < BURST_LIGHTS; i++) {
    positions.push(new THREE.Vector4());
    colors.push(new THREE.Vector3());
  }
  const uniforms = {
    uBurstPosition: { value: positions },
    uBurstColor: { value: colors },
  };
  ctx.burstLights = { uniforms };

  // The brightest lights so far this frame: their strength and record.
  const topStrength = new Float64Array(BURST_LIGHTS);
  const topRecord = new Array(BURST_LIGHTS).fill(null);

  // A burst: a bright flash as the shell breaks, then a glow that fades with the sparks.
  // A fountain (a record with a hold time): a steady, flickering light while it runs.
  // Lightning (a record that sounds as thunder): a hard flash on each stroke.
  function strength(record, time) {
    const age = time - record.time;
    if (record.sound === 'thunder') {
      if (age < 0 || age > record.hold) return 0;
      let flash = 0;
      for (let s = 0; s < STRIKES.length; s++) {
        const after = age - STRIKES[s][0];
        if (after >= 0) flash += 2 * STRIKES[s][1] * Math.exp(-after * 22);
      }
      return flash * (record.size / 60);
    }
    if (record.hold > 0) {
      if (age < 0 || age > record.hold) return 0;
      const ramp = Math.min(1, age / 0.8, (record.hold - age) / 1.0);
      return 0.22 * ramp * (0.85 + 0.15 * Math.sin(time * 37 + record.x)) * (record.size / 60);
    }
    const life = config.look.lifetime * 1.3;
    if (age < 0 || age > life) return 0;
    const flash = 1.8 * Math.exp(-age * 2.5);
    const glow = 0.35 * (1 - age / life);
    return (flash + glow) * (record.size / 60);
  }

  // Inserts a light into the sorted top list if it's bright enough.
  function consider(record, time) {
    const s = strength(record, time);
    if (s <= topStrength[BURST_LIGHTS - 1]) return;
    let slot = BURST_LIGHTS - 1;
    while (slot > 0 && topStrength[slot - 1] < s) {
      topStrength[slot] = topStrength[slot - 1];
      topRecord[slot] = topRecord[slot - 1];
      slot--;
    }
    topStrength[slot] = s;
    topRecord[slot] = record;
  }

  function place(lamp) {
    if (!lamp || lamp.intensity <= 0) return;
    let weakest = 0;
    for (let i = 1; i < BURST_LIGHTS; i++) if (positions[i].w < positions[weakest].w) weakest = i;
    if (lamp.intensity > positions[weakest].w) {
      positions[weakest].set(lamp.x, lamp.y, lamp.z, lamp.intensity);
      colors[weakest].set(lamp.r, lamp.g, lamp.b);
    }
  }

  return {
    update(dt, time) {
      topStrength.fill(0);
      topRecord.fill(null);
      const bursts = ctx.fireworks ? ctx.fireworks.bursts : null;
      if (bursts) for (let b = 0; b < bursts.length; b++) consider(bursts[b], time);
      const fountains = ctx.fountains ? ctx.fountains.lights : null;
      if (fountains) for (let f = 0; f < fountains.length; f++) consider(fountains[f], time);
      const scale = config.look.sceneLight;
      for (let i = 0; i < BURST_LIGHTS; i++) {
        const record = topRecord[i];
        if (!record) {
          positions[i].w = 0;
          continue;
        }
        positions[i].set(record.x, record.y, record.z, topStrength[i] * scale);
        colors[i].set(record.r, record.g, record.b);
      }
      // Steady lamps (the lighthouse, the countdown clock) take the dimmest slot when they
      // outshine what's there.
      place(ctx.lighthouse ? ctx.lighthouse.lamp : null);
      place(ctx.countdown ? ctx.countdown.lamp : null);
    },

    dispose() {
      ctx.burstLights = null;
    },
  };
}
