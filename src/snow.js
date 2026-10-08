// Snowfall. Every flake's position is a closed-form function of time, as the fireworks' sparks
// are, so the CPU never touches a flake: one instanced draw, no per-frame allocation, nothing
// at all drawn while config.snow.amount is 0.
//
// Two layers share the draw. A near layer fills a small box in front of the camera with
// larger flakes that slide past and go soft as they near the lens (out-of-focus discs, as a
// camera sees them); a far layer fills a big box out to the barge with tiny ones, which is
// what makes the air read as deep. Each box is anchored in the world and wraps around the
// camera (a flake that leaves one side returns on the other), so walking or turning never
// drags the snow along. A flake falls at a steady speed, sways on its own slow period, and is
// carried by the wind the smoke feels (ctx.wind.offset). Flakes catch the light of every
// firework burst near them, in its colour, over a cold glow of their own.
import * as THREE from 'three';
import { BURST_LIGHTS, burstLightGLSL } from './burstlights.js';

// Boxes [width, height, depth] in metres. The near one sits ahead of the camera, the far one
// reaches out past the barge (380 m).
const NEAR = [44, 24, 64];
const FAR = [300, 100, 430];
const SWAY_PERIOD = 120; // seconds; every sway period is this divided by a whole number, so the phase wraps without a jump

const vertexShader = /* glsl */ `
  uniform float uFall;          // scene seconds
  uniform float uPhase;         // scene seconds, wrapped to the sway period
  uniform vec2 uWind;           // metres the air has moved (x, z)
  uniform vec2 uViewport;       // drawing buffer, pixels
  uniform vec3 uAmbient;        // the flakes' own cold light
  uniform float uGlow;          // how strongly bursts light them
  uniform float uDensity;       // 0..1, how many are showing (for a soft cut-off)
  uniform float uSize;

  attribute vec4 aHome;         // where in its box the flake belongs (0..1), and its layer (w)
  attribute vec4 aRandom;       // size, speed, sway period, sway reach

  varying vec2 vCorner;
  varying vec3 vColor;
  varying float vAlpha;

  ${burstLightGLSL}

  const float TAU = 6.2831853;
  const float SWAY = ${SWAY_PERIOD.toFixed(1)};

  void main() {
    bool near = aHome.w < 0.5;
    vec3 box = near ? vec3(${NEAR.map((n) => n.toFixed(1)).join(', ')}) : vec3(${FAR.map((n) => n.toFixed(1)).join(', ')});
    // The box around the camera: ahead of it for the near layer (the view is almost always
    // out to sea), all round it for the far one.
    vec3 low = near
      ? vec3(cameraPosition.x - box.x * 0.5, cameraPosition.y - 3.0, cameraPosition.z - box.z + 6.0)
      : vec3(cameraPosition.x - box.x * 0.5, -6.0, cameraPosition.z - box.z + 30.0);

    float bigness = aRandom.x;                       // 0 small .. 1 large
    float speed = mix(1.15, 0.55, bigness) * (0.9 + 0.2 * fract(aRandom.y * 7.0));
    float period = SWAY / floor(8.0 + aRandom.z * 40.0);
    float turn = TAU * fract(uPhase / period + aHome.x * 13.0);
    float reach = (0.15 + 0.5 * aRandom.w) * (0.4 + 0.6 * bigness);
    vec3 motion = vec3(
      uWind.x * 0.85 + sin(turn) * reach,
      -uFall * speed,
      uWind.y * 0.85 + cos(turn * 0.8 + aRandom.w * 6.0) * reach
    );
    vec3 world = low + mod(aHome.xyz * box + motion - low, box);

    // Faded toward every face of the box, so a flake never pops in or out.
    vec3 inside = (world - low) / box;
    vec3 edge = min(inside, 1.0 - inside);
    float fade = smoothstep(0.0, 0.1, edge.x) * smoothstep(0.0, 0.08, edge.y) * smoothstep(0.0, 0.1, edge.z);

    vec4 view = viewMatrix * vec4(world, 1.0);
    float depth = -view.z;
    if (depth < 0.4 || fade <= 0.0 || aRandom.y > uDensity) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);        // outside the clip volume: nothing is drawn
      return;
    }

    // Size on screen: a flake is a few millimetres across, so most are a pixel or less. Under a
    // pixel it stays a pixel but gets fainter in proportion (no shimmer); close to the lens it
    // swells into a soft out-of-focus disc and thins out.
    float metres = (near ? mix(0.006, 0.018, bigness * bigness) : mix(0.012, 0.03, bigness)) * uSize;
    float pixels = metres * projectionMatrix[1][1] * 0.5 * uViewport.y / depth;
    float alpha = 1.0;
    float radius = pixels;
    if (pixels < 1.0) {
      alpha = pixels * pixels;
      radius = 1.0;
    } else if (pixels > 3.0) {
      alpha = 3.0 / pixels;                           // out of focus: spread thin
      radius = min(pixels, 26.0);
    }
    radius *= 1.3;                                    // the soft edge

    // Light: a cold glow of its own, and a share of every burst near it.
    vec3 lit = uAmbient;
    for (int i = 0; i < ${BURST_LIGHTS}; i++) {
      float intensity = uBurstPosition[i].w;
      if (intensity <= 0.0) continue;
      vec3 offset = uBurstPosition[i].xyz - world;
      lit += uBurstColor[i] * intensity * uGlow / (1.0 + dot(offset, offset) / 60000.0);
    }

    vec4 clip = projectionMatrix * view;
    vec2 corner = position.xy;
    vec2 pixelsAcross = corner * radius;
    gl_Position = vec4(clip.xy + pixelsAcross / (0.5 * uViewport) * clip.w, clip.z, clip.w);
    vCorner = corner;
    vColor = lit;
    // Far flakes melt into the haze; each one is a little different in brightness.
    vAlpha = alpha * fade * (1.0 - smoothstep(180.0, 420.0, depth)) * (0.6 + 0.4 * fract(aRandom.z * 11.0));
  }
`;

