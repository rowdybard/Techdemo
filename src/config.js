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
    preset: 'sand',
    // Each view orbits its target when dragged. Polar angles are from straight up, and
    // azimuth 0 looks straight out to sea; the limits keep each view framed.
    presets: {
      // Eye height on dry sand, 16 m up from the waterline. The polar range keeps the eye
      // about 1.5 to 3.7 m above the sand.
      sand: { position: [0, 2.4, 16], target: [0, 11.2, -60], polar: [95.1, 96.8], azimuth: [-15, 15] },
      // High over the beach, looking out over the whole bay.
      drone: { position: [0, 32, 48], target: [0, 60, -380], polar: [88, 96], azimuth: [-20, 20] },
      // Knee-deep in the surf, looking up at the show.
      water: { position: [0, 0.9, -12], target: [0, 30, -380], polar: [93, 95], azimuth: [-15, 15] },
    },
  },

  controls: {
    damping: 0.08,
    rotateSpeed: 0.2, // one swipe across a phone screen covers the whole range
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
    surf: 0.7, // height of the breaking waves near the beach, in metres
    foam: 1,
    resolution: { desktop: [200, 340], phone: [120, 210] }, // grid columns and rows
  },

  beach: {
    glints: 1, // sparkle of wet and dry grains
    resolution: { desktop: [360, 190], phone: [200, 110] }, // grid columns and rows
  },

  landmarks: {
    pier: false, // a pier and lighthouse, as on Lake Michigan
    grass: false, // dune grass in the foreground
  },

  show: {
    bargePosition: [0, 0, -380], // where shells launch from, offshore
    launchSite: 'barge', // 'barge', 'shore' (a line of tubes nearer the beach) or 'tap' (tap the sky to aim)
    autoLaunch: true,
    shellsPerMinute: 34,
    maxShells: 7, // most shells bursting or burning at once
    openingShells: 3, // already climbing when the page opens, so the show starts at once
  },

  // Ground show: a row of fountains along the barge, playing every so often.
  fountains: {
    enabled: true,
    firstAt: 3.5, // seconds after opening
    every: 28, // seconds between ground shows
    duration: 9, // seconds each fountain runs
    height: 42, // metres
    nozzles: 9, // along the barge (fewer on phones)
    color: 'gold', // fountains: 'gold' or 'silver'; the other effects use the palette
    style: 'mixed', // 'mixed' rotates through all; or 'fountains', 'shooters', 'candles', 'mines', 'fans'
  },

  look: {
    palette: 'classic',
    // Weight per burst type: how often each one is picked.
    mix: { peony: 2, chrysanthemum: 2, willow: 1.5, palm: 1, ring: 1, crossette: 1, strobe: 0.7, crackle: 1, multibreak: 1, heart: 0.35, star: 0.35, text: 0.5 },
    text: 'SUNSET COVE', // what text shells spell; a client's name is the point
    textWidth: 230, // metres across
    particles: 420, // sparks per shell (about half on phones)
    burstSize: 62, // metres a spark coasts before drag holds it
    lifetime: 2.6, // seconds
    sparkSize: 1,
    trailLength: 1,
    glitter: 1,
    brightness: 1.6,
    sceneLight: 1, // how strongly bursts light the water and sand
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
    launchSpread: 58, // metres either side of the barge's middle (it's 130 m long)
    angleVariance: 6, // degrees a rocket may lean
  },

  // Burst colours, linear RGB. Brightness scales them all.
  palettes: {
    classic: [[1, 0.12, 0.08], [0.15, 1, 0.25], [0.2, 0.35, 1], [1, 0.62, 0.18], [1, 0.93, 0.85], [0.75, 0.25, 1]],
    usa: [[1, 0.08, 0.06], [1, 0.95, 0.9], [0.15, 0.3, 1]],
    gold: [[1, 0.55, 0.16], [1, 0.75, 0.35], [1, 0.9, 0.6]],
    neon: [[1, 0.1, 0.8], [0.1, 0.95, 1], [0.6, 1, 0.1], [0.55, 0.2, 1]],
    pastel: [[1, 0.6, 0.75], [0.6, 0.85, 1], [0.8, 1, 0.7], [1, 0.9, 0.6]],
    custom: [[1, 0.3, 0.1], [0.2, 0.6, 1], [1, 0.85, 0.4]], // the panel's colour pickers edit these
  },

  fireworks: {
    poolSize: { desktop: 60000, phone: 20000 },
  },

  sound: {
    enabled: true, // starts after the first tap or key press, as browsers require
    volume: 0.6,
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
    visible: false, // or add #debug to the link, or press the backquote key
    refreshHz: 4,
  },
};
