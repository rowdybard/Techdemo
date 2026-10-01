// Presets, and settings saved as JSON. A preset starts from the defaults and changes a
// few values, so switching presets never leaves settings behind from the last one.
// Loading JSON only accepts keys and value types that already exist in the config, so a
// pasted file can't add junk or break the scene.
import { config as defaults } from './config.js';

// The parts of the config a person designs. Everything else (resolutions, pool size,
// camera geometry) belongs to the app.
const SAVED = ['sky', 'ocean', 'beach', 'landmarks', 'show', 'fountains', 'smoke', 'look', 'physics', 'bloom', 'sound', 'hero'];
const STORAGE_KEY = 'beach-fireworks-settings';
const TYPES = ['peony', 'chrysanthemum', 'willow', 'palm', 'ring', 'crossette', 'strobe', 'crackle', 'multibreak', 'heart', 'star', 'text'];

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
    look: { palette: 'usa', particles: 480, mix: mixOf({ peony: 3, chrysanthemum: 2, crossette: 1.5, strobe: 1.5, ring: 1, multibreak: 1.5, star: 1 }) },
    show: { shellsPerMinute: 46, maxShells: 9 },
  },
  'Gold Willows': {
    look: { palette: 'gold', lifetime: 3.2, trailLength: 1.4, mix: mixOf({ willow: 5, palm: 2, crackle: 1.5 }) },
    show: { shellsPerMinute: 24, maxShells: 6 },
    sky: { timeOfDay: 0.55 },
  },
  'Lake Michigan': {
    // Freshwater: smaller, calmer waves and a short run-up, a pier and lighthouse, dune grass.
    ocean: { waveHeight: 0.45, choppiness: 0.35, surf: 0.4 },
    landmarks: { pier: true, grass: true },
    look: { mix: mixOf({ peony: 2, chrysanthemum: 2, willow: 1.5, ring: 1, crossette: 1, crackle: 1, multibreak: 1, text: 0.5 }) },
    show: { shellsPerMinute: 30 },
  },
  Neon: {
    look: { palette: 'neon', brightness: 1.9, glitter: 0.6, mix: mixOf({ ring: 2, peony: 2, chrysanthemum: 2, strobe: 1.2, multibreak: 1 }) },
    bloom: { strength: 0.85 },
    sky: { timeOfDay: 0.8 },
  },
  Calm: {
    look: { palette: 'pastel', mix: mixOf({ peony: 2, willow: 2, chrysanthemum: 1, heart: 0.5 }) },
    show: { shellsPerMinute: 12, maxShells: 3 },
    fountains: { every: 40, color: 'silver', height: 20 },
    physics: { windSpeed: 1 },
    smoke: { amount: 0.5 },
    ocean: { waveHeight: 0.6, surf: 0.45 },
    sky: { timeOfDay: 0.12 },
  },
  Finale: {
    look: { particles: 520, mix: mixOf({ peony: 2, chrysanthemum: 2, willow: 1, palm: 1, ring: 1, crossette: 1.5, strobe: 1, crackle: 1.5, multibreak: 2, text: 0.6 }) },
    show: { shellsPerMinute: 95, maxShells: 16 },
    fountains: { every: 14, nozzles: 12 },
    smoke: { amount: 1.3 },
    bloom: { strength: 0.75 },
  },
};

export function applyPreset(config, name) {
  const header = { ...config.hero }; // a client's header text survives a change of preset
  merge(config, DEFAULTS);
  merge(config, PRESETS[name] || {});
  Object.assign(config.hero, header);
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
