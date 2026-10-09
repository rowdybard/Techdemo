// Occasions: the content packs a SkyGreeting is made from. Each one is data, not code:
// a preset for the scene and show, a suggested message, the effects it features (free
// ones, and Deluxe ones a paid send unlocks), and its ending, a timed sequence of cues
// that director.js plays. A new season (Christmas, New Year's, Valentine's) is a new
// entry here, plus any new shells or ground effects it needs.
//
// Cues: { at: seconds, shell: type, x: metres across from the barge's middle, h: burst
// height } or { at, ground: style } (it stops the ground effect before it; with layer: true it
// plays over it) or { at, text: 'message' | 'to' | 'year' | 'from' (the sender, signed) }, or { at,
// countdown: seconds } to hang the giant clock in the sky, or { at, crane: seconds } to lift the
// camera toward the show for that long (crane.js). A cue with `zero: s` in place of `at`
// happens s seconds after the clock reaches zero (director.js sends a shell up early so it bursts
// right then). A shell cue may name a `palette` (one of config.palettes) to be coloured with. A cue for a Deluxe
// effect, or marked deluxe: true, plays only in a Deluxe greeting; otherwise a shell or
// ground effect it names is swapped for the occasion's stand-in (`fallback`).
import { PRESETS, SCENE, applyPreset, applyPresetSections, putScene, takeScene } from './presets.js';

export const PRICE = '$4.99';

// Names for the effect chips.
export const LABELS = {
  pumpkin: "Jack-o'-lanterns", skull: 'Skulls', bat: 'Bats', ghost: 'Ghosts', web: 'Spider webs',
  brew: "Witch's brew", eyes: 'Eyes in the dark', wisp: "Will-o'-the-wisps",
  cauldron: 'Bubbling cauldrons', wisps: 'Rising wisps', lightning: 'Lightning', lanterns: 'Floating lanterns',
  heart: 'Hearts', star: 'Stars', ring: 'Rings', peony: 'Peonies', willow: 'Gold willows', palm: 'Palms',
  crossette: 'Crossettes', strobe: 'Strobes', crackle: 'Crackle', multibreak: 'Double breaks', chrysanthemum: 'Chrysanthemums',
  fountains: 'Fountains', candles: 'Roman candles', shooters: 'Sweeping shooters', mines: 'Mines', fans: 'V fans',
  finale: 'Grand finale',
};

export const GROUND = new Set(['fountains', 'shooters', 'candles', 'mines', 'fans', 'cauldron', 'wisps', 'lightning', 'lanterns']);

// Deluxe's grand finale, about 22 seconds timed by when each shell breaks (`zero` cues: with no
// clock, zero is the ending's start). The camera lifts and glides toward the show (crane.js); shells
// build across the whole sky with the ground show joining in, quicken into mirrored pairs, a breath,
// then a crescendo of sixteen across the sky inside a second and a half, and a last high break in
// gold over everything, and the sender's name signed under it. `shells` are the types it cycles
// through, `ground` three ground effects (the third layered on the crescendo), `last` the three of
// the last break.
function grandFinale(from, shells, ground, last, lastPalette = 'gold') {
  const cues = [{ zero: from - 1.5, crane: 24, deluxe: true }];
  const shell = (zero, type, x, h, palette) => cues.push({ zero, shell: type, x, h, deluxe: true, ...(palette ? { palette } : {}) });
  for (let k = 0; k < 18; k++) shell(from + k * 0.5, shells[k % shells.length], ((k * 71) % 300) - 150, 95 + ((k * 37) % 60));
  for (let k = 0; k < 12; k++) {
    const x = 40 + ((k * 53) % 150);
    const h = 100 + ((k * 29) % 70);
    const type = shells[(k + 3) % shells.length];
    shell(from + 9.2 + k * 0.5, type, -x, h);
    shell(from + 9.32 + k * 0.5, type, x, h);
  }
  for (let k = 0; k < 16; k++) shell(from + 16.4 + k * 0.09, shells[k % shells.length], -210 + k * 28, 110 + ((k * 41) % 80));
  shell(from + 19, last[0], -160, 165, lastPalette);
  shell(from + 19.15, last[1], 0, 205, lastPalette);
  shell(from + 19.3, last[2], 160, 165, lastPalette);
  cues.push(
    { zero: from + 22.4, text: 'from', palette: 'signature', deluxe: true },
    { zero: from - 0.4, ground: ground[0], deluxe: true },
    { zero: from + 8, ground: ground[1], deluxe: true },
    { zero: from + 16.2, ground: ground[2], deluxe: true, layer: true },
  );
  return cues;
}

