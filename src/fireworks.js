// Fireworks module: the particle pool, the barge the shells launch from, and the
// scheduler that decides when to fire. The scheduler keeps a fixed ring of shell
// records; launching a shell writes all of its particles at once (see shells.js).
// With the 'tap' launch site, a quick tap on the sky sends a shell to that spot.
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
  for (let i = 0; i < SHELLS; i++) bursts.push({ time: -1e9, x: 0, y: 0, z: 0, r: 0, g: 0, b: 0, size: 0, end: -1e9 });
  ctx.fireworks = { bursts };
  let next = 0;
  let nextLaunch = 0;

  let finaleUntil = -1;

  function launch(time, aimX = NaN, aimY = NaN) {
    plan.launch = time;
    planShell(plan, config, phone, aimX, aimY);
    const record = bursts[next];
    next = (next + 1) % SHELLS;
    fireShell(pool, plan, config, config.palettes[config.look.palette], record);
    record.end = record.time + config.look.lifetime * 1.2;
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
  syncWind(config);
  for (let i = 0; i < config.show.openingShells; i++) {
    plan.launch = 0;
    planShell(plan, config, phone);
    plan.launch = 0.7 + i * 0.55 - plan.fuse;
    const record = bursts[next];
    next = (next + 1) % SHELLS;
    fireShell(pool, plan, config, config.palettes[config.look.palette], record);
    record.end = record.time + config.look.lifetime * 1.2;
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
  canvas.addEventListener('pointerup', (event) => {
    if (config.show.launchSite !== 'tap') return;
    if (Math.hypot(event.clientX - downX, event.clientY - downY) > TAP_PIXELS || performance.now() - downAt > TAP_MS) return;
    const box = canvas.getBoundingClientRect();
    pointer.set(((event.clientX - box.left) / box.width) * 2 - 1, -((event.clientY - box.top) / box.height) * 2 + 1);
    ray.setFromCamera(pointer, camera);
    aimPlane.constant = -config.show.bargePosition[2];
    if (!ray.ray.intersectPlane(aimPlane, aimPoint) || aimPoint.y < 20) return;
    syncWind(config);
    launch(uniforms.uTime.value, aimPoint.x, Math.min(aimPoint.y, 260));
  }, { signal });

  const api = {
    update(dt, time) {
      syncWind(config);
      const { show } = config;
      if (time < finaleUntil) {
        // Finale: shells as fast as the pool can take them.
        if (nextLaunch < time - 1) nextLaunch = time;
        while (time >= nextLaunch) {
          if (inTheAir(time) < FINALE_MAX_SHELLS) launch(nextLaunch);
          nextLaunch += 0.12 + Math.random() * 0.18;
        }
      } else if (show.autoLaunch) {
        // A long pause skips the shells it missed instead of firing them all at once.
        if (nextLaunch < time - 1) nextLaunch = time;
        while (time >= nextLaunch) {
          if (inTheAir(time) < show.maxShells) launch(nextLaunch);
          nextLaunch += (60 / show.shellsPerMinute) * (0.4 + Math.random() * 1.2);
        }
      } else {
        nextLaunch = time;
      }
      syncUniforms(time);
      stats.poolUsed = pool.liveCount(time);
    },

    /** Fires one shell now, whatever the schedule. */
    launch() {
      launch(uniforms.uTime.value);
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
  ctx.fireworks.launch = api.launch;
  ctx.fireworks.finale = api.finale;
  return api;
}

// Wind speed and direction (degrees, 0 blows away from the beach) as x and z.
function syncWind(config) {
  const { physics } = config;
  const a = (physics.windDirection * Math.PI) / 180;
  physics.windX = Math.sin(a) * physics.windSpeed;
  physics.windZ = -Math.cos(a) * physics.windSpeed;
}

// A dark barge silhouette on the water, with a couple of dim work lights.
function createBarge([x, y, z]) {
  const group = new THREE.Group();
  const dark = new THREE.MeshBasicMaterial({ color: 0x05060a });
  const lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.9, 0.45) });
  const hull = new THREE.BoxGeometry(46, 2.4, 14);
  const cabin = new THREE.BoxGeometry(8, 3.5, 6);
  const light = new THREE.SphereGeometry(0.35, 8, 6);
  const parts = [
    [hull, dark, 0, 0.6, 0],
    [cabin, dark, -14, 3.4, 0],
    [light, lamp, -14, 5.6, 0],
    [light, lamp, 18, 2.2, 0],
  ];
  for (const [geometry, material, px, py, pz] of parts) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x + px, y + py, z + pz);
    group.add(mesh);
  }
  return {
    group,
    dispose() {
      hull.dispose();
      cabin.dispose();
      light.dispose();
      dark.dispose();
      lamp.dispose();
    },
  };
}
