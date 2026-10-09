// The countdown clock: a dial of light, bigger than a house, hanging in the sky over the barge,
// counting down to a zero that the director chooses (director.js: a { countdown } cue). Drawn by
// one additive quad using the picture in clock.glsl.js; the water mirrors the same picture (the
// shared `uniforms` go into the lake shader), and the clock lights the scene a little, like a
// burst, through `lamp` (burstlights.js). Nothing is drawn, and nothing costs anything, until a
// countdown starts, and the clock is gone a few seconds after zero.
import * as THREE from 'three';
import { clockGLSL } from './clock.glsl.js';

const RADIUS = 78; // metres, the dial's
const CENTRE = [0, 132, -380]; // over the barge, high enough to clear the mountains
const AFTER = 3.2; // seconds the clock's last light lingers after zero

const vertexShader = /* glsl */ `
  varying vec2 vUV;
  void main() {
    vUV = position.xy / ${RADIUS.toFixed(1)};
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  varying vec2 vUV;
  ${clockGLSL}
  void main() {
    gl_FragColor = vec4(clockLight(vUV), 1.0);
  }
`;

export function create(ctx) {
  const { scene } = ctx;

  // x seconds to zero, y fade-in, z seconds since zero, w brightness; and where the dial is.
  const uniforms = {
    uClock: { value: new THREE.Vector4(100, 0, 0, 1) },
    uClockBox: { value: new THREE.Vector4(CENTRE[0], CENTRE[1], CENTRE[2], RADIUS * 2) }, // half the quad's size
  };
  const lamp = { x: CENTRE[0], y: CENTRE[1], z: CENTRE[2], r: 1, g: 0.72, b: 0.36, intensity: 0 };
  let zeroAt = NaN;
  let length = 10; // the countdown's length when it started, to time the fade-in
  let active = false;
  let last = 0;
  let cheer = 0;

  const size = RADIUS * 4; // room for the ring that leaves the dial at zero
  const geometry = new THREE.PlaneGeometry(size, size);
  geometry.deleteAttribute('normal');
  geometry.deleteAttribute('uv');
  const mesh = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
    name: 'Countdown',
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }));
  mesh.position.set(...CENTRE);
  mesh.renderOrder = 3; // over the smoke and the snow, with the sparks
  mesh.visible = false;
  scene.add(mesh);

  function end() {
    active = false;
    mesh.visible = false;
    lamp.intensity = 0;
    uniforms.uClock.value.set(100, 0, 0, 1);
  }

  const clock = {
    uniforms,
    lamp,
    get active() { return active; },
    /** How much the world is celebrating, 1 at zero fading over the next ten seconds (the village lights up). */
    get cheer() { return cheer; },
    /** Starts counting down to `at` (scene seconds). */
    start(at) {
      zeroAt = at;
      length = Math.max(at - last, 1);
      active = true;
    },
    stop() {
      end();
      cheer = 0;
    },
    /** Seconds until zero (negative after it), for the sounds. */
    remaining: (time) => zeroAt - time,
  };
  ctx.countdown = clock;

  return {
    update(dt, time) {
      last = time;
      cheer *= Math.exp(-dt * 0.2);
      if (!active) return;
      const rem = zeroAt - time;
      if (rem <= 0) cheer = Math.max(cheer, 1);
      if (rem < -AFTER) {
        end();
        return;
      }
      const since = Math.max(-rem, 0);
      const intro = THREE.MathUtils.smoothstep(length - rem, 0, 1);
      mesh.visible = true;
      uniforms.uClock.value.set(rem, intro, since, 1);
      // The dial's light on the snow: steady, rising as zero nears, a flash at zero.
      lamp.intensity = intro * Math.exp(-since * 1.6) * (0.45 + 0.4 * Math.max(0, 1 - rem / 10) + 2 * Math.exp(-since * 5) * (since > 0 ? 1 : 0));
    },

    dispose() {
      scene.remove(mesh);
      geometry.dispose();
      mesh.material.dispose();
      ctx.countdown = null;
    },
  };
}
