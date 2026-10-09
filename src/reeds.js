// Frozen reeds along the near shore: tufts of dead stalks standing out of the snow at the edge of
// the ice, stiff, rimed with frost at the tips, swaying a little in the wind. They fill the lower
// corners of the shore view and give the eye something close to measure the lake by. One instanced
// mesh; each blade is handed the height of its ground when the lake is built (landHeight).
import * as THREE from 'three';
import { skyGLSL } from './glsl.js';
import { LAKE, lakeDistance, landHeight } from './lake.glsl.js';
import { burstLightGLSL } from './burstlights.js';

const SEGMENTS = 4;

const vertexShader = /* glsl */ `
  attribute vec4 aPlace;        // x, z, height, which way it leans
  attribute float aGround;      // the ground's height under it
  attribute vec4 aLook;         // sway phase, lean, thickness, a random number
  uniform float uTime;
  uniform vec2 uWind;           // m/s, x and z
  varying vec3 vWorld;
  varying float vUp;
  varying float vRandom;

  void main() {
    float ground = aGround;
    float up = position.y;                                   // 0 at the root, 1 at the tip
    float taper = (1.0 - up * 0.82) * aLook.z;
    vec2 lean = vec2(cos(aPlace.w), sin(aPlace.w)) * aLook.y * up * up * aPlace.z;
    float speed = length(uWind);
    vec2 sway = vec2(sin(uTime * 1.3 + aLook.x), cos(uTime * 1.1 + aLook.x * 1.7)) * (0.03 + 0.012 * speed) * up * up * aPlace.z;
    vec2 across = vec2(cos(aLook.x), sin(aLook.x)) * position.x * taper;   // each blade's ribbon faces its own way
    vec3 world = vec3(aPlace.x + lean.x + sway.x + across.x, ground - 0.1 + up * aPlace.z, aPlace.y + lean.y + sway.y + across.y);
    vWorld = world;
    vUp = up;
    vRandom = aLook.w;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec4 uMoon;
  varying vec3 vWorld;
  varying float vUp;
  varying float vRandom;

  ${skyGLSL}
  ${burstLightGLSL}

  void main() {
    // Dead stalks, dark ochre, white with rime toward the tips.
    vec3 stalk = mix(vec3(0.05, 0.034, 0.02), vec3(0.11, 0.08, 0.05), vRandom);
    vec3 rime = vec3(0.8, 0.86, 0.96);
    vec3 albedo = mix(stalk, rime, smoothstep(0.55, 0.95, vUp + (vRandom - 0.5) * 0.3));
    vec3 up = vec3(0.0, 1.0, 0.0);
    vec3 moonColor = vec3(0.21, 0.27, 0.44) * uMoon.w;
    vec3 fill = vec3(0.025, 0.036, 0.065) * uMoon.w + skyZenith() * 2.0;
    vec3 color = albedo * (moonColor * (0.4 + 0.6 * max(dot(up, uMoon.xyz), 0.0)) + fill + burstDiffuse(vWorld, up) * 0.22);
    gl_FragColor = vec4(color, 1.0);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// The first z, walking from the lake toward the camera's side, where the land is `out` metres
// from the water at this x (by bisection).
function bankZ(x, out) {
  let inside = LAKE.z;
  let land = 200;
  for (let i = 0; i < 40; i++) {
    const middle = (inside + land) / 2;
    if (lakeDistance(x, middle) < out) inside = middle;
    else land = middle;
  }
  return (inside + land) / 2;
}

export function create(ctx) {
  const { scene, phone } = ctx;
  const tufts = phone ? 14 : 22;
  const blades = phone ? 16 : 26;
  const total = tufts * blades;

  const place = new Float32Array(total * 4);
  const look = new Float32Array(total * 4);
  const ground = new Float32Array(total);
  let n = 0;
  for (let t = 0; t < tufts; t++) {
    // Clumps either side of the view, nearest the middle first, never right in front of the eye.
    const side = t % 2 === 0 ? -1 : 1;
    const cx = side * (3.2 + (t / tufts) * 11 + Math.random() * 3);
    const out = 0.8 + Math.random() * 3.5;
    const cz = bankZ(cx, out);
    const height = 1.2 + Math.random() * 1.3;
    for (let b = 0; b < blades; b++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * 1.1;
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r * 0.6;
      ground[n] = landHeight(x, z);
      place.set([x, z, height * (0.55 + Math.random() * 0.6), Math.random() * Math.PI * 2], n * 4);
      look.set([Math.random() * 6.28, 0.1 + Math.random() * 0.22, 0.02 + Math.random() * 0.02, Math.random()], n * 4);
      n++;
    }
  }

  // One blade, a narrow tapering ribbon of a few segments so it can bend.
  const positions = [];
  const index = [];
  for (let s = 0; s <= SEGMENTS; s++) {
    positions.push(-1, s / SEGMENTS, 0, 1, s / SEGMENTS, 0);
    if (s < SEGMENTS) {
      const a = s * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.setAttribute('aPlace', new THREE.InstancedBufferAttribute(place, 4));
  geometry.setAttribute('aGround', new THREE.InstancedBufferAttribute(ground, 1));
  geometry.setAttribute('aLook', new THREE.InstancedBufferAttribute(look, 4));
  geometry.instanceCount = total;

  const uniforms = { ...ctx.sky.uniforms, ...ctx.burstLights.uniforms, uTime: { value: 0 }, uWind: { value: new THREE.Vector2() } };
  const material = new THREE.ShaderMaterial({ name: 'Reeds', uniforms, vertexShader, fragmentShader, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false; // positions live in the shader
  scene.add(mesh); // not in the reflection: it's photographed from a point about as far from the reeds as they are tall

  return {
    update(dt, time) {
      uniforms.uTime.value = time % 600; // sin of a long running time loses precision on some phone GPUs
      uniforms.uWind.value.set(ctx.config.physics.windX, ctx.config.physics.windZ);
    },

    dispose() {
      scene.remove(mesh);
      geometry.dispose();
      material.dispose();
    },
  };
}
