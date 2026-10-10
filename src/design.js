// A versioned, bounded design that works in both browser ES modules and the Worker.
// Only authored appearance travels; runtime resources, words, audio and payment state do not.
import { config as original } from './config.js';
import { SHELLS, GROUND_EFFECTS, GROUND_MIXES, freeDesign, groundStyles } from './catalog.js';

export const MAX_LOOK_BYTES = 4096;
const BASE = structuredClone(original);
const RANGE = {
  renderer: { exposure: [0.3, 2] }, loop: { timeScale: [0.1, 1] },
  sky: { timeOfDay: [0, 1], cloudCoverage: [0, 0.8], starBrightness: [0, 2] },
  ocean: { waveHeight: [0, 2.5], choppiness: [0, 1.2], surf: [0, 1.6], foam: [0, 2] },
  beach: { glints: [0, 2] }, landmarks: { light: [0, 2], sweep: [0, 20] },
  show: { shellsPerMinute: [4, 120], maxShells: [1, 20, true] },
  fountains: { firstAt: [0, 90], every: [8, 90], duration: [3, 20], height: [8, 50], nozzles: [2, 14, true] },
  smoke: { amount: [0, 2], linger: [8, 60] }, snow: { amount: [0, 1], glow: [0, 3], size: [0.2, 3] },
  lake: { open: [0, 1] },
  look: { textWidth: [60, 260], particles: [80, 900, true], burstSize: [20, 110], lifetime: [1, 5], sparkSize: [0.3, 3], trailLength: [0, 3], glitter: [0, 1], brightness: [0.5, 4], sceneLight: [0, 3] },
  physics: { gravity: [0.2, 2], drag: [0.3, 2.5], windSpeed: [0, 15], windDirection: [0, 360], gustiness: [0, 2], heightMin: [40, 200], heightMax: [60, 260], launchSpread: [0, 150], angleVariance: [0, 25] },
  bloom: { strength: [0, 2], radius: [0, 1], threshold: [0.5, 2] },
};
const CHOICES = {
  place: { environment: ['beach', 'lake'] }, camera: { preset: ['sand', 'drone', 'water'] },
  landmarks: { lightColor: ['warm', 'white', 'red', 'green'] },
  show: { launchSite: ['barge', 'shore'] }, fountains: { color: ['gold', 'silver'] },
  look: { palette: Object.keys(BASE.palettes).filter((name) => name !== 'signature') },
};
const FLAGS = { landmarks: ['pier', 'grass'], fountains: ['enabled', 'sideBarges'], smoke: ['enabled'] };
const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
const number = (value, [min, max, integer], fallback) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const bounded = Math.min(max, Math.max(min, value));
  return integer ? Math.round(bounded) : bounded;
};

/** Accept only designable fields, falling back to the supplied design or shipped defaults. */
export function sanitizeDesign(input = {}, fallback = BASE) {
  const out = {};
  for (const [section, fields] of Object.entries(RANGE)) {
    out[section] ||= {};
    for (const [key, range] of Object.entries(fields)) out[section][key] = number(input[section]?.[key], range, fallback[section]?.[key] ?? BASE[section][key]);
  }
  for (const [section, fields] of Object.entries(CHOICES)) {
    out[section] ||= {};
    for (const [key, allowed] of Object.entries(fields)) out[section][key] = allowed.includes(input[section]?.[key]) ? input[section][key] : fallback[section]?.[key] ?? BASE[section][key];
  }
  for (const [section, fields] of Object.entries(FLAGS)) {
    out[section] ||= {};
    for (const key of fields) out[section][key] = typeof input[section]?.[key] === 'boolean' ? input[section][key] : fallback[section]?.[key] ?? BASE[section][key];
  }
  const style = input.fountains?.style;
  out.fountains.style = typeof style === 'string' && style.length <= 150 && style.split(',').every((name) => GROUND_EFFECTS.includes(name) || Object.hasOwn(GROUND_MIXES, name))
    ? style : fallback.fountains?.style ?? BASE.fountains.style;
  out.look.mix = {};
  const mix = object(input.look?.mix) ? input.look.mix : fallback.look?.mix || BASE.look.mix;
  for (const name of SHELLS) out.look.mix[name] = number(mix[name], [0, 5], 0);
  if (!SHELLS.some((name) => out.look.mix[name] > 0)) out.look.mix.peony = 1;
  const palette = input.palette ?? input.palettes?.custom;
  const valid = Array.isArray(palette) && palette.length === 3 && palette.every((color) => Array.isArray(color) && color.length === 3 && color.every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 4));
  out.palette = structuredClone(valid ? palette : fallback.palette || fallback.palettes?.custom || BASE.palettes.custom);
  if (out.physics.heightMin > out.physics.heightMax) out.physics.heightMin = out.physics.heightMax;
  return out;
}

