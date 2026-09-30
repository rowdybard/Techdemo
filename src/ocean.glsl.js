// Ocean shaders. The vertex shader sums Gerstner waves with analytic normals, shrinks
// them over shallow sand and adds the swash near the shore. The fragment shader reflects
// the twilight sky, adds foam, and fades the water out at the waterline.
import { noiseGLSL, skyGLSL } from './glsl.js';
import { terrainGLSL } from './terrain.glsl.js';

export const WAVE_COUNT = 6;

export const oceanVertex = /* glsl */ `
  uniform float uTime;
  uniform float uWaveHeight;
  uniform float uChoppiness;
  uniform float uSwash;
  uniform vec4 uWaves[${WAVE_COUNT}]; // direction xy, wavelength, amplitude

  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vCrest;

  ${terrainGLSL}

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

    float nearShore = 1.0 - smoothstep(0.5, 4.0, floorDepth);
    offset.y += swashLevel(rest, uTime, uSwash) * nearShore;

    vWorld = vec3(rest.x + offset.x, offset.y, rest.y + offset.z);
    vNormal = normal;
    vCrest = offset.y / max(0.45 * uWaveHeight, 0.01);
    gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
  }
`;

export const oceanFragment = /* glsl */ `
  uniform float uTime;
  uniform float uFoam;

  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vCrest;

  ${noiseGLSL}
  ${skyGLSL}
  ${terrainGLSL}

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
    vec3 n = normalize(normalize(vNormal) + ripples(vWorld.xz, 0.09 * detail));
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

    // Foam: a lacy band where the water thins out over the sand, and streaks on crests.
    vec2 p = vWorld.xz;
    float edge = 1.0 - smoothstep(0.0, 0.1 + 0.12 * valueNoise(p * 0.2 + uTime * 0.1), water);
    float lace = fbm(p * vec2(0.6, 1.6) + vec2(0.0, -uTime * 0.35));
    float foam = edge * smoothstep(0.5, 0.75, lace + edge * 0.25);
    foam += (1.0 - smoothstep(0.0, 0.035, water)) * 0.8; // the thin bright lip of each run-up
    foam += smoothstep(0.55, 1.1, vCrest) * smoothstep(0.42, 0.68, fbm(p * 0.35 + uTime * 0.08)) * 0.8;
    foam = clamp(foam * uFoam, 0.0, 1.0) * detail;
    vec3 foamLight = skyZenith() * 2.2 + skyGradient(normalize(vec3(uSunDirection.x, 0.08, uSunDirection.z))) * 0.22;
    color = mix(color, foamLight, clamp(foam, 0.0, 1.0) * 0.85);

    // Soft waterline: the sheet of water fades out as it thins, so there is no hard edge.
    float alpha = smoothstep(0.0, 0.06, water) * mix(0.5, 0.97, smoothstep(0.05, 1.5, water));
    alpha = max(alpha, foam * smoothstep(-0.02, 0.02, water));

    gl_FragColor = vec4(color, alpha);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
