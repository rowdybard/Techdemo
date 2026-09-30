// Every tunable in one plain object. Modules read it through ctx.config, and the panel
// changes it live. Units are metres, seconds and degrees unless a name says otherwise.
//
// World layout: +Y is up, the sea lies toward -Z, and the waterline runs along z = 0,
// so the beach rises toward +Z behind the default camera.

export const config = {
  renderer: {
    antialias: true,
    maxPixelRatio: { desktop: 2, phone: 1.5 },
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
    bargePosition: [0, 0, -280], // where shells launch from, offshore
  },

  debug: {
    visible: true,
    refreshHz: 4,
  },
};
