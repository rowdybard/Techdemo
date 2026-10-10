// Fireworks module: the particle pool, the barge the shells launch from, and the
// scheduler that decides when to fire. The scheduler keeps a fixed ring of shell
// records; launching a shell writes all of its particles at once (see shells.js).
// A quick tap on the sky sends a shell to that spot (except on an embedded header).
import * as THREE from 'three';
import { mergeParts } from './lighthouse.js';
import { createPool } from './particles.js';
import { fireShell, planShell } from './shells.js';

const SHELLS = 96; // shell records kept for counting shells in the air, lighting and sound
const FINALE_SECONDS = 7;
const FINALE_MAX_SHELLS = 24;
const SAMPLE_SHELLS = 3; // shells a Style card sends up the moment it's picked
const TAP_PIXELS = 8; // a press that moves further than this is a drag, not a tap
const TAP_MS = 350;
const DIRECTED = 3; // separate from ambient shells and the two ground-show owners

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
    uGroundBrightness: { value: GROUND_BRIGHTNESS },
    uGlitter: { value: 1 },
  };
  const pool = createPool(phone ? config.fireworks.poolSize.phone : config.fireworks.poolSize.desktop, uniforms);
  scene.add(pool.mesh);
  stats.poolSize = pool.size;

  const barge = createBarge(config.show.bargePosition, BARGE_LENGTH, true);
  scene.add(barge.group);
  // Two small barges either side, for ground shows only (fountains.js runs them).
  const [mx, my, mz] = config.show.bargePosition;
  const sides = [-1, 1].map((side) => createBarge([mx + side * SIDE_BARGE_OFFSET, my, mz], SIDE_BARGE_LENGTH, false));
  for (const side of sides) scene.add(side.group);

  // One reusable plan and a ring of burst records (time, place, colour) for the lights.
  const plan = { launch: 0 };
  const bursts = [];
  // crackle: seconds after the break when its stars' tips crackle (audio.js), 0 for none.
  for (let i = 0; i < SHELLS; i++) bursts.push({ owner: 0, time: -1e9, launch: -1e9, x: 0, y: 0, z: 0, r: 0, g: 0, b: 0, size: 0, end: -1e9, type: '', crackle: 0, spans: new Int32Array(8), spanCount: 0 });
  ctx.fireworks = { bursts };
  let next = 0;
  let nextLaunch = 0;

  let finaleUntil = -1;
  let secondLine = true; // which of two lines in the sky went up last

  // Is a message in the sky (or about to be)? Then random shells go to the sides.
  function wordsUp(time) {
    for (let i = 0; i < SHELLS; i++) {
      const b = bursts[i];
      if (b.type === 'text' && b.launch < time && b.end > time) return true;
    }
    return false;
  }

  // `burstAt`, if given, is the moment the shell must burst: it leaves the barge a fuse earlier
  // (so a shell can be sent off ahead of time and burst exactly on a beat).
  function launch(time, aimX = NaN, aimY = NaN, type = null, random = false, burstAt = NaN, paletteName = null, owner = 0, words = null, line = 0) {
    plan.launch = time;
    planShell(plan, config, phone, aimX, aimY, type);
    plan.words = words;
    plan.line = line;
    // Two lines in the sky take turns, in the show's own shells (a greeting's lines are the director's),
    // the first in the palette's first colour and the second in its second.
    if (random && plan.type === 'text' && config.look.text2.trim()) {
      secondLine = !secondLine;
      plan.words = secondLine ? config.look.text2 : config.look.text;
      plan.line = secondLine ? 2 : 1;
    }
    if (random && plan.type !== 'text' && wordsUp(time)) {
      // Clear of the words: out to one side, at any height.
      const side = Math.random() < 0.5 ? -1 : 1;
      const [bx] = config.show.bargePosition;
      const { heightMin, heightMax } = config.physics;
      planShell(plan, config, phone, bx + side * (90 + Math.random() * 70), heightMin + Math.random() * (heightMax - heightMin), plan.type);
    }
    if (!Number.isNaN(burstAt)) plan.launch = burstAt - plan.fuse;
    const record = bursts[next];
    next = (next + 1) % SHELLS;
    pool.shellShow(owner);
    try { fireShell(pool, plan, config, config.palettes[paletteName] || config.palettes[config.look.palette], record); }
    finally { pool.shellShow(); }
    record.owner = owner;
    record.launch = plan.launch;
    return record.end;
  }

  function inTheAir(time) {
    let count = 0;
    for (let i = 0; i < SHELLS; i++) if (bursts[i].end > time && bursts[i].launch <= time) count++;
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
    uniforms.uGlitter.value = Math.min(1, Math.max(0, look.glitter)); // above 1 a twinkle's off beat goes negative: black flashes
  }

  // Shells already in flight when the page opens, so the first burst comes within a second.
  for (let i = 0; i < config.show.openingShells; i++) {
    plan.launch = 0;
    planShell(plan, config, phone);
    plan.launch = 0.7 + i * 0.55 - plan.fuse;
    const record = bursts[next];
    next = (next + 1) % SHELLS;
    fireShell(pool, plan, config, config.palettes[config.look.palette], record);
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
    // With the view locked (viewlock.js) a drag does nothing else, so a sloppier press counts.
    const slack = ctx.viewLocked ? 3 : 1;
    if (Math.hypot(event.clientX - downX, event.clientY - downY) > TAP_PIXELS * slack || performance.now() - downAt > TAP_MS * slack) return;
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
      if (ctx.recordingTail) {
        nextLaunch = time;
      } else if (time < finaleUntil) {
        // Finale: shells as fast as the pool can take them.
        if (nextLaunch < time - 1) nextLaunch = time;
        for (let queued = 0; time >= nextLaunch && queued < FINALE_MAX_SHELLS; queued++) {
          if (inTheAir(time) < FINALE_MAX_SHELLS) launch(nextLaunch, NaN, NaN, null, true);
          nextLaunch += 0.12 + Math.random() * 0.18;
        }
      } else if (show.autoLaunch && !(ctx.director && ctx.director.active)) {
        // A long pause skips the shells it missed instead of firing them all at once.
        if (nextLaunch < time - 1) nextLaunch = time;
        const rate = Number.isFinite(show.shellsPerMinute) && show.shellsPerMinute > 0 ? Math.min(240, show.shellsPerMinute) : 1;
        for (let queued = 0; time >= nextLaunch && queued < FINALE_MAX_SHELLS; queued++) {
          if (inTheAir(time) < show.maxShells) launch(nextLaunch, NaN, NaN, null, true);
          nextLaunch += (60 / rate) * (0.4 + Math.random() * 1.2);
        }
      } else {
        nextLaunch = time;
      }
      syncUniforms(time);
      pool.trim(time); // draw only up to the last live spark
      stats.poolUsed = pool.liveCount(time);
      const sidesOn = config.fountains.sideBarges;
      sides[0].group.visible = sidesOn;
      sides[1].group.visible = sidesOn;
    },

    /** Fires one shell now, whatever the schedule; optionally of one type. */
    /** Fires one shell of `type` now (`words` spells those instead of the words in the sky, as its `line`: 1 or 2). */
    launch(type = null, words = null, line = 0) {
      launch(uniforms.uTime.value, NaN, NaN, type, false, NaN, null, 0, words, line);
    },

    /** Fires one shell of `type` from the barge to burst at (x, height), at `burstAt` if given, in a named palette if given. */
    launchAt(type, x, height, burstAt = NaN, palette = null, directed = false) {
      return launch(uniforms.uTime.value, x, height, type, false, burstAt, palette, directed ? DIRECTED : 0);
    },

    /** Explicit Stop/Back drops unborn directed sparks and queued smoke/sound, preserving visible tails. */
    cancelDirected(time = uniforms.uTime.value) {
      pool.cut(DIRECTED, time);
      ctx.smoke?.cutDirected(time);
      ctx.audio?.cutDirected();
      for (let i = 0; i < bursts.length; i++) {
        const record = bursts[i];
        if (record.owner !== DIRECTED) continue;
        if (record.launch > time) record.launch = -1e9;
        if (record.time > time) {
          record.time = -1e9;
          record.end = time;
          record.crackle = 0;
        }
      }
    },

    /** A few shells from the mix as it is now, already climbing and bursting within about a second: a new style shows at once. */
    sample() {
      const time = uniforms.uTime.value;
      for (let i = 0; i < SAMPLE_SHELLS; i++) launch(time, NaN, NaN, null, true, time + 0.5 + i * 0.35);
    },

    /** A few seconds of shells as fast as the pool allows. */
    finale() {
      finaleUntil = uniforms.uTime.value + FINALE_SECONDS;
      nextLaunch = uniforms.uTime.value;
    },

    dispose() {
      scene.remove(pool.mesh, barge.group, sides[0].group, sides[1].group);
      pool.dispose();
      barge.dispose();
      for (const side of sides) side.dispose();
      stats.poolSize = 0;
      stats.poolUsed = 0;
      ctx.fireworks = null;
    },
  };
  ctx.fireworks.pool = pool; // the ground-show fountains write into the same pool
  ctx.fireworks.launch = api.launch;
  ctx.fireworks.launchAt = api.launchAt;
  ctx.fireworks.cancelDirected = api.cancelDirected;
  ctx.fireworks.finale = api.finale;
  ctx.fireworks.sample = api.sample;
  return api;
}

