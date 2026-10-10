// Presets, and settings saved as JSON. A preset starts from the defaults and changes a
// few values, so switching presets never leaves settings behind from the last one.
// Loading JSON only accepts keys and value types that already exist in the config, so a
// pasted file can't add junk or break the scene.
import { config as defaults } from './config.js';

// The parts of the config a person designs. Everything else (resolutions, pool size,
// camera geometry) belongs to the app.
const SAVED = ['place', 'sky', 'ocean', 'beach', 'landmarks', 'show', 'fountains', 'smoke', 'snow', 'lake', 'look', 'physics', 'bloom', 'sound', 'hero'];
const STORAGE_KEY = 'beach-fireworks-settings';
// [section, key, the old default] for defaults changed since launch (see recall).
const UPGRADES = [['physics', 'heightMin', 85], ['physics', 'heightMax', 135], ['look', 'text', 'SUNSET COVE']];
const TYPES = ['peony', 'chrysanthemum', 'willow', 'palm', 'ring', 'crossette', 'strobe', 'crackle', 'multibreak', 'heart', 'star', 'text',
  'pumpkin', 'skull', 'bat', 'ghost', 'web', 'brew', 'eyes', 'wisp', 'kamuro', 'dahlia', 'saturn', 'fish', 'whirl', 'leaves'];

const DEFAULTS = snapshot(defaults);

// A full shell mix: the listed weights, and zero for every other type.
function mixOf(weights) {
  const mix = {};
  for (const type of TYPES) mix[type] = weights[type] || 0;
  return mix;
}

