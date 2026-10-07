// Smoke shaders. Each puff is a camera-facing quad, stretched and tilted its own way,
// filled with domain-warped noise that's cut off against a soft edge, so every puff has
// its own ragged outline of lobes, holes and wisps. As a puff ages the noise keeps
// churning and the cut-off rises, so it billows and then tears apart into wisps
// instead of fading as a disc. Offsets stay small so the noise holds up on GPUs with
// low float precision (the tablet that drew stars as streaks).
import { noiseGLSL } from './glsl.js';
import { BURST_LIGHTS, burstLightGLSL } from './burstlights.js';
import { beamGLSL } from './lighthouse.glsl.js';

export const smokeVertex = /* glsl */ `
  ${burstLightGLSL}
  attribute vec4 aOrigin; // xyz, birth time
  attribute vec4 aShape; // start radius, growth, life, seed
  attribute vec4 aLook; // stretch across, stretch up, tilt, noise scale
  attribute vec4 aTrail; // a trail puff: the direction its star flew, and how far it stretches along it
  attribute vec4 aExtra; // rise (m/s, buoyant at first), glow (how strongly firework light lights it), density
  uniform float uTime;
  uniform vec3 uWindOffset; // metres the air has moved (origins are stored relative to it)
  uniform float uAmount;
  uniform vec3 uAmbient;
  uniform float uSceneLight;
  varying vec2 vUv;
  varying vec2 vNoise; // where this puff's noise starts
  varying vec3 vLight;
  varying float vAlpha;
  varying float vAge;
  varying float vTear;
  varying float vScale;
  varying float vGlow;
  varying vec3 vWorld;

  void main() {
    float age = uTime - aOrigin.w;
    float life = aShape.z;
    if (age < 0.0 || age > life || uAmount <= 0.0) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // off screen: costs nothing to draw
      return;
    }
    float seed = aShape.w;
    // Carried by the wind it met (a little slower than the air, so the origin is stored
    // minus where the air had got to at its birth), a slow drift of its own, and a gentle
    // rise as the warm smoke floats up.
    vec3 drift = vec3(sin(seed * 41.0), 0.0, cos(seed * 23.0)) * 0.6;
    // Carried by the air, which moves faster higher up (the same power law as smoke.js).
    float carry = clamp(pow(max(aOrigin.y, 2.0) / 10.0, 0.16), 0.75, 1.8);
    vec3 center = aOrigin.xyz + uWindOffset * carry + drift * age;
    // Cooled smoke hardly rises; a ground effect's warm smoke lifts a little, then levels.
    center.y += 0.1 * age + aExtra.x * 2.5 * (1.0 - exp(-age / 3.0));
    float radius = aShape.x + aShape.y * sqrt(age);

    float fadeIn = smoothstep(0.0, 1.2, age);
    float fadeOut = 1.0 - smoothstep(life * 0.55, life, age);
    // The same smoke spread over a bigger puff is thinner, so it clears as it spreads.
    vAlpha = uAmount * aExtra.z * fadeIn * fadeOut * pow(aShape.x / radius, 1.0);
    vTear = smoothstep(0.15, 1.0, age / life); // how far it has broken up

    // Lit at its middle: the sky's glow, plus every firework light nearby. Light falls
    // off quickly, so a burst lights the smoke it's in, not smoke a few hundred metres off.
    vec3 light = uAmbient;
    for (int i = 0; i < ${BURST_LIGHTS}; i++) {
      float intensity = uBurstPosition[i].w;
      if (intensity <= 0.0) continue;
      vec3 offset = uBurstPosition[i].xyz - center;
      float reach = radius + 45.0;
      light += uBurstColor[i] * intensity * uSceneLight * 0.2 * aExtra.y / (1.0 + dot(offset, offset) / (reach * reach));
    }
    vLight = light;

    // Stretched (wind shear draws it out sideways as it ages) and tilted, facing the camera.
    vec4 view = viewMatrix * vec4(center, 1.0);
    vec2 stretch = aLook.xy * vec2(1.0 + age * 0.025, 1.0);
    float angle = aLook.z;
    if (aTrail.w > 0.0) {
      // Lined up with the star's path as it looks from here, so trails read as streaks.
      vec2 along = (viewMatrix * vec4(aTrail.xyz, 0.0)).xy;
      if (dot(along, along) > 1e-4) angle = atan(along.y, along.x);
      stretch = vec2(aTrail.w * (1.0 + age * 0.02), aLook.y);
    }
    vec2 corner = mat2(cos(angle), sin(angle), -sin(angle), cos(angle)) * (position.xy * stretch);
    view.xy += corner * radius;
    gl_Position = projectionMatrix * view;
    // Where this corner is in the world (for the lighthouse beams).
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vWorld = center + (right * corner.x + up * corner.y) * radius;
    vUv = position.xy;
    vNoise = vec2(fract(seed * 7.13), fract(seed * 3.71)) * 40.0;
    vAge = age;
    vScale = aLook.w;
    vGlow = aExtra.y;
  }
`;

