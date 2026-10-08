// A greeting's look: the parts of a show someone designs in Customize (colours, which
// fireworks, ground show, pace, size, sparkle, sky, wind, smoke, snow, pier and its light,
// grass, view),
// packed small enough to ride in a free link or be stored with a paid greeting. Also
// what a free send may use: an occasion's Deluxe effects are taken back out.
import { GROUND, paidItems } from './occasions.js';
import { LIGHT_COLORS } from './lighthouse.js';

const MIXES = {
  mixed: ['fountains', 'shooters', 'candles', 'mines', 'fans'],
  halloween: ['cauldron', 'wisps', 'lightning', 'lanterns'],
};
const CAMERAS = new Set(['sand', 'drone', 'water']);

/** The designed parts of the config, as a small plain object. */
export function lookOf(config) {
  const mix = {};
  for (const type in config.look.mix) if (type !== 'text' && config.look.mix[type] > 0) mix[type] = Math.round(config.look.mix[type] * 10) / 10;
  const look = {
    p: config.look.palette,
    m: mix,
    g: config.fountains.enabled ? config.fountains.style : '',
    s: config.show.shellsPerMinute,
    x: config.show.maxShells,
    b: config.look.burstSize,
    r: Math.round(config.look.brightness * 100) / 100,
    t: Math.round(config.sky.timeOfDay * 100) / 100,
    w: Math.round(config.physics.windSpeed * 10) / 10,
    k: config.smoke.enabled ? Math.round(config.smoke.amount * 100) / 100 : 0,
    n: Math.round(config.snow.amount * 100) / 100,
    e: config.fountains.sideBarges ? 1 : 0,
    i: config.landmarks.pier ? 1 : 0,
    d: config.landmarks.grass ? 1 : 0,
    c: config.camera.preset,
  };
  // The lighthouse's light, only when there's a lighthouse.
  if (config.landmarks.pier) {
    look.h = Math.round(config.landmarks.light * 100) / 100;
    look.v = Math.round(config.landmarks.sweep * 10) / 10;
    look.u = config.landmarks.lightColor;
  }
  return look;
}

/** Applies a look (from a link or the server: untrusted, so every value is checked). */
export function applyLook(config, look) {
  if (!look || typeof look !== 'object') return;
  const number = (value, min, max, fallback) => (typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback);
  if (typeof look.p === 'string' && config.palettes[look.p] && look.p !== 'custom') config.look.palette = look.p;
  if (look.m && typeof look.m === 'object') {
    let any = false;
    for (const type in config.look.mix) {
      if (type === 'text') continue;
      const weight = number(look.m[type], 0, 5, 0);
      config.look.mix[type] = weight;
      if (weight > 0) any = true;
    }
    if (!any) config.look.mix.peony = 1;
  }
  if (typeof look.g === 'string') {
    const styles = look.g.split(',').filter((style) => GROUND.has(style) || MIXES[style]);
    config.fountains.enabled = styles.length > 0;
    if (styles.length) config.fountains.style = styles.join(',');
  }
  config.show.shellsPerMinute = number(look.s, 4, 120, config.show.shellsPerMinute);
  config.show.maxShells = Math.round(number(look.x, 1, 20, config.show.maxShells));
  config.look.burstSize = number(look.b, 20, 110, config.look.burstSize);
  config.look.brightness = number(look.r, 0.5, 4, config.look.brightness);
  config.sky.timeOfDay = number(look.t, 0, 1, config.sky.timeOfDay);
  config.physics.windSpeed = number(look.w, 0, 15, config.physics.windSpeed);
  const smoke = number(look.k, 0, 2, config.smoke.enabled ? config.smoke.amount : 0);
  config.smoke.enabled = smoke > 0.01;
  config.smoke.amount = smoke;
  config.snow.amount = number(look.n, 0, 1, config.snow.amount);
  if (look.e === 0 || look.e === 1) config.fountains.sideBarges = look.e === 1;
  if (look.i === 0 || look.i === 1) config.landmarks.pier = look.i === 1;
  if (look.d === 0 || look.d === 1) config.landmarks.grass = look.d === 1;
  config.landmarks.light = number(look.h, 0, 2, config.landmarks.light);
  config.landmarks.sweep = number(look.v, 0, 20, config.landmarks.sweep);
  if (typeof look.u === 'string' && Object.hasOwn(LIGHT_COLORS, look.u)) config.landmarks.lightColor = look.u;
  if (CAMERAS.has(look.c)) config.camera.preset = look.c;
}

/**
 * The Deluxe effects of `occasion` this config uses. The "A bit of everything" mix doesn't
 * count: it's the default, and a free send quietly uses only its free effects.
 */
export function deluxeInUse(config, occasion) {
  const used = [];
  const ground = chosenGround(config);
  for (const item of paidItems(occasion)) {
    if (item === 'finale') continue;
    if (GROUND.has(item) ? ground.includes(item) : config.look.mix[item] > 0) used.push(item);
  }
  return used;
}

// The ground effects someone picked by name (a single style, a list, or the Halloween mix).
function chosenGround(config) {
  if (!config.fountains.enabled) return [];
  return config.fountains.style.split(',').flatMap((style) => (style === 'mixed' ? [] : MIXES[style] || [style]));
}

/** Takes an occasion's Deluxe effects back out, for a free send. */
export function keepFree(config, occasion) {
  const paid = paidItems(occasion);
  for (const item of paid) if (!GROUND.has(item) && item in config.look.mix) config.look.mix[item] = 0;
  let any = false;
  for (const type in config.look.mix) if (type !== 'text' && config.look.mix[type] > 0) any = true;
  if (!any) for (const item of occasion.free) if (item in config.look.mix) config.look.mix[item] = 1;
  if (config.fountains.enabled) {
    let styles = groundStyles(config).filter((style) => !paid.has(style));
    if (!styles.length) styles = occasion.free.filter((item) => GROUND.has(item));
    if (styles.length) config.fountains.style = styles.join(',');
    else config.fountains.enabled = false;
  }
}

// The ground effects a style setting plays: one, a list, or a named mix.
function groundStyles(config) {
  if (!config.fountains.enabled) return [];
  return config.fountains.style.split(',').flatMap((style) => MIXES[style] || [style]);
}

/** Adds an occasion's Deluxe effects to the show (Deluxe ticked in the builder). */
export function addDeluxe(config, occasion) {
  for (const item of occasion.deluxe) if (!GROUND.has(item) && item in config.look.mix) config.look.mix[item] = Math.max(config.look.mix[item], 1.2);
  const extra = occasion.deluxe.filter((item) => GROUND.has(item));
  if (extra.length) {
    const styles = new Set(groundStyles(config).concat(extra));
    config.fountains.enabled = true;
    config.fountains.style = [...styles].join(',');
  }
}
