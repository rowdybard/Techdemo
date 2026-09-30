// Firework particle shaders. Every particle's position is a closed-form function of
// time, so the CPU never touches a live particle:
//   terminal velocity  vT = g/k + wind
//   v(t) = vT + (v0 - vT) e^(-k t)
//   p(t) = p0 + vT t + (v0 - vT) (1 - e^(-k t)) / k
// The vertex shader evaluates p(t) for the head and p(t - trail) for the tail and
// stretches a camera-facing quad between them, so trails and round sparks are the same
// quad. Dead and unborn particles collapse to nothing.

export const KIND = { spark: 0, glitter: 1, strobe: 2, comet: 3, pop: 4 };

export const fireworksVertex = /* glsl */ `
  uniform float uTime;
  uniform vec3 uGravity;
  uniform vec3 uWind;
  uniform vec2 uViewport;     // drawing buffer size in pixels
  uniform float uSizeScale;
  uniform float uTrailScale;
  uniform float uMinPixels;   // sparks never shrink below this radius

  attribute vec4 aStart;      // p0.xyz, spawn time
  attribute vec4 aMotion;     // v0.xyz, drag k
  attribute vec4 aColor;      // rgb, unused
  attribute vec4 aColor2;     // rgb after the color change, time of the change
  attribute vec4 aShape;      // lifetime, radius (m), trail (s), kind

  varying vec3 vColor;
  varying float vAlong;       // position along the streak, in radii
  varying float vAcross;      // position across the streak, in radii
  varying float vHalf;        // half the streak's length, in radii
  varying float vAge;         // 0 at birth, 1 at death
  varying float vSeconds;     // age in seconds
  varying float vKind;
  varying float vSeed;

  vec3 positionAt(float t) {
    float k = aMotion.w;
    vec3 terminal = uGravity / k + uWind;
    return aStart.xyz + terminal * t + (aMotion.xyz - terminal) * (1.0 - exp(-k * t)) / k;
  }

  void main() {
    float age = uTime - aStart.w;
    float life = aShape.x;
    if (age < 0.0 || age > life) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // outside the clip volume: nothing is drawn
      return;
    }

    float trail = aShape.z * uTrailScale;
    vec4 head = projectionMatrix * viewMatrix * vec4(positionAt(age), 1.0);
    vec4 tail = projectionMatrix * viewMatrix * vec4(positionAt(max(age - trail, 0.0)), 1.0);

    // Work in pixels so the quad keeps its width whatever the aspect ratio.
    vec2 headPx = head.xy / head.w * 0.5 * uViewport;
    vec2 tailPx = tail.xy / tail.w * 0.5 * uViewport;
    vec2 axis = headPx - tailPx;
    float span = length(axis);
    vec2 along = span > 0.001 ? axis / span : vec2(1.0, 0.0);
    vec2 across = vec2(-along.y, along.x);

    float radius = max(aShape.y * uSizeScale * projectionMatrix[1][1] * 0.5 * uViewport.y / head.w, uMinPixels);
    float halfLength = 0.5 * span;
    vec2 center = 0.5 * (headPx + tailPx);
    vec2 corner = center + along * position.x * (halfLength + radius * 2.0) + across * position.y * radius * 2.0;

    float w = head.w;
    gl_Position = vec4(corner / (0.5 * uViewport) * w, head.z / head.w * w, w);

    vAlong = position.x * (halfLength + radius * 2.0) / radius;
    vAcross = position.y * 2.0;
    vHalf = halfLength / radius;
    vAge = age / life;
    vSeconds = age;
    vKind = aShape.w;
    vSeed = fract(aStart.x * 0.1731 + aStart.z * 0.0937 + aStart.w * 7.13 + aMotion.x * 0.37);

    float change = smoothstep(aColor2.w, aColor2.w + 0.25, age);
    vColor = mix(aColor.rgb, aColor2.rgb, change);
  }
`;

export const fireworksFragment = /* glsl */ `
  uniform float uTime;
  uniform float uBrightness;
  uniform float uGlitter;

  varying vec3 vColor;
  varying float vAlong;
  varying float vAcross;
  varying float vHalf;
  varying float vAge;
  varying float vSeconds;
  varying float vKind;
  varying float vSeed;

  float hash(float n) {
    return fract(sin(n) * 43758.5453);
  }

  void main() {
    // Distance from the streak's core segment, in radii: round caps, soft edges.
    float beyond = max(abs(vAlong) - vHalf, 0.0);
    float d2 = beyond * beyond + vAcross * vAcross;
    float core = exp(-d2 * 2.2);
    if (core < 0.004) discard;

    // Trails fade toward the tail.
    float u = vHalf > 0.01 ? clamp((vAlong + vHalf) / (2.0 * vHalf), 0.0, 1.0) : 1.0;
    float intensity = core * mix(0.04, 1.0, pow(u, 1.6));

    // Sparks brighten as they spread (hundreds start on one point, and at full strength
    // they would add up to a white blot), then fade and cool toward orange at the end.
    float fade = (1.0 - smoothstep(0.6, 1.0, vAge)) * mix(0.1, 1.0, smoothstep(0.0, 0.4, vSeconds));
    vec3 color = mix(vColor, vec3(1.0, 0.45, 0.12) * dot(vColor, vec3(0.33)), smoothstep(0.55, 1.0, vAge) * 0.6);
    float brightness = fade;

    if (vKind > 0.5 && vKind < 1.5) {        // glitter: random flickers
      float flick = step(0.45, hash(vSeed * 97.0 + floor(uTime * 24.0)));
      brightness *= mix(1.0, flick * 2.2, uGlitter);
    } else if (vKind > 1.5 && vKind < 2.5) { // strobe: blinks once it has slowed
      float blink = step(0.55, fract(uTime * (6.0 + 4.0 * vSeed) + vSeed));
      brightness *= mix(1.0, blink * 2.6, smoothstep(0.15, 0.3, vAge));
    } else if (vKind > 2.5 && vKind < 3.5) { // comet: hot white core
      color = mix(color, vec3(1.0, 0.9, 0.75), core * 0.6);
      brightness *= 1.4;
    } else if (vKind > 3.5) {                // crackle pop: one sharp flash
      brightness = 3.0 * exp(-vAge * 5.0);
      color = mix(vec3(1.0, 0.95, 0.85), color, 0.3);
    }

    gl_FragColor = vec4(color * intensity * brightness * uBrightness, 1.0);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
