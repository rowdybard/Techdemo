// Light from the fireworks on the water and sand. Each frame this picks the brightest
// live bursts and writes them into fixed-size uniform arrays that the ocean and beach
// shaders share. Plain uniforms instead of three.js lights, because changing the number
// of lights would recompile every shader mid-show.
import * as THREE from 'three';

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

  // Soft light falling on a surface with normal n.
  vec3 burstDiffuse(vec3 p, vec3 n) {
    vec3 sum = vec3(0.0);
    for (int i = 0; i < ${BURST_LIGHTS}; i++) {
      float intensity = uBurstPosition[i].w;
      if (intensity <= 0.0) continue;
      vec3 toLight = normalize(uBurstPosition[i].xyz - p);
      sum += uBurstColor[i] * intensity * (0.35 + 0.65 * max(dot(n, toLight), 0.0));
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

  // The brightest bursts so far this frame: their strength and record index.
  const topStrength = new Float64Array(BURST_LIGHTS);
  const topIndex = new Int32Array(BURST_LIGHTS);

  // A bright flash as the shell breaks, then a glow that fades with the sparks.
  function strength(record, time) {
    const age = time - record.time;
    const life = config.look.lifetime * 1.3;
    if (age < 0 || age > life) return 0;
    const flash = 1.8 * Math.exp(-age * 2.5);
    const glow = 0.35 * (1 - age / life);
    return (flash + glow) * (record.size / 60);
  }

  return {
    update(dt, time) {
      topStrength.fill(0);
      topIndex.fill(-1);
      const bursts = ctx.fireworks ? ctx.fireworks.bursts : null;
      if (bursts) {
        for (let b = 0; b < bursts.length; b++) {
          const s = strength(bursts[b], time);
          if (s <= topStrength[BURST_LIGHTS - 1]) continue;
          // Insert into the sorted top list.
          let slot = BURST_LIGHTS - 1;
          while (slot > 0 && topStrength[slot - 1] < s) {
            topStrength[slot] = topStrength[slot - 1];
            topIndex[slot] = topIndex[slot - 1];
            slot--;
          }
          topStrength[slot] = s;
          topIndex[slot] = b;
        }
      }
      const scale = config.look.sceneLight;
      for (let i = 0; i < BURST_LIGHTS; i++) {
        const record = topIndex[i] >= 0 ? bursts[topIndex[i]] : null;
        if (!record) {
          positions[i].w = 0;
          continue;
        }
        positions[i].set(record.x, record.y, record.z, topStrength[i] * scale);
        colors[i].set(record.r, record.g, record.b);
      }
    },

    dispose() {
      ctx.burstLights = null;
    },
  };
}
