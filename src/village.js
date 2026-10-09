// The village across the lake: chalets and a few big lodges in rows along the far shore, snow
// on every roof and light in nearly every window. One instanced mesh; each house is a box and
// a gable roof (36 triangles). The vertex shader stands each one on landHeight with a deep
// foundation, so it sits on the slope however the ground falls. Windows are drawn in the
// fragment shader as a grid on each wall, warm and bright enough that the bloom pass gives each
// a halo, and they blur into a glow of average brightness when they're smaller than a pixel
// (a phone, or a house far off), so nothing shimmers.
import * as THREE from 'three';
import { valueNoiseGLSL, skyGLSL } from './glsl.js';
import { lakeGLSL, LAKE, lakeDistance } from './lake.glsl.js';
import { burstLightGLSL } from './burstlights.js';

const CELL = [3.2, 3.5]; // metres per window, across and up

const vertexShader = /* glsl */ `
  attribute vec3 aNormal;
  attribute vec4 aFace;         // along the face 0..1, up 0..1, 1 if the face runs along the house's width, part (0 wall, 1 roof, 2 gable)
  attribute vec4 aPlace;        // x, z, turn, a random number
  attribute vec4 aSize;         // width, depth, wall height, roof height
  attribute vec4 aLook;         // wall colour (rgb), how many windows are lit
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec2 vUV;
  varying vec4 vFace;
  varying vec4 vLook;
  varying vec2 vSize;
  varying float vSeed;

  ${valueNoiseGLSL}
  ${lakeGLSL}

  void main() {
    float ground = landHeight(aPlace.xy);
    vec3 local = position;                       // x, z in -0.5..0.5, y in 0..1 (walls) or above (roof)
    float roof = aFace.w > 0.5 && aFace.w < 1.5 ? 1.0 : 0.0;
    local.x *= aSize.x * (1.0 + 0.16 * roof);    // the roof overhangs
    local.z *= aSize.y * (1.0 + 0.16 * roof);
    local.y = local.y <= 1.0 ? local.y * aSize.z : aSize.z + (local.y - 1.0) * aSize.w;
    local.y -= 2.0 * (1.0 - step(0.001, position.y)) * (1.0 - roof); // wall bottoms reach down into the ground
    float c = cos(aPlace.z);
    float s = sin(aPlace.z);
    vec3 world = vec3(aPlace.x + c * local.x + s * local.z, ground + 0.2 + local.y, aPlace.y - s * local.x + c * local.z);
    // Roof slopes lean by the real pitch of this house (their unit-space normals don't).
    vec3 nrm = roof > 0.5 ? normalize(vec3(0.0, aSize.y * 0.58, sign(aNormal.z) * aSize.w)) : aNormal;
    vNormal = vec3(c * nrm.x + s * nrm.z, nrm.y, -s * nrm.x + c * nrm.z);
    vWorld = world;
    vUV = vec2(aFace.x * (aFace.z > 0.5 ? aSize.x : aSize.y), aFace.y * aSize.z);
    vFace = aFace;
    vLook = aLook;
    vSize = vec2(aFace.z > 0.5 ? aSize.x : aSize.y, aSize.z);
    vSeed = aPlace.w;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec4 uMoon;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec2 vUV;
  varying vec4 vFace;
  varying vec4 vLook;
  varying vec2 vSize;
  varying float vSeed;

  ${valueNoiseGLSL}
  ${skyGLSL}
  ${burstLightGLSL}

  void main() {
    vec3 toEye = cameraPosition - vWorld;
    float distance = length(toEye);
    vec3 n = normalize(vNormal);
    float part = vFace.w;
    bool isRoof = part > 0.5 && part < 1.5;

    vec3 snow = vec3(0.8, 0.86, 0.96);
    vec3 albedo = isRoof ? snow * (0.8 + 0.2 * valueNoise(vWorld.xz * 0.9)) : vLook.rgb * (0.7 + 0.5 * valueNoise(vUV * 0.6 + vSeed * 40.0));
    // The eaves and the foot of each wall go dark; a drift of snow lies along the base.
    if (!isRoof) albedo = mix(albedo, snow * 0.7, smoothstep(1.4, 0.2, vFace.y * vSize.y) * 0.8);

    vec3 moonColor = vec3(0.3, 0.39, 0.62) * uMoon.w;
    vec3 fill = (vec3(0.035, 0.05, 0.09) * uMoon.w + skyZenith() * 2.0) * (0.5 + 0.5 * n.y);
    vec3 light = moonColor * max(dot(n, uMoon.xyz), 0.0) + fill + burstDiffuse(vWorld, n) * 0.22;
    vec3 color = albedo * light;
    vec3 haze = skyGradient(normalize(vec3(-toEye.x, 0.03, -toEye.z))) + vec3(0.016, 0.024, 0.045) * uMoon.w;
    color = mix(color, haze, 1.0 - exp(-distance / 3600.0));

    // Windows: a grid on the walls, a margin all round, lit at random.
    if (part < 0.5) {
      vec2 cell = vec2(${CELL[0].toFixed(1)}, ${CELL[1].toFixed(1)});
      vec2 g = vUV / cell;
      vec2 id = floor(g);
      vec2 f = fract(g);
      float fits = step(1.0, vUV.x) * step(vUV.x, vSize.x - 1.0) * step(1.2, vUV.y) * step(vUV.y, vSize.y - 0.9);
      vec2 inside = smoothstep(vec2(0.27, 0.22), vec2(0.31, 0.26), f) * (1.0 - smoothstep(vec2(0.69, 0.76), vec2(0.73, 0.8), f));
      float shape = inside.x * inside.y;
      // Too small to resolve: the average light of the whole grid.
      float footprint = max(fwidth(vUV.x), fwidth(vUV.y));
      float resolved = 1.0 - smoothstep(0.2 * cell.x, 0.5 * cell.x, footprint);
      shape = mix(0.17, shape, resolved);
      float roll = hash12(id + vSeed * 91.0 + floor(vSize.x));
      float lit = step(roll, vLook.w);
      vec3 warm = mix(vec3(1.0, 0.55, 0.22), vec3(1.0, 0.78, 0.45), hash12(id + 7.0 + vSeed * 13.0));
      warm = mix(warm, vec3(0.62, 0.78, 1.0), step(0.93, hash12(id + 3.3 + vSeed * 5.0))); // the odd cold screen-light
      float glow = mix(lit, vLook.w, 1.0 - resolved) * fits;
      color += warm * shape * glow * 2.6 * (0.75 + 0.5 * hash12(id + 1.9));
    }

    gl_FragColor = vec4(color, 1.0);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// Unit house: walls x, z in -0.5..0.5 and y 0..1; roof ridge along x at y = 2 (the shader maps
// 1..2 to the roof's height).
function houseGeometry() {
  const position = [];
  const normal = [];
  const face = [];
  const quad = (a, b, c, d, n, wide, part) => {
    // a, b, c, d around the face; u runs a to b, v runs a to d.
    for (const [p, u, v] of [[a, 0, 0], [b, 1, 0], [c, 1, 1], [a, 0, 0], [c, 1, 1], [d, 0, 1]]) {
      position.push(...p);
      normal.push(...n);
      face.push(u, v, wide, part);
    }
  };
  const tri = (a, b, c, n) => {
    for (const [p, u, v] of [[a, 0, 0], [b, 1, 0], [c, 0.5, 1]]) {
      position.push(...p);
      normal.push(...n);
      face.push(u, v, 0, 2);
    }
  };
  const h = 0.5;
  quad([-h, 0, h], [h, 0, h], [h, 1, h], [-h, 1, h], [0, 0, 1], 1, 0);   // front (toward +z, the lake)
  quad([h, 0, -h], [-h, 0, -h], [-h, 1, -h], [h, 1, -h], [0, 0, -1], 1, 0);
  quad([h, 0, h], [h, 0, -h], [h, 1, -h], [h, 1, h], [1, 0, 0], 0, 0);
  quad([-h, 0, -h], [-h, 0, h], [-h, 1, h], [-h, 1, -h], [-1, 0, 0], 0, 0);
  tri([h, 1, h], [h, 1, -h], [h, 2, 0], [1, 0, 0]);
  tri([-h, 1, -h], [-h, 1, h], [-h, 2, 0], [-1, 0, 0]);
  // Roof: two slopes meeting at the ridge. Slope normals lean out and up.
  const slope = 0.62;
  const k = 1 / Math.hypot(1, slope);
  quad([-h, 1, h], [h, 1, h], [h, 2, 0], [-h, 2, 0], [0, k, slope * k], 1, 1);
  quad([h, 1, -h], [-h, 1, -h], [-h, 2, 0], [h, 2, 0], [0, k, -slope * k], 1, 1);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('aNormal', new THREE.Float32BufferAttribute(normal, 3));
  geometry.setAttribute('aFace', new THREE.Float32BufferAttribute(face, 4));
  return geometry;
}

// The far shore's z at this x, `out` metres inland from the waterline (by bisection).
function shoreZ(x, out) {
  let inside = LAKE.z; // on the ice
  let land = LAKE.z - LAKE.halfDepth * 2;
  for (let i = 0; i < 40; i++) {
    const middle = (inside + land) / 2;
    if (lakeDistance(x, middle) < out) inside = middle;
    else land = middle;
  }
  return (inside + land) / 2;
}

const WALLS = [[0.34, 0.2, 0.13], [0.3, 0.27, 0.22], [0.42, 0.16, 0.1], [0.24, 0.26, 0.3], [0.38, 0.32, 0.2], [0.2, 0.22, 0.18]];

export function create(ctx) {
  const { scene, phone } = ctx;
  const rows = [[12, 1], [34, 0.85], [68, 0.6]]; // metres inland, and how full the row is
  const houses = [];
  for (const [out, fill] of rows) {
    let x = -520 + Math.random() * 14;
    while (x < 520) {
      const lodge = Math.random() < 0.08;
      const width = lodge ? 24 + Math.random() * 8 : 9 + Math.random() * 8;
      if (Math.random() < fill && !(phone && Math.random() < 0.25)) {
        houses.push({ x: x + width / 2, z: shoreZ(x + width / 2, out + (Math.random() - 0.5) * 8), width, lodge });
      }
      x += width + 4 + Math.random() * 16;
    }
  }

  const place = new Float32Array(houses.length * 4);
  const size = new Float32Array(houses.length * 4);
  const look = new Float32Array(houses.length * 4);
  houses.forEach((house, i) => {
    const wall = house.lodge ? 7 + Math.random() * 3 : 4.6 + Math.random() * 3.6;
    place.set([house.x, house.z, (Math.random() - 0.5) * 0.4 + 0, Math.random()], i * 4);
    size.set([house.width, house.lodge ? 12 + Math.random() * 4 : 7 + Math.random() * 4, wall, house.lodge ? 4 + Math.random() * 2 : 3 + Math.random() * 3], i * 4);
    look.set([...WALLS[Math.floor(Math.random() * WALLS.length)], 0.82 + Math.random() * 0.16], i * 4);
  });

  const unit = houseGeometry();
  const geometry = new THREE.InstancedBufferGeometry();
  for (const name in unit.attributes) geometry.setAttribute(name, unit.attributes[name]);
  geometry.setAttribute('aPlace', new THREE.InstancedBufferAttribute(place, 4));
  geometry.setAttribute('aSize', new THREE.InstancedBufferAttribute(size, 4));
  geometry.setAttribute('aLook', new THREE.InstancedBufferAttribute(look, 4));
  geometry.instanceCount = houses.length;

  const material = new THREE.ShaderMaterial({
    name: 'Village',
    uniforms: { ...ctx.sky.uniforms, ...ctx.burstLights.uniforms },
    vertexShader,
    fragmentShader,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false; // positions live in the shader
  mesh.userData.mirrored = true;
  scene.add(mesh);

  return {
    update() {},

    dispose() {
      scene.remove(mesh);
      unit.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}
