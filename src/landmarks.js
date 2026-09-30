// Lake Michigan landmarks: a long pier running out into the water with a red lighthouse
// at its end (a lamp that blinks, a beam that sweeps), and clumps of dune grass framing
// the foreground. Built once; the panel and the Lake Michigan preset show or hide them by
// toggling visibility, which changes no shaders. The lamp also joins the firework lights,
// so it draws its own streak across the water.
import * as THREE from 'three';
import { terrainHeight, shoreDistance } from './terrain.glsl.js';

const PIER_X = -70;
const PIER_NEAR = 6; // pier starts on the sand...
const PIER_FAR = -235; // ...and ends here, under the lighthouse
const DECK = 2.2; // deck height above the water
const LAMP_Y = DECK + 17.5;

const beamVertex = /* glsl */ `
  varying float vAlong;
  void main() {
    vAlong = uv.y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const beamFragment = /* glsl */ `
  uniform float uStrength;
  varying float vAlong;
  void main() {
    // Bright at the lamp (the cone's apex, where uv.y is 1), fading into the dusk.
    float fade = pow(clamp(vAlong, 0.0, 1.0), 2.2);
    gl_FragColor = vec4(vec3(1.0, 0.86, 0.6) * fade * 0.16 * uStrength, 1.0);
  }
`;

const grassVertex = /* glsl */ `
  uniform float uTime;
  attribute float aPhase;
  varying float vTip;
  void main() {
    vTip = position.y;
    vec4 world = instanceMatrix * vec4(position, 1.0);
    // Blades sway in the breeze, more at the tip.
    world.x += sin(uTime * 1.6 + aPhase) * 0.12 * position.y;
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

  // Pier and lighthouse, dark against the afterglow.
  const pier = new THREE.Group();
  const deck = keep(new THREE.MeshBasicMaterial({ color: 0x0d0e12 }));
  const tower = keep(new THREE.MeshBasicMaterial({ color: 0x3a0d0b }));
  const trim = keep(new THREE.MeshBasicMaterial({ color: 0x16161a }));
  const length = PIER_NEAR - PIER_FAR;
  addMesh(pier, keep(new THREE.BoxGeometry(5, 0.6, length)), deck, PIER_X, DECK, PIER_NEAR - length / 2);
  const piling = keep(new THREE.BoxGeometry(0.5, 1, 0.5));
  for (let z = PIER_NEAR - 4; z > PIER_FAR; z -= 12) {
    const ground = Math.min(terrainHeight(PIER_X, z), 0) - 1;
    for (const side of [-2.2, 2.2]) {
      const post = addMesh(pier, piling, deck, PIER_X + side, (DECK + ground) / 2, z);
      post.scale.y = DECK - ground;
    }
  }
  // A handrail catches the light as a thin line.
  addMesh(pier, keep(new THREE.BoxGeometry(0.15, 0.15, length)), trim, PIER_X - 2.4, DECK + 1.1, PIER_NEAR - length / 2);
  addMesh(pier, keep(new THREE.CylinderGeometry(4.2, 4.6, 2, 20)), trim, PIER_X, DECK + 1, PIER_FAR);
  addMesh(pier, keep(new THREE.CylinderGeometry(2.2, 3, 13, 20)), tower, PIER_X, DECK + 8.5, PIER_FAR);
  addMesh(pier, keep(new THREE.CylinderGeometry(2.8, 2.8, 0.4, 20)), trim, PIER_X, DECK + 15.2, PIER_FAR);
  addMesh(pier, keep(new THREE.ConeGeometry(1.9, 1.8, 16)), tower, PIER_X, DECK + 19.4, PIER_FAR);
  const lampMaterial = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3, 1.8) }));
  addMesh(pier, keep(new THREE.SphereGeometry(1.1, 16, 10)), lampMaterial, PIER_X, LAMP_Y, PIER_FAR);

  // The sweeping beam: a long, faint additive cone that turns around the lamp.
  const beamUniforms = { uStrength: { value: 1 } };
  const beamGeometry = keep(new THREE.ConeGeometry(14, 320, 24, 1, true).rotateZ(Math.PI / 2).translate(160, 0, 0));
  const beam = new THREE.Mesh(beamGeometry, keep(new THREE.ShaderMaterial({
    name: 'LighthouseBeam',
    uniforms: beamUniforms,
    vertexShader: beamVertex,
    fragmentShader: beamFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  })));
  beam.position.set(PIER_X, LAMP_Y, PIER_FAR);
  pier.add(beam);
  scene.add(pier);

  // Dune grass: clumps on the dry sand either side of the view, drawn as one instanced mesh.
  const blade = keep(new THREE.BufferGeometry());
  blade.setAttribute('position', new THREE.Float32BufferAttribute([-0.02, 0, 0, 0.02, 0, 0, 0, 1, 0], 3));
  const clumps = phone ? 16 : 26;
  const perClump = 30;
  const phases = new Float32Array(clumps * perClump);
  const grassUniforms = {
    uTime: ctx.ocean.uniforms.uTime,
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

  // The lamp, as a light the water and sand can reflect (read by burstlights.js).
  const lamp = { x: PIER_X, y: LAMP_Y, z: PIER_FAR, r: 1, g: 0.8, b: 0.5, intensity: 0 };
  ctx.landmarks = { lamp };

  return {
    update(dt, time) {
      pier.visible = settings.pier;
      grass.visible = settings.grass;
      // A slow sweep, and a lamp that flashes every four seconds like a harbour light.
      beam.rotation.y = time * 0.9;
      const flash = 0.55 + 0.45 * Math.pow(Math.max(0, Math.sin(time * Math.PI * 0.5)), 8);
      lampMaterial.color.setRGB(4 * flash, 3 * flash, 1.8 * flash);
      beamUniforms.uStrength.value = settings.pier ? 1 : 0;
      lamp.intensity = settings.pier ? 0.22 * flash : 0;
    },

    dispose() {
      scene.remove(pier, grass);
      grass.dispose();
      for (const thing of disposables) thing.dispose();
      ctx.landmarks = null;
    },
  };
}

function addMesh(group, geometry, material, x, y, z) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  group.add(mesh);
  return mesh;
}
