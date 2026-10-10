// Firework particle shaders. Every particle's position is a closed-form function of
// time, so the CPU never touches a live particle:
//   terminal velocity  vT = g/k + wind
//   v(t) = vT + (v0 - vT) e^(-k t)
//   p(t) = p0 + vT t + (v0 - vT) (1 - e^(-k t)) / k
// The vertex shader evaluates p(t) for the head and p(t - trail) for the tail and
// stretches a camera-facing quad between them, so trails and round sparks are the same
// quad. Dead and unborn particles collapse to nothing.
//
// Three kinds add a closed-form wobble to that path, still with no CPU simulation: `swim` (the
// fish) wriggles across the way it's heading, wider as it goes; `whirl` circles round its own
// path; `flutter` (falling leaves) sways side to side as it drifts down, and glints as it turns.

export const KIND = { spark: 0, glitter: 1, strobe: 2, comet: 3, pop: 4, swim: 5, whirl: 6, flutter: 7 };

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
  attribute vec4 aColor;      // rgb, 1 for a ground-show spark
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
  varying float vGround;
  varying float vRamp;        // 0..1 brightness while the burst is still tight

  float seed;  // per spark, 0..1 (set first thing in main)
  vec3 sideways; // two directions across the spark's launch heading (for the wobbling kinds)
  vec3 upways;

  vec3 wobble(float t) {
    float kind = aShape.w;
    float phase = seed * 6.2832;
    if (kind < 5.5) return sideways * sin(t * (8.0 + 5.0 * seed) + phase) * min(t, 1.2) * 4.0;
    if (kind < 6.5) {
      float turn = t * (7.0 + 4.0 * seed) + phase;
      return (sideways * cos(turn) + upways * sin(turn)) * (3.0 + 6.0 * min(t, 1.5));
    }
    return vec3(sin(t * 2.3 + phase) * 6.0, 0.0, cos(t * 1.6 + phase) * 3.0) * min(t, 1.0);
  }

  vec3 positionAt(float t) {
    float k = aMotion.w;
    vec3 terminal = uGravity / k + uWind;
    vec3 p = aStart.xyz + terminal * t + (aMotion.xyz - terminal) * (1.0 - exp(-k * t)) / k;
    return aShape.w > 4.5 ? p + wobble(t) : p;
  }

  void main() {
    seed = fract(aStart.x * 0.1731 + aStart.z * 0.0937 + aStart.w * 7.13 + aMotion.x * 0.37);
    if (aShape.w > 4.5) {
      vec3 heading = normalize(aMotion.xyz + vec3(0.0, 0.0001, 0.0));
      sideways = normalize(cross(heading, abs(heading.y) > 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0)));
      upways = cross(heading, sideways);
    }
    float age = uTime - aStart.w;
    float life = aShape.x;
    if (age < 0.0 || age > life) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // outside the clip volume: nothing is drawn
      return;
    }

    float trail = aShape.z * uTrailScale;
    vec4 head = projectionMatrix * viewMatrix * vec4(positionAt(age), 1.0);
    vec4 tail = projectionMatrix * viewMatrix * vec4(positionAt(max(age - trail, 0.0)), 1.0);
    // Skip sparks level with the camera or behind it. Their size divides by a depth near
    // zero, and a trail crossing behind the camera flips across the screen, so either
    // would draw one huge additive streak over everything. They're off-screen anyway.
    if (head.w < 1.0 || tail.w < 1.0) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }

    // Work in pixels so the quad keeps its width whatever the aspect ratio.
    vec2 headPx = head.xy / head.w * 0.5 * uViewport;
    vec2 tailPx = tail.xy / tail.w * 0.5 * uViewport;
    vec2 axis = headPx - tailPx;
    float span = length(axis);
    vec2 along = span > 0.001 ? axis / span : vec2(1.0, 0.0);
    vec2 across = vec2(-along.y, along.x);

    float radius = clamp(aShape.y * uSizeScale * projectionMatrix[1][1] * 0.5 * uViewport.y / head.w, uMinPixels, 0.08 * uViewport.y);
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
    // A burst is born on one point, so for a moment hundreds of sparks overlap there and
    // add up past white. They start dim and reach full brightness as it opens. A long
    // trail (willow, palm) keeps its tail on the break point until the spark is a trail
    // length old, so those overlap there for longer: they hold at 40% until the tails
    // let go. Ground shows keep their own ramp (their brightness is capped separately).
    float opening = mix(0.03, 1.0, smoothstep(0.02, 0.45, age));
    float held = mix(1.0, 0.4, smoothstep(0.3, 0.9, trail));
    float anchored = mix(held, 1.0, smoothstep(trail * 0.9, trail * 1.5 + 0.001, age)); // + 0.001: never equal edges (NaN)
    vRamp = opening * (aColor.w > 0.5 ? 1.0 : anchored);
    vKind = aShape.w;
    vSeed = seed;
    vGround = aColor.w;

    float change = smoothstep(aColor2.w, aColor2.w + 0.25, age);
    vColor = mix(aColor.rgb, aColor2.rgb, change);
  }
