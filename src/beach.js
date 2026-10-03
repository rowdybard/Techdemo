// Beach: a sand mesh shaped by the shared terrain height. Its shader adds fine grain and
// wind ripples, a wet band that follows the surf in surf.glsl.js (freshly uncovered sand
// shines and mirrors the sky, then dulls as it drains), foam that each wave leaves stuck
// to the sand and that breaks up into bubbles as it fades, and sparse glints that
// flicker with the view angle. It reads time and surf from ctx.ocean and the sky from
// ctx.sky.
import * as THREE from 'three';
import { noiseGLSL, skyGLSL } from './glsl.js';
import { terrainGLSL } from './terrain.glsl.js';
import { surfGLSL } from './surf.glsl.js';
import { burstLightGLSL } from './burstlights.js';

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
  uniform float uSurf;
  uniform float uGlints;

  varying vec3 vWorld;
  varying vec3 vNormal;

  ${noiseGLSL}
  ${skyGLSL}
  ${terrainGLSL}
  ${surfGLSL}
  ${burstLightGLSL}

  void main() {
    vec2 p = vWorld.xz;
    vec3 toEye = cameraPosition - vWorld;
    float distance = length(toEye);
    vec3 view = toEye / distance;
    float near = 1.0 - smoothstep(20.0, 120.0, distance);

    // Dry sand: pale, with fine grain and faint wind ripples that fade with distance.
    float grain = valueNoise(p * 38.0) * 0.5 + valueNoise(p * 9.0) * 0.5;
    float ripple = near > 0.0 ? sin(p.y * 5.5 + p.x * 0.8 + fbm(p * 0.5) * 6.0) * 0.5 + 0.5 : 0.5;
    vec3 albedo = vec3(0.74, 0.59, 0.42) * (0.86 + 0.18 * grain * near + 0.08 * ripple * near);
    albedo *= 0.9 + 0.2 * fbm(p * 0.05);

    // Wetness from the surf. Sand the waves reach stays damp (drying over half a minute),
    // sand the water has just left shines, and each wave leaves foam stuck to the sand.
    float s = shoreDistance(p);
    float damp = 1.0 - smoothstep(0.5, 5.5 + 1.5 * valueNoise(p * 0.3), s); // the band the surf usually reaches
    float fresh = 0.0;
    float residue = 0.0;
    float sheet = 0.0;     // the swash: a thin sheet of water over the sand, right now
    float sheetFoam = 0.0;
    float reach = 0.0;     // metres back from the sheet's leading edge
    if (s > -2.0 && s < 9.0) {
      Surf surf = surfAt(p, uTime, uSurf);
      // Its edge is a couple of pixels soft wherever it is (as in Parla's water).
      float soft = max(fwidth(s) * 1.5, 0.25);
      // Below the waterline the sea covers it, so it fades out there instead of stopping.
      sheet = smoothstep(-soft, soft, surf.edge - s) * smoothstep(-1.2, 0.2, s);
      reach = max(surf.edge - s, 0.0);
      sheetFoam = surf.foam * sheet;
      damp = max(damp, exp(-surf.dry / 25.0));
      fresh = exp(-surf.dry / 1.8) * (1.0 - sheet);
      residue = surf.residue * (1.0 - sheet);
    }
    float wet = max(damp * 0.75, fresh);
    albedo *= 1.0 - 0.55 * wet;

    // Twilight light: a cool fill from the whole sky and a warm, low light from the
    // afterglow side.
    vec3 n = normalize(vNormal);
    vec3 fill = skyZenith() * 1.8 + skyGradient(vec3(0.0, 0.3, 0.0)) * 0.5;
    vec3 glowDirection = normalize(vec3(uSunDirection.x, 0.12, uSunDirection.z));
    vec3 glowColor = skyGradient(normalize(vec3(uSunDirection.x, 0.02, uSunDirection.z))) * 0.42;
    vec3 fireworkLight = burstDiffuse(vWorld, n);
    vec3 color = albedo * (fill * (0.6 + 0.4 * n.y) + glowColor * max(dot(n, glowDirection), 0.0) + fireworkLight * 0.03);

    // Wet sand mirrors the sky; fresh water left by the surge mirrors it most.
    vec3 r = reflect(-view, n);
    r.y = abs(r.y);
    float fresnel = 0.02 + 0.98 * pow(1.0 - clamp(dot(view, n), 0.0, 1.0), 5.0);
    color += skyGradient(r) * fresnel * (0.3 * damp + 0.55 * fresh);
    // The wet band shines when a shell bursts.
    color += burstReflection(vWorld, r, 600.0) * mix(0.15, 1.0, fresnel) * (0.2 * damp + 0.7 * fresh);

    // Glints: rare grains that catch the light from a narrow range of angles.
    vec2 cell = floor(p * 26.0);
    float lucky = step(0.996, hash12(cell));
    float facing = hash13(vec3(cell, floor(dot(view, vec3(31.0, 17.0, 23.0)))));
    float glint = lucky * smoothstep(0.75, 1.0, facing) * (1.0 - smoothstep(3.0, 16.0, distance)) * uGlints;
    color += (fill * 2.5 + glowColor * 1.5 + fireworkLight * 1.2) * glint * (0.35 + 0.65 * wet);

    // The swash sheet: wet, darker sand under a film of water that mirrors the sky,
    // thickening back from its leading edge, with the foam it carries on top.
    if (sheet > 0.001) {
      vec3 film = normalize(vec3(0.0, 1.0, 0.0) + (vec3(valueNoise(p * 3.0 + uTime), 0.0, valueNoise(p * 3.0 - uTime)) - 0.5) * 0.06);
      vec3 fr = reflect(-view, film);
      fr.y = abs(fr.y);
      float filmFresnel = 0.02 + 0.98 * pow(1.0 - clamp(dot(view, film), 0.0, 1.0), 5.0);
      float depth = smoothstep(0.0, 3.0, reach);
      vec3 under = color * mix(0.7, 0.45, depth) + vec3(0.004, 0.014, 0.014) * (0.25 + 0.75 * uDusk);
      vec3 water = mix(under, skyGradient(fr), filmFresnel * 0.9);
      water += burstReflection(vWorld, fr, 500.0) * mix(0.2, 1.0, filmFresnel);
      color = mix(color, water, sheet * mix(0.55, 0.9, depth));
      float bubbles = foamPattern(p + vec2(0.0, -uTime * 0.25), sheetFoam);
      color = mix(color, FOAM_LIGHT(glowColor) * 0.9 + fireworkLight * 0.08, bubbles * 0.9 * (0.4 + 0.6 * near));
    }

    // Foam the last waves left behind: a bubbly film that breaks into bits as it fades.
    if (residue > 0.01) {
      float bubbles = foamPattern(p, residue * 0.8);
      vec3 foamLight = FOAM_LIGHT(glowColor) * 0.85 + fireworkLight * 0.08;
      color = mix(color, foamLight, bubbles * 0.85 * near);
    }

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
    ...ctx.burstLights.uniforms,
    uTime: ctx.ocean.uniforms.uTime,
    uSurf: ctx.ocean.uniforms.uSurf,
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