// A long, dark barge silhouette on the water: mortar racks along the deck, a cabin at
// one end, and a few dim work lights. Shells launch from along its length. The two side
// barges are short ones without a cabin, for ground shows.
export const BARGE_LENGTH = 130;
// Ground shows' brightness never goes past Customize's Sparkle at about 55% (0.8 + 0.55 × 2.2):
// above that their overlapping sparks bloom into glowing blobs. Not a setting.
const GROUND_BRIGHTNESS = 2.0;
export const SIDE_BARGE_LENGTH = 34;
export const SIDE_BARGE_OFFSET = 108; // metres from the main barge's middle to each side barge's

function createBarge([x, y, z], length, cabined) {
  const group = new THREE.Group();
  const dark = new THREE.MeshBasicMaterial({ color: 0x05060a });
  const lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.9, 0.45) });
  const half = length / 2;
  const hull = [];
  const lamps = [];
  const box = (w, h, d, px, py, pz) => hull.push([new THREE.BoxGeometry(w, h, d), x + px, y + py, z + pz]);
  const bulb = (px, py, pz) => lamps.push([new THREE.SphereGeometry(0.35, 8, 6), x + px, y + py, z + pz]);
  if (cabined) {
    box(length, 2.4, 16, 0, 0.6, 0);
    box(9, 3.5, 7, -half + 8, 3.4, 0);
    for (let px = -half + 18; px < half - 4; px += 9) box(5, 1.2, 3, px, 2.4, (px / 9) % 2 === 0 ? -3 : 3);
    for (const px of [-half + 8, -half + 30, 0, half - 25, half - 3]) bulb(px, px === -half + 8 ? 5.6 : 2.4, 6);
  } else {
    box(length, 1.8, 9, 0, 0.6, 0);
    for (let k = 0; k < 4; k++) box(5, 1.2, 3, -half + 5 + k * ((length - 10) / 3), 1.9, k % 2 ? -1.5 : 1.5);
    for (const px of [-half + 2, half - 2]) bulb(px, 1.9, 4.2);
  }
  // One mesh for the hull and its racks, one for the lamps: two draw calls a barge.
  const geometries = [mergeParts(hull), mergeParts(lamps)];
  group.add(new THREE.Mesh(geometries[0], dark), new THREE.Mesh(geometries[1], lamp));
  return {
    group,
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      dark.dispose();
      lamp.dispose();
    },
  };
}
