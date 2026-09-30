// Particle pool: one instanced quad per particle, all drawn in a single call. Every
// buffer is allocated once. Spawning claims a contiguous run from a ring cursor, writes
// only that run, and uploads only that run. A run that would pass the end starts over
// at zero instead, so it never wraps. Nothing is freed: dead particles collapse to
// nothing in the shader until the cursor comes round and reuses them.
import * as THREE from 'three';
import { fireworksFragment, fireworksVertex } from './fireworks.glsl.js';

const RUNS = 2048; // spawn runs remembered for the live-particle count

export function createPool(size, uniforms) {
  const quad = new THREE.InstancedBufferGeometry();
  quad.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  quad.setIndex([0, 1, 2, 0, 2, 3]);

  const attributes = {};
  for (const name of ['aStart', 'aMotion', 'aColor', 'aColor2', 'aShape']) {
    const attribute = new THREE.InstancedBufferAttribute(new Float32Array(size * 4), 4);
    attribute.setUsage(THREE.DynamicDrawUsage);
    quad.setAttribute(name, attribute);
    attributes[name] = attribute;
  }
  quad.instanceCount = size;
  const attributeList = Object.values(attributes);
  // Unborn particles would otherwise all sit at the origin with a spawn time of zero.
  attributes.aStart.array.fill(-1e6);

  const start = attributes.aStart.array;
  const motion = attributes.aMotion.array;
  const color = attributes.aColor.array;
  const color2 = attributes.aColor2.array;
  const shape = attributes.aShape.array;

  const mesh = new THREE.Mesh(
    quad,
    new THREE.ShaderMaterial({
      name: 'Fireworks',
      uniforms,
      vertexShader: fireworksVertex,
      fragmentShader: fireworksFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  // Positions live in the shader, so three's bounds would be wrong and cull the show.
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;

  let cursor = 0;
  let runStart = 0;
  let runCount = 0;
  const runFirst = new Float64Array(RUNS);
  const runLast = new Float64Array(RUNS);
  const runSize = new Uint32Array(RUNS);
  let runIndex = 0;
  let runFirstBorn = Infinity;
  let runLastDeath = -Infinity;

  return {
    mesh,
    size,

    /** Claims `count` particles and returns the index of the first. */
    begin(count) {
      if (cursor + count > size) cursor = 0;
      runStart = cursor;
      runCount = count;
      cursor += count;
      runFirstBorn = Infinity;
      runLastDeath = -Infinity;
      return runStart;
    },

    set(i, px, py, pz, born, vx, vy, vz, drag, r, g, b, r2, g2, b2, changeAt, life, radius, trail, kind) {
      const o = i * 4;
      start[o] = px;
      start[o + 1] = py;
      start[o + 2] = pz;
      start[o + 3] = born;
      motion[o] = vx;
      motion[o + 1] = vy;
      motion[o + 2] = vz;
      motion[o + 3] = drag;
      color[o] = r;
      color[o + 1] = g;
      color[o + 2] = b;
      color2[o] = r2;
      color2[o + 1] = g2;
      color2[o + 2] = b2;
      color2[o + 3] = changeAt;
      shape[o] = life;
      shape[o + 1] = radius;
      shape[o + 2] = trail;
      shape[o + 3] = kind;
      if (born < runFirstBorn) runFirstBorn = born;
      if (born + life > runLastDeath) runLastDeath = born + life;
    },

    /** Uploads the run claimed by the last begin(). */
    end() {
      for (let a = 0; a < attributeList.length; a++) {
        attributeList[a].addUpdateRange(runStart * 4, runCount * 4);
        attributeList[a].needsUpdate = true;
      }
      runFirst[runIndex] = runFirstBorn;
      runLast[runIndex] = runLastDeath;
      runSize[runIndex] = runCount;
      runIndex = (runIndex + 1) % RUNS;
    },

    /** Particles in runs that are live now (an upper bound: a run counts whole). */
    liveCount(time) {
      let live = 0;
      for (let i = 0; i < RUNS; i++) if (runFirst[i] <= time && runLast[i] >= time) live += runSize[i];
      return Math.min(live, size);
    },

    dispose() {
      quad.dispose();
      mesh.material.dispose();
    },
  };
}

/**
 * Writes into `out` where a particle is `t` seconds after launch, with the same
 * closed-form motion the shader uses. `out` is a 3-element array.
 */
export function positionAt(out, px, py, pz, vx, vy, vz, drag, t, gravity, windX, windZ) {
  const decay = (1 - Math.exp(-drag * t)) / drag;
  const tx = windX;
  const ty = -gravity / drag;
  const tz = windZ;
  out[0] = px + tx * t + (vx - tx) * decay;
  out[1] = py + ty * t + (vy - ty) * decay;
  out[2] = pz + tz * t + (vz - tz) * decay;
  return out;
}

/** Same as positionAt, for the velocity. */
export function velocityAt(out, vx, vy, vz, drag, t, gravity, windX, windZ) {
  const e = Math.exp(-drag * t);
  const ty = -gravity / drag;
  out[0] = windX + (vx - windX) * e;
  out[1] = ty + (vy - ty) * e;
  out[2] = windZ + (vz - windZ) * e;
  return out;
}
