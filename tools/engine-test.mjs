import assert from 'node:assert/strict';
import { fixture, installDOM, THREE } from './engine-fixtures.mjs';
const { createPool, positionAt } = await import('../src/particles.js');
const { planShell, fireShell } = await import('../src/shells.js');
const { createQualityMonitor } = await import('../src/post.js');
const smoke = await import('../src/smoke.js');
const fountains = await import('../src/fountains.js');
const fireworks = await import('../src/fireworks.js');
const lake = await import('../src/lake.js');
const mirror = await import('../src/mirror.js');
const walk = await import('../src/walk.js');
const environment = await import('../src/environment.js');
const { waterfall } = await import('../src/ground.js');
const director = await import('../src/director.js');
const { OCCASIONS } = await import('../src/occasions.js');
let passed = 0;
function test(name, run) { run(); passed++; console.log(`PASS ${name}`); }
function pool(size = 100) { return createPool(size, { uTime: { value: 0 } }); }
function emit(p, count, owner, born, life) {
  p.groundShow(owner);
  const from = p.begin(count);
  for (let i = from; i < from + count; i++) p.set(i, 0, 0, 0, born, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, life, 1, 1, 0);
  p.end();
  return from;
}

test('particle claim searches past 48 blockers', () => {
  const p = pool();
  for (let i = 0; i < 100; i++) emit(p, 1, 0, 0, i < 95 && i % 2 === 0 ? 100 : 0.5);
  p.mesh.material.uniforms.uTime.value = 1;
  assert.equal(p.begin(2), 95);
  assert.equal(p.squeezed, 0);
  p.dispose();
});
test('partial overwrite retains ownership and counts later pressure', () => {
  for (const cut of [true, false]) {
    const p = pool();
    emit(p, 80, 1, 10, 20);
    emit(p, 20, 2, 10, 20);
    assert.equal(emit(p, 40, 2, 10, 20), 0);
    assert.equal(p.squeezed, 1);
    if (cut) {
      p.cut(1, 1);
      const births = p.mesh.geometry.attributes.aStart.array;
      assert.equal(births[60 * 4 + 3], -1e6);
      assert.equal(births[20 * 4 + 3], 10);
      assert.equal(p.liveCount(11), 60);
    }
    assert.equal(emit(p, 40, 2, 10, 20), 40);
    assert.equal(p.squeezed, cut ? 1 : 2);
    p.dispose();
  }
});
test('ownership survives more than 2048 runs and already born sparks survive a cut', () => {
  const p = pool(4096);
  for (let i = 0; i < 3072; i++) emit(p, 1, 1, i === 0 ? 0 : 10, 30);
  emit(p, 1024, 2, 10, 20);
  assert.equal(p.squeezed, 0);
  p.cut(1, 1);
  assert.equal(p.mesh.geometry.attributes.aStart.array[3], 0);
  assert.equal(p.liveCount(11), 1025);
  p.dispose();
});
test('a gap crossing the search cursor is found without wrapping a claim', () => {
  const p = pool(10);
  emit(p, 6, 0, 0, 0.5);
  emit(p, 4, 0, 0, 100);
  p.mesh.material.uniforms.uTime.value = 1;
  emit(p, 3, 0, 0, 0.5); // cursor 3, free physical gap [0,6)
  assert.equal(p.begin(5), 0);
  assert.equal(p.squeezed, 0);
  p.dispose();
});
test('random fragmented allocations and cancellations match a slot oracle', () => {
  const p = pool(64);
  const slots = Array.from({ length: 64 }, () => ({ born: -Infinity, death: -Infinity, owner: 0 }));
  let seed = 123456, now = 0;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let step = 0; step < 1500; step++) {
    now += random() < 0.2 ? 1 : 0;
    p.mesh.material.uniforms.uTime.value = now;
    const owner = Math.floor(random() * 3);
    if (random() < 0.15) {
      p.cut(owner, now);
      for (const slot of slots) if (slot.owner === owner && slot.born > now) slot.born = slot.death = -Infinity;
    } else {
      const count = 1 + Math.floor(random() * 20);
      const born = now + Math.floor(random() * 8), life = 1 + Math.floor(random() * 15);
      let gap = false;
      for (let i = 0; i <= slots.length - count; i++) {
        if (slots.slice(i, i + count).every((slot) => slot.death <= now)) { gap = true; break; }
      }
      const prior = p.squeezed;
      const from = emit(p, count, owner, born, life);
      assert.equal(p.squeezed - prior, gap ? 0 : 1);
      if (gap) assert.ok(slots.slice(from, from + count).every((slot) => slot.death <= now));
      for (let i = from; i < from + count; i++) slots[i] = { owner, born, death: born + life };
    }
    assert.equal(p.liveCount(now), slots.filter((slot) => slot.born <= now && slot.death > now).length);
    assert.equal(p.latestDeath(), Math.max(...slots.map((slot) => slot.death)));
  }
  p.dispose();
});
test('shell occupancy uses the last actual emitted particle death', () => {
  const ctx = fixture();
  const p = pool(20000);
  const plan = { launch: 0 };
  planShell(plan, ctx.config, false, 0, 100, 'leaves');
  plan.launch = 5 - plan.fuse;
  const record = {};
  fireShell(p, plan, ctx.config, ctx.config.palettes[ctx.config.look.palette], record);
  const birth = p.mesh.geometry.attributes.aStart.array;
  const shape = p.mesh.geometry.attributes.aShape.array;
  let latest = -Infinity;
  for (let i = 0; i < p.size; i++) if (birth[i * 4 + 3] > -100) latest = Math.max(latest, birth[i * 4 + 3] + shape[i * 4]);
  assert.ok(Math.abs(record.end - latest) < 0.00001);
  assert.ok(record.end > record.time + ctx.config.look.lifetime * 3);
  assert.ok(p.liveCount(record.time + ctx.config.look.lifetime * 2) > 0);
  p.dispose();
});
test('auto quality notices later work, manual→auto, and sustained 300 ms frames', () => {
  let now = 0;
  let tier = 'high';
  const monitor = createQualityMonitor((next) => { tier = next; }, () => now);
  function frames(count, ms, mode = 'auto', place = 'beach') {
    for (let i = 0; i < count; i++) { now += ms; monitor.update(mode, place, tier); }
  }
  frames(250, 16);
  assert.equal(tier, 'high');
  frames(100, 40);
  assert.notEqual(tier, 'high');
  tier = 'high';
  frames(20, 100, 'high');
  assert.equal(tier, 'high');
  frames(24, 300);
  assert.equal(tier, 'low');
});
test('auto quality ignores one isolated stall without stopping future measurement', () => {
  let now = 0;
  let tier = 'high';
  const monitor = createQualityMonitor((next) => { tier = next; }, () => now);
  for (let i = 0; i < 500; i++) {
    now += i === 110 ? 1200 : 16;
    monitor.update('auto', 'beach', tier);
  }
  assert.equal(tier, 'high');
});
test('smoke finds free slots behind a busy cursor', () => {
  const ctx = fixture();
  ctx.fireworks = { bursts: [{ time: 0, type: 'peony', size: 60, x: 0, y: 100, z: -380 }] };
  const module = smoke.create(ctx);
  const mesh = ctx.scene.children.find((item) => item.material?.name === 'Smoke');
  const births = mesh.geometry.attributes.aOrigin.array;
  const shapes = mesh.geometry.attributes.aShape.array;
  births[3] = 0;
  shapes[2] = 100;
  module.update(0.1, 0.1);
  let newPuffs = 0;
  for (let i = 1; i < 390; i++) if (births[i * 4 + 3] > -100) newPuffs++;
  assert.ok(newPuffs > 10);
  assert.equal(births[3], 0);
  module.dispose();
});
test('shortening a ground hold cancels future smoke but keeps existing smoke', () => {
  const ctx = fixture();
  const record = { owner: 1, time: 0, hold: 10, smoke: 1, x: 0, z: -380 };
  ctx.fountains = { lights: [record] };
  const module = smoke.create(ctx);
  const births = ctx.scene.children[0].geometry.attributes.aOrigin.array;
  module.update(0, 0);
  assert.ok(Array.from(births).some((value, i) => i % 4 === 3 && value > 2));
  record.hold = 1;
  module.update(0.1, 1);
  let existing = 0;
  for (let i = 390; i < 520; i++) {
    assert.ok(births[i * 4 + 3] <= 1);
    if (births[i * 4 + 3] >= 0) existing++;
  }
  assert.ok(existing > 0);
  module.dispose();
});
test('turning off side barges cancels their future sparks, smoke, sound and lights', () => {
  const ctx = fixture();
  ctx.config.fountains.sideBarges = true;
  ctx.config.fountains.enabled = true;
  ctx.config.fountains.firstAt = 0;
  const p = pool(60000);
  ctx.fireworks = { pool: p };
  const stoppedAudio = [];
  ctx.audio = { cutGround: (owner) => stoppedAudio.push(owner) };
  const ground = fountains.create(ctx);
  const haze = smoke.create(ctx);
  ground.update(0, 0);
  haze.update(0, 0);
  assert.ok(ctx.fountains.lights.slice(14).some((record) => record.hold > 1));
  ctx.config.fountains.sideBarges = false;
  ground.update(0.1, 1);
  haze.update(0.1, 1);
  assert.ok(stoppedAudio.includes(2));
  const births = p.mesh.geometry.attributes.aStart.array;
  for (let i = 0; i < p.size; i++) {
    const x = births[i * 4];
    if (Math.abs(x) > 80) assert.ok(births[i * 4 + 3] <= 1);
  }
  for (const record of ctx.fountains.lights.slice(14)) assert.ok(record.time + record.hold <= 1.6);
  haze.dispose(); ground.dispose(); p.dispose();
});
test('side-barge disable cancels delayed emissions after their lights already ended', () => {
  const ctx = fixture();
  ctx.config.fountains.firstAt = 0;
  ctx.config.fountains.sideBarges = true;
  const p = pool(60000);
  ctx.fireworks = { pool: p };
  const cancelled = [];
  ctx.audio = { cutGround: (owner) => cancelled.push(owner) };
  const module = fountains.create(ctx);
  module.update(0, 0);
  const delayed = emit(p, 1, 2, 20, 2);
  ctx.config.fountains.sideBarges = false;
  module.update(0.1, 15);
  assert.ok(cancelled.includes(2));
  assert.equal(p.mesh.geometry.attributes.aStart.array[delayed * 4 + 3], -1e6);
  module.dispose(); p.dispose();
});
test('waterfall starts at the deck, anchors its lights, and dies at water at every height', () => {
  for (const height of [8, 50]) for (const gravity of [0.2, 1, 2]) {
    const ctx = fixture();
    ctx.config.fountains.height = height;
    ctx.config.physics.gravity = gravity;
    const p = pool(6000);
    const tubes = [-50, -25, 0, 25, 50];
    const lights = tubes.map(() => ({}));
    waterfall(p, ctx.config, false, 0, tubes, 2.5, -380, [], lights);
    const birth = p.mesh.geometry.attributes.aStart.array;
    const motion = p.mesh.geometry.attributes.aMotion.array;
    const shape = p.mesh.geometry.attributes.aShape.array;
    let count = 0;
    const point = [0, 0, 0];
    for (let i = 0; i < p.size; i++) {
      const offset = i * 4;
      if (birth[offset + 3] < -100) continue;
      count++;
      assert.equal(birth[offset + 1], 2.5);
      assert.ok(birth[offset + 2] > -372, 'sparks originate beyond the front hull edge');
      assert.ok(motion[offset + 2] > 0, 'sparks spill outward toward the water');
      assert.ok(shape[offset] < 4, 'deck-height sparks do not keep a six-second fall');
      positionAt(point, birth[offset], birth[offset + 1], birth[offset + 2],
        motion[offset], motion[offset + 1], motion[offset + 2], motion[offset + 3], shape[offset], 9.81 * gravity, 0, 0);
      assert.ok(Math.abs(point[1]) < 0.002, 'lifetime ends at water level');
    }
    assert.equal(count, Math.round(125 * 2.9) * 8, 'existing per-metre particle density retained');
    for (const light of lights) { assert.equal(light.y, 2.5); assert.equal(light.z, -371.9); }
    p.dispose();
  }
});
test('lake mask and reflection targets are regenerated after context restoration', () => {
  const ctx = fixture();
  const reflections = mirror.create(ctx);
  const ice = lake.create(ctx);
  reflections.update(0, 1);
  const firstRenders = ctx.renderer.renders.length;
  assert.equal(firstRenders, 7); // one mask bake and all six cubemap faces
  ctx.renderer.domElement.dispatchEvent(new Event('webglcontextrestored'));
  reflections.update(0, 1.1);
  ice.update(0, 1.1);
  assert.equal(ctx.renderer.renders.length, firstRenders * 2);
  ice.dispose(); reflections.dispose(); ctx.abort.abort();
});
test('walking disposal restores drag controls and preserves a locked view', () => {
  const events = installDOM();
  for (const locked of [false, true]) {
    const ctx = fixture();
    const module = walk.create(ctx);
    const key = new Event('keydown', { cancelable: true });
    Object.defineProperty(key, 'code', { value: 'KeyW' });
    events.dispatchEvent(key);
    assert.equal(ctx.controls.enabled, false);
    ctx.viewLocked = locked;
    module.dispose();
    assert.equal(ctx.controls.enabled, !locked);
    ctx.abort.abort();
  }
});
test('rebuilding on the lake preserves the original beach camera baseline', () => {
  installDOM();
  const ctx = fixture();
  const original = structuredClone(ctx.config.camera.presets.sand);
  ctx.config.place.environment = 'lake';
  let module = environment.create(ctx);
  assert.deepEqual(ctx.config.camera.presets.sand.position, [0, 2.6, 7]);
  module.dispose();
  module = environment.create(ctx);
  ctx.config.place.environment = 'beach';
  module.update(0.1, 1);
  assert.deepEqual(ctx.config.camera.presets.sand, original);
  module.dispose(); ctx.abort.abort();
});
test('invalid launch rates cannot trap the render loop', () => {
  const ctx = fixture();
  ctx.config.show.openingShells = 0;
  ctx.config.show.shellsPerMinute = -1;
  const module = fireworks.create(ctx);
  module.update(0.1, 2);
  assert.ok(ctx.fireworks.bursts.filter((record) => record.time > -100).length <= 1);
  module.dispose(); ctx.abort.abort();
});

