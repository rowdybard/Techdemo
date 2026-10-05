// The auto-director for a quiet stream (?live=1): when few people are chatting it keeps
// the show changing by itself, so the stream never looks like the same loop. It
//   - changes the look every few minutes (the sky eases to its new colour, a banner names it),
//   - plays a countdown, then a themed show at :00 (a grand finale), :20 and :40 (a mini
//     show) on the clock, waiting for any words in the sky to finish first,
//   - and every couple of minutes drops a line in the feed asking viewers to try a command,
//     unless people are already chatting.
// It only calls the page's own helpers (look, show, busy), so it never fights the paid
// words flow. Link options: director=0 turns it off, looks=15 (minutes between looks, 0 =
// never change), shows=0 (no clock shows).
import { PRESETS } from './presets.js';

const LOOKS = [
  ['Default', '🌅 Classic sunset', 0, 11],
  ['Gold Willows', '✨ Gold willows', 0, 11],
  ['Neon', '💜 Neon night', 0, 11],
  ['Calm', '🌙 Calm evening', 0, 11],
  ['Fourth of July', '🇺🇸 Red, white & blue', 5, 6], // months 0-11 it may appear in: June to July
  ['Halloween', '🎃 Halloween night', 8, 10], // September to November
];
const SHOW_MINUTES = 20; // clock shows at :00, :20, :40
const COUNTDOWN = 10; // seconds of "starting in" before a clock show
const MAX_WAIT = 120; // seconds a show waits for words in the sky to finish, then it's skipped
const PROMPTS = [
  'Type !heart to launch a heart 💖',
  'Try !pink heart or !blue ring 🎆',
  'Type !chaos for six shells at once',
  'Type !star gold ⭐',
  'A Super Chat puts your words in the sky: !sky HELLO',
  '!birthday NAME puts a name in the sky 🎂',
];
const EASE_PER_SECOND = 1 / 30; // the sky takes about 30 s to get to a new time of day
const ONE_MINUTE = 60000;

export function createDirector({ params, config, overlay, look, show, busy }) {
  if (params.get('director') === '0') return { update() {}, viewer() {}, dispose() {} };
  const lookMinutes = Number(params.get('looks') ?? 15);
  const clockShows = params.get('shows') !== '0';
  const zone = -new Date().getTimezoneOffset() * ONE_MINUTE; // so :00 is the viewer's local hour
  const month = new Date().getMonth();
  const looks = LOOKS.filter(([name, , from, to]) => PRESETS[name] && month >= from && month <= to);
  let lookIndex = Math.max(0, looks.findIndex(([name]) => name === params.get('preset')));
  let nextLook = Date.now() + lookMinutes * ONE_MINUTE;
  let skyTarget = config.sky.timeOfDay;

  const slot = SHOW_MINUTES * ONE_MINUTE;
  const local = () => Date.now() + zone;
  let showAt = Math.ceil((local() + COUNTDOWN * 1000 + 1) / slot) * slot; // local clock time of the next show
  let counting = false;
  let lastViewer = 0;
  let nextPrompt = Date.now() + 60000;
  let promptIndex = 0;

  function nextLookNow() {
    if (!looks.length) return;
    lookIndex = (lookIndex + 1) % looks.length;
    const before = config.sky.timeOfDay;
    look(looks[lookIndex][0]);
    skyTarget = config.sky.timeOfDay;
    config.sky.timeOfDay = before; // ease to the new sky instead of jumping
    overlay.banner(looks[lookIndex][1], 5);
  }

  function runShow() {
    const hour = showAt % (60 * ONE_MINUTE) === 0;
    show(hour ? 'finale' : 'mini');
    showAt = Math.ceil((local() + 1) / slot) * slot;
    counting = false;
  }

  return {
    update(dt) {
      const wall = Date.now();
      const step = EASE_PER_SECOND * dt;
      const gap = skyTarget - config.sky.timeOfDay;
      if (gap !== 0) config.sky.timeOfDay = Math.abs(gap) <= step ? skyTarget : config.sky.timeOfDay + Math.sign(gap) * step;

      if (clockShows) {
        const wait = showAt - local(); // ms until the show
        if (!counting && wait <= COUNTDOWN * 1000) {
          if (wait < -MAX_WAIT * 1000) showAt = Math.ceil((local() + 1) / slot) * slot; // missed it (a long pause): next slot
          else if (!busy()) {
            counting = true;
            overlay.countdown(showAt % (60 * ONE_MINUTE) === 0 ? '🎆 Top-of-the-hour grand finale' : '🎆 Mini show', 'starting in', Math.max(1, Math.round(wait / 1000)));
          }
        } else if (counting && wait <= 0) {
          if (!busy()) runShow();
          else if (wait < -MAX_WAIT * 1000) {
            counting = false;
            showAt = Math.ceil((local() + 1) / slot) * slot;
          }
        }
      }

      if (lookMinutes > 0 && wall >= nextLook && !busy() && !counting) {
        nextLook = wall + lookMinutes * ONE_MINUTE;
        nextLookNow();
      }

      if (wall >= nextPrompt) {
        nextPrompt = wall + 2 * ONE_MINUTE;
        if (!busy() && !counting && wall - lastViewer > 40000) overlay.feed(PROMPTS[promptIndex++ % PROMPTS.length], true);
      }
    },

    /** A viewer just did something: no prompts for a while. */
    viewer() {
      lastViewer = Date.now();
    },

    dispose() {},
  };
}
