// Snow-laden pines, one instanced mesh. Each tree is a stack of drooping skirts (six tiers of
// a twelve-pointed cone, notched like branch tips) on a thin trunk, 84 triangles. A few stand on
// the near bank, framing the view, and hundreds crowd the shores and slopes beyond the lake,
// thinning out at the treeline. The vertex shader stands each tree on landHeight (lake.glsl.js),
// so the trees follow the land exactly and any that fall on the ice or above the treeline are
// simply not drawn. In the fragment shader snow settles on every upward face in broken patches,
// the rest staying near black, lit by the moon and the bursts.
import * as THREE from 'three';
import { valueNoiseGLSL, skyGLSL } from './glsl.js';
import { lakeGLSL, LAKE, ISLANDS, lakeDistance } from './lake.glsl.js';
import { burstLightGLSL } from './burstlights.js';

const TIERS = 6;
const POINTS = 12;

const vertexShader = /* glsl */ `
  attribute vec3 aNormal;
  attribute vec2 aShade;        // x: how far up its tier the point is (0 at the skirt edge), y: how far up the tree
  attribute vec4 aPlace;        // x, z, height in metres, turn
  attribute vec4 aLook;         // width relative to height, snow load, lean, a random number
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec2 vShade;
  varying float vSnow;

  ${valueNoiseGLSL}
  ${lakeGLSL}

  void main() {
    float ground = landHeight(aPlace.xy);
    // Not on the ice, and not above the treeline (which wanders with the tree).
    bool shown = ground > 0.4 && ground < 380.0 + 120.0 * aLook.w;
    float turn = aPlace.w;
    float c = cos(turn);
    float s = sin(turn);
    vec3 local = position * vec3(aLook.x, 1.0, aLook.x) * aPlace.z;
    local.xz += aLook.z * position.y * position.y * aPlace.z * vec2(0.3, -0.2);   // a slight lean
    vec3 world = vec3(aPlace.x + c * local.x + s * local.z, ground - 0.5 + local.y, aPlace.y - s * local.x + c * local.z);
    vNormal = vec3(c * aNormal.x + s * aNormal.z, aNormal.y, -s * aNormal.x + c * aNormal.z);
    vWorld = world;
    vShade = aShade;
    vSnow = aLook.y;
    gl_Position = shown ? projectionMatrix * viewMatrix * vec4(world, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec4 uMoon;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec2 vShade;
  varying float vSnow;

  ${valueNoiseGLSL}
  ${skyGLSL}
  ${burstLightGLSL}

  void main() {
    vec3 toEye = cameraPosition - vWorld;
    float distance = length(toEye);
    vec3 n = normalize(vNormal);
    float near = 1.0 - smoothstep(40.0, 400.0, distance);

    // Snow on every upward face, in patches; the skirts' undersides and edges stay dark.
    float patches = valueNoise(vWorld.xz * 1.1 + vWorld.y * 0.7) * 0.55 + valueNoise(vWorld.xz * 3.7 + vWorld.y * 2.3) * 0.45;
    float settled = smoothstep(0.26, 0.6, n.y * 0.8 + patches * 0.5 * (0.4 + 0.6 * near) + vShade.x * 0.35 + vSnow * 0.5 - 0.12);
    vec3 needles = vec3(0.012, 0.026, 0.022) * (0.6 + 0.8 * patches);
    vec3 snow = vec3(0.8, 0.86, 0.96);
    vec3 albedo = mix(needles, snow, settled);

    vec3 moonColor = vec3(0.3, 0.39, 0.62) * uMoon.w;
    vec3 fill = (vec3(0.035, 0.05, 0.09) * uMoon.w + skyZenith() * 2.0) * (0.5 + 0.5 * n.y) * (0.45 + 0.55 * vShade.x);
    vec3 light = moonColor * max(dot(n, uMoon.xyz), 0.0) + fill + burstDiffuse(vWorld, n) * 0.22;
    vec3 color = albedo * light;

    vec3 haze = skyGradient(normalize(vec3(-toEye.x, 0.03, -toEye.z))) + vec3(0.016, 0.024, 0.045) * uMoon.w;
    color = mix(color, haze, 1.0 - exp(-distance / 3600.0));

    gl_FragColor = vec4(color, 1.0);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// One pine, 1 m tall and about 0.7 m across at the base, as flat-shaded triangles.
function pineGeometry() {
  const position = [];
  const normal = [];
  const shade = [];
  const triangle = (a, b, c, ya, yb, yc) => {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    for (const [p, y] of [[a, ya], [b, yb], [c, yc]]) {
      position.push(p.x, p.y, p.z);
      normal.push(n.x, n.y, n.z);
      shade.push(y, p.y);
    }
  };
  for (let tier = 0; tier < TIERS; tier++) {
    const up = tier / TIERS;
    const bottom = 0.1 + 0.8 * up * 0.95;
    const top = bottom + 0.31 - 0.04 * up;
    const radius = 0.36 * (1 - up * 0.82);
    const turn = tier * 0.9;
    const apex = new THREE.Vector3(0, top, 0);
    const ring = [];
    for (let k = 0; k < POINTS; k++) {
      const tip = k % 2 === 0;
      const a = turn + (k / POINTS) * Math.PI * 2;
      const r = radius * (tip ? 1 : 0.7);
      ring.push(new THREE.Vector3(Math.cos(a) * r, bottom - (tip ? 0.03 : -0.012), Math.sin(a) * r));
    }
    for (let k = 0; k < POINTS; k++) triangle(apex, ring[(k + 1) % POINTS], ring[k], 1, 0, 0);
  }
  // A thin trunk, so a gap between skirts isn't empty.
  const trunk = 6;
  for (let k = 0; k < trunk; k++) {
    const a0 = (k / trunk) * Math.PI * 2;
    const a1 = ((k + 1) / trunk) * Math.PI * 2;
    const p = (a, y, r) => new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
    triangle(p(a0, 0, 0.03), p(a1, 0, 0.03), p(a1, 0.45, 0.018), 0, 0, 1);
    triangle(p(a0, 0, 0.03), p(a1, 0.45, 0.018), p(a0, 0.45, 0.018), 0, 1, 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('aNormal', new THREE.Float32BufferAttribute(normal, 3));
  geometry.setAttribute('aShade', new THREE.Float32BufferAttribute(shade, 2));
  return geometry;
}

export function create(ctx) {
  const { scene, phone } = ctx;
  const forest = phone ? 700 : 1600;
  const islands = ISLANDS.length * (phone ? 8 : 14); // pines on each island
  const bank = 20; // pines on the near bank, either side of the view

  const total = forest + islands + bank;
  const place = new Float32Array(total * 4);
  const look = new Float32Array(total * 4);
  let n = 0;
  const add = (x, z, height, snow) => {
    place.set([x, z, height, Math.random() * Math.PI * 2], n * 4);
    look.set([0.55 + Math.random() * 0.25, snow, (Math.random() - 0.5) * 0.8, Math.random()], n * 4);
    n++;
  };

  // The forest: round the lake, thickest at the shore, mostly on the far side where the view is.
  while (n < forest) {
    const far = Math.random() < 0.72;
    const angle = far ? Math.PI * (1.12 + Math.random() * 0.76) : Math.random() * Math.PI * 2; // 1.12 pi..1.88 pi faces the camera, across the lake
    const out = 35 + Math.pow(Math.random(), 1.5) * 1000;
    const x = LAKE.x + Math.cos(angle) * (LAKE.halfWidth + out);
    const z = LAKE.z + Math.sin(angle) * (LAKE.halfDepth + out);
    const shore = lakeDistance(x, z);
    if (shore < 20 || (shore < 80 && z < LAKE.z && Math.abs(x) < 580)) continue; // the village stands on that shelf
    add(x, z, 17 + Math.random() * 13, Math.random());
  }
  // The islands: a stand of pines on each, tallest at the middle.
  for (const [ix, iz, radius] of ISLANDS) {
    for (let k = 0; k < islands / ISLANDS.length; k++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * radius * 0.55;
      add(ix + Math.cos(a) * r, iz + Math.sin(a) * r, 11 + (1 - r / radius) * 9 + Math.random() * 4, 0.5 + Math.random() * 0.5);
    }
  }
  // The near bank: big pines at the edges of the view, never in the middle of it.
  while (n < total) {
    const side = n % 2 === 0 ? -1 : 1;
    const x = side * (14 + Math.random() * 70);
    const z = 8 + Math.random() * 60 - (Math.abs(x) > 40 ? 12 : 0);
    if (lakeDistance(x, z) < 6) continue;
    add(x, z, 11 + Math.random() * 9, 0.4 + Math.random() * 0.6);
  }

  const geometry = pineGeometry();
  const instanced = new THREE.InstancedBufferGeometry();
  instanced.index = geometry.index;
  for (const name in geometry.attributes) instanced.setAttribute(name, geometry.attributes[name]);
  instanced.setAttribute('aPlace', new THREE.InstancedBufferAttribute(place, 4));
  instanced.setAttribute('aLook', new THREE.InstancedBufferAttribute(look, 4));
  instanced.instanceCount = total;

  const material = new THREE.ShaderMaterial({
    name: 'Pines',
    uniforms: { ...ctx.sky.uniforms, ...ctx.burstLights.uniforms },
    vertexShader,
    fragmentShader,
  });
  const mesh = new THREE.Mesh(instanced, material);
  mesh.frustumCulled = false; // positions live in the shader
  mesh.userData.mirrored = true; // part of what the ice reflects (mirror.js)
  scene.add(mesh);

  return {
    update() {},

    dispose() {
      scene.remove(mesh);
      geometry.dispose();
      instanced.dispose();
      material.dispose();
    },
  };
}
