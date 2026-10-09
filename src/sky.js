// Twilight sky: afterglow on the horizon where the sun went down, a blue hour gradient
// up to the zenith, thin cloud wisps and procedural twinkling stars, all in one dome.
// three's Sky addon was tried first, but its model goes almost black once the sun is
// below the horizon, which is exactly the moment this scene lives in.
// config.sky.timeOfDay runs from 0 (late dusk) to 1 (night) and only moves uniforms.
// The sun and dusk uniforms are shared through ctx.sky so the water and sand match.
import * as THREE from 'three';
import { noiseGLSL, skyGLSL } from './glsl.js';
import { PLACES } from './places.js';

const DEG = Math.PI / 180;

const vertexShader = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vDirection = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position.z = gl_Position.w; // on the far plane, behind everything
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uStars;
  uniform float uClouds;
  uniform vec4 uMoon;           // xyz: direction, w: brightness (0 is no moon)
  varying vec3 vDirection;

  ${noiseGLSL}
  ${skyGLSL}

  // Each cell of a grid around the camera may hold one star.
  vec3 starLayer(vec3 dir, float cells, float chance) {
    vec3 cell = floor(dir * cells);
    float roll = hash13(cell);
    if (roll > chance) return vec3(0.0);
    vec3 star = normalize(cell + 0.3 + 0.4 * vec3(hash13(cell + 1.7), hash13(cell + 3.1), hash13(cell + 5.9)));
    float pixel = length(fwidth(dir));
    float glow = 1.0 - smoothstep(0.0, pixel, acos(clamp(dot(dir, star), -1.0, 1.0)));
    float magnitude = pow(hash13(cell + 9.2), 12.0);    // a few bright stars, many faint ones
    float twinkle = 0.7 + 0.3 * sin(uTime * (1.5 + 4.0 * hash13(cell + 4.4)) + roll * 60.0);
    vec3 tint = mix(vec3(0.7, 0.82, 1.0), vec3(1.0, 0.86, 0.72), hash13(cell + 7.7));
    return tint * glow * (0.02 + 2.5 * magnitude) * twinkle;
  }

  void main() {
    vec3 dir = normalize(vDirection);
    float up = max(dir.y, 0.0);
    vec3 color = skyGradient(dir);

    // Thin cloud wisps on a plane above the camera, lit underneath by the afterglow.
    float cover = 0.0;
    if (dir.y > 0.0 && uClouds > 0.0) {
      vec2 plane = dir.xz / (dir.y + 0.08);
      plane.x += uTime * 0.003;
      float wisps = fbm(plane * vec2(0.7, 2.2) + 3.0);
      cover = smoothstep(1.0 - uClouds, 1.05 - uClouds * 0.6, wisps) * smoothstep(0.0, 0.12, dir.y);
      vec3 lit = vec3(0.9, 0.34, 0.16) * (0.08 + 0.9 * pow(sunwardness(dir), 4.0) * exp(-up * 5.0)) * uDusk;
      color = mix(color, mix(skyZenith() * 0.6, lit, 0.8), cover * 0.85);
    }

    // The moon: a small bright disc in a soft halo, dimmed by cloud.
    if (uMoon.w > 0.0) {
      color += vec3(0.012, 0.02, 0.042) * uMoon.w * exp(-up * 5.0);   // moonlit haze low in the sky
      float angle = acos(clamp(dot(dir, uMoon.xyz), -1.0, 1.0));
      float disc = 1.0 - smoothstep(0.0100, 0.0122, angle);
      float halo = exp(-angle * angle / 0.004) * 0.28 + exp(-angle * 5.0) * 0.04;
      color += vec3(0.8, 0.88, 1.0) * (disc * 4.0 + halo) * uMoon.w * (1.0 - cover * 0.75);
    }

    // Stars come out as the dusk fades, hide behind clouds and thin out into the horizon haze.
    // Skipped entirely when they're off, so a GPU that draws them badly never draws them.
    float clear = uStars * (1.0 - cover);
    if (clear > 0.0) {
      color += starLayer(dir, 110.0, 0.22) * clear * smoothstep(0.02, 0.3, up) * (1.0 - 0.85 * uDusk);
      color += starLayer(dir, 260.0, 0.12) * clear * 0.7 * smoothstep(0.05, 0.4, up) * (1.0 - uDusk);
    }

    gl_FragColor = vec4(color, 1.0);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function create(ctx) {
  const { scene, config } = ctx;
  const settings = config.sky;

  const uniforms = {
    uSunDirection: { value: new THREE.Vector3() },
    uDusk: { value: 1 },
    uTime: { value: 0 },
    uStars: { value: settings.starBrightness },
    uClouds: { value: settings.cloudCoverage },
    uMoon: { value: new THREE.Vector4(0, 1, 0, 0) },
  };
  // Other shaders take these same uniform objects, so one update here reaches them all.
  ctx.sky = { uniforms };

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(10000, 48, 24),
    new THREE.ShaderMaterial({
      name: 'TwilightSky',
      uniforms,
      vertexShader,
      fragmentShader,
      side: THREE.BackSide,
      depthWrite: false,
    }),
  );
  dome.frustumCulled = false;
  dome.renderOrder = -1;
  dome.userData.mirrored = true; // the frozen lake reflects it (mirror.js)
  scene.add(dome);

  const sun = uniforms.uSunDirection.value;
  const moon = uniforms.uMoon.value;
  const MOON_AZIMUTH = -30 * DEG; // left of straight ahead, high, clear of where the shells burst
  const MOON_ELEVATION = 26 * DEG;

  return {
    update(dt, time) {
      const t = settings.timeOfDay;
      // The sun has set over the water, a little right of straight ahead.
      const elevation = (settings.duskSunElevation + (settings.nightSunElevation - settings.duskSunElevation) * t) * DEG;
      const azimuth = settings.sunAzimuth * DEG;
      sun.set(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), -Math.cos(azimuth) * Math.cos(elevation));

      uniforms.uDusk.value = 1 - THREE.MathUtils.smoothstep(t, 0, 1);
      uniforms.uTime.value = time;
      uniforms.uStars.value = settings.starBrightness;
      uniforms.uClouds.value = settings.cloudCoverage;
      const place = PLACES[config.place.environment];
      moon.set(Math.sin(MOON_AZIMUTH) * Math.cos(MOON_ELEVATION), Math.sin(MOON_ELEVATION), -Math.cos(MOON_AZIMUTH) * Math.cos(MOON_ELEVATION), place ? place.moon : 0);
    },

    dispose() {
      scene.remove(dome);
      dome.geometry.dispose();
      dome.material.dispose();
      ctx.sky = null;
    },
  };
}