export const smokeFragment = /* glsl */ `
  ${noiseGLSL}
  ${beamGLSL}
  uniform int uOctaves;
  varying vec2 vUv;
  varying vec2 vNoise;
  varying vec3 vLight;
  varying float vAlpha;
  varying float vAge;
  varying float vTear;
  varying float vScale;
  varying float vGlow;
  varying vec3 vWorld;

  float billow(vec2 p) {
    float sum = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 4; i++) {
      if (i >= uOctaves) break;
      sum += amplitude * valueNoise(p);
      p = p * 2.03 + vec2(1.7, 9.2);
      amplitude *= 0.5;
    }
    return sum;
  }

  void main() {
    float r = length(vUv);
    // Nearly cleared, or outside the puff: skip the noise entirely (most of the fill cost).
    if (r > 1.0 || vAlpha < 0.003) discard;
    vec2 p = vUv * vScale + vNoise;
    float t = vAge * 0.05;
    // Warp the noise by more noise, so lobes curl into each other instead of sitting in a grid.
    vec2 warp = vec2(valueNoise(p * 0.7 + t), valueNoise(p * 0.7 + vec2(5.2, 1.3) - t)) - 0.5;
    float n = billow(p + warp * 1.8 + vec2(t, -0.6 * t));
    // Cut against a soft edge: thick in the middle, ragged lobes toward the outside,
    // and as it ages the cut rises until only wisps are left.
    float edge = smoothstep(0.2, 1.0, r);
    float d = n - edge * 0.62 - 0.1 - vTear * 0.18;
    // A wide ramp keeps the outlines soft, like smoke, not cut out like paper.
    float density = smoothstep(-0.04, 0.42, d) * (1.0 - smoothstep(0.75, 1.0, r));
    float alpha = density * vAlpha;
    if (alpha < 0.004) discard;
    // Thin edges let more light through than the dense middle. Kept under the bloom
    // threshold, so lit smoke glows softly instead of flaring.
    // Shell smoke is kept dim (it read as white blobs); smoke lit from inside by a ground
    // effect may glow brighter, still under the bloom threshold so it never flares.
    vec3 color = min(vLight * (1.15 - 0.45 * density + 0.3 * n), vec3(mix(0.4, 0.9, clamp((vGlow - 1.0) / 20.0, 0.0, 1.0))));
    // A lighthouse beam passing through lights a band across the puff, brightest when it
    // points toward you (the puff's middle plane stands in for its depth).
    if (uBeamColor.r + uBeamColor.g + uBeamColor.b > 0.0) {
      color += min(beamLight(vWorld, normalize(cameraPosition - vWorld)) * (1.2 - 0.5 * density + 0.3 * n), vec3(0.85));
    }
    gl_FragColor = vec4(color, alpha);
  }
`;
