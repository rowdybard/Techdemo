// Fireworks module: the particle pool, the barge the shells launch from, and the
// scheduler that decides when to fire. The scheduler keeps a fixed ring of shell
// records; launching a shell writes all of its particles at once (see shells.js).
// A quick tap on the sky sends a shell to that spot (except on an embedded header).
import * as THREE from 'three';
import { createPool } from './particles.js';
import { fireShell, planShell } from './shells.js';

const SHELLS = 64; // shell records kept for counting shells in the air and lighting
const FINALE_SECONDS = 7;
const FINALE_MAX_SHELLS = 24;
const TAP_PIXELS = 8; // a press that moves further than this is a drag, not a tap
const TAP_MS = 350;

export function create(ctx) {
  const { scene, config, renderer, camera, phone, stats, signal } = ctx;

  const uniforms = {
    uTime: { value: 0 },
    uGravity: { value: new THREE.Vector3() },
    uWind: { value: new THREE.Vector3() },
    uViewport: { value: new THREE.Vector2(1, 1) },
    uSizeScale: { value: 1 },
    uTrailScale: { value: 1 },
    uMinPixels: { value: 1.1 },
    uBrightness: { value: 1 },
    uGlitter: { value: 1 },
  };
  const pool = createPool(phone ? config.fireworks.poolSize.phone : config.fireworks.poolSize.desktop, uniforms);
  scene.add(pool.mesh);
  stats.poolSize = pool.size;

  const barge = createBarge(config.show.bargePosition);
  scene.add(barge.group);

  // One reusable plan and a ring of burst records (time, place, colour) for the lights.
  const plan = { launch: 0 };
  const bursts = [];
  for (let i = 0; i < SHELLS; i++) bursts.push({ time: -1e9, launch: -1e9, x: 0, y: 0, z: 0, r: 0, g: 0, b: 0, size: 0, end: -1e9, type: '' });
  ctx.fireworks = { bursts };
  let next = 0;
  let nextLaunch = 0;

  let finaleUntil = -1;

  // Is a message in the sky (or about to be)? Then random shells go to the sides.
  function wordsUp(time) {
    for (let i = 0; i < SHELLS; i++) {
      const b = bursts[i];
      if (b.type === 'text' && b.time - 4 < time && b.time + config.look.lifetime * 1.6 > time) return true;
    }
    return false;
  }

  function launch(time, aimX = NaN, aimY = NaN, type = null, random = false) {
    plan.launch = time;
    planShell(plan, config, phone, aimX, aimY, type);
    if (random && plan.type !== 'text' && wordsUp(time)) {
      // Clear of the words: out to one side, at any height.
      const side = Math.random() < 0.5 ? -1 : 1;
      const [bx] = config.show.bargePosition;
      const { heightMin, heightMax } = config.physics;
      planShell(plan, config, phone, bx + side * (90 + Math.random() * 70), heightMin + Math.random() * (heightMax - heightMin), plan.type);
    }
    const record = bursts[next];
    next = (next + 1) % SHELLS;
    fireShell(pool, plan, config, config.palettes[config.look.palette], record);
    record.end = record.time + config.look.lifetime * 1.2;
    record.launch = time;
  }

  function inTheAir(time) {
    let count = 0;
    for (let i = 0; i < SHELLS; i++) if (bursts[i].end > time && bursts[i].time - 6 < time) count++;
    return count;
  }

  function syncUniforms(time) {
    const { physics, look } = config;
    uniforms.uTime.value = time;
    uniforms.uGravity.value.set(0, -9.81 * physics.gravity, 0);
    uniforms.uWind.value.set(physics.windX, 0, physics.windZ);
    renderer.getDrawingBufferSize(uniforms.uViewport.value);
    uniforms.uSizeScale.value = look.sparkSize;
    uniforms.uTrailScale.value = look.trailLength;
    uniforms.uBrightness.value = look.brightness;
    uniforms.uGlitter.value = look.glitter;
  }

  // Shells already in flight when the page opens, so the first burst comes within a second.
  for (let i = 0; i < config.show.openingShells; i++) {
    plan.launch = 0;
    planShell(plan, config, phone);
    plan.launch = 0.7 + i * 0.55 - plan.fuse;
    const record = bursts[next];
    next = (next + 1) % SHELLS;
    fireShell(pool, plan, config, config.palettes[config.look.palette], record);
    record.end = record.time + config.look.lifetime * 1.2;
    record.launch = plan.launch;
  }
  nextLaunch = 1.2;

  // Tap to aim: a quick press that barely moves is a tap. The aim point is where the ray
  // through it crosses the upright plane of the barge.
  const ray = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const aimPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -config.show.bargePosition[2]);
  const aimPoint = new THREE.Vector3();
  let downX = 0;
  let downY = 0;
  let downAt = 0;
  const canvas = renderer.domElement;
  canvas.addEventListener('pointerdown', (event) => {
    downX = event.clientX;
    downY = event.clientY;
    downAt = performance.now();
  }, { signal });
  let lastTap = -Infinity;
  canvas.addEventListener('pointerup', (event) => {
    // Anyone can tap the sky to launch a shell (not on a client's embedded header).
    if (ctx.link.embed) return;
    if (Math.hypot(event.clientX - downX, event.clientY - downY) > TAP_PIXELS || performance.now() - downAt > TAP_MS) return;
    const box = canvas.getBoundingClientRect();
    pointer.set(((event.clientX - box.left) / box.width) * 2 - 1, -((event.clientY - box.top) / box.height) * 2 + 1);
    ray.setFromCamera(pointer, camera);
    aimPlane.constant = -config.show.bargePosition[2];
    if (!ray.ray.intersectPlane(aimPlane, aimPoint) || aimPoint.y < 20) return;
    if (performance.now() - lastTap < 200) return; // a few a second at most
    lastTap = performance.now();
    launch(uniforms.uTime.value, aimPoint.x, Math.min(aimPoint.y, 260));
  }, { signal });

  const api = {
    update(dt, time) {
      const { show } = config;
      if (time < finaleUntil) {
        // Finale: shells as fast as the pool can take them.
        if (nextLaunch < time - 1) nextLaunch = time;
        while (time >= nextLaunch) {
          if (inTheAir(time) < FINALE_MAX_SHELLS) launch(nextLaunch, NaN, NaN, null, true);
          nextLaunch += 0.12 + Math.random() * 0.18;
        }
      } else if (show.autoLaunch && !(ctx.director && ctx.director.active)) {
        // A long pause skips the shells it missed instead of firing them all at once.
        if (nextLaunch < time - 1) nextLaunch = time;
        while (time >= nextLaunch) {
          if (inTheAir(time) < show.maxShells) launch(nextLaunch, NaN, NaN, null, true);
          nextLaunch += (60 / show.shellsPerMinute) * (0.4 + Math.random() * 1.2);
        }
      } else {
        nextLaunch = time;
      }
      syncUniforms(time);
      stats.poolUsed = pool.liveCount(time);
    },

    /** Fires one shell now, whatever the schedule; optionally of one type. */
    launch(type = null) {
      launch(uniforms.uTime.value, NaN, NaN, type);
    },

    /** Fires one shell of `type` from the barge to burst at (x, height). */
    launchAt(type, x, height) {
      launch(uniforms.uTime.value, x, height, type);
    },

    /** A few seconds of shells as fast as the pool allows. */
    finale() {
      finaleUntil = uniforms.uTime.value + FINALE_SECONDS;
      nextLaunch = uniforms.uTime.value;
    },

    dispose() {
      scene.remove(pool.mesh, barge.group);
      pool.dispose();
      barge.dispose();
      stats.poolSize = 0;
      stats.poolUsed = 0;
      ctx.fireworks = null;
    },
  };
  ctx.fireworks.pool = pool; // the ground-show fountains write into the same pool
  ctx.fireworks.launch = api.launch;
  ctx.fireworks.launchAt = api.launchAt;
  ctx.fireworks.finale = api.finale;
  return api;
}

