// The frozen lake's surface shader: black ice with cracks and frost, and patches of open water
// that lie dark and still and mirror the bursts. One flat quad; everything is per pixel.
//
// Ice is a poor mirror up close and a good one at a grazing angle, so at the camera's height the
// far ice shines like glass while the ice at your feet is dark and a little milky. Frost and
// snow dust are matte and pale, and take the moon and the bursts as the snow banks do. Open
// water is nearly black, with the faintest ripples, so each burst draws a long bright streak
// and the sky lies in it.

import { noiseGLSL, skyGLSL } from './glsl.js';
import { lakeGLSL } from './lake.glsl.js';
import { burstLightGLSL } from './burstlights.js';
import { clockGLSL } from './clock.glsl.js';

export const iceVertex = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
  }
`;

export const iceFragment = /* glsl */ `
  uniform float uTime;
  uniform float uOpen;          // 0..1, how much of the lake is open water
  uniform vec4 uMoon;
  uniform samplerCube uEnv;     // the scenery, photographed (mirror.js)
  uniform vec3 uEnvCentre;
  uniform float uEnvRadius;
  uniform vec4 uClockBox;       // where the countdown clock hangs: x, y, z, half the quad's size
  varying vec3 vWorld;

  ${noiseGLSL}
  ${skyGLSL}
  ${lakeGLSL}
  ${burstLightGLSL}
  ${clockGLSL}

  // How open the water is here: 1 in the middle of a patch, 0 under ice, with a ragged edge
  // (the ice comes back thicker toward the shore). The open water lies where the show shows it
  // off: a bay right in front of the viewer, because a burst high over the barge is mirrored in
  // the water only a few metres from a low camera, and a channel round the barge.
  float openness(vec2 p, out float rim) {
    float field = 0.55 * fbm(p * 0.0032 + 4.0) + 0.45 * fbm(p * 0.012 + 9.0);
    float bay = 1.0 - smoothstep(0.55, 1.0, length((p - vec2(0.0, -75.0)) / vec2(340.0, 125.0)));
    float channel = 1.0 - smoothstep(0.4, 1.0, length((p - vec2(0.0, -400.0)) / vec2(260.0, 120.0)));
    float shore = smoothstep(5.0, 16.0, -lakeDistance(p));
    float level = field + 0.55 * max(bay, channel) * shore - mix(0.95, 0.3, uOpen);
    float edge = fwidth(level) * 1.2 + 0.012;
    rim = 1.0 - smoothstep(0.0, 0.05, abs(level));
    return smoothstep(-edge, edge, level) * step(0.001, uOpen);
  }

  // The tiny waves of open water: a handful of crossing ripples, as a slope.
  vec2 ripples(vec2 p, float t) {
    vec2 slope = vec2(0.0);
    slope += vec2(0.8, 0.6) * cos(dot(p, vec2(0.8, 0.6)) * 0.9 + t * 0.8);
    slope += vec2(-0.5, 0.86) * cos(dot(p, vec2(-0.5, 0.86)) * 1.7 - t * 1.1) * 0.6;
    slope += vec2(0.97, -0.25) * cos(dot(p, vec2(0.97, -0.25)) * 3.1 + t * 1.5) * 0.35;
    slope += vec2(valueNoise(p * 0.7 + t * 0.2), valueNoise(p * 0.7 - t * 0.17)) - 0.5;
    return slope * 0.012;
  }

  // The reflected world (sky and moon, land, pines, village) along ray r from point P, as the
  // photo sees it from its own centre: the ray is carried out to the sphere the scenery is
  // treated as lying on.
  vec4 scenery(vec3 P, vec3 r, float lod) {
    vec3 oc = P - uEnvCentre;
    float b = dot(oc, r);
    float disc = b * b - (dot(oc, oc) - uEnvRadius * uEnvRadius);
    vec3 dir = disc > 0.0 ? normalize(oc + r * (-b + sqrt(disc))) : r;
    return textureCubeLodEXT(uEnv, vec3(-dir.x, dir.y, dir.z), lod);
  }

  // The countdown clock, mirrored: where the reflected ray crosses the plane the clock hangs in.
  vec3 clockReflection(vec3 P, vec3 r) {
    if (uClock.y <= 0.001 || r.z > -0.02) return vec3(0.0);
    vec3 hit = P + r * ((uClockBox.z - P.z) / r.z);
    return clockLight((hit.xy - uClockBox.xy) / (uClockBox.w / 2.0));
  }

  void main() {
    vec2 p = vWorld.xz;
    vec3 toEye = cameraPosition - vWorld;
    float distance = length(toEye);
    vec3 view = toEye / distance;
    float near = 1.0 - smoothstep(15.0, 160.0, distance);

    float rim;
    float water = openness(p, rim);

    // Ice: faint undulation, long pressure cracks, frost where it has snowed on it.
    vec2 bumps = (vec2(valueNoise(p * 0.35), valueNoise(p * 0.35 + 19.0)) - 0.5) * 0.02 * (0.3 + 0.7 * near);
    vec3 crackCell = cells(p * 0.055);
    float crack = (1.0 - smoothstep(0.0, 0.035 + 0.02 * (1.0 - near), crackCell.y)) * smoothstep(0.1, 0.9, valueNoise(p * 0.02 + 3.0));
    if (near > 0.02) { // up close, a finer net of cracks too
      // Wandering cracks: the cell walls warped by noise, broken into stretches, thin.
      vec2 warped = p * 0.28 + (vec2(valueNoise(p * 0.6), valueNoise(p * 0.6 + 40.0)) - 0.5) * 1.1;
      vec3 fine = cells(warped);
      float stretch = smoothstep(0.45, 0.75, valueNoise(p * 0.17 + 8.0));
      crack = max(crack, (1.0 - smoothstep(0.0, 0.028, fine.y)) * near * 0.45 * stretch);
    }
    // Frost: blown snow in streaks along the wind, patches, a thick band along the shore.
    float blotch = smoothstep(0.58, 0.8, fbm(p * 0.018 + 13.0));
    float drift = smoothstep(0.6, 0.84, fbm(vec2(p.x * 0.006, p.y * 0.05) + 4.0));
    float shoreBand = smoothstep(4.0, 1.0, -lakeDistance(p));
    float away = smoothstep(8.0, 70.0, distance); // the ice at your feet is clear
    float frost = max(max(blotch * 0.8, drift * 0.7) * away, shoreBand);
    frost = max(frost, rim * 0.8); // the ice around a patch of water is thin, white where it is dusted

    vec2 slope = mix(bumps, ripples(p, uTime), water);
    vec3 n = normalize(vec3(-slope.x, 1.0, -slope.y));
    vec3 r = reflect(-view, n);
    r.y = abs(r.y);
    float fresnel = 0.03 + 0.97 * pow(1.0 - clamp(dot(view, n), 0.0, 1.0), 5.0);

    // Light on what lies on the surface: the moon, the cold sky, the bursts.
    vec3 up = vec3(0.0, 1.0, 0.0);
    vec3 moonColor = vec3(0.3, 0.39, 0.62) * uMoon.w;
    vec3 fill = vec3(0.035, 0.05, 0.09) * uMoon.w + skyZenith() * 2.0;
    vec3 lightOnSnow = moonColor * max(dot(up, uMoon.xyz), 0.0) + fill + burstDiffuse(vWorld, up) * 0.22;

    // Ice: dark blue-black with a little teal depth, milky where it's close and thin.
    vec3 body = mix(vec3(0.004, 0.008, 0.013), vec3(0.008, 0.02, 0.028), valueNoise(p * 0.15)) * (1.0 + 1.5 * near * (1.0 - fresnel));
    body += vec3(0.05, 0.09, 0.12) * crack * lightOnSnow * 3.0;
    vec3 dust = vec3(0.7, 0.78, 0.9) * lightOnSnow * (0.85 + 0.15 * valueNoise(p * 1.7));
    vec3 iceColor = mix(body, dust, frost * 0.85);

    // Open water: nearly black.
    vec3 waterBody = vec3(0.002, 0.006, 0.009) * (1.0 + near);
    vec3 surface = mix(iceColor, waterBody, water);

    // What they mirror. Frost doesn't mirror; clear ice does a little blurrily; water does.
    float glossy = mix((1.0 - frost) * 0.9, 1.0, water);
    vec3 mirrored = scenery(vWorld, r, mix(mix(1.6, 6.0, frost), 0.3, water)).rgb; // sky, moon, land, village
    mirrored += vec3(0.8, 0.88, 1.0) * uMoon.w * pow(max(dot(r, uMoon.xyz), 0.0), 30.0) * 0.05 * (1.0 - water);
    mirrored += clockReflection(vWorld, r) * mix(0.35, 1.0, water);
    vec3 color = surface * (1.0 - fresnel * glossy) + mirrored * fresnel * glossy;

    // The burst glints: tight streaks on water, a broad sheen on ice.
    float sharp = mix(70.0, 800.0, water);
    color += burstReflection(vWorld, r, sharp) * mix(0.1, 1.0, fresnel) * glossy * mix(0.5, 1.0, water);

    // Sparkle of frost crystals.
    vec2 cell = floor(p * 11.0);
    float lucky = step(0.993, hash12(cell)) * near * frost * (1.0 - water);
    float facing = hash13(vec3(cell, floor(dot(view, vec3(31.0, 17.0, 23.0)))));
    color += (moonColor * 3.0 + burstDiffuse(vWorld, up) * 0.4) * lucky * smoothstep(0.7, 1.0, facing);

    // Distance: the far ice melts into the haze.
    vec3 haze = skyGradient(normalize(vec3(-view.x, 0.03, -view.z))) + vec3(0.016, 0.024, 0.045) * uMoon.w;
    color = mix(color, haze, smoothstep(300.0, 2400.0, distance) * 0.4);

    gl_FragColor = vec4(color, 1.0);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