export const PRESETS = {
  Default: {},
  'Fourth of July': {
    look: { palette: 'usa', particles: 480, mix: mixOf({ peony: 3, chrysanthemum: 2, crossette: 1.5, strobe: 1.5, ring: 1, multibreak: 1.5, star: 1, dahlia: 1.5, saturn: 0.8, whirl: 1 }) },
    show: { shellsPerMinute: 46, maxShells: 9 },
  },
  'Gold Willows': {
    look: { palette: 'gold', lifetime: 3.2, trailLength: 1.4, mix: mixOf({ willow: 5, palm: 2, crackle: 1.5, kamuro: 2.5, leaves: 1 }) },
    show: { shellsPerMinute: 24, maxShells: 6 },
    sky: { timeOfDay: 0.55 },
  },
  'Lake Michigan': {
    // Freshwater: smaller, calmer waves and a short run-up, a pier and lighthouse, dune grass.
    ocean: { waveHeight: 0.45, choppiness: 0.35, surf: 0.4 },
    landmarks: { pier: true, grass: true },
    look: { mix: mixOf({ peony: 2, chrysanthemum: 2, willow: 1.5, ring: 1, crossette: 1, crackle: 1, multibreak: 1, text: 0.5, fish: 0.6, saturn: 0.5 }) },
    show: { shellsPerMinute: 30 },
  },
  Halloween: {
    look: { palette: 'halloween', lifetime: 2.9, mix: mixOf({ pumpkin: 2, skull: 1.3, bat: 1.5, ghost: 1.5, web: 1.1, brew: 1.6, eyes: 1.2, wisp: 1.6, crackle: 0.6, strobe: 0.4, leaves: 0.8 }) },
    show: { shellsPerMinute: 30, maxShells: 7 },
    fountains: { style: 'halloween', every: 20, duration: 9 },
    sky: { timeOfDay: 0.9, cloudCoverage: 0.6 },
    smoke: { amount: 0.2 },
    physics: { windSpeed: 3 },
    bloom: { strength: 0.7 },
  },
  // A frozen mountain lake at midnight: snow falling, gold willows, a village across the ice. The
  // New Year occasion's look.
  Winter: {
    place: { environment: 'lake' },
    look: { palette: 'gold', lifetime: 3.2, trailLength: 1.3, mix: mixOf({ willow: 3.5, peony: 2, chrysanthemum: 1.5, ring: 1, star: 0.6, crackle: 1, text: 0.5, kamuro: 2, saturn: 0.6 }) },
    show: { shellsPerMinute: 26, maxShells: 6 },
    fountains: { color: 'gold', every: 22 },
    sky: { timeOfDay: 0.9, cloudCoverage: 0.2, starBrightness: 0.5 },
    smoke: { amount: 0.08 },
    physics: { windSpeed: 1.6 },
    snow: { amount: 0.5 },
  },
  Neon: {
    look: { palette: 'neon', brightness: 3, glitter: 0.6, mix: mixOf({ ring: 2, peony: 2, chrysanthemum: 2, strobe: 1.2, multibreak: 1, dahlia: 2, saturn: 1.2, whirl: 1 }) },
    bloom: { strength: 0.85 },
    sky: { timeOfDay: 0.8 },
  },
  Calm: {
    look: { palette: 'pastel', mix: mixOf({ peony: 2, willow: 2, chrysanthemum: 1, heart: 0.5, leaves: 1.2, kamuro: 0.6 }) },
    show: { shellsPerMinute: 12, maxShells: 3 },
    fountains: { every: 40, color: 'silver', height: 20, sideBarges: false },
    physics: { windSpeed: 1 },
    smoke: { amount: 0.06 },
    ocean: { waveHeight: 0.6, surf: 0.45 },
    sky: { timeOfDay: 0.12 },
  },
  Royal: {
    look: { palette: 'royal', lifetime: 3, mix: mixOf({ kamuro: 1.2, chrysanthemum: 1.5, saturn: 0.8, willow: 0.8, crossette: 1.2, peony: 1.2 }) },
    show: { shellsPerMinute: 26 },
    fountains: { style: 'waterfall,fountains', color: 'gold' },
    sky: { timeOfDay: 0.85 },
  },
  'Under the Sea': {
    look: { palette: 'ocean', mix: mixOf({ fish: 3, ring: 1.5, dahlia: 1.2, peony: 1.5, willow: 0.8, saturn: 0.5 }) },
    show: { shellsPerMinute: 30 },
    fountains: { style: 'waterfall,fountains', color: 'silver' },
    sky: { timeOfDay: 0.75 },
  },
  Galaxy: {
    look: { palette: 'cosmic', brightness: 2.8, mix: mixOf({ saturn: 2.5, star: 1.2, strobe: 1.5, ring: 1.2, chrysanthemum: 1, peony: 1 }) },
    show: { shellsPerMinute: 28 },
    fountains: { style: 'fans,mines', color: 'silver' },
    sky: { timeOfDay: 1, cloudCoverage: 0.1, starBrightness: 0.6 },
    bloom: { strength: 0.75 },
  },
  Rainbow: {
    look: { palette: 'rainbow', mix: mixOf({ dahlia: 2.5, peony: 2, ring: 1.2, crossette: 1, multibreak: 1, chrysanthemum: 1 }) },
    show: { shellsPerMinute: 40, maxShells: 9 },
    sky: { timeOfDay: 0.5 },
  },
  Romance: {
    look: { palette: 'rose', lifetime: 3, mix: mixOf({ heart: 2.5, dahlia: 1.5, willow: 1.2, kamuro: 0.8, ring: 0.8, peony: 1 }) },
    show: { shellsPerMinute: 18, maxShells: 5 },
    fountains: { color: 'silver', every: 30 },
    physics: { windSpeed: 1 },
    sky: { timeOfDay: 0.6 },
  },
  'Cherry Blossom': {
    look: { palette: 'sakura', mix: mixOf({ peony: 2.5, chrysanthemum: 1.5, ring: 1, multibreak: 1, star: 0.6, heart: 0.5 }) },
    show: { shellsPerMinute: 20, maxShells: 5 },
    fountains: { color: 'silver', every: 34 },
    smoke: { amount: 0.06 },
    sky: { timeOfDay: 0.15 },
  },
  Autumn: {
    look: { palette: 'autumn', lifetime: 3, mix: mixOf({ leaves: 3, kamuro: 1, willow: 1.5, palm: 1.2, peony: 1, crackle: 0.8 }) },
    show: { shellsPerMinute: 24 },
    fountains: { color: 'gold' },
    physics: { windSpeed: 4 },
    sky: { timeOfDay: 0.35, cloudCoverage: 0.5 },
  },
  Carnival: {
    look: { mix: mixOf({ whirl: 2, crossette: 1.5, multibreak: 1.5, strobe: 1, fish: 1, palm: 1, peony: 1, star: 0.6 }) },
    show: { shellsPerMinute: 48, maxShells: 10 },
    fountains: { style: 'shooters,fans,candles', every: 16 },
    sky: { timeOfDay: 0.55 },
  },
  Thunder: {
    look: { palette: 'ice', mix: mixOf({ crackle: 2.5, strobe: 2, chrysanthemum: 1.5, multibreak: 1.2, peony: 1 }) },
    show: { shellsPerMinute: 60, maxShells: 12 },
    fountains: { style: 'mines', every: 12 },
    smoke: { amount: 0.22 },
    bloom: { strength: 0.75 },
    sky: { timeOfDay: 0.95, cloudCoverage: 0.75 },
  },
  Ice: {
    look: { palette: 'ice', mix: mixOf({ peony: 2, chrysanthemum: 2, strobe: 1.5, ring: 1, saturn: 0.6, crossette: 0.8 }) },
    show: { shellsPerMinute: 30 },
    fountains: { color: 'silver' },
    sky: { timeOfDay: 0.8, cloudCoverage: 0.15 },
  },
  Finale: {
    look: { particles: 520, mix: mixOf({ peony: 2, chrysanthemum: 2, willow: 1, palm: 1, ring: 1, crossette: 1.5, strobe: 1, crackle: 1.5, multibreak: 2, text: 0.6, kamuro: 1.5, dahlia: 1.5, whirl: 1, fish: 1 }) },
    show: { shellsPerMinute: 95, maxShells: 16 },
    fountains: { every: 14, nozzles: 12 },
    smoke: { amount: 0.18 },
    bloom: { strength: 0.75 },
  },
};