// A long, dark barge silhouette on the water: mortar racks along the deck, a cabin at
// one end, and a few dim work lights. Shells launch from along its length.
export const BARGE_LENGTH = 130;

function createBarge([x, y, z]) {
  const group = new THREE.Group();
  const dark = new THREE.MeshBasicMaterial({ color: 0x05060a });
  const lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.9, 0.45) });
  const hull = new THREE.BoxGeometry(BARGE_LENGTH, 2.4, 16);
  const cabin = new THREE.BoxGeometry(9, 3.5, 7);
  const rack = new THREE.BoxGeometry(5, 1.2, 3);
  const light = new THREE.SphereGeometry(0.35, 8, 6);
  const half = BARGE_LENGTH / 2;
  const add = (geometry, material, px, py, pz) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x + px, y + py, z + pz);
    group.add(mesh);
  };
  add(hull, dark, 0, 0.6, 0);
  add(cabin, dark, -half + 8, 3.4, 0);
  for (let px = -half + 18; px < half - 4; px += 9) add(rack, dark, px, 2.4, (px / 9) % 2 === 0 ? -3 : 3);
  for (const px of [-half + 8, -half + 30, 0, half - 25, half - 3]) add(light, lamp, px, px === -half + 8 ? 5.6 : 2.4, 6);
  return {
    group,
    dispose() {
      hull.dispose();
      cabin.dispose();
      rack.dispose();
      light.dispose();
      dark.dispose();
      lamp.dispose();
    },
  };
}
