// Every tunable in one plain object. Modules read it through ctx.config, and the panel
// changes it live. Units are metres, seconds and degrees unless a name says otherwise.
//
// World layout: +Y is up, the sea lies toward -Z, and the waterline runs along z = 0,
// so the beach rises toward +Z behind the default camera.

export const config = {
  renderer: {
    antialias: false, // the quality tier multisamples the post-processing target instead
    exposure: 1, // ACES filmic tone mapping; the panel changes this live
  },

  loop: {
    maxDt: 0.1, // longest step after a stall or a resume, so the show never jumps ahead
    timeScale: 1, // below 1 is slow motion
  },

  camera: {
    fov: 50, // vertical, on a landscape screen
    minHorizontalFov: 40, // narrow screens widen the vertical fov until this much fits across
    maxFov: 75,
    near: 0.1,
    far: 6000,
    position: [0, 2.4, 16], // eye height above the sand, 16 m up from the waterline
    target: [0, 11.2, -60], // over the water; the camera orbits this point when dragged
  },

  // Limits keep every view on the sand, facing the water, with the beach still in frame.
  controls: {
    damping: 0.08,
    rotateSpeed: 0.2, // one swipe across a phone screen covers the whole range
    minPolarAngle: 95.1, // from straight up; this end lifts the eye to about 3.7 m above the sand
    maxPolarAngle: 96.8, // this end holds the eye about 1.5 m above the sand
    minAzimuthAngle: -15, // 0 looks straight out to sea
    maxAzimuthAngle: 15,
  },

  sky: {
    timeOfDay: 0.3, // 0 is late dusk, 1 is full night
    duskSunElevation: -3, // sun elevation at timeOfDay 0, just set
    nightSunElevation: -18,
    sunAzimuth: 18, // right of straight out to sea, so the afterglow sits behind the show
    cloudCoverage: 0.35, // 0 is a clear sky
    starBrightness: 1,
  },

  ocean: {
    waveHeight: 1, // scales every wave
    choppiness: 0.55, // sharper crests as it rises
    surf: 0.28, // height of the swash running up the sand, in metres
    foam: 1,
    resolution: { desktop: [200, 340], phone: [120, 210] }, // grid columns and rows
  },

  beach: {
    glints: 1, // sparkle of wet and dry grains
    resolution: { desktop: [360, 190], phone: [200, 110] }, // grid columns and rows
  },

  show: {
    bargePosition: [0, 0, -380], // where shells launch from, offshore
    autoLaunch: true,
    shellsPerMinute: 34,
    maxShells: 7, // most shells bursting or burning at once
    openingShells: 3, // already climbing when the page opens, so the show starts at once
  },

  look: {
    palette: 'classic',
    // Weight per burst type: how often each one is picked.
    mix: { peony: 2, chrysanthemum: 2, willow: 1.5, palm: 1, ring: 1, crossette: 1, strobe: 0.7, crackle: 1, multibreak: 1 },
    particles: 420, // sparks per shell (about half on phones)
    burstSize: 62, // metres a spark coasts before drag holds it
    lifetime: 2.6, // seconds
    sparkSize: 1,
    trailLength: 1,
    glitter: 1,
    brightness: 1.6,
  },

  physics: {
    gravity: 1, // times Earth's
    drag: 1,
    windSpeed: 2, // m/s
    windDirection: 90, // degrees; 0 blows out to sea, 90 blows left to right
    windX: 0, // worked out each frame from speed and direction
    windZ: 0,
    heightMin: 85, // burst height range, metres
    heightMax: 135,
    launchSpread: 45, // metres either side of the barge's middle
    angleVariance: 6, // degrees a rocket may lean
  },

  // Burst colours, linear RGB. Brightness scales them all.
  palettes: {
    classic: [[1, 0.12, 0.08], [0.15, 1, 0.25], [0.2, 0.35, 1], [1, 0.62, 0.18], [1, 0.93, 0.85], [0.75, 0.25, 1]],
  },

  fireworks: {
    poolSize: { desktop: 60000, phone: 20000 },
  },

  bloom: {
    strength: 0.6,
    radius: 0.35,
    threshold: 1, // only what is brighter than this glows, so fireworks glow and sand doesn't
  },

  quality: {
    tier: 'auto', // 'auto', 'low', 'medium' or 'high'
    tiers: {
      high: { pixelRatio: { desktop: 2, phone: 1.5 }, samples: 4, bloomScale: 1 },
      medium: { pixelRatio: { desktop: 1.5, phone: 1.25 }, samples: 0, bloomScale: 1 },
      low: { pixelRatio: { desktop: 1, phone: 1 }, samples: 0, bloomScale: 0.5 },
    },
  },

  debug: {
    visible: true,
    refreshHz: 4,
  },
};
