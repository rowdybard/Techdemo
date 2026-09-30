// Twilight sky: afterglow on the horizon where the sun went down, a blue hour gradient
// up to the zenith, thin cloud wisps and procedural twinkling stars, all in one dome.
// three's Sky addon was tried first, but its model goes almost black once the sun is
// below the horizon, which is exactly the moment this scene lives in.
// config.sky.timeOfDay runs from 0 (late dusk) to 1 (night) and only moves uniforms.
import * as THREE from 'three';

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
  uniform vec3 uSunDirection;
  uniform float uDusk;       // 1 at late dusk, 0 at full night
  uniform float uTime;
  uniform float uStars;
  uniform float uClouds;
  varying vec3 vDirection;

  float hash(vec3 p) {
    p = fract(p * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash(vec3(i, 0.0));
    float b = hash(vec3(i + vec2(1.0, 0.0), 0.0));
    float c = hash(vec3(i + vec2(0.0, 1.0), 0.0));
    float d = hash(vec3(i + vec2(1.0, 1.0), 0.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  float fbm(vec2 p) {
    float sum = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 5; i++) {
      sum += amplitude * noise(p);
      p = p * 2.03 + 17.1;
      amplitude *= 0.5;
    }
    return sum;
  }

  // Each cell of a grid around the camera may hold one star.
  vec3 starLayer(vec3 dir, float cells, float chance) {
    vec3 cell = floor(dir * cells);
    float roll = hash(cell);
    if (roll > chance) return vec3(0.0);
    vec3 star = normalize(cell + 0.3 + 0.4 * vec3(hash(cell + 1.7), hash(cell + 3.1), hash(cell + 5.9)));
    float pixel = length(fwidth(dir));
    float glow = 1.0 - smoothstep(0.0, pixel, acos(clamp(dot(dir, star), -1.0, 1.0)));
    float magnitude = pow(hash(cell + 9.2), 12.0);    // a few bright stars, many faint ones
    float twinkle = 0.7 + 0.3 * sin(uTime * (1.5 + 4.0 * hash(cell + 4.4)) + roll * 60.0);
    vec3 tint = mix(vec3(0.7, 0.82, 1.0), vec3(1.0, 0.86, 0.72), hash(cell + 7.7));
    return tint * glow * (0.02 + 2.5 * magnitude) * twinkle;
  }

  void main() {
    vec3 dir = normalize(vDirection);
    float up = max(dir.y, 0.0);
    vec2 flatDir = normalize(dir.xz + 1e-5);
    float sunward = 0.5 + 0.5 * dot(flatDir, normalize(uSunDirection.xz + 1e-5)); // 1 toward the sunset
    float dusk = uDusk;

    // Blue hour gradient from the horizon to the zenith.
    vec3 zenith = mix(vec3(0.0025, 0.0035, 0.009), vec3(0.012, 0.022, 0.06), dusk);
    vec3 horizon = mix(vec3(0.008, 0.011, 0.022), vec3(0.075, 0.07, 0.14), dusk);
    vec3 color = mix(horizon, zenith, pow(up, 0.5));

    // Afterglow: a warm band low on the horizon, strongest toward where the sun set.
    float band = exp(-up * 9.0);
    float glow = pow(sunward, 6.0) * band * dusk * dusk;
    color += vec3(1.2, 0.38, 0.08) * glow * 1.1;
    color += vec3(0.55, 0.16, 0.22) * pow(sunward, 2.0) * exp(-up * 4.0) * dusk * dusk * 0.09;
    // A faint pink belt opposite the sunset.
    color += vec3(0.12, 0.05, 0.09) * pow(1.0 - sunward, 2.0) * exp(-up * 12.0) * dusk * 0.4;

    // Thin cloud wisps on a plane above the camera, lit underneath by the afterglow.
    float cover = 0.0;
    if (dir.y > 0.0 && uClouds > 0.0) {
      vec2 plane = dir.xz / (dir.y + 0.08);
      plane.x += uTime * 0.003;
      float wisps = fbm(plane * vec2(0.7, 2.2) + 3.0);
      cover = smoothstep(1.0 - uClouds, 1.05 - uClouds * 0.6, wisps) * smoothstep(0.0, 0.12, dir.y);
      vec3 lit = vec3(0.9, 0.34, 0.16) * (0.08 + 0.9 * pow(sunward, 4.0) * exp(-up * 5.0)) * dusk;
      color = mix(color, mix(zenith * 0.6, lit, 0.8), cover * 0.85);
    }

    // Stars come out as the dusk fades, hide behind clouds and thin out into the horizon haze.
    float clear = uStars * (1.0 - cover);
    color += starLayer(dir, 110.0, 0.22) * clear * smoothstep(0.02, 0.3, up) * (1.0 - 0.85 * dusk);
    color += starLayer(dir, 260.0, 0.12) * clear * 0.7 * smoothstep(0.05, 0.4, up) * (1.0 - dusk);

    gl_FragColor = vec4(color, 1.0);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function create({ scene, config }) {
  const settings = config.sky;

  const uniforms = {
    uSunDirection: { value: new THREE.Vector3() },
    uDusk: { value: 1 },
    uTime: { value: 0 },
    uStars: { value: settings.starBrightness },
    uClouds: { value: settings.cloudCoverage },
  };
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
  scene.add(dome);

  const sun = uniforms.uSunDirection.value;

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
    },

    dispose() {
      scene.remove(dome);
      dome.geometry.dispose();
      dome.material.dispose();
    },
  };
}
