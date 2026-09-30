// Ocean shaders. The vertex shader sums Gerstner waves with analytic normals, shrinks
// them over shallow sand, and adds the breaking surf and swash from surf.glsl.js near
// the shore. The fragment shader reflects the twilight sky, draws bubbly foam, and fades
// the water out at the waterline.
import { noiseGLSL, skyGLSL } from './glsl.js';
import { terrainGLSL } from './terrain.glsl.js';
import { surfGLSL } from './surf.glsl.js';
import { burstLightGLSL } from './burstlights.js';

export const WAVE_COUNT = 6;

export const oceanVertex = /* glsl */ `
  uniform float uTime;
  uniform float uWaveHeight;
  uniform float uChoppiness;
  uniform float uSurf;
  uniform vec4 uWaves[${WAVE_COUNT}]; // direction xy, wavelength, amplitude

  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vCrest;
  varying float vFoam;

  ${terrainGLSL}
  ${surfGLSL}

  void main() {
    vec2 rest = position.xz; // the grid is built in world space
    float floorDepth = -terrainHeight(rest);
    float distance = length(rest - cameraPosition.xz);

    // Waves die out over shallow sand and far away, where the grid is too coarse for them.
    float shoal = smoothstep(0.2, 5.0, floorDepth) * (1.0 - smoothstep(700.0, 2800.0, distance));
    // Crests sharpen as they reach the shallows.
    float steep = uChoppiness * (1.0 + 0.9 * (1.0 - smoothstep(1.0, 5.0, floorDepth)));

    vec3 offset = vec3(0.0);
    vec3 normal = vec3(0.0, 1.0, 0.0);
    for (int i = 0; i < ${WAVE_COUNT}; i++) {
      vec2 dir = uWaves[i].xy;
      float k = 6.2831853 / uWaves[i].z;
      float amplitude = uWaves[i].w * uWaveHeight * shoal;
      float phase = k * dot(dir, rest) - sqrt(9.81 * k) * uTime;
      float s = sin(phase);
      float c = cos(phase);
      offset.xz += steep * amplitude * dir * c;
      offset.y += amplitude * s;
      normal.xz -= dir * k * amplitude * c;
      normal.y -= steep * k * amplitude * s;
    }

    // Breaking surf near the beach, and the thin sheet of swash it pushes up the sand.
    // Its slope tilts the normal, found by sampling the surf a little to each side.
    Surf surf = surfAt(rest, uTime, uSurf);
    if (surf.lift > 0.0) {
      float e = 0.35;
      normal.x -= (surfAt(rest + vec2(e, 0.0), uTime, uSurf).lift - surf.lift) / e;
      normal.z -= (surfAt(rest + vec2(0.0, e), uTime, uSurf).lift - surf.lift) / e;
    }
    float surface = max(offset.y + surf.lift, swashSurface(rest, surf.edge));

    vWorld = vec3(rest.x + offset.x, surface, rest.y + offset.z);
    vNormal = normal;
    vCrest = offset.y / max(0.45 * uWaveHeight, 0.01);
    vFoam = surf.foam;
    gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
  }
`;

export const oceanFragment = /* glsl */ `
  uniform float uTime;
  uniform float uFoam;

  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vCrest;
  varying float vFoam;

  ${noiseGLSL}
  ${skyGLSL}
  ${terrainGLSL}
  ${burstLightGLSL}

  // Small ripples on top of the waves, as a normal perturbation.
  vec3 ripples(vec2 p, float strength) {
    vec2 a = p * 0.8 + vec2(0.0, uTime * 0.55);
    vec2 b = p * 2.3 + vec2(uTime * 0.3, uTime * 0.9);
    float e = 0.12;
    float h = valueNoise(a) + 0.5 * valueNoise(b);
    float hx = valueNoise(a + vec2(e, 0.0)) + 0.5 * valueNoise(b + vec2(e, 0.0));
    float hz = valueNoise(a + vec2(0.0, e)) + 0.5 * valueNoise(b + vec2(0.0, e));
    return vec3(h - hx, 0.0, h - hz) / e * strength;
  }

  void main() {
    float water = vWorld.y - terrainHeight(vWorld.xz); // how deep the water is here
    if (water < -0.02) discard;                          // under dry sand

    vec3 toEye = cameraPosition - vWorld;
    float distance = length(toEye);
    vec3 view = toEye / distance;

    float detail = 1.0 - smoothstep(25.0, 260.0, distance);
    vec3 n = normalize(vNormal);
    if (detail > 0.0) n = normalize(n + ripples(vWorld.xz, 0.09 * detail)); // no ripples where they'd be sub-pixel
    // Far off, the waves are smaller than a pixel: settle toward a calm, glossy surface.
    n = normalize(mix(n, vec3(0.0, 1.0, 0.0), 0.7 * smoothstep(150.0, 1500.0, distance)));

    // Reflection of the sky. A ray that would dip below the horizon reflects the sky too.
    vec3 r = reflect(-view, n);
    r.y = abs(r.y);
    float fresnel = 0.02 + 0.98 * pow(1.0 - clamp(dot(view, n), 0.0, 1.0), 5.0);
    vec3 reflection = skyGradient(r);

    // Light scattered inside the water, a little greener where it is shallow.
    float light = 0.25 + 0.75 * uDusk;
    vec3 body = mix(vec3(0.02, 0.06, 0.055), vec3(0.003, 0.009, 0.016), smoothstep(0.5, 6.0, water)) * light;
    vec3 color = mix(body, reflection, fresnel);
    // Fireworks mirrored in the waves: every facet tilted the right way glints, which
    // draws each burst out into a long, broken streak across the water.
    color += burstReflection(vWorld, r, 420.0) * mix(0.25, 1.0, fresnel) * (0.35 + 0.65 * detail);
    color += burstDiffuse(vWorld, n) * 0.004;

    // Foam: whitewater from the breaking surf and the swash (worked out per vertex), a lip
    // wherever the water thins to nothing, and a little on offshore crests. It's drawn as
    // bubbles, and only where there is any, which keeps the cost down on phones.
    vec2 p = vWorld.xz;
    float thin = 1.0 - smoothstep(0.0, 0.012, water); // only the very edge of the water
    float crest = smoothstep(0.7, 1.2, vCrest) * 0.45;
    float amount = clamp(max(max(vFoam, thin * 0.6), crest) * uFoam, 0.0, 1.0) * detail;
    float foam = 0.0;
    if (amount > 0.01) foam = foamPattern(p + vec2(0.0, -uTime * 0.3), amount);
    vec3 foamLight = FOAM_LIGHT(skyGradient(normalize(vec3(uSunDirection.x, 0.06, uSunDirection.z))) * 0.5);
    foamLight += burstDiffuse(vWorld, n) * 0.08;
    color = mix(color, foamLight, foam * 0.9);

    // Soft waterline: the sheet of water fades out as it thins, so there is no hard edge.
    float alpha = smoothstep(0.0, 0.06, water) * mix(0.5, 0.97, smoothstep(0.05, 1.5, water));
    alpha = max(alpha, foam * smoothstep(-0.02, 0.02, water));

    gl_FragColor = vec4(color, alpha);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
