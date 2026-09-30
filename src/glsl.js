// GLSL shared by several shaders: hashing and noise, and the twilight sky gradient
// that the sky dome draws and the water and wet sand reflect.

export const noiseGLSL = /* glsl */ `
  float hash13(vec3 p) {
    p = fract(p * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  float hash12(vec2 p) {
    return hash13(vec3(p, 0.0));
  }

  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash12(i);
    float b = hash12(i + vec2(1.0, 0.0));
    float c = hash12(i + vec2(0.0, 1.0));
    float d = hash12(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  float fbm(vec2 p) {
    float sum = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 5; i++) {
      sum += amplitude * valueNoise(p);
      p = p * 2.03 + 17.1;
      amplitude *= 0.5;
    }
    return sum;
  }
`;

// Needs the uniforms uSunDirection (vec3) and uDusk (float, 1 at late dusk, 0 at night).
export const skyGLSL = /* glsl */ `
  uniform vec3 uSunDirection;
  uniform float uDusk;

  // 1 looking toward where the sun set, 0 looking away from it.
  float sunwardness(vec3 dir) {
    return 0.5 + 0.5 * dot(normalize(dir.xz + 1e-5), normalize(uSunDirection.xz + 1e-5));
  }

  vec3 skyZenith() {
    return mix(vec3(0.0025, 0.0035, 0.009), vec3(0.012, 0.022, 0.06), uDusk);
  }

  // Blue hour gradient with the afterglow, without clouds or stars.
  vec3 skyGradient(vec3 dir) {
    float up = max(dir.y, 0.0);
    float sunward = sunwardness(dir);
    float dusk = uDusk;
    vec3 horizon = mix(vec3(0.008, 0.011, 0.022), vec3(0.075, 0.07, 0.14), dusk);
    vec3 color = mix(horizon, skyZenith(), pow(up, 0.5));
    // Afterglow: a warm band low on the horizon, strongest toward where the sun set.
    color += vec3(1.2, 0.38, 0.08) * pow(sunward, 6.0) * exp(-up * 9.0) * dusk * dusk * 1.1;
    color += vec3(0.55, 0.16, 0.22) * pow(sunward, 2.0) * exp(-up * 4.0) * dusk * dusk * 0.09;
    // A faint pink belt opposite the sunset.
    color += vec3(0.12, 0.05, 0.09) * pow(1.0 - sunward, 2.0) * exp(-up * 12.0) * dusk * 0.4;
    return color;
  }
`;
