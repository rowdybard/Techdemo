// Every tunable in one plain object. Modules read it through ctx.config, and the panel
// changes it live. Units are metres, seconds and degrees unless a name says otherwise.
//
// World layout: +Y is up, the sea lies toward -Z, and the waterline runs along z = 0,
// so the beach rises toward +Z behind the default camera.

export const config = {
  renderer: {
    antialias: true,
    maxPixelRatio: { desktop: 2, phone: 1.5 },
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
    position: [0, 1.7, 16], // eye height, on dry sand 16 m up from the waterline
    target: [0, 12, -60], // over the water; the camera orbits this point when dragged
  },

  // Limits keep every view on the sand, facing the water, with the beach still in frame.
  controls: {
    damping: 0.08,
    rotateSpeed: 0.2, // one swipe across a phone screen covers the whole range
    minPolarAngle: 96.2, // from straight up; this end lifts the camera to about 3.7 m
    maxPolarAngle: 97.8, // this end holds the camera at eye level, about 1.6 m
    minAzimuthAngle: -15, // 0 looks straight out to sea
    maxAzimuthAngle: 15,
  },

  show: {
    bargePosition: [0, 0, -280], // where shells launch from, offshore
  },

  debug: {
    visible: true,
    refreshHz: 4,
  },
};
