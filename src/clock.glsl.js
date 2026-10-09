// The countdown clock's picture, as light: a dial with an hour of ticks, a lit arc round the rim
// that shrinks as the seconds run out, a sweep hand that goes round once a second, and the number
// in glowing seven-segment tubes (with the unlit segments faintly there, like a real display).
// It's a function of uv (the dial's radius is 1) and four numbers, so the same code draws the
// clock in the sky (countdown.js) and mirrors it in the water (ice.glsl.js).
//
// uClock: x seconds to zero (it goes negative after), y how far the clock has faded in (0..1),
// z seconds since zero (0 before it), w brightness. Add the result; it needs no alpha. The
// light reaches two dial-radii out, for the ring that leaves the clock at zero.

export const clockGLSL = /* glsl */ `
  uniform vec4 uClock;

  const float CLOCK_TAU = 6.2831853;
  const int SEGMENTS[10] = int[10](0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07, 0x7F, 0x6F);

  float clockSegment(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a;
    vec2 ba = b - a;
    return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
  }

  // One digit in tubes. p is in the digit's own space: 0.6 wide, 1.24 tall, centred.
  vec3 clockDigit(vec2 p, int digit, float pop) {
    const float W = 0.3;
    const float H = 0.62;
    const float G = 0.05;
    vec2 a[7] = vec2[7](vec2(-W + G, H), vec2(W, H - G), vec2(W, -G), vec2(-W + G, -H), vec2(-W, -G), vec2(-W, H - G), vec2(-W + G, 0.0));
    vec2 b[7] = vec2[7](vec2(W - G, H), vec2(W, G), vec2(W, -H + G), vec2(W - G, -H), vec2(-W, -H + G), vec2(-W, G), vec2(W - G, 0.0));
    int mask = SEGMENTS[digit];
    vec3 core = vec3(1.0, 0.93, 0.78);
    vec3 glow = vec3(1.0, 0.45, 0.12);
    vec3 light = vec3(0.0);
    for (int i = 0; i < 7; i++) {
      float d = clockSegment(p, a[i], b[i]);
      if (((mask >> i) & 1) == 1) {
        light += core * smoothstep(0.034, 0.012, d) * (1.5 + 1.5 * pop) + glow * exp(-d * 15.0) * (0.4 + 0.6 * pop);
      } else {
        light += glow * smoothstep(0.03, 0.012, d) * 0.05; // an unlit tube, barely there
      }
    }
    return light;
  }

  vec3 clockLight(vec2 uv) {
    float rem = uClock.x;
    float intro = uClock.y;
    float since = uClock.z;
    if (intro <= 0.001 || max(abs(uv.x), abs(uv.y)) > 2.05) return vec3(0.0);

    float fade = intro * exp(-since * 2.2);
    vec3 gold = vec3(1.0, 0.72, 0.32);
    vec3 hot = vec3(1.0, 0.93, 0.78);
    float r = length(uv);
    // Outside the dial only the ring that leaves it at zero shows, so nothing else is worked out
    // there (the quad is big, and before zero countdown.js shrinks it to the dial anyway).
    if (r > 1.3) {
      if (since <= 0.0) return vec3(0.0);
      float shockOut = abs(r - (0.95 + since * 1.1));
      return (hot * smoothstep(0.05, 0.01, shockOut) * 2.5 + gold * exp(-shockOut * 8.0)) * exp(-since * 2.6) * fade * uClock.w
        * (1.0 - smoothstep(1.8, 2.05, max(abs(uv.x), abs(uv.y))));
    }
    float age = ceil(rem) - rem;                         // seconds since the number last changed
    float pop = exp(-age * 9.0) * step(0.0, rem);
    float ang = atan(uv.x, uv.y);                         // clockwise from 12 o'clock
    ang = ang < 0.0 ? ang + CLOCK_TAU : ang;
    float left = clamp(rem / 10.0, 0.0, 1.0);             // how much of the countdown is left
    float lit = step(ang, left * CLOCK_TAU);

    vec3 light = gold * exp(-r * r * 2.4) * 0.07;         // a warm haze behind it all

    // The rim: a thin ring, bright where time is left, with a spark at the head of the arc.
    float onRim = abs(r - 0.95);
    light += gold * (smoothstep(0.014, 0.004, onRim) * (0.2 + 1.7 * lit) + exp(-onRim * 26.0) * (0.04 + 0.4 * lit));
    float behindHead = abs(ang - left * CLOCK_TAU) * r;
    light += hot * exp(-behindHead * behindHead * 90.0) * exp(-onRim * 40.0) * 3.0 * step(0.0, rem);

    // Ticks: sixty small ones and twelve long ones, brighter inside the lit arc.
    if (r > 0.72 && r < 0.92) {
    float hours = ang / (CLOCK_TAU / 12.0);
    float toHour = abs(fract(hours + 0.5) - 0.5) * (CLOCK_TAU / 12.0) * r;
    float quarter = step(mod(floor(hours + 0.5), 3.0), 0.5);
    float hourTick = smoothstep(0.012, 0.004, toHour) * smoothstep(mix(0.82, 0.74, quarter) - 0.01, mix(0.82, 0.74, quarter), r) * step(r, 0.9);
    float minutes = ang / (CLOCK_TAU / 60.0);
    float toMinute = abs(fract(minutes + 0.5) - 0.5) * (CLOCK_TAU / 60.0) * r;
    float minuteTick = smoothstep(0.005, 0.0015, toMinute) * smoothstep(0.855, 0.865, r) * step(r, 0.9);
    light += gold * (hourTick * (0.5 + 1.6 * lit) + minuteTick * (0.18 + 0.7 * lit));
    }

    // The sweep hand, once round each second, with a wake behind it.
    float turn = CLOCK_TAU * age;
    vec2 pointing = vec2(sin(turn), cos(turn));
    float toHand = clockSegment(uv, pointing * 0.12, pointing * 0.84);
    float behind = mod(turn - ang + CLOCK_TAU, CLOCK_TAU);
    float wake = exp(-behind * 3.4) * smoothstep(0.1, 0.25, r) * smoothstep(0.9, 0.78, r) * step(0.0, rem);
    light += hot * (smoothstep(0.011, 0.003, toHand) * 1.8 + exp(-toHand * 30.0) * 0.3) * step(0.0, rem) + gold * wake * 0.32;
    light += hot * smoothstep(0.06, 0.02, r) * 1.2;

    // The number, popping as it changes, hotter in the last three seconds.
    float shown = max(ceil(rem), 0.0);
    float scale = (shown >= 10.0 ? 1.0 : 1.15) * (1.0 + 0.16 * pop);
    vec2 q = uv / scale;
    int ones = int(mod(shown, 10.0));
    vec3 digits = vec3(0.0);
    if (abs(uv.x) > 1.0 || abs(uv.y) > 1.05) {
      // beyond the digits and their glow
    } else if (shown >= 10.0) {
      digits += clockDigit(q - vec2(-0.37, 0.0), int(shown / 10.0), pop);
      digits += clockDigit(q - vec2(0.37, 0.0), ones, pop);
    } else {
      digits += clockDigit(q, ones, pop);
    }
    light += digits * (1.0 + 0.7 * smoothstep(3.0, 0.0, rem));

    // Zero: the dial goes white and a ring of light leaves it.
    light += hot * exp(-since * 7.0) * (2.5 * exp(-r * r * 2.0)) * step(0.001, since);
    float shock = abs(r - (0.95 + since * 1.1));
    light += (hot * smoothstep(0.05, 0.01, shock) * 2.5 + gold * exp(-shock * 8.0)) * exp(-since * 2.6) * step(0.001, since);

    return light * fade * uClock.w * (1.0 - smoothstep(1.8, 2.05, max(abs(uv.x), abs(uv.y))));
  }
`;
