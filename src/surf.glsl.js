// Breaking surf, shared by the ocean and the beach so they agree on where each wave is.
//
// Three wave trains with different periods roll toward the beach, so sets never repeat
// exactly, and every wave gets its own height and run-up from a hash of its number. A
// wave travels in from about 48 m out, slowing and growing as the water shallows, then
// breaks where the depth is about its own height. Its crest collapses into a lower bore
// of whitewater that rushes up the sand as the swash, stops, and drains back. Each train
// arrives a little earlier or later along the beach, so waves break in sections.
//
// The beach reads the same timeline to know where the water was and when it left, so
// foam is left stuck to the sand and fades, and freshly uncovered sand shines.
//
// Needs terrainGLSL (for shoreDistance and terrainHeight).

export const surfGLSL = /* glsl */ `
  const float SURF_START = -48.0;   // shore distance where a wave is first drawn
  const float SURF_TRAVEL = 9.0;    // seconds from there to the waterline
  const float RUNUP_TIME = 2.6;     // seconds the swash takes to rush up the sand
  const float BACKWASH_TIME = 4.4;  // seconds it takes to drain back

  float surfHash(float n, float train) {
    return fract(sin(n * 12.9898 + train * 78.233) * 43758.5453);
  }

  // Seconds this train runs ahead or behind here, so fronts arrive in sections.
  float surfDelay(float x, float train) {
    return 1.4 * sin(x * 0.011 + train * 2.1) + 0.8 * sin(x * 0.031 + train * 4.7) + x * 0.004 * (train - 1.0);
  }

  // Where the front is, as a shore distance, at progress u (0 far out, 1 at the waterline).
  // It slows as it shoals.
  float surfFront(float u) {
    return SURF_START * pow(1.0 - clamp(u, 0.0, 1.0), 1.35);
  }

  struct Surf {
    float lift;     // how far the wave lifts the water surface here
    float foam;     // whitewater on the water surface, 0 to 1
    float edge;     // furthest shore distance the swash covers right now
    float residue;  // foam left on the sand, fading, 0 to 1
    float dry;      // seconds since the water left this sand (large if long ago)
  };

  void surfWave(float train, float n, float tau, float s, float scale, inout Surf o) {
    if (tau < 0.0) return;
    float height = scale * mix(0.4, 1.0, surfHash(n, train));
    float reach = (1.2 + 3.8 * surfHash(n + 0.37, train)) * (0.4 + 0.6 * scale / 0.7);

    if (tau < SURF_TRAVEL) {
      float c = surfFront(tau / SURF_TRAVEL);
      float breakAt = -max(height * 24.0, 4.0);        // breaks where depth is about its height
      float broken = smoothstep(breakAt, breakAt + 5.0, c);
      float grow = 1.0 + 0.7 * smoothstep(-40.0, breakAt, c);
      float d = s - c;                                  // positive on the shore side of the crest
      // A steep face toward the beach and a long back; once broken it slumps into a bore.
      float face = d > 0.0 ? exp(-d * d / mix(1.6, 5.0, broken)) : exp(-d * d / 45.0);
      float wave = height * grow * face * mix(1.0, 0.3, broken);
      if (s < 1.0) o.lift += wave;
      // Whitewater: a thick band on the collapsing crest and a trail behind the bore.
      float crest = broken * exp(-d * d / 3.0);
      float trail = broken * (d < 0.0 ? exp(d / (2.0 + 7.0 * broken)) : 0.0);
      o.foam = max(o.foam, clamp(crest * 1.3 + trail * 0.75, 0.0, 1.0));
      return;
    }

    float p = tau - SURF_TRAVEL;
    float e;
    if (p < RUNUP_TIME) {
      float k = 1.0 - p / RUNUP_TIME;
      e = reach * (1.0 - k * k);                        // rushes up, slowing as it goes
    } else if (p < RUNUP_TIME + BACKWASH_TIME) {
      e = reach - (reach + 2.0) * (p - RUNUP_TIME) / BACKWASH_TIME; // drains back steadily
    } else {
      e = -2.0;
    }
    o.edge = max(o.edge, e);
    if (s < e) {
      // Foam piles up at the leading edge while it runs up, and thins as it drains.
      float lip = smoothstep(e - 2.5, e, s);
      float running = p < RUNUP_TIME ? 1.0 : 0.5;
      o.foam = max(o.foam, clamp(running * (0.12 + 0.88 * lip), 0.0, 1.0));
    }
    // Sand this wave covered: when did the water leave it?
    if (s < reach && s > -1.0) {
      float leaves = RUNUP_TIME + BACKWASH_TIME * (reach - s) / (reach + 2.0);
      float age = p - leaves;
      if (age > 0.0) {
        // Most foam is dropped along the line where the wave stopped; a little is left
        // scattered below it.
        float line = exp(-max(reach - s, 0.0) / 0.7);
        o.residue = max(o.residue, exp(-age / 3.2) * (0.25 + 0.75 * line) * smoothstep(-1.0, 0.5, s));
        o.dry = min(o.dry, age);
      }
    }
  }

  // Surf at a point on the beach or in the water, at time t. scale is the wave height (m).
  Surf surfAt(vec2 xz, float t, float scale) {
    Surf o = Surf(0.0, 0.0, -2.0, 0.0, 1e4);
    if (scale <= 0.0) return o;
    float s = shoreDistance(xz);
    if (s < SURF_START - 5.0 || s > 10.0) return o;
    for (int i = 0; i < 3; i++) {
      float train = float(i);
      float period = 8.7 + train * 2.6;               // 8.7 s, 11.3 s, 13.9 s
      float local = t + surfDelay(xz.x, train) + train * 3.1;
      float n = floor(local / period);
      float tau = local - n * period;
      surfWave(train, n, tau, s, scale, o);           // this wave
      surfWave(train, n - 1.0, tau + period, s, scale, o); // the one before, still draining
    }
    return o;
  }

  // The thin sheet of swash water: just above the sand wherever the swash reaches.
  float swashSurface(vec2 xz, float edge) {
    float s = shoreDistance(xz);
    if (s >= edge) return -1e4;
    return terrainHeight(xz) + 0.03 + 0.018 * (edge - s);
  }
`;
