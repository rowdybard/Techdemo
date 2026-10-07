// Showcase greetings: Deluxe SkyGreetings the site owner made to show the product off
// (posted on TikTok and the like). They're paid greetings that never went through
// Stripe: /api/greeting and link previews read them from here before KV, so they play
// with every Deluxe effect and the grand finale. Only a code change can add one.
//
// Each look uses the same short keys as src/look.js (palette, mix, ground, pace, size,
// sparkle, time of day, wind, smoke, side barges, pier, grass, camera, lighthouse).

const made = Date.UTC(2026, 9, 7);
const greeting = (occasion, message, message2, to, look) => ({
  occasion, message, message2, to, from: '', look, deluxe: true, status: 'paid', created: made, showcase: true,
});

export const SHOWCASE = {
  // Halloween: bats, skulls, webs, brew, eyes and wisps, the Halloween ground mix
  // (lightning, cauldrons, wisps, lanterns) and a green lighthouse.
  Hx7kQm2a: greeting('halloween', 'HAPPY HALLOWEEN', '', 'BESTIE', {
    p: 'halloween', m: { bat: 1.5, skull: 1.2, web: 1, brew: 1, eyes: 0.8, wisp: 1, pumpkin: 1.5, ghost: 1, crackle: 0.6 },
    g: 'halloween', s: 28, x: 12, b: 90, r: 2.3, t: 0.95, w: 3, k: 0.15, e: 1, i: 1, d: 1, c: 'sand', h: 1.1, v: 6, u: 'green',
  }),
  Bd4tRw9e: greeting('birthday', 'HAPPY BIRTHDAY', '', 'MOM', {
    p: 'classic', m: { multibreak: 1.5, crossette: 1.2, strobe: 0.8, peony: 1.5, ring: 1, star: 0.8, chrysanthemum: 1.2, crackle: 0.8 },
    g: 'candles,mines', s: 32, x: 12, b: 90, r: 2.3, t: 0.75, w: 3, k: 0.12, e: 1, i: 0, d: 1, c: 'sand',
  }),
  Mr3yKp8s: greeting('love', 'WILL YOU MARRY ME?', '', '', {
    p: 'pastel', m: { heart: 2, ring: 1.2, strobe: 0.6, willow: 1.5, chrysanthemum: 0.8 },
    g: 'fans,candles', s: 20, x: 9, b: 85, r: 2, t: 0.85, w: 2, k: 0.1, e: 1, i: 1, d: 1, c: 'sand', h: 0.9, v: 4, u: 'warm',
  }),
  Dk6wHn4c: greeting('love', 'I MISS YOU', 'COME HOME SOON', 'DAD', {
    p: 'usa', m: { heart: 1, willow: 1.2, peony: 1.2, star: 1, chrysanthemum: 1.2, strobe: 0.6, multibreak: 0.8 },
    g: 'fans,candles', s: 20, x: 9, b: 85, r: 2, t: 0.9, w: 2, k: 0.1, e: 1, i: 1, d: 1, c: 'water', h: 1, v: 5, u: 'warm',
  }),
  Ts5vNq2g: greeting('thanks', 'THANK YOU', '', 'NIGHT SHIFT', {
    p: 'gold', m: { willow: 2, palm: 1.5, crackle: 1.2, chrysanthemum: 1.2 },
    g: 'fountains,candles', s: 24, x: 10, b: 95, r: 2.2, t: 1, w: 2, k: 0.12, e: 1, i: 1, d: 1, c: 'drone', h: 1, v: 5, u: 'white',
  }),
  Jb9xCf3m: greeting('congrats', 'YOU GOT THE JOB!', '', '', {
    p: 'neon', m: { crossette: 1.2, star: 1, palm: 1, multibreak: 1.5, strobe: 1, crackle: 1, ring: 1 },
    g: 'shooters,mines,fans', s: 32, x: 12, b: 90, r: 2.4, t: 0.85, w: 3, k: 0.12, e: 1, i: 0, d: 1, c: 'sand',
  }),
};

/** A showcase greeting by id (a fresh copy, so nothing can change the original), or null. */
export function showcase(id) {
  return Object.hasOwn(SHOWCASE, id) ? structuredClone(SHOWCASE[id]) : null;
}
