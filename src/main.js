import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { config as defaultConfig } from './config.js';
import { readLink } from './link.js';
import * as wind from './wind.js';
import * as sky from './sky.js';
import * as burstlights from './burstlights.js';
import * as ocean from './ocean.js';
import * as beach from './beach.js';
import * as landmarks from './landmarks.js';
import * as lighthouse from './lighthouse.js';
import * as walk from './walk.js';
import * as fireworks from './fireworks.js';
import * as fountains from './fountains.js';
import * as smoke from './smoke.js';
import * as audio from './audio.js';
import * as post from './post.js';
import * as debug from './debug.js';
import * as ui from './ui.js';
import * as director from './director.js';
import * as video from './video.js';
import * as builder from './builder.js';
import * as studio from './studio.js';
import * as gift from './gift.js';

// Update order. Modules are disposed in reverse. Each one exports
// create(ctx) and returns { update(dt, time), dispose() }.
const MODULES = [wind, sky, burstlights, ocean, beach, landmarks, lighthouse, walk, fireworks, fountains, smoke, audio, post, debug, ui, director, video, builder, studio, gift];

const DEG = Math.PI / 180;

/**
 * Starts the scene in `container` and adds the page-level Shift+R shortcut,
 * which destroys the app and builds a fresh one (the leak test in HANDOFF.md).
 */
export function start(container) {
  let app;
  try {
    app = createApp(container);
  } catch (error) {
    console.error(error);
    const notice = document.createElement('p');
    notice.className = 'notice';
    notice.textContent =
      'This scene needs WebGL. Turn on hardware acceleration in your browser settings, ' +
      'or open the page in a current version of Chrome, Safari or Firefox.';
    container.append(notice);
    return;
  }

  // This listener belongs to the page, not to any one app, so it survives every rebuild.
  addEventListener('keydown', (event) => {
    if (event.code !== 'KeyR' || !event.shiftKey || event.repeat) return;
    if (event.ctrlKey || event.metaKey || event.altKey || debug.isTyping(event)) return;
    app.destroy();
    app = createApp(container);
  });
}

/**
 * Builds the scene inside `container` and starts the render loop.
 * Returns { destroy }, which releases everything the app created.
 */
