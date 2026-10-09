// GLSL shared by several shaders: hashing and noise, and the twilight sky gradient
// that the sky dome draws and the water and wet sand reflect.

export const valueNoiseGLSL = /* glsl */ `
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

  vec2 hash22(vec2 p) {
    return vec2(hash13(vec3(p, 1.7)), hash13(vec3(p, 9.2)));
  }

  // Cell noise. x: distance to the nearest scattered point; y: how far from the wall
  // between the two nearest cells (0 on the wall); z: a random number for the nearest cell.
  vec3 cells(vec2 p) {
    vec2 cell = floor(p);
    vec2 f = fract(p);
    float nearest = 8.0;
    float second = 8.0;
    float id = 0.0;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 g = vec2(float(x), float(y));
        vec2 h = hash22(cell + g);
        vec2 r = g + h * 0.9 - f;
        float d = dot(r, r);
        if (d < nearest) { second = nearest; nearest = d; id = h.x; }
        else if (d < second) second = d;
      }
    }
    nearest = sqrt(nearest);
    return vec3(nearest, sqrt(second) - nearest, id);
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

// The foam: needs fwidth, so fragment shaders only (the plain noise above also runs in vertex shaders).
export const foamGLSL = /* glsl */ `
  // Foam coverage from an amount (0 to 1), in world metres. Thick foam is white froth
  // full of bubble holes of mixed sizes; as it thins it pulls back into a wobbly lace,
  // and the lace tears into scraps. Detail too small to see at a distance is skipped,
  // which matters when a breaking wave fills the lower half of the screen with foam.
  float foamPattern(vec2 p, float amount) {
    if (amount <= 0.01) return 0.0;
    float pixel = length(fwidth(p));
    // Big soft patches, so the outline of the foam wanders instead of following the
    // amount exactly, and a streaky lace of soft noise inside it (cell walls drew thin
    // bright lines). Detail finer than a few pixels settles to its average, so nothing
    // shimmers into dashes in the distance (as in Parla's water).
    float patches = valueNoise(p * 0.45 + 3.1) * 0.6 + valueNoise(p * 1.3 + 8.7) * 0.4;
    vec2 q = p * vec2(1.6, 2.6);
    float lace = valueNoise(q) * 0.6 + valueNoise(q * 2.3 + 7.0) * 0.4;
    lace = mix(lace, 0.5, smoothstep(0.15, 0.6, pixel * 2.6));
    float cover = smoothstep(0.3, 0.72, amount * 1.15 + (patches - 0.5) * 0.5 + (lace - 0.5) * (0.55 - 0.25 * amount));
    if (cover <= 0.001) return 0.0;
    // Bubble holes, 5 to 15 cm, opening up as the foam thins.
    vec2 b = p * 8.0;
    float blur = smoothstep(0.25, 0.8, pixel * 8.0);
    float holes = 0.8;
    if (blur < 1.0) {
      vec3 c = cells(b);
      float radius = (0.05 + 0.2 * (1.0 - amount)) * (0.6 + 0.8 * c.z);
      holes = mix(smoothstep(radius, radius + 0.18, c.x), 0.8, blur);
    }
    return cover * holes;
  }

  // Light on foam: it's white, so it takes the colour of the bright sky near the horizon
  // and of the afterglow, not just the dim sky overhead. Needs skyGLSL.
  #define FOAM_LIGHT(glow) (skyGradient(vec3(0.0, 0.18, -1.0)) * 0.9 + (glow) * 0.8 + skyZenith() * 1.5)
`;

// Noise, and foam on top of it: what the water and sand shaders include.
export const noiseGLSL = valueNoiseGLSL + foamGLSL;

// Needs the uniforms uSunDirection (vec3) and uDusk (float, 1 at late dusk, 0 at night).
export const skyGLSL = /* glsl */ `
  uniform vec3 uSunDirection;
  uniform float uDusk;

  // 1 looking toward where the sun set, 0 looking away from it.
  float sunwardness(vec3 dir) {
    // Clamped: rounding can push the dot product a hair past 1, and pow() of the tiny
    // negative number that leaves is NaN on real GPUs, which bloom smears over the screen.
    return clamp(0.5 + 0.5 * dot(normalize(dir.xz + 1e-5), normalize(uSunDirection.xz + 1e-5)), 0.0, 1.0);
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
    vec3 color = mix(horizon, skyZenith(), sqrt(up));
    // Afterglow: a warm band low on the horizon, strongest toward where the sun set.
    color += vec3(1.2, 0.38, 0.08) * pow(sunward, 6.0) * exp(-up * 9.0) * dusk * dusk * 1.1;
    color += vec3(0.55, 0.16, 0.22) * pow(sunward, 2.0) * exp(-up * 4.0) * dusk * dusk * 0.09;
    // A faint pink belt opposite the sunset.
    color += vec3(0.12, 0.05, 0.09) * pow(1.0 - sunward, 2.0) * exp(-up * 12.0) * dusk * 0.4;
    return color;
  }
`;
