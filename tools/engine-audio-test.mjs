// Real audio engine + deterministic Web Audio/DOM stand-ins. No speakers or browser.
import assert from 'node:assert/strict';
import { fixture, installDOM } from './engine-fixtures.mjs';
const events = installDOM();
const realPerformance = globalThis.performance;
let wall = 0;
globalThis.performance = { now: () => wall };
class Param {
  value = 0;
  setValueAtTime(value) { this.value = value; }
  exponentialRampToValueAtTime(value) { this.value = value; }
  setTargetAtTime(value) { this.value = value; }
}
class Node {
  gain = new Param(); frequency = new Param(); Q = new Param(); pan = new Param();
  threshold = new Param(); ratio = new Param(); playbackRate = new Param();
  disconnected = false;
  connect(node) { return node; }
  disconnect() { this.disconnected = true; }
}
class Source extends Node {
  stops = [];
  start(when = 0) { this.when = when; }
  stop(when) { this.stops.push(when ?? 0); }
}
let context;
class AudioContextStub {
  state = 'running'; currentTime = 0; sampleRate = 48000;
  destination = new Node(); sources = [];
  constructor() { context = this; }
  createBuffer(channels, size, rate) { return { duration: size / rate, copyToChannel() {} }; }
  createGain() { return new Node(); }
  createBiquadFilter() { return new Node(); }
  createStereoPanner() { return new Node(); }
  createDynamicsCompressor() { return new Node(); }
  createConvolver() { return new Node(); }
  createBufferSource() { const source = new Source(); this.sources.push(source); return source; }
  createOscillator() { return this.createBufferSource(); }
  async resume() { this.state = 'running'; }
  async suspend() { this.state = 'suspended'; }
  async close() { this.state = 'closed'; }
}
globalThis.window = { AudioContext: AudioContextStub };
globalThis.requestAnimationFrame = (callback) => queueMicrotask(callback);
const audio = await import('../src/audio.js');
const ctx = fixture();
ctx.config.sound.enabled = true;
ctx.config.sound.volume = 0.6;
ctx.config.sound.idleSeconds = 300;
ctx.fireworks = { bursts: [] };
ctx.fountains = { lights: [] };
const module = audio.create(ctx);
events.dispatchEvent(new Event('pointerdown'));
await new Promise((resolve) => setTimeout(resolve, 20));
assert.equal(ctx.audioState(), 'running');
const seaSources = context.sources.length;
ctx.fireworks.bursts.push({ time: 1, launch: 0, x: 0, y: 100, z: -380, size: 60, type: 'peony' });
module.update(0.1, 1);
assert.ok(context.sources.length > seaSources);
const sounded = context.sources.length;
wall = 300001;
module.update(0.1, 2);
assert.equal(context.state, 'suspended');
for (const source of context.sources.slice(seaSources)) {
  assert.equal(source.stops.at(-1), 0, 'idle stops previously scheduled sources');
  assert.ok(source.disconnected);
}
for (let i = 0; i < 20; i++) {
  const at = 3 + i;
  ctx.fireworks.bursts.push({ time: at, launch: at - 1, x: 0, y: 100, z: -380, size: 60, type: 'peony' });
  module.update(0.1, at);
}
assert.equal(context.sources.length, sounded, 'suspended context must not receive a backlog');
events.dispatchEvent(new Event('pointerdown'));
module.update(0.1, 22);
assert.equal(context.sources.length, sounded, 'waking must not replay missed events');
console.log('PASS idle suspension cancels queued sources and skips missed events');

ctx.fountains.lights.push({ owner: 2, time: 23, hold: 6, sound: 'pops', x: 108, z: -380 });
module.update(0.1, 23);
const sideSources = context.sources.slice(sounded);
assert.ok(sideSources.length > 4);
assert.ok(sideSources.some((source) => source.when > 3));
ctx.audio.cutGround(2);
for (const source of sideSources) {
  assert.equal(source.stops.at(-1), 0);
  assert.ok(source.disconnected);
}
console.log('PASS stopped side barges cancel their future Web Audio emissions');

ctx.fireworks.bursts.push({ time: 24, launch: 23, x: 0, y: 100, z: -380, size: 60, type: 'whirl' });
module.update(0.1, 24);
ctx.fireworks.bursts.push({ time: 25, launch: 24, x: 0, y: 100, z: -380, size: 60, type: 'crackle' });
module.update(0.1, 25);
assert.ok(context.sources.slice(sounded + sideSources.length).some((source) => !source.disconnected));
document.hidden = true;
document.dispatchEvent(new Event('visibilitychange'));
for (const source of context.sources.slice(seaSources)) assert.ok(source.disconnected);
console.log('PASS moved sound recipes work and visibility sleep cancels their sources');

document.hidden = false;
events.dispatchEvent(new Event('pointerdown'));
context.currentTime = 30;
const beforeDirected = context.sources.length;
ctx.fireworks.bursts.push({ owner: 3, time: 26, launch: 25, x: 0, y: 100, z: -380, size: 60, type: 'crackle' });
module.update(0.1, 26);
const directed = context.sources.slice(beforeDirected);
assert.ok(directed.length > 2);
context.currentTime = Math.min(...directed.map((source) => source.when)) + 0.01;
assert.ok(directed.some((source) => source.when > context.currentTime));
assert.ok(directed.some((source) => source.when <= context.currentTime));
ctx.audio.cutDirected();
for (const source of directed) {
  assert.equal(source.disconnected, source.when > context.currentTime, 'only pending directed sound is cancelled');
}
console.log('PASS director cancellation removes delayed voices and preserves sound already playing');

module.dispose(); ctx.abort.abort();
for (const source of context.sources) assert.ok(source.disconnected);
globalThis.performance = realPerformance;
console.log('4 audio regression tests passed');