// New Year's midnight. Shells that burst together at the clock's zero (director.js sends them up
// early): [type, x, burst height] for each. Spread across the whole sky, centre highest.
const salvo = (zero, shells, deluxe = false, palette) => shells.map(([shell, x, h], k) => ({
  zero: zero + k * 0.1, shell, x, h, ...(deluxe ? { deluxe: true } : {}), ...(palette ? { palette } : {}),
}));
// A run of shells, one every `step` seconds from `zero + from`, wandering across the sky (in the
// named palette, if given: the opening is gold and the barrage goes multicoloured).
const barrage = (from, count, step, types, deluxe = true, palette) => Array.from({ length: count }, (_, k) => ({
  zero: from + k * step, shell: types[k % types.length], x: ((k * 67) % 380) - 190, h: 86 + ((k * 43) % 110), ...(deluxe ? { deluxe: true } : {}), ...(palette ? { palette } : {}),
}));

export const OCCASIONS = {
  halloween: {
    label: 'Halloween',
    preset: 'Halloween',
    message: 'HAPPY HALLOWEEN',
    free: ['pumpkin', 'ghost', 'lanterns'],
    deluxe: ['skull', 'bat', 'web', 'brew', 'eyes', 'wisp', 'cauldron', 'wisps', 'lightning', 'finale'],
    fallback: { bat: 'ghost', skull: 'pumpkin', web: 'chrysanthemum', brew: 'crackle', eyes: 'strobe', wisp: 'willow', lightning: 'lanterns', cauldron: 'lanterns', wisps: 'lanterns' },
    ending: [
      { at: 0, ground: 'lightning' },
      { at: 1.0, shell: 'bat', x: -90, h: 120 },
      { at: 1.4, shell: 'bat', x: 90, h: 112 },
      { at: 3.0, shell: 'ghost', x: 0, h: 105 },
      { at: 5.5, text: 'message' },
      { at: 8.5, text: 'to' },
      { at: 10.5, shell: 'eyes', x: -70, h: 100 },
      { at: 11.0, shell: 'eyes', x: 75, h: 112 },
      { at: 12.5, shell: 'pumpkin', x: -95, h: 100 },
      { at: 12.9, shell: 'pumpkin', x: 0, h: 125 },
      { at: 13.3, shell: 'pumpkin', x: 95, h: 100 },
      { at: 13.6, ground: 'lanterns' },
      ...grandFinale(18, ['skull', 'bat', 'brew', 'ghost', 'web', 'pumpkin', 'eyes', 'wisp', 'crackle'], ['cauldron', 'wisps', 'lightning'], ['wisp', 'pumpkin', 'wisp'], 'halloween'),
    ],
  },

  birthday: {
    label: 'Birthday',
    preset: 'Default',
    message: 'HAPPY BIRTHDAY',
    free: ['peony', 'ring', 'star', 'candles'],
    deluxe: ['multibreak', 'crossette', 'strobe', 'mines', 'finale'],
    fallback: { multibreak: 'peony', crossette: 'chrysanthemum', strobe: 'ring', mines: 'candles' },
    ending: [
      { at: 0, ground: 'candles' },
      { at: 1.2, shell: 'peony', x: -80, h: 110 },
      { at: 1.6, shell: 'peony', x: 80, h: 110 },
      { at: 3.5, text: 'message' },
      { at: 6.5, text: 'to' },
      { at: 8.5, shell: 'ring', x: -60, h: 115 },
      { at: 8.9, shell: 'ring', x: 60, h: 115 },
      { at: 10, shell: 'star', x: 0, h: 125 },
      { at: 11, ground: 'mines' },
      ...grandFinale(15.5, ['multibreak', 'crossette', 'peony', 'strobe', 'ring', 'star', 'chrysanthemum'], ['fans', 'candles', 'mines'], ['willow', 'crossette', 'willow']),
    ],
  },

  love: {
    label: 'Love you',
    preset: 'Calm',
    message: 'I LOVE YOU',
    free: ['heart', 'willow', 'fountains'],
    deluxe: ['ring', 'strobe', 'fans', 'finale'],
    fallback: { ring: 'heart', strobe: 'willow', fans: 'fountains' },
    ending: [
      { at: 0, ground: 'fountains' },
      { at: 1.5, shell: 'heart', x: 0, h: 110 },
      { at: 4, text: 'message' },
      { at: 7, text: 'to' },
      { at: 9, shell: 'heart', x: -80, h: 105 },
      { at: 9.4, shell: 'heart', x: 80, h: 105 },
      { at: 10.5, ground: 'fans' },
      { at: 11, shell: 'willow', x: 0, h: 130 },
      ...grandFinale(16, ['heart', 'ring', 'willow', 'strobe', 'heart', 'peony', 'chrysanthemum'], ['fountains', 'fans', 'mines'], ['willow', 'heart', 'willow']),
    ],
  },

  congrats: {
    label: 'Congrats',
    preset: 'Fourth of July',
    message: 'CONGRATULATIONS',
    free: ['crossette', 'star', 'palm', 'shooters'],
    deluxe: ['multibreak', 'strobe', 'crackle', 'mines', 'finale'],
    fallback: { multibreak: 'crossette', strobe: 'star', crackle: 'palm', mines: 'shooters' },
    ending: [
      { at: 0, ground: 'shooters' },
      { at: 1.5, shell: 'crossette', x: -70, h: 115 },
      { at: 1.9, shell: 'crossette', x: 70, h: 115 },
      { at: 3.8, text: 'message' },
      { at: 7, text: 'to' },
      { at: 9, shell: 'star', x: 0, h: 120 },
      { at: 10, shell: 'palm', x: -90, h: 100 },
      { at: 10.3, shell: 'palm', x: 90, h: 100 },
      { at: 11, ground: 'mines' },
      ...grandFinale(15.5, ['multibreak', 'crackle', 'strobe', 'crossette', 'star', 'palm', 'chrysanthemum'], ['shooters', 'fans', 'mines'], ['willow', 'crackle', 'willow']),
    ],
  },

  newyear: {
    label: 'New Year',
    preset: 'Winter',
    message: 'HAPPY NEW YEAR',
    free: ['willow', 'peony', 'ring', 'fountains', 'candles'],
    deluxe: ['chrysanthemum', 'crackle', 'strobe', 'mines', 'fans', 'finale'],
    fallback: { chrysanthemum: 'peony', crackle: 'willow', strobe: 'ring', mines: 'candles', fans: 'fountains' },
    // A calm few seconds to take in the lake, the clock appears, ten seconds, and at zero the sky
    // goes off. Zero is at 18 s. The middle of the sky is kept clear while the year and the words
    // are up. Free gets the break, the year, the words and a short barrage; Deluxe gets a long
    // barrage and a crescendo on top.
    ending: [
      { at: 0, ground: 'fountains' },
      { at: 1.2, shell: 'willow', x: -70, h: 120 },
      { at: 2.6, shell: 'willow', x: 70, h: 126 },
      { at: 4.4, shell: 'peony', x: 0, h: 112 },
      { at: 5.6, ground: 'candles' },
      { at: 8, countdown: 10 },
      // Midnight: seven shells, the middle highest, and the ground goes up.
      ...salvo(0, [['willow', -150, 108], ['peony', -100, 126], ['willow', -50, 142], ['peony', 0, 162], ['willow', 50, 142], ['peony', 100, 126], ['willow', 150, 108]]),
      { zero: 0, ground: 'fountains' },
      ...salvo(0.9, [['ring', -70, 150], ['ring', 70, 150]]),
      { zero: 0.9, ground: 'candles', layer: true },
      ...salvo(1.6, [['chrysanthemum', -120, 135], ['crackle', 0, 175], ['chrysanthemum', 120, 135]], true),
      { zero: 1.6, ground: 'mines', deluxe: true, layer: true },
      // The year takes the clock's place; gold falls at the sides.
      { zero: 2.9, text: 'year', width: 215 },
      ...salvo(3.2, [['willow', -170, 150], ['willow', 170, 150], ['willow', -215, 140], ['willow', 215, 140]]),
      // Then the words, and the name under them.
      { zero: 6.8, text: 'message' },
      ...salvo(7.6, [['peony', -180, 130], ['peony', 180, 130]]),
      { zero: 10.8, text: 'to' },
      ...salvo(11.2, [['ring', -150, 120], ['ring', 150, 120]]),
      // The rest of the night.
      ...barrage(14.5, 16, 0.4, ['willow', 'peony', 'ring', 'peony'], false, 'classic'),
      { zero: 13, ground: 'fans', deluxe: true },
      { zero: 19, crane: 22, deluxe: true },
      ...barrage(20.8, 50, 0.26, ['chrysanthemum', 'willow', 'crackle', 'peony', 'strobe', 'ring', 'crackle', 'willow'], true, 'classic'),
      { zero: 20, ground: 'mines', deluxe: true },
      { zero: 25, ground: 'fountains', deluxe: true },
      // The crescendo: everything at once.
      ...salvo(35, [['strobe', -170, 120], ['chrysanthemum', -130, 150], ['crackle', -90, 130], ['willow', -50, 170], ['peony', -15, 140], ['strobe', 15, 185], ['chrysanthemum', 50, 140],
        ['willow', 90, 170], ['crackle', 130, 130], ['peony', 170, 150], ['ring', -60, 100], ['ring', 60, 100], ['crackle', 0, 120], ['strobe', 0, 100]], true, 'classic'),
      { zero: 35, ground: 'fountains', deluxe: true },
      { zero: 39, text: 'from', palette: 'signature', deluxe: true },
    ],
  },

  thanks: {
    label: 'Thank you',
    preset: 'Gold Willows',
    message: 'THANK YOU',
    free: ['willow', 'palm', 'fountains'],
    deluxe: ['crackle', 'chrysanthemum', 'candles', 'finale'],
    fallback: { crackle: 'willow', chrysanthemum: 'palm', candles: 'fountains' },
    ending: [
      { at: 0, ground: 'fountains' },
      { at: 1.5, shell: 'willow', x: 0, h: 120 },
      { at: 4, text: 'message' },
      { at: 7, text: 'to' },
      { at: 9, shell: 'palm', x: -80, h: 105 },
      { at: 9.4, shell: 'palm', x: 80, h: 105 },
      { at: 10.5, ground: 'candles' },
      ...grandFinale(15, ['crackle', 'willow', 'chrysanthemum', 'palm', 'peony', 'willow', 'crackle'], ['fountains', 'candles', 'mines'], ['willow', 'willow', 'willow']),
    ],
  },
};