export function applyPreset(config, name) {
  const header = { ...config.hero }; // a client's header text survives a change of preset
  const words = config.look.text; // and so do the words in the sky: they're the person's, not the style's
  merge(config, DEFAULTS);
  merge(config, PRESETS[name] || {});
  Object.assign(config.hero, header);
  config.look.text = words;
  if (words.trim() && !(config.look.mix.text > 0)) config.look.mix.text = 0.5; // a style without words still spells theirs now and then
}

// A place's setting, as opposed to the show: where it is, its sky, its ice and its snow.
export const SCENE = ['place', 'sky', 'lake', 'snow'];

/** A copy of the setting, to put back later with putScene. */
export function takeScene(config) {
  const scene = {};
  for (const key of SCENE) scene[key] = JSON.parse(JSON.stringify(config[key]));
  return scene;
}

export function putScene(config, scene) {
  for (const key of SCENE) merge(config[key], scene[key]);
}

/** The default setting (the beach at dusk), as takeScene would give it. */
export function defaultScene() {
  return takeScene(DEFAULTS);
}

/** Applies only these sections of a preset (a place's sky and snow, say), leaving the rest of the show as it is. */
export function applyPresetSections(config, name, sections) {
  const preset = PRESETS[name] || {};
  for (const key of sections) if (isObject(preset[key])) merge(config[key], preset[key]);
}

/** The designable settings as pretty JSON, including the custom palette. */
export function settingsJSON(config) {
  const data = snapshot(config);
  data.palette = config.palettes.custom;
  return JSON.stringify(data, null, 1);
}

/** Applies settings from JSON text. Returns an error message, or '' on success. */
export function loadSettings(config, text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return 'That isn’t valid JSON. Paste the text from Copy settings.';
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return 'Settings should be a JSON object.';
  for (const key of SAVED) if (isObject(data[key])) merge(config[key], data[key]);
  if (Array.isArray(data.palette) && data.palette.length === config.palettes.custom.length && data.palette.every(isColor)) {
    config.palettes.custom = data.palette.map((c) => c.slice());
  }
  return '';
}

// Per-viewer memory of the last settings. Storage can be missing or throw (private
// windows, blocked storage, previews), and the scene works without it.
export function remember(config) {
  try {
    localStorage.setItem(STORAGE_KEY, settingsJSON(config));
  } catch {
    // Nothing to do: the settings just won't be remembered.
  }
}

export function recall(config) {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    if (text) loadSettings(config, text);
  } catch {
    // Start from the defaults.
  }
  // Defaults that changed after a visitor's settings were saved: an old default they never
  // touched moves to the new one, while a value they chose stays.
  for (const [section, key, before] of UPGRADES) {
    if (config[section][key] === before) config[section][key] = DEFAULTS[section][key];
  }
}

function snapshot(config) {
  const data = {};
  for (const key of SAVED) data[key] = JSON.parse(JSON.stringify(config[key]));
  return data;
}

// Copies values from source into target where the key exists in target with the same
// kind of value. Arrays of numbers are copied whole.
function merge(target, source) {
  for (const key in source) {
    if (!(key in target)) continue;
    const from = source[key];
    const to = target[key];
    if (isObject(to) && isObject(from)) merge(to, from);
    else if (Array.isArray(to) && Array.isArray(from) && from.length === to.length && from.every((n) => typeof n === 'number')) target[key] = from.slice();
    else if (typeof to === typeof from && !isObject(to) && !Array.isArray(to)) target[key] = from;
  }
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isColor(value) {
  return Array.isArray(value) && value.length === 3 && value.every((n) => typeof n === 'number' && n >= 0 && n <= 4);
}
