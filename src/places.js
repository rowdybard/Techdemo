// The places a show can be set in: plain data, so the panel, the greeting link and the
// environment host (environment.js) can all name them without loading any scenery.
// A place picks which scenery modules exist; the fireworks, smoke, snow and sky are shared.
//
// `look` names a preset whose setting (sky, snow) comes with the place when it's picked in Customize.
// `moon` is how bright the moon is (0 is none; sky.js draws it, and the land and ice are lit by it).
// `views` names the three camera presets for that place (the preset keys stay sand, drone and
// water so links and the autoshow keep working); `cameras` replaces config.camera.presets
// while the place is showing, or is null to keep the config's own (the beach's).

export const PLACES = {
  beach: {
    label: 'Beach',
    icon: '🏖️',
    views: { sand: 'On the sand', drone: 'From above', water: 'In the water' },
    cameras: null,
    moon: 0,
    capabilities: { beach: true, snow: false, ice: false },
  },
  lake: {
    label: 'Frozen lake',
    icon: '🏔️',
    moon: 1, // a full moon in the sky, lighting the snow
    capabilities: { beach: false, snow: true, ice: true },
    look: 'Winter', // the preset whose sky and snow it takes when picked in Customize (midnight, falling snow)
    views: { sand: 'On the shore', drone: 'From above', water: 'On the ice' },
    cameras: {
      // Standing on the snowy bank, the ice at your feet and the village across the water.
      sand: { position: [0, 2.6, 7], target: [0, 12.2, -60], polar: [95.1, 96.8], azimuth: [-15, 15] },
      drone: { position: [0, 32, 48], target: [0, 60, -380], polar: [88, 96], azimuth: [-20, 20] },
      // Out on the ice, low, with the reflections at their longest.
      water: { position: [0, 1.0, -40], target: [0, 30, -380], polar: [93, 95], azimuth: [-15, 15] },
    },
  },
};

export const PLACE_NAMES = Object.keys(PLACES);
