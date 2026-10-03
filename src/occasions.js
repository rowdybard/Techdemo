// Occasions: the content packs a SkyGreeting is made from. Each one is data, not code:
// a preset for the scene and show, a suggested message, the effects it features (free
// ones, and Deluxe ones a paid send unlocks), and its ending, a timed sequence of cues
// that director.js plays. A new season (Christmas, New Year's, Valentine's) is a new
// entry here, plus any new shells or ground effects it needs.
//
// Cues: { at: seconds, shell: type, x: metres across from the barge's middle, h: burst
// height } or { at, ground: style } or { at, text: 'message' | 'to' }. A cue for a Deluxe
// effect, or marked deluxe: true, plays only in a Deluxe greeting; otherwise a shell or
// ground effect it names is swapped for the occasion's stand-in (`fallback`).
import { applyPreset } from './presets.js';

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

const finale = (start, types) => types.map((shell, k) => ({
  at: start + k * 0.35, shell, x: ((k * 53) % 180) - 90, h: 95 + ((k * 37) % 45), deluxe: true,
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
      ...finale(16.5, ['skull', 'brew', 'wisp', 'web', 'bat', 'brew', 'skull', 'crackle', 'wisp', 'pumpkin']),
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
      ...finale(13, ['multibreak', 'crossette', 'strobe', 'peony', 'multibreak', 'ring', 'crossette', 'star']),
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
      ...finale(13.5, ['heart', 'ring', 'heart', 'strobe', 'heart', 'heart', 'ring']),
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
      ...finale(13, ['multibreak', 'crackle', 'strobe', 'crossette', 'multibreak', 'star', 'crackle', 'palm']),
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
      ...finale(12.5, ['crackle', 'willow', 'chrysanthemum', 'crackle', 'willow', 'palm', 'crackle']),
    ],
  },
};

export const DEFAULT_OCCASION = 'halloween';

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

export function allowedEffects(occasion, deluxe) {
  return new Set(deluxe ? occasion.free.concat(occasion.deluxe) : occasion.free);
}
