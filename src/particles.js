// Particle pool: one instanced quad per particle, all drawn in a single call. Every
// buffer is allocated once. Spawning claims a contiguous run, writes only that run, and
// uploads only that run. Dead particles collapse to nothing in the shader until a later
// run reuses them. A run is placed at a ring cursor, but never over particles that are
// still alive (or not yet born): it skips past them to free space, and only when the
// pool is genuinely full does it overwrite the oldest, as the ring always did. A run
// that would pass the end starts over at zero, so it never wraps.
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
  let ground = 0; // 1 while a ground show writes its sparks (their Sparkle is capped)
  let owner = 0; // who the runs written now belong to (a ground show's barge), so they can be cut
  let runStart = 0;
  let runCount = 0;
  const runFirst = new Float64Array(RUNS);
  const runLast = new Float64Array(RUNS);
  const runSize = new Uint32Array(RUNS);
  const runAt = new Uint32Array(RUNS); // where each run starts in the pool
  const runOwner = new Uint8Array(RUNS);
  let squeezed = 0; // runs that had to overwrite live particles because the pool was full
  let runIndex = 0;
  let runFirstBorn = Infinity;
  let runLastDeath = -Infinity;

  // Where `count` particles can go without covering any that are alive or still waiting to
  // be born at `now`: from the cursor on, skipping past each live run in the way, and
  // starting over at zero once. Falls back to the cursor (the oldest) if it's all full.
  function claim(count, now) {
    let at = cursor + count > size ? 0 : cursor;
    let wrapped = at === 0 && cursor !== 0;
    for (let tries = 0; tries < 48; tries++) {
      const end = at + count;
      let blockedUntil = -1;
      for (let i = 0; i < RUNS; i++) {
        if (runLast[i] <= now || runSize[i] === 0) continue;
        const from = runAt[i];
        const to = from + runSize[i];
        if (from < end && to > at && to > blockedUntil) blockedUntil = to;
      }
      if (blockedUntil < 0) return at;
      at = blockedUntil;
      if (at + count > size) {
        if (wrapped) break;
        wrapped = true;
        at = 0;
      }
    }
    squeezed++;
    return cursor + count > size ? 0 : cursor;
  }

  return {
    mesh,
    size,

    /** Marks the sparks written from now on as a ground show's, from barge `id` (1 and up), or not (0). */
    groundShow(id) {
      ground = id ? 1 : 0;
      owner = id;
    },

    /**
     * Stops barge `id`'s ground show at `time`: its sparks not yet born never are. Those already
     * in the air fly on and fall, so the show stops pouring rather than vanishing.
     */
    cut(id, time) {
      for (let r = 0; r < RUNS; r++) {
        if (runOwner[r] !== id || runSize[r] === 0 || runLast[r] <= time) continue;
        const from = runAt[r];
        const to = from + runSize[r];
        let lastDeath = -Infinity;
        for (let i = from; i < to; i++) {
          const born = start[i * 4 + 3];
          if (born > time) start[i * 4 + 3] = -1e6;
          else lastDeath = Math.max(lastDeath, born + shape[i * 4]);
        }
        runLast[r] = lastDeath;
        attributes.aStart.addUpdateRange(from * 4, runSize[r] * 4);
        attributes.aStart.needsUpdate = true;
      }
    },

    /** Claims `count` particles and returns the index of the first. */
    begin(count) {
      runStart = claim(count, uniforms.uTime.value);
      // Runs that were there are over (or squeezed out): forget where they were, so a cut can't
      // reach the sparks written over them.
      for (let r = 0; r < RUNS; r++) {
        if (runSize[r] > 0 && runAt[r] < runStart + count && runAt[r] + runSize[r] > runStart) runSize[r] = 0;
      }
      runCount = count;
      cursor = runStart + count;
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
      color[o + 3] = ground;
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
      runAt[runIndex] = runStart;
      runOwner[runIndex] = owner;
      runIndex = (runIndex + 1) % RUNS;
    },

    /** How many runs overwrote live particles because the pool was full (0 is healthy). */
    get squeezed() {
      return squeezed;
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
