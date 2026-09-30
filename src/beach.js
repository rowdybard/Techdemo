// Beach: a sand mesh shaped by the shared terrain height. Its shader adds fine grain and
// wind ripples, a wet band that follows the swash (freshly soaked sand shines and
// mirrors the sky, then dulls as it drains), and sparse glints that flicker with the
// view angle. It reads time and surf from ctx.ocean and the sky from ctx.sky.
import * as THREE from 'three';
import { noiseGLSL, skyGLSL } from './glsl.js';
import { terrainGLSL } from './terrain.glsl.js';

const vertexShader = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vNormal;

  ${terrainGLSL}

  void main() {
    vec2 xz = position.xz;
    float e = 0.5;
    float h = terrainHeight(xz);
    vNormal = normalize(vec3(h - terrainHeight(xz + vec2(e, 0.0)), e, h - terrainHeight(xz + vec2(0.0, e))));
    vWorld = vec3(xz.x, h, xz.y);
    gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uSwash;
  uniform float uGlints;

  varying vec3 vWorld;
  varying vec3 vNormal;

  ${noiseGLSL}
  ${skyGLSL}
  ${terrainGLSL}

  void main() {
    vec2 p = vWorld.xz;
    vec3 toEye = cameraPosition - vWorld;
    float distance = length(toEye);
    vec3 view = toEye / distance;
    float near = 1.0 - smoothstep(20.0, 120.0, distance);

    // Dry sand: pale, with fine grain and faint wind ripples that fade with distance.
    float grain = valueNoise(p * 38.0) * 0.5 + valueNoise(p * 9.0) * 0.5;
    float ripple = sin(p.y * 5.5 + p.x * 0.8 + fbm(p * 0.5) * 6.0) * 0.5 + 0.5;
    vec3 albedo = vec3(0.74, 0.59, 0.42) * (0.86 + 0.18 * grain * near + 0.08 * ripple * near);
    albedo *= 0.9 + 0.2 * fbm(p * 0.05);

    // Wetness from the swash. The current sheet of water, the peak of this surge, and
    // how long ago that peak was.
    float h = vWorld.y;
    float phase = uTime * 0.42 + p.x * 0.011 + 0.9 * sin(p.x * 0.006 + 1.0);
    float cycle = fract(phase);
    float peak = uSwash * 1.15;
    float current = swashLevel(p, uTime, uSwash);
    float damp = 1.0 - smoothstep(peak - 0.02, peak + 0.22 + 0.05 * valueNoise(p * 0.7), h);
    // Shine left behind by the surge: it appears as the water arrives and fades as it
    // drains, so there is no seam where one stretch of beach runs out of step.
    float fresh = smoothstep(current - 0.01, current + 0.02, h) * (1.0 - smoothstep(peak - 0.03, peak + 0.02, h))
                * smoothstep(0.05, 0.22, cycle) * (1.0 - smoothstep(0.22, 0.95, cycle));
    float wet = max(damp * 0.75, fresh);
    albedo *= 1.0 - 0.55 * wet;

    // Twilight light: a cool fill from the whole sky and a warm, low light from the
    // afterglow side.
    vec3 n = normalize(vNormal);
    vec3 fill = skyZenith() * 1.8 + skyGradient(vec3(0.0, 0.3, 0.0)) * 0.5;
    vec3 glowDirection = normalize(vec3(uSunDirection.x, 0.12, uSunDirection.z));
    vec3 glowColor = skyGradient(normalize(vec3(uSunDirection.x, 0.02, uSunDirection.z))) * 0.42;
    vec3 color = albedo * (fill * (0.6 + 0.4 * n.y) + glowColor * max(dot(n, glowDirection), 0.0));

    // Wet sand mirrors the sky; fresh water left by the surge mirrors it most.
    vec3 r = reflect(-view, n);
    r.y = abs(r.y);
    float fresnel = 0.02 + 0.98 * pow(1.0 - clamp(dot(view, n), 0.0, 1.0), 5.0);
    color += skyGradient(r) * fresnel * (0.3 * damp + 0.55 * fresh);

    // Glints: rare grains that catch the light from a narrow range of angles.
    vec2 cell = floor(p * 26.0);
    float lucky = step(0.996, hash12(cell));
    float facing = hash13(vec3(cell, floor(dot(view, vec3(31.0, 17.0, 23.0)))));
    float glint = lucky * smoothstep(0.75, 1.0, facing) * (1.0 - smoothstep(3.0, 16.0, distance)) * uGlints;
    color += (fill * 2.5 + glowColor * 1.5) * glint * (0.35 + 0.65 * wet);

    // Distant sand fades into the haze on the horizon.
    vec3 haze = skyGradient(normalize(vec3(-view.x, 0.02, -view.z)));
    color = mix(color, haze, smoothstep(180.0, 900.0, distance) * 0.7);

    gl_FragColor = vec4(color, 1.0);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function create(ctx) {
  const { scene, config, phone } = ctx;
  const settings = config.beach;

  const uniforms = {
    ...ctx.sky.uniforms,
    uTime: ctx.ocean.uniforms.uTime,
    uSwash: ctx.ocean.uniforms.uSwash,
    uGlints: { value: settings.glints },
  };

  const [columns, rows] = phone ? settings.resolution.phone : settings.resolution.desktop;
  // From under the shallow water (seen through it) up the beach and over the dunes.
  // The vertex shader lifts every vertex to the terrain height.
  const geometry = new THREE.PlaneGeometry(1800, 380, columns, rows).rotateX(-Math.PI / 2).translate(0, 0, 150);
  geometry.deleteAttribute('normal');
  geometry.deleteAttribute('uv');

  const mesh = new THREE.Mesh(
    geometry,
    new THREE.ShaderMaterial({ name: 'Beach', uniforms, vertexShader, fragmentShader }),
  );
  mesh.frustumCulled = false;
  scene.add(mesh);

  return {
    update() {
      uniforms.uGlints.value = settings.glints;
    },

    dispose() {
      scene.remove(mesh);
      geometry.dispose();
      mesh.material.dispose();
    },
  };
}