export function createApp(container, config = defaultConfig) {
  const phone = matchMedia('(pointer: coarse)').matches;
  // Remembered settings, then whatever a client link carries, before anything reads them.
  const link = readLink(config);

  const renderer = new THREE.WebGLRenderer({
    antialias: config.renderer.antialias,
    powerPreference: 'high-performance',
  });
  // Render counts are reset once per frame, so a frame drawn in several passes reports its totals.
  renderer.info.autoReset = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = config.renderer.exposure;
  const canvas = renderer.domElement;
  container.append(canvas);

  const abort = new AbortController();
  const { signal } = abort;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(config.camera.fov, 1, config.camera.near, config.camera.far);
  const controls = new OrbitControls(camera, canvas);
  setUpControls(controls, camera, config);
  if (link.embed) {
    // An embedded header holds its view, so swiping over it scrolls the client's page.
    controls.enabled = false;
    canvas.style.touchAction = 'pan-y';
  }

  // Numbers modules publish for the debug overlay. Plain fields, updated in place.
  const stats = { poolUsed: 0, poolSize: 0 };
  const ctx = { renderer, scene, camera, controls, config, container, signal, phone, stats, link };

  ctx.resize = resize;
  ctx.setCameraPreset = (name) => {
    if (ctx.walk) ctx.walk.stop();
    config.camera.preset = name;
    setUpControls(controls, camera, config);
  };
  const modules = [];
  const resizeObserver = new ResizeObserver(resize);
  let destroyed = false;
  let last = -1;
  let running = false;
  let onScreen = true;
  let viewObserver = null;
  let time = 0;
  let firstFrame = false;

  try {
    for (const module of MODULES) modules.push(module.create(ctx));
  } catch (error) {
    destroy();
    throw error;
  }

  resize();
  resizeObserver.observe(container);
  watchPixelRatio();
  document.addEventListener('visibilitychange', onVisibilityChange, { signal });
  // Render only while the tab is visible and the scene is on screen (an embedded header
  // scrolled out of view stops costing battery).
  viewObserver = new IntersectionObserver((entries) => {
    onScreen = entries[entries.length - 1].isIntersecting;
    onVisibilityChange();
  });
  viewObserver.observe(container);
  onVisibilityChange();

  function frame(now) {
    // The first frame after a start or a resume steps by zero. After that the step is
    // clamped, so a stall never fires a backlog of shells.
    const dt = last < 0 ? 0 : Math.min((now - last) / 1000, config.loop.maxDt) * config.loop.timeScale;
    last = now;
    time += dt;
    renderer.toneMappingExposure = config.renderer.exposure;

    // While walking, walk.js drives the camera and the orbit controls stand aside.
    if (controls.enabled) controls.update();
    for (let i = 0; i < modules.length; i++) modules[i].update(dt, time);

    renderer.info.reset();
    if (ctx.render) ctx.render();
    else renderer.render(scene, camera);
    if (ctx.afterRender) ctx.afterRender(); // video.js copies the frame while it's recording
    if (!firstFrame) {
      firstFrame = true;
      performance.mark('first-frame'); // load time: from opening the page to the first picture
    }
  }

  function resize() {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width === 0 || height === 0) return;

    // The quality tier caps the pixel ratio (post.js sets it).
    const cap = ctx.quality ? ctx.quality.pixelRatio : 1;
    renderer.setPixelRatio(Math.min(devicePixelRatio, cap));
    renderer.setSize(width, height, false);
    if (ctx.onResize) ctx.onResize(width, height);
    camera.aspect = width / height;
    camera.fov = fitFov(camera.aspect, config.camera);
    camera.updateProjectionMatrix();
  }

  // ResizeObserver doesn't report a pixel-ratio change, such as a window dragged to
  // another monitor, so watch for one directly.
  function watchPixelRatio() {
    matchMedia(`(resolution: ${devicePixelRatio}dppx)`).addEventListener('change', onPixelRatioChange, {
      once: true,
      signal,
    });
  }

  function onPixelRatioChange() {
    resize();
    watchPixelRatio();
  }

  function onVisibilityChange() {
    const run = !document.hidden && onScreen;
    if (run === running) return;
    running = run;
    if (run) last = -1; // the first frame back steps by zero
    renderer.setAnimationLoop(run ? frame : null);
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;

    // Teardown order from HANDOFF.md, no-leak rule 8.
    renderer.setAnimationLoop(null);
    abort.abort();
    resizeObserver.disconnect();
    if (viewObserver) viewObserver.disconnect();
    if (ctx.gui) ctx.gui.destroy();
    controls.dispose();
    for (let i = modules.length - 1; i >= 0; i--) modules[i].dispose();
    modules.length = 0;
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
  }

  return { destroy };
}

// Puts the camera at the current preset's position and applies that view's drag limits.
function setUpControls(controls, camera, config) {
  const view = config.camera.presets[config.camera.preset] || config.camera.presets.sand;
  camera.position.fromArray(view.position);
  controls.target.fromArray(view.target);
  controls.enableDamping = true;
  controls.dampingFactor = config.controls.damping;
  controls.rotateSpeed = config.controls.rotateSpeed;
  // Panning or zooming would carry the camera off the beach. Camera presets cover other views.
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.minPolarAngle = view.polar[0] * DEG;
  controls.maxPolarAngle = view.polar[1] * DEG;
  controls.minAzimuthAngle = view.azimuth[0] * DEG;
  controls.maxAzimuthAngle = view.azimuth[1] * DEG;
  controls.update();
}

// A landscape screen keeps the configured vertical fov. A narrow screen widens it until
// minHorizontalFov fits across (up to maxFov), so a phone held upright still sees the show.
function fitFov(aspect, { fov, minHorizontalFov, maxFov }) {
  const needed = (2 * Math.atan(Math.tan((minHorizontalFov * DEG) / 2) / aspect)) / DEG;
  return Math.min(maxFov, Math.max(fov, needed));
}
