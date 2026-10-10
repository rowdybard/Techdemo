// Exercise the real recorder controller without a browser, encoder, or network.
import assert from 'node:assert/strict';
import { fixture, installDOM, ElementStub } from './engine-fixtures.mjs';
installDOM();
class VideoElement extends ElementStub {
  attrs = new Map(); hidden = false;
  style = { setProperty() {} };
  append(...nodes) { this.children.push(...nodes); }
  setAttribute(name, value) { this.attrs.set(name, value); }
  removeAttribute(name) { this.attrs.delete(name); }
  getAttribute(name) { return this.attrs.get(name); }
  pause() {} load() {} focus() {} click() { this.dispatchEvent(new Event('click')); }
  async play() {}
}
const streams = [];
class Canvas extends VideoElement {
  width = 1280; height = 720;
  getContext() { return { drawImage() {}, fillText() {} }; }
  captureStream() {
    const mediaTrack = { stopped: false, stop() { this.stopped = true; } };
    const stream = { getTracks: () => [mediaTrack] };
    streams.push(stream);
    return stream;
  }
}
globalThis.HTMLCanvasElement = Canvas;
document.createElement = (tag) => tag === 'canvas' ? new Canvas() : new VideoElement();
document.body = new VideoElement();
const recorders = [];
let failStart = false;
class Recorder {
  static isTypeSupported() { return true; }
  state = 'inactive'; stopCalls = 0;
  constructor() { recorders.push(this); }
  start() { if (failStart) throw new Error('encoder failed'); this.state = 'recording'; }
  stop() { this.state = 'inactive'; this.stopCalls++; }
  complete() {
    this.ondataavailable?.({ data: new Blob([new Uint8Array(4096)]) });
    this.onstop?.();
  }
}
globalThis.MediaRecorder = Recorder;
const telemetry = [];
globalThis.window = { gtag: (...args) => telemetry.push(args) };
let shareCancelled = false;
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {
  canShare: () => true,
  async share() { if (shareCancelled) throw Object.assign(new Error(), { name: 'AbortError' }); },
} });
const realPerformance = globalThis.performance;
let wall = 0;
globalThis.performance = { now: () => wall };
const video = await import('../src/video.js');
const directorModule = await import('../src/director.js');
const { OCCASIONS } = await import('../src/occasions.js');
let returned = 0, played = 0;
function setup() {
  const ctx = fixture();
  ctx.container = new VideoElement();
  ctx.renderer.domElement.width = 1280; ctx.renderer.domElement.height = 720;
  ctx.director = { active: false, remaining: 67, stop() { this.active = false; } };
  ctx.crane = { remaining: 0 };
  let death = 0;
  ctx.fireworks = { pool: { latestDeath: () => death } };
  const panels = new Map();
  const frames = ['builder-preview'];
  ctx.navigation = {
    register(id, panel) { panels.set(id, panel); return () => panels.delete(id); },
    open(id) { frames.push(id); panels.get(id).element.hidden = false; },
    back() { panels.get(frames.at(-1))?.beforeBack?.(); frames.pop(); },
    get current() { return frames.at(-1); },
  };
  const module = video.create(ctx);
  const flow = ctx.container.children[0];
  const [pill, cancel, ready] = flow.children;
  const [title, preview, note, row, done] = ready.children;
  const [save, share, again] = row.children;
  function capture() {
    return ctx.video.capture({ watermark: false, name: 'skygreeting-newyear', returnTo: () => returned++,
      play() { played++; ctx.director.active = true; return 67; } });
  }
  function frame(time, realSeconds = time) { wall = realSeconds * 1000; module.update(0.1, time); ctx.afterRender?.(); }
  return { ctx, module, capture, frame, setDeath(value) { death = value; }, pill, cancel, ready, title, preview, note, done, save, share, again };
}

