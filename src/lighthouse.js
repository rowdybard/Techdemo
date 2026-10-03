// The lighthouse at the end of the pier (landmarks.js builds the pier): a red steel tower
// on a concrete crib, with a black gallery and an eight-sided lantern room, as on Lake
// Michigan's pier heads. Inside, a lens turns and throws two opposite beams that sweep
// the haze. Side-on a beam is a soft shaft, brightest near the lamp; when one swings
// toward you the lamp flares. The beams light any smoke they pass through (smoke.js
// reads ctx.lighthouse), and the lamp joins the firework lights, so it shines on the
// water (burstlights.js). Brightness, turning speed and colour are config.landmarks
// settings, and only ever move uniforms. Shaders are in lighthouse.glsl.js.
import * as THREE from 'three';
import { worldVertex, structureFragment, lanternFragment, glareVertex, glareFragment, shaftVertex, shaftFragment } from './lighthouse.glsl.js';

export const PIER = { x: -70, near: 6, far: -235, deck: 2.2 }; // the pier's line, and its deck height above the water
const LAMP_Y = PIER.deck + 17.15;
const LENS = 0.45; // beam radius at the lens, metres
const SPREAD = 0.045; // how much the beam widens per metre
const LENGTH = 420; // metres of beam drawn
const BOUND = 3; // the cone drawn is this many beam radii wide
// Light colours, linear RGB: an old incandescent lamp, LED white, and the red and green
// of harbour lights.
export const LIGHT_COLORS = { warm: [1, 0.78, 0.5], white: [0.86, 0.92, 1], red: [1, 0.1, 0.06], green: [0.12, 1, 0.35] };

/** A lit material for the pier and tower: albedo, sheen, grime. */
export function structureMaterial(ctx, color, sheen, grime, lamp = null) {
  return new THREE.ShaderMaterial({
    name: 'Structure',
    uniforms: {
      ...ctx.sky.uniforms,
      ...ctx.burstLights.uniforms,
      uColor: { value: new THREE.Color(color) },
      uSheen: { value: sheen },
      uGrime: { value: grime },
      uLampPosition: lamp ? lamp.uLampPosition : { value: new THREE.Vector3(0, -1000, 0) },
      uLampGlow: lamp ? lamp.uLampGlow : { value: new THREE.Color(0, 0, 0) },
    },
    vertexShader: worldVertex,
    fragmentShader: structureFragment,
  });
}

