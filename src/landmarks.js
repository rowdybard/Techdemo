// Lake Michigan landmarks: a long concrete pier running out into the water (the
// lighthouse at its end is lighthouse.js), and clumps of dune grass framing the
// foreground. Built once; the panel and the Lake Michigan preset show or hide them by
// toggling visibility, which changes no shaders. The pier is lit like the sand, so
// bursts light it in their colours.
import * as THREE from 'three';
import { terrainHeight, shoreDistance } from './terrain.glsl.js';
import { PIER, structureMaterial, mergeParts } from './lighthouse.js';

const PIER_X = PIER.x;
const PIER_NEAR = PIER.near; // pier starts on the sand...
const PIER_FAR = PIER.far; // ...and ends under the lighthouse
const DECK = PIER.deck; // deck height above the water

const grassVertex = /* glsl */ `
  uniform float uTime;
  uniform vec2 uWind; // m/s, x and z
  attribute float aPhase;
  varying float vTip;
  void main() {
    vTip = position.y;
    vec4 world = instanceMatrix * vec4(position, 1.0);
    // Blades lean with the wind and flutter, harder in a gust, more at the tip.
    float speed = length(uWind);
    vec2 along = speed > 0.01 ? uWind / speed : vec2(1.0, 0.0);
    float bend = min(speed * 0.025, 0.3) * position.y * position.y;
    float flutter = sin(uTime * (1.6 + speed * 0.35) + aPhase) * (0.06 + min(speed * 0.02, 0.12)) * position.y;
    world.xz += along * (bend + flutter);
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * world;
  }
`;

const grassFragment = /* glsl */ `
  uniform vec3 uBase;
  uniform vec3 uTipColor;
  varying float vTip;
  void main() {
    gl_FragColor = vec4(mix(uBase, uTipColor, vTip), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function create(ctx) {
  const { scene, config, phone } = ctx;
  const settings = config.landmarks;
  const disposables = [];
  const keep = (thing) => (disposables.push(thing), thing);

  // The pier: a concrete deck on pilings, with a handrail that catches the light.
  const pier = new THREE.Group();
  const deck = keep(structureMaterial(ctx, 0x5e5a53, 0.06, 0.8));
  const steel = keep(structureMaterial(ctx, 0x232326, 0.4, 0.6));
  const length = PIER_NEAR - PIER_FAR;
  // Deck and pilings as one mesh (one draw call).
  const concrete = [[new THREE.BoxGeometry(5, 0.6, length), PIER_X, DECK, PIER_NEAR - length / 2]];
  for (let z = PIER_NEAR - 4; z > PIER_FAR; z -= 12) {
    const ground = Math.min(terrainHeight(PIER_X, z), 0) - 1;
    for (const side of [-2.2, 2.2]) concrete.push([new THREE.BoxGeometry(0.5, DECK - ground, 0.5), PIER_X + side, (DECK + ground) / 2, z]);
  }
  addMesh(pier, keep(mergeParts(concrete)), deck, 0, 0, 0);
  addMesh(pier, keep(new THREE.BoxGeometry(0.15, 0.15, length)), steel, PIER_X - 2.4, DECK + 1.1, PIER_NEAR - length / 2);
  scene.add(pier);

  // Dune grass: clumps on the dry sand either side of the view, drawn as one instanced mesh.
  const blade = keep(new THREE.BufferGeometry());
  blade.setAttribute('position', new THREE.Float32BufferAttribute([-0.02, 0, 0, 0.02, 0, 0, 0, 1, 0], 3));
  const clumps = phone ? 16 : 26;
  const perClump = 30;
  const phases = new Float32Array(clumps * perClump);
  const grassUniforms = {
    uTime: ctx.ocean.uniforms.uTime,
    uWind: { value: new THREE.Vector2() },
    uBase: { value: new THREE.Color(0x0c0d08) },
    uTipColor: { value: new THREE.Color(0x3d3a22) },
  };
  const grass = new THREE.InstancedMesh(blade, keep(new THREE.ShaderMaterial({
    name: 'DuneGrass',
    uniforms: grassUniforms,
    vertexShader: grassVertex,
    fragmentShader: grassFragment,
    side: THREE.DoubleSide,
  })), clumps * perClump);
  const place = new THREE.Object3D();
  let n = 0;
  const [camX, , camZ] = config.camera.presets.sand.position;
  for (let c = 0; c < clumps; c++) {
    // In the foreground of the default view, to the left and right so the middle stays
    // open, and only on dry sand.
    const side = c % 2 === 0 ? -1 : 1;
    let cx = 0;
    let cz = 0;
    for (let tries = 0; tries < 20; tries++) {
      const ahead = 3 + Math.random() * 11;
      cx = camX + side * ahead * (0.35 + Math.random() * 0.5);
      cz = camZ - ahead;
      if (shoreDistance(cx, cz) > 5) break;
    }
    for (let b = 0; b < perClump; b++) {
      const x = cx + (Math.random() - 0.5) * 1.6;
      const z = cz + (Math.random() - 0.5) * 1.6;
      place.position.set(x, terrainHeight(x, z) - 0.05, z);
      place.rotation.set((Math.random() - 0.5) * 0.5, Math.random() * Math.PI, (Math.random() - 0.5) * 0.6);
      place.scale.set(1 + Math.random(), 0.45 + Math.random() * 0.6, 1);
      place.updateMatrix();
      grass.setMatrixAt(n, place.matrix);
      phases[n] = x * 0.3 + Math.random() * 0.8;
      n++;
    }
  }
  blade.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
  grass.frustumCulled = false;
  scene.add(grass);

  return {
    update() {
      pier.visible = settings.pier;
      grass.visible = settings.grass;
      grassUniforms.uWind.value.set(ctx.config.physics.windX, ctx.config.physics.windZ);
    },

    dispose() {
      scene.remove(pier, grass);
      grass.dispose();
      for (const thing of disposables) thing.dispose();
    },
  };
}

function addMesh(group, geometry, material, x, y, z) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  group.add(mesh);
  return mesh;
}