test('explicit director stop cancels unborn text, smoke and burst records without touching ambient shells', () => {
  installDOM();
  // Only text rasterization is stubbed; the real director, shell writer and particle pool run.
  document.createElement = () => ({ getContext: () => ({
    measureText: () => ({ width: 100 }), fillText() {},
    getImageData: () => ({ data: new Uint8Array(640 * 160 * 4).fill(255) }),
  }) });
  const ctx = fixture();
  ctx.config.show.openingShells = 0;
  ctx.config.show.autoLaunch = false;
  ctx.config.look.text = 'BASE';
  ctx.countdown = { stop() {} };
  let audioCuts = 0;
  ctx.audio = { cutDirected() { audioCuts++; } };
  const show = fireworks.create(ctx), haze = smoke.create(ctx), direction = director.create(ctx);
  show.update(0.1, 1);
  ctx.fireworks.launchAt('peony', 70, 100, 12); // autoshow's existing call stays owner 0
  ctx.director.play({ ...OCCASIONS.birthday, ending: [{ at: 0, text: 'message' }] }, { message: 'OLD WORDS' }, false);
  direction.update(0.4, 0.4);
  const scheduled = ctx.fireworks.bursts.find((record) => record.type === 'text');
  assert.equal(scheduled.owner, 3);
  assert.ok(scheduled.time > 1);
  haze.update(0.1, 1);
  const p = ctx.fireworks.pool, attributes = p.mesh.geometry.attributes;
  const births = attributes.aStart.array, flags = attributes.aColor.array;
  assert.ok(p.latestDeath(3) > scheduled.time);
  for (let i = 0; i < p.size; i++) if (births[i * 4 + 3] > -100) assert.equal(flags[i * 4 + 3], 0, 'shells never receive the ground shader flag');
  const ambientEnd = p.latestDeath(0);
  const smokeBirths = ctx.scene.children.find((child) => child.material?.name === 'Smoke').geometry.attributes.aOrigin.array;
  const smokeBefore = smokeBirths.filter((_, index) => index % 4 === 3 && smokeBirths[index] > 1).length;
  const directedEnd = p.latestDeath(3), beforeNatural = audioCuts;
  ctx.director.stop({ settle: true });
  assert.equal(p.latestDeath(3), directedEnd, 'natural completion preserves the remaining tail');
  assert.equal(audioCuts, beforeNatural);
  direction.update(0.1, 1);
  ctx.director.stop();
  assert.equal(audioCuts, beforeNatural + 1);
  assert.ok(scheduled.time < -100);
  assert.equal(p.latestDeath(0), ambientEnd);
  assert.ok(p.latestDeath(3) < directedEnd);
  const smokeAfter = smokeBirths.filter((_, index) => index % 4 === 3 && smokeBirths[index] > 1).length;
  assert.ok(smokeAfter < smokeBefore, 'the text shell’s unborn smoke also disappears');
  assert.equal(ctx.config.look.text, 'BASE');
  assert.ok(ctx.fireworks.bursts.find((record) => record.type === 'peony').time === 12);
  direction.dispose(); haze.dispose(); show.dispose(); ctx.abort.abort();
});
console.log(`${passed} engine regression tests passed`);
