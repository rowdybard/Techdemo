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

  vec2 hash22(vec2 p) {
    return vec2(hash13(vec3(p, 1.7)), hash13(vec3(p, 9.2)));
  }

  // Cell noise. x: distance to the nearest scattered point; y: how far from the wall
  // between the two nearest cells (0 on the wall).
  vec2 cells(vec2 p) {
    vec2 cell = floor(p);
    vec2 f = fract(p);
    float nearest = 8.0;
    float second = 8.0;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 g = vec2(float(x), float(y));
        vec2 r = g + hash22(cell + g) * 0.9 - f;
        float d = dot(r, r);
        if (d < nearest) { second = nearest; nearest = d; }
        else if (d < second) second = d;
      }
    }
    nearest = sqrt(nearest);
    return vec2(nearest, sqrt(second) - nearest);
  }

  // Foam coverage from an amount (0 to 1), in world metres. Thick foam is white froth
  // full of small bubble holes; as it thins it pulls back into a wobbly lace, and the
  // lace tears into scraps. The holes blend to an even texture where they'd be sub-pixel.
  float foamPattern(vec2 p, float amount) {
    if (amount <= 0.01) return 0.0;
    vec2 warp = vec2(valueNoise(p * 0.9), valueNoise(p * 0.9 + 5.3)) * 0.9;
    float wall = cells(p * vec2(1.7, 2.8) + warp).y;               // 0 on the lace lines
    float lace = 1.0 - smoothstep(0.02, 0.1 + 0.3 * amount, wall);
    float body = smoothstep(0.6, 0.95, amount + 0.25 * valueNoise(p * 2.3));
    float scraps = smoothstep(0.62 - amount * 0.5, 0.82 - amount * 0.5, valueNoise(p * 1.7 + 11.0));
    float cover = max(body, lace * scraps * smoothstep(0.05, 0.4, amount));
    // Bubble holes of two sizes, about 5 and 12 cm, opening up as the foam thins.
    vec2 q = p * 8.0;
    float radius = 0.06 + 0.22 * (1.0 - amount);
    float holes = smoothstep(radius, radius + 0.12, cells(q).x) * smoothstep(radius * 0.8, radius * 0.8 + 0.1, cells(q * 2.3 + 3.1).x);
    float blur = smoothstep(0.25, 0.8, length(fwidth(q)));
    holes = mix(holes, 0.75, blur);
    return cover * holes;
  }

  // Light on foam: it's white, so it takes the colour of the bright sky near the horizon
  // and of the afterglow, not just the dim sky overhead. Needs skyGLSL.
  #define FOAM_LIGHT(glow) (skyGradient(vec3(0.0, 0.18, -1.0)) * 0.9 + (glow) * 0.8 + skyZenith() * 1.5)

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