let scene = setup();
assert.ok(scene.capture());
const first = recorders.at(-1);
scene.frame(0.1, 0.1);
scene.pill.click();
assert.equal(first.state, 'recording', 'saving before five seconds is disabled');
const staleStop = first.onstop;
scene.cancel.click();
await Promise.resolve();
assert.equal(returned, 1);
assert.equal(scene.ctx.navigation.current, 'builder-preview');
assert.equal(first.state, 'inactive');
assert.ok(streams.at(-1).getTracks()[0].stopped);
assert.equal(scene.ctx.afterRender, null);
assert.equal(scene.ctx.recordingTail, false);
console.log('PASS Cancel returns immediately before five seconds');

assert.ok(scene.capture());
const second = recorders.at(-1);
staleStop();
assert.equal(second.state, 'recording');
assert.equal(scene.ready.hidden, true);
scene.frame(10, 50);
assert.equal(second.state, 'recording', 'a slow scene is not stopped at 45 wall seconds');
scene.frame(66, 120);
assert.equal(second.state, 'recording', 'New Year retains its final cues after 45 seconds');
scene.ctx.director.active = false;
scene.ctx.crane.remaining = 5;
scene.setDeath(74);
scene.frame(67, 122);
assert.equal(scene.ctx.recordingTail, true);
scene.setDeath(200); // a later unrelated report cannot extend the snapped deadline
scene.frame(74, 134);
assert.equal(second.state, 'recording');
scene.frame(74.6, 136);
assert.equal(second.state, 'inactive');
second.complete();
assert.equal(scene.ready.hidden, false);
assert.equal(scene.title.textContent, 'Your video is ready');
assert.equal(telemetry.filter(([, name]) => name === 'video_completed').length, 1);
console.log('PASS long recordings follow scene completion and a fixed actual particle/camera tail');

shareCancelled = true;
scene.share.click(); await Promise.resolve(); await Promise.resolve();
assert.equal(telemetry.filter(([, name]) => name === 'share_success').length, 0);
shareCancelled = false;
scene.share.click(); await Promise.resolve(); await Promise.resolve();
assert.equal(telemetry.filter(([, name]) => name === 'share_success').length, 1);
scene.done.click(); await Promise.resolve();
scene.ctx.video.cancel(); await Promise.resolve();
assert.equal(returned, 2, 'Done/Cancel return once per capture session');
assert.equal(played, 2, 'returning never replays the show');
scene.module.dispose(); scene.ctx.abort.abort();
console.log('PASS share success is confirmed and return callbacks do not replay or duplicate');

scene = setup();
failStart = true;
assert.equal(scene.capture(), false);
assert.ok(streams.at(-1).getTracks()[0].stopped);
assert.equal(scene.ready.hidden, false);
assert.equal(scene.again.hidden, false);
assert.equal(scene.ctx.afterRender, null);
failStart = false;
scene.again.click();
assert.equal(recorders.at(-1).state, 'recording');
assert.equal(scene.ready.hidden, true);
recorders.at(-1).onerror();
assert.ok(streams.at(-1).getTracks()[0].stopped);
assert.equal(scene.again.hidden, false);
scene.module.dispose(); scene.ctx.abort.abort();
assert.equal(telemetry.filter(([, name]) => name === 'video_completed').length, 1);
console.log('PASS encoder start/runtime errors release streams and offer retry without a completed event');

// A real director extends its deadline from the engine's returned particle lifetime.
const ctx = fixture();
let resets = 0;
ctx.crane = { reset() { resets++; } };
ctx.countdown = { stop() {} };
ctx.fireworks = { launchAt: () => 20 };
const direction = directorModule.create(ctx);
const occasion = { ...OCCASIONS.birthday, ending: [{ at: 0, shell: 'peony', x: 0, h: 100 }] };
ctx.director.play(occasion, {}, false);
direction.update(0.4, 0.4);
assert.ok(ctx.director.remaining > 19);
direction.update(0.1, 10);
assert.equal(ctx.director.active, true);
const beforeNatural = resets;
direction.update(0.1, 20.6);
assert.equal(ctx.director.active, false);
assert.equal(resets, beforeNatural, 'natural completion lets the camera settle');
ctx.director.stop();
assert.equal(resets, beforeNatural + 1, 'explicit Back/Stop restores the camera immediately');
direction.dispose();
globalThis.performance = realPerformance;
console.log('PASS director includes actual tails and distinguishes natural versus explicit stops');
console.log('5 video regression tests passed');