const fragmentShader = /* glsl */ `
  varying vec2 vCorner;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    float r = length(vCorner);
    float soft = smoothstep(1.0, 0.25, r);
    float a = soft * vAlpha;
    if (a < 0.003) discard;
    gl_FragColor = vec4(vColor, a);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function create(ctx) {
  const { scene, config, renderer, phone } = ctx;
  const settings = config.snow;
  const total = phone ? settings.count.phone : settings.count.desktop;

  // One quad, instanced. aHome and aRandom hold the flakes' fixed random numbers.
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  const home = new Float32Array(total * 4);
  const random = new Float32Array(total * 4);
  for (let i = 0; i < total; i++) {
    home[i * 4] = Math.random();
    home[i * 4 + 1] = Math.random();
    home[i * 4 + 2] = Math.random();
    home[i * 4 + 3] = Math.random() < 0.5 ? 0 : 1; // near or far layer
    random[i * 4] = Math.random();
    // Column 1 doubles as the order flakes appear in as the density rises, so it's even.
    random[i * 4 + 1] = (i + 0.5) / total;
    random[i * 4 + 2] = Math.random();
    random[i * 4 + 3] = Math.random();
  }
  geometry.setAttribute('aHome', new THREE.InstancedBufferAttribute(home, 4));
  geometry.setAttribute('aRandom', new THREE.InstancedBufferAttribute(random, 4));
  geometry.instanceCount = total;

  const uniforms = {
    ...ctx.burstLights.uniforms,
    uFall: { value: 0 },
    uPhase: { value: 0 },
    uWind: { value: new THREE.Vector2() },
    uViewport: { value: new THREE.Vector2(1, 1) },
    uAmbient: { value: new THREE.Color() },
    uGlow: { value: settings.glow },
    uDensity: { value: 0 },
    uSize: { value: settings.size },
  };
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.ShaderMaterial({ name: 'Snow', uniforms, vertexShader, fragmentShader, transparent: true, depthWrite: false }),
  );
  mesh.frustumCulled = false; // positions live in the shader
  mesh.renderOrder = 1; // with the smoke: after the water, before the sparks
  mesh.visible = false;
  scene.add(mesh);

  // The flakes' own light, by the sky: bluish and quite dim at night, brighter in the dusk.
  const DUSK = new THREE.Color(0.5, 0.52, 0.6);
  const NIGHT = new THREE.Color(0.2, 0.24, 0.34);

  return {
    update(dt, time) {
      const amount = Math.min(1, Math.max(0, settings.amount));
      mesh.visible = amount > 0.001;
      if (!mesh.visible) return;
      uniforms.uFall.value = time;
      uniforms.uPhase.value = time % SWAY_PERIOD;
      if (ctx.wind) uniforms.uWind.value.set(ctx.wind.offset.x, ctx.wind.offset.z);
      renderer.getDrawingBufferSize(uniforms.uViewport.value);
      uniforms.uAmbient.value.copy(DUSK).lerp(NIGHT, config.sky.timeOfDay);
      uniforms.uGlow.value = settings.glow;
      uniforms.uSize.value = settings.size;
      // Light flurries use few flakes; a blizzard all of them.
      uniforms.uDensity.value = Math.min(1, amount * 1.15);
    },

    dispose() {
      scene.remove(mesh);
      geometry.dispose();
      mesh.material.dispose();
    },
  };
}
