// Particle pool: one instanced quad per particle, all drawn in a single call. Every
// buffer is allocated once. Spawning claims a contiguous run, writes only that run, and
// uploads only that run. Dead particles collapse to nothing in the shader until a later
// run reuses them. A run is placed at a ring cursor, but never over particles that are
// still alive (or not yet born): it skips past them to free space, and only when the
// pool has no sufficiently large gap does it overwrite at the cursor. A run
// that would pass the end starts over at zero, so it never wraps.
import * as THREE from 'three';
import { fireworksFragment, fireworksVertex } from './fireworks.glsl.js';

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
  let owner = 0; // 0 random shells, 1/2 barges, 3 director shells; cancellation never changes shading
  let runStart = 0;
  let runCount = 0;
  // Ownership and lifetime belong to individual slots: overwriting half a run must
  // neither forget its surviving half nor let a later cut reach its replacement.
  const bornAt = new Float64Array(size).fill(-Infinity);
  const diesAt = new Float64Array(size).fill(-Infinity);
  const owners = new Uint8Array(size);
  let squeezed = 0; // runs that had to overwrite live particles because the pool was full
  let lastDeath = -Infinity;

  // Where `count` particles can go without covering any that are alive or still waiting to
  // be born at `now`: from the cursor on, skipping past each live run in the way, and
  // starting over at zero once. Falls back to the cursor (the oldest) if it's all full.
  function claim(count, now) {
    const first = cursor + count > size ? 0 : cursor;
    let at = freeRun(first, size, count, now);
    // Include a gap beginning before the cursor and ending after it. A claim still
    // never wraps past the physical buffer's end.
    if (at < 0 && first > 0) at = freeRun(0, Math.min(size, first + count - 1), count, now);
    if (at >= 0) return at;
    squeezed++;
    return first;
  }

  function freeRun(from, to, count, now) {
    let available = 0;
    for (let i = from; i < to; i++) {
      available = diesAt[i] > now ? 0 : available + 1;
      if (available === count) return i - count + 1;
    }
    return -1;
  }

  return {
    mesh,
    size,

    /** Marks the sparks written from now on as a ground show's, from barge `id` (1 and up), or not (0). */
    groundShow(id) {
      ground = id ? 1 : 0;
      owner = id;
    },

    /** Shell ownership is independent of the shader's ground-spark flag. */
    shellShow(id = 0) { ground = 0; owner = id; },

    /**
     * Stops owner `id` at `time`: its sparks not yet born never are. Those already
     * in the air fly on and fall, so the show stops pouring rather than vanishing.
     */
    cut(id, time) {
      let from = size;
      let to = -1;
      for (let i = 0; i < size; i++) {
        if (owners[i] !== id || bornAt[i] <= time) continue;
        start[i * 4 + 3] = -1e6;
        bornAt[i] = diesAt[i] = -Infinity;
        from = Math.min(from, i);
        to = i;
      }
      if (to >= from) {
        attributes.aStart.addUpdateRange(from * 4, (to - from + 1) * 4);
        attributes.aStart.needsUpdate = true;
      }
    },

    /** Track the actual last particle death across every run of the next shell. */
    beginLifetime() { lastDeath = -Infinity; },
    get lastDeath() { return lastDeath; },
    /** Last actual death among the occupied slots; owner null includes all barges/shells. */
    latestDeath(owner = null) {
      let end = -Infinity;
      for (let i = 0; i < size; i++) if (owner === null || owners[i] === owner) end = Math.max(end, diesAt[i]);
      return end;
    },

    /** Claims `count` particles and returns the index of the first. */
    begin(count) {
      if (!Number.isInteger(count) || count < 0 || count > size) throw new RangeError('Particle claim exceeds the pool');
      runStart = count ? claim(count, uniforms.uTime.value) : cursor;
      runCount = count;
      cursor = runStart + count;
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
      bornAt[i] = born;
      diesAt[i] = born + life;
      owners[i] = owner;
      if (born + life > lastDeath) lastDeath = born + life;
    },

    /** Uploads the run claimed by the last begin(). */
    end() {
      if (!runCount) return;
      for (let a = 0; a < attributeList.length; a++) {
        attributeList[a].addUpdateRange(runStart * 4, runCount * 4);
        attributeList[a].needsUpdate = true;
      }
    },

    /** How many runs overwrote live particles because the pool was full (0 is healthy). */
    get squeezed() {
      return squeezed;
    },

    /** Particles born and still alive now, including survivors of a squeezed run. */
    liveCount(time) {
      let live = 0;
      for (let i = 0; i < size; i++) if (bornAt[i] <= time && diesAt[i] > time) live++;
      return live;
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