`;

export const fireworksFragment = /* glsl */ `
  uniform float uBrightness;
  uniform float uGroundBrightness; // ground shows never go brighter than this (Sparkle at about 55%)
  uniform float uGlitter;

  varying vec3 vColor;
  varying float vAlong;
  varying float vAcross;
  varying float vHalf;
  varying float vAge;
  varying float vSeconds;
  varying float vKind;
  varying float vSeed;
  varying float vGround;
  varying float vRamp;

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

    // Sparks brighten as they spread (vRamp: hundreds start on one point, and at full
    // strength they would add up to a white blot). A star then burns at full colour until
    // three quarters of its life and goes out over the last quarter, warming a little as
    // it dies but keeping its own hue (a long dim tail read as pale grey against the
    // sunset). Ground shows keep their earlier, longer fade, so fountain plumes stay thin.
    float fade = (1.0 - smoothstep(vGround > 0.5 ? 0.6 : 0.75, 1.0, vAge)) * vRamp;
    vec3 color = vColor * mix(vec3(1.0), vec3(1.0, 0.62, 0.38), smoothstep(0.7, 1.0, vAge) * 0.6);
    float brightness = fade;

    // Flicker and blink run on the spark's own age, not the page's clock: after a long
    // session (the autoshow left up) the clock is large enough that some phone GPUs'
    // sin() returns NaN, which the safety pass turns into black flashes.
    if (vKind > 0.5 && vKind < 1.5) {        // glitter: random flickers
      float flick = step(0.45, hash(vSeed * 97.0 + floor(vSeconds * 24.0)));
      brightness *= mix(1.0, flick * 2.2, uGlitter);
    } else if (vKind > 1.5 && vKind < 2.5) { // strobe: blinks once it has slowed
      float blink = step(0.55, fract(vSeconds * (6.0 + 4.0 * vSeed) + vSeed));
      brightness *= mix(1.0, blink * 2.6, smoothstep(0.15, 0.3, vAge));
    } else if (vKind > 2.5 && vKind < 3.5) { // comet (the rising shell only): hot white core
      color = mix(color, vec3(1.0, 0.9, 0.75), core * 0.6);
      brightness *= 1.4;
    } else if (vKind > 3.5 && vKind < 4.5) { // crackle pop: one sharp flash
      brightness = 3.0 * exp(-vAge * 5.0);
      color = mix(vec3(1.0, 0.95, 0.85), color, 0.3);
    } else if (vKind > 4.5 && vKind < 5.5) { // fish: a shimmer as they swim
      brightness *= 0.75 + 0.5 * step(0.5, hash(vSeed * 53.0 + floor(vSeconds * 18.0)));
    } else if (vKind > 5.5 && vKind < 6.5) { // whirl: a warm head
      color = mix(color, vec3(1.0, 0.85, 0.6), core * 0.2);
    } else if (vKind > 6.5) {                // leaf: glints each time it turns to face you
      brightness *= 0.5 + 1.6 * pow(abs(sin(vSeconds * (3.5 + 2.5 * vSeed) + vSeed * 6.2832)), 8.0);
    }

    // Hundreds of fountain sparks overlap in one place, so they're capped below where they
    // would merge into a glowing blob, however high Sparkle goes.
    float sparkle = vGround > 0.5 ? min(uBrightness, uGroundBrightness) : uBrightness;

    // ACES tone mapping washes bright colours toward white, so a burst's core lost its
    // colour and read as a white blob. Deepen the hue before the brightness multiply so the
    // colour survives being pushed bright, and ease the peak down a touch so the dense core
    // stops clipping to white. Comet and crackle whites are near-grey already, so the
    // saturation lift barely touches them.
    float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
    color = max(mix(vec3(luma), color, 1.3), 0.0);
    gl_FragColor = vec4(color * intensity * brightness * sparkle * 0.82, 1.0);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
