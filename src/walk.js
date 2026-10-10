// Walking: WASD (or the arrow keys) walks you around the beach at eye height, following
// the sand and wading a little way into the surf; Shift runs. Dragging the mouse looks
// around. Pressing a movement key switches from the orbiting view to walking; Escape, or
// choosing a camera in the panel, switches back. A hint appears on devices with a
// keyboard and fades away.
import * as THREE from 'three';
import { terrainHeight } from './terrain.glsl.js';
import { isTyping } from './debug.js';

const EYE = 1.7; // metres above the sand
const WALK = 3.5; // metres per second
const RUN = 9;
const LOOK = 0.0032; // radians per pixel dragged
const DEEPEST = -0.9; // how far below sea level the sand can be before you stop wading
const BOUNDS = { minX: -400, maxX: 400, minZ: -60, maxZ: 180 };

const KEYS = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
};

export function create(ctx) {
  const { camera, controls, container, renderer, signal, phone } = ctx;
  const held = { forward: false, back: false, left: false, right: false, run: false };
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  let walking = false;
  let yaw = 0;
  let pitch = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let last = -1;

  const hint = document.createElement('p');
  hint.className = 'walk-hint';
  hint.textContent = phone
    ? 'Tap the sky to launch a firework'
    : 'Click the sky to launch · WASD to walk · drag to look';
  hint.hidden = ctx.link.embed;
  container.append(hint);
  const hideHint = setTimeout(() => hint.classList.add('faded'), 9000);

  function start() {
    if (walking || ctx.viewLocked) return; // the view lock (viewlock.js) holds the camera still
    walking = true;
    controls.enabled = false;
    // Carry on looking the way the orbiting camera was.
    euler.setFromQuaternion(camera.quaternion);
    yaw = euler.y;
    pitch = euler.x;
    hint.classList.add('faded');
  }

  function stop() {
    if (!walking) return;
    walking = false;
    dragging = false;
    controls.enabled = !ctx.viewLocked;
  }
  ctx.walk = { stop, get active() { return walking; } };

  addEventListener('keydown', (event) => {
    if (isTyping(event) || event.ctrlKey || event.metaKey || event.altKey || ctx.link.embed) return;
    if (event.code === 'Escape') {
      if (walking) ctx.setCameraPreset(ctx.config.camera.preset);
      return;
    }
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') held.run = true;
    const move = KEYS[event.code];
    if (!move) return;
    event.preventDefault(); // keep the arrow keys from scrolling the page
    held[move] = true;
    start();
  }, { signal });
  addEventListener('keyup', (event) => {
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') held.run = false;
    const move = KEYS[event.code];
    if (move) held[move] = false;
  }, { signal });
  // Letting go of every key when the window loses focus, so you don't keep walking.
  addEventListener('blur', () => {
    held.forward = held.back = held.left = held.right = held.run = false;
  }, { signal });

  const canvas = renderer.domElement;
  canvas.addEventListener('pointerdown', (event) => {
    if (!walking) return;
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
  }, { signal });
  addEventListener('pointermove', (event) => {
    if (!dragging) return;
    // The view follows the mouse: drag right to look right.
    yaw -= (event.clientX - lastX) * LOOK;
    pitch -= (event.clientY - lastY) * LOOK;
    pitch = Math.max(-1.3, Math.min(1.3, pitch));
    lastX = event.clientX;
    lastY = event.clientY;
  }, { signal });
  addEventListener('pointerup', () => { dragging = false; }, { signal });

  return {
    update() {
      // Real time, so slow motion slows the fireworks but not your feet.
      const now = performance.now();
      const dt = last < 0 ? 0 : Math.min((now - last) / 1000, 0.1);
      last = now;
      if (!walking) return;

      const ahead = (held.forward ? 1 : 0) - (held.back ? 1 : 0);
      const side = (held.right ? 1 : 0) - (held.left ? 1 : 0);
      if (ahead !== 0 || side !== 0) {
        forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
        right.set(Math.cos(yaw), 0, -Math.sin(yaw));
        const step = (held.run ? RUN : WALK) * dt / Math.hypot(ahead, side);
        const x = camera.position.x + (forward.x * ahead + right.x * side) * step;
        const z = camera.position.z + (forward.z * ahead + right.z * side) * step;
        // Stop at the edges of the world, and where the water gets too deep to wade.
        if (x > BOUNDS.minX && x < BOUNDS.maxX && z > BOUNDS.minZ && z < BOUNDS.maxZ && terrainHeight(x, z) > DEEPEST) {
          camera.position.x = x;
          camera.position.z = z;
        }
      }
      const ground = terrainHeight(camera.position.x, camera.position.z);
      // Ease the eye onto the new ground height so dunes don't jolt the view.
      const target = Math.max(ground, DEEPEST) + EYE;
      camera.position.y += (target - camera.position.y) * Math.min(1, dt * 10);
      euler.set(pitch, yaw, 0);
      camera.quaternion.setFromEuler(euler);
    },

    dispose() {
      stop();
      clearTimeout(hideHint);
      hint.remove();
      ctx.walk = null;
    },
  };
}