export function takeDesign(config) { return sanitizeDesign(config); }

/** Mutate values in place so controls keep their object/array references. */
export function putDesign(config, design) {
  const safe = sanitizeDesign(design, takeDesign(config));
  for (const [section, fields] of Object.entries(safe)) {
    if (section === 'palette') continue;
    for (const [key, value] of Object.entries(fields)) {
      if (object(value)) Object.assign(config[section][key], value);
      else config[section][key] = value;
    }
  }
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) config.palettes.custom[i][j] = safe.palette[i][j];
  return config;
}

/** Reject unsafe pasted settings before applying any part of them. */
export function designError(input) {
  if (!object(input)) return 'Settings should be a JSON object.';
  for (const [section, fields] of Object.entries(RANGE)) {
    for (const [key, [min, max]] of Object.entries(fields)) {
      if (!Object.hasOwn(input[section] || {}, key)) continue;
      const value = input[section][key];
      if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) return `${section}.${key} must be a number from ${min} to ${max}.`;
    }
  }
  for (const [section, fields] of Object.entries(CHOICES)) for (const [key, allowed] of Object.entries(fields)) {
    if (Object.hasOwn(input[section] || {}, key) && !allowed.includes(input[section][key])) return `${section}.${key} is not a supported choice.`;
  }
  for (const [section, fields] of Object.entries(FLAGS)) for (const key of fields) {
    if (Object.hasOwn(input[section] || {}, key) && typeof input[section][key] !== 'boolean') return `${section}.${key} must be true or false.`;
  }
  if (input.fountains?.style != null && (typeof input.fountains.style !== 'string' || input.fountains.style.length > 150 ||
      !input.fountains.style.split(',').every((name) => GROUND_EFFECTS.includes(name) || Object.hasOwn(GROUND_MIXES, name)))) return 'Choose a supported ground effect.';
  if (input.look?.mix && Object.entries(input.look.mix).some(([key, value]) => (SHELLS.includes(key) || key === 'text') && (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 5))) return 'Firework weights must be numbers from 0 to 5.';
  return '';
}

/** Old links retain their compact, partial format. This helper makes a safe partial design. */
export function legacyDesign(look = {}) {
  const data = {};
  const map = { p: ['look', 'palette'], m: ['look', 'mix'], s: ['show', 'shellsPerMinute'], x: ['show', 'maxShells'], b: ['look', 'burstSize'], r: ['look', 'brightness'], t: ['sky', 'timeOfDay'], w: ['physics', 'windSpeed'], k: ['smoke', 'amount'], n: ['snow', 'amount'], c: ['camera', 'preset'], a: ['place', 'environment'], h: ['landmarks', 'light'], v: ['landmarks', 'sweep'], u: ['landmarks', 'lightColor'], o: ['lake', 'open'] };
  for (const [key, [section, field]] of Object.entries(map)) if (Object.hasOwn(look, key)) { data[section] ||= {}; data[section][field] = look[key]; }
  for (const [key, section, field] of [['e', 'fountains', 'sideBarges'], ['i', 'landmarks', 'pier'], ['d', 'landmarks', 'grass']]) if (look[key] === 0 || look[key] === 1) { data[section] ||= {}; data[section][field] = look[key] === 1; }
  if (typeof look.g === 'string') data.fountains = { ...data.fountains, enabled: Boolean(look.g), style: groundStyles(look.g).join(',') || 'fountains' };
  if (typeof look.k === 'number') data.smoke.enabled = look.k > 0.01;
  return data;
}

/** Canonical envelope for newly saved greetings, including submissions from old clients. */
export function normalizeLook(look, { tier = 'deluxe' } = {}) {
  if (!object(look)) return null;
  try { if (new TextEncoder().encode(JSON.stringify(look)).length > MAX_LOOK_BYTES) return null; } catch { return null; }
  if (look.ver != null && look.ver !== 1 && look.ver !== 2) return null;
  if (look.ver === 2 && !object(look.design)) return null;
  const design = sanitizeDesign(look.ver === 2 ? look.design : legacyDesign(look));
  return { ver: 2, design: tier === 'free' ? freeDesign(design) : design };
}

export function lookPlace(look) {
  const value = look?.ver === 2 ? look.design?.place?.environment : look?.a;
  return value === 'beach' || value === 'lake' ? value : null;
}
