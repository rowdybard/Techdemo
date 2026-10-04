// The TikTok LIVE vocabulary, shared by the stream page (live.js) and the bridge server
// (live/rules.mjs): the colour and shape words viewers type in chat, the occasions a
// dedication can ask for, and the gift effects. Plain data, no DOM, so Node can import it.

// Chat colours, linear RGB like config.palettes. Each is a one-colour palette.
export const COLORS = {
  red: [1, 0.08, 0.05],
  orange: [1, 0.38, 0.04],
  gold: [1, 0.62, 0.16],
  yellow: [1, 0.85, 0.2],
  green: [0.15, 1, 0.22],
  teal: [0.1, 0.95, 0.8],
  blue: [0.15, 0.32, 1],
  purple: [0.6, 0.16, 1],
  pink: [1, 0.25, 0.65],
  white: [1, 0.95, 0.9],
};

// Chat shape words and the burst type each launches. `chaos` is handled on its own.
export const SHAPES = {
  peony: 'peony', boom: 'multibreak', ring: 'ring', heart: 'heart', star: 'star',
  willow: 'willow', palm: 'palm', crackle: 'crackle', strobe: 'strobe', crossette: 'crossette',
  mum: 'chrysanthemum', pumpkin: 'pumpkin', ghost: 'ghost', bat: 'bat', skull: 'skull',
};

// Words for a dedication (`!birthday Maya`) and the occasion in occasions.js each plays.
export const OCCASION_WORDS = {
  birthday: 'birthday', bday: 'birthday', hbd: 'birthday',
  love: 'love', congrats: 'congrats', thanks: 'thanks', thankyou: 'thanks',
  halloween: 'halloween', boo: 'halloween',
};

// What each gift effect is, for the help text and the admin page.
export const GIFT_EFFECTS = {
  rose: 'a red bloom per rose',
  heart: 'a pink heart per gift',
  sparkle: 'a gold shell per gift',
  fountain: 'the ground show and gold willows',
  name: 'their name spelled in the sky',
  barrage: 'a fan of twelve shells and crackle',
  finale: 'their name, then the grand finale',
  follow: 'a gold willow',
};

export const NAME_LIMIT = 16; // characters of a name in the sky