export const DEFAULT_OCCASION = 'halloween';

/** The place an occasion is set in (its preset's), 'beach' unless the preset says otherwise. */
export function placeOf(name) {
  const preset = PRESETS[(OCCASIONS[name] || {}).preset];
  return (preset && preset.place && preset.place.environment) || 'beach';
}

/**
 * Puts an occasion that has a setting of its own (New Year's frozen lake) over a show someone
 * designed, without touching their fireworks: the place, its sky and its snow. Returns what it
 * replaced, for `returnScene`, or null if the occasion is just set on the beach.
 */
export function borrowScene(config, name) {
  const preset = PRESETS[(OCCASIONS[name] || {}).preset];
  if (!preset || !preset.place) return null;
  const before = takeScene(config);
  applyPresetSections(config, OCCASIONS[name].preset, SCENE);
  return before;
}

/** Gives back what `borrowScene` replaced. */
export function returnScene(config, before) {
  putScene(config, before);
}

/**
 * Sets up the scene and the background show for an occasion. Without Deluxe, the
 * occasion's Deluxe shells are taken out of the mix and its ground show plays only
 * free effects. Nothing is remembered in this viewer's saved settings.
 */
export function applyOccasion(config, name, deluxe) {
  const occasion = OCCASIONS[name] || OCCASIONS[DEFAULT_OCCASION];
  applyPreset(config, occasion.preset);
  const allowed = allowedEffects(occasion, deluxe);
  for (const item of occasion.free.concat(occasion.deluxe)) {
    if (GROUND.has(item) || item === 'finale') continue;
    if (item in config.look.mix) config.look.mix[item] = allowed.has(item) ? Math.max(config.look.mix[item], 1.2) : 0;
  }
  const ground = [...allowed].filter((item) => GROUND.has(item));
  if (ground.length) config.fountains.style = ground.join(',');
  config.look.mix.text = 0; // the ending spells the words, at the right moments
  return occasion;
}

// Every effect that's Deluxe in an occasion, wherever it's being made: that occasion's
// own Deluxe list, plus every effect no occasion gives away (the Halloween shells beyond
// the three free ones, chrysanthemums, strobes, fans...). Without the second part, a
// Birthday greeting could use Halloween's Deluxe shells for free, and Customize marked only
// the occasion's own few with ✦.
const GIVEN_AWAY = new Set(Object.values(OCCASIONS).flatMap((occasion) => occasion.free));
const EVERY_EFFECT = new Set(Object.values(OCCASIONS).flatMap((occasion) => occasion.free.concat(occasion.deluxe)));
const paid = new WeakMap();
export function paidItems(occasion) {
  let set = paid.get(occasion);
  if (!set) {
    set = new Set(occasion.deluxe);
    for (const item of EVERY_EFFECT) if (!GIVEN_AWAY.has(item)) set.add(item);
    paid.set(occasion, set);
  }
  return set;
}

export function allowedEffects(occasion, deluxe) {
  return new Set(deluxe ? occasion.free.concat(occasion.deluxe) : occasion.free);
}