/** One geometry from many parts: [geometry, x, y, z, rotationX, rotationY]. Disposes the parts. */
export function mergeParts(parts) {
  const positions = [];
  const normals = [];
  const matrix = new THREE.Matrix4();
  const turn = new THREE.Euler();
  for (const [part, x, y, z, rx = 0, ry = 0] of parts) {
    const flat = part.index ? part.toNonIndexed() : part;
    matrix.makeRotationFromEuler(turn.set(rx, ry, 0)).setPosition(x, y, z);
    flat.applyMatrix4(matrix);
    positions.push(...flat.attributes.position.array);
    normals.push(...flat.attributes.normal.array);
    if (flat !== part) flat.dispose();
    part.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return geometry;
}

export function create(ctx) {
  const { scene, config, camera } = ctx;
  const settings = config.landmarks;
  const disposables = [];
  const keep = (thing) => (disposables.push(thing), thing);
  const { x: X, far: Z, deck: DECK } = PIER;
  const group = new THREE.Group();

  const lampPosition = new THREE.Vector3(X, LAMP_Y, Z);
  const lampGlow = new THREE.Color();
  const lampUniforms = { uLampPosition: { value: lampPosition }, uLampGlow: { value: lampGlow } };
  const add = (geometry, material) => group.add(new THREE.Mesh(keep(geometry), keep(material)));

  // Concrete crib and the red tower, tapering, with a door facing the pier.
  add(mergeParts([[new THREE.CylinderGeometry(4.4, 4.9, 2.6, 32), X, DECK - 0.2, Z]]), structureMaterial(ctx, 0x6b665e, 0.05, 1, lampUniforms));
  add(mergeParts([[new THREE.CylinderGeometry(2.2, 2.9, 13.6, 40, 1, true), X, DECK + 7.9, Z]]), structureMaterial(ctx, 0xb02215, 0.3, 1, lampUniforms));

  // Black ironwork: door, portholes, gallery and its railing, lantern frame, roof.
  const top = DECK + 18.33; // top of the glass
  const iron = [
    [new THREE.BoxGeometry(1.1, 2.1, 0.2), X, DECK + 2.15, Z + 2.8],
    [new THREE.CylinderGeometry(0.3, 0.3, 0.2, 14), X, DECK + 7.2, Z + 2.55, Math.PI / 2],
    [new THREE.CylinderGeometry(0.3, 0.3, 0.2, 14), X, DECK + 11.4, Z + 2.38, Math.PI / 2],
    [new THREE.CylinderGeometry(3.05, 2.7, 0.35, 40), X, DECK + 14.9, Z],
    [new THREE.TorusGeometry(2.95, 0.05, 4, 56), X, DECK + 16.05, Z, Math.PI / 2],
    [new THREE.TorusGeometry(2.95, 0.035, 4, 56), X, DECK + 15.55, Z, Math.PI / 2],
    [new THREE.CylinderGeometry(1.78, 1.78, 0.9, 8), X, DECK + 15.53, Z, 0, Math.PI / 8],
    [new THREE.CylinderGeometry(1.74, 1.74, 0.14, 8), X, top + 0.07, Z, 0, Math.PI / 8],
    [new THREE.SphereGeometry(1.98, 32, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.62, 1), X, top + 0.14, Z],
    [new THREE.CircleGeometry(1.98, 32), X, top + 0.14, Z, Math.PI / 2],
    [new THREE.SphereGeometry(0.3, 14, 8), X, top + 1.55, Z],
    [new THREE.CylinderGeometry(0.03, 0.03, 1.4, 5), X, top + 2.4, Z],
  ];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    iron.push([new THREE.BoxGeometry(0.07, 0.95, 0.07), X + Math.sin(a) * 2.95, DECK + 15.55, Z + Math.cos(a) * 2.95]);
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    iron.push([new THREE.BoxGeometry(0.1, 2.36, 0.1), X + Math.sin(a) * 1.64, DECK + 17.15, Z + Math.cos(a) * 1.64, 0, a]);
  }
  add(mergeParts(iron), structureMaterial(ctx, 0x1c1d20, 0.6, 0.3, lampUniforms));

  // The lantern's glass, eight flat panes around the lamp.
  const beamDir = new THREE.Vector3(1, 0, 0);
  const panes = mergeParts([[new THREE.CylinderGeometry(1.62, 1.62, 2.36, 8, 1, true), X, LAMP_Y, Z, 0, Math.PI / 8]]);
  panes.computeVertexNormals(); // flat: each pane mirrors its own patch of sky
  add(panes, new THREE.ShaderMaterial({
    name: 'LanternGlass',
    uniforms: { ...ctx.sky.uniforms, ...lampUniforms, uBeamDir: { value: beamDir } },
    vertexShader: worldVertex,
    fragmentShader: lanternFragment,
  }));

  // The glare of the lamp, a fixed angular size, flaring as a beam passes the eye.
  const glareUniforms = { uLampPosition: lampUniforms.uLampPosition, uGlareSize: { value: 0.03 }, uGlareColor: { value: new THREE.Color() } };
  const glare = new THREE.Mesh(keep(new THREE.PlaneGeometry(2, 2)), keep(new THREE.ShaderMaterial({
    name: 'LighthouseGlare',
    uniforms: glareUniforms,
    vertexShader: glareVertex,
    fragmentShader: glareFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })));
  glare.frustumCulled = false; // placed in the shader
  glare.renderOrder = 2;
  group.add(glare);

  // The beams: shared with the smoke, which they light.
  const beamColor = new THREE.Color();
  const beamUniforms = {
    uBeamOrigin: { value: lampPosition },
    uBeamDir: { value: beamDir },
    uBeamColor: { value: beamColor },
    uBeamShape: { value: new THREE.Vector2(LENS, SPREAD) },
  };
  const shaftMaterial = keep(new THREE.ShaderMaterial({
    name: 'LighthouseBeam',
    uniforms: { ...beamUniforms, uLength: { value: LENGTH }, uBound: { value: BOUND }, uHaze: { value: 0.1 } },
    vertexShader: shaftVertex,
    fragmentShader: shaftFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  }));
  // A closed cone from the lens outward (narrow end at the lamp).
  const cone = keep(new THREE.CylinderGeometry(BOUND * (LENS + SPREAD * LENGTH), BOUND * LENS, LENGTH, 32, 1, false)
    .rotateZ(-Math.PI / 2).translate(LENGTH / 2, 0, 0));
  const beams = new THREE.Group();
  beams.position.copy(lampPosition);
  for (const turn of [0, Math.PI]) {
    const shaft = new THREE.Mesh(cone, shaftMaterial);
    shaft.rotation.y = turn;
    shaft.renderOrder = 2;
    beams.add(shaft);
  }
  group.add(beams);
  scene.add(group);

  // The lamp as a light the water reflects (burstlights.js), and the beams for the smoke.
  const lamp = { x: X, y: LAMP_Y, z: Z, r: 1, g: 0.8, b: 0.5, intensity: 0 };
  ctx.lighthouse = { lamp, uniforms: beamUniforms };
  let angle = 1.2;

  return {
    update(dt) {
      const on = settings.pier;
      group.visible = on;
      const light = on ? Math.max(0, settings.light) : 0;
      beams.visible = light > 0;
      glare.visible = light > 0;
      // Turns per minute, accumulated so a change of speed doesn't jump.
      angle = (angle + dt * settings.sweep * Math.PI / 30) % (Math.PI * 2);
      beams.rotation.y = angle;
      const dx = Math.cos(angle);
      const dz = -Math.sin(angle);
      beamDir.set(dx, 0, dz);

      // How squarely a beam points at the eye: the lamp flares as one sweeps past.
      const ex = camera.position.x - X;
      const ey = camera.position.y - LAMP_Y;
      const ez = camera.position.z - Z;
      const level = Math.sqrt(ex * ex + ez * ez) || 1;
      const off = Math.acos(Math.min(1, Math.abs(ex * dx + ez * dz) / level));
      const rise = Math.atan2(ey, level);
      const flash = Math.exp(-((off / 0.085) ** 2) - (rise / 0.14) ** 2);

      const tint = LIGHT_COLORS[settings.lightColor] || LIGHT_COLORS.warm;
      const r = tint[0];
      const g = tint[1];
      const b = tint[2];
      lampGlow.setRGB(r * light, g * light, b * light);
      beamColor.setRGB(r * light, g * light, b * light);
      glareUniforms.uGlareColor.value.setRGB(r, g, b).multiplyScalar(light * (0.3 + 5 * flash));
      glareUniforms.uGlareSize.value = 0.025 + 0.06 * flash;
      shaftMaterial.uniforms.uHaze.value = 0.1 * (0.6 + 0.4 * config.sky.timeOfDay);
      lamp.r = r;
      lamp.g = g;
      lamp.b = b;
      lamp.intensity = light * (0.12 + 0.3 * flash);
    },

    dispose() {
      scene.remove(group);
      for (const thing of disposables) thing.dispose();
      ctx.lighthouse = null;
    },
  };
}
