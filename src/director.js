// Director: plays an occasion's ending, a timed sequence of shells, ground effects and
// words (see occasions.js). While it plays, the random show and the scheduled ground
// show hold off, so the ending reads as one authored piece.
import { GROUND, allowedEffects } from './occasions.js';

const TAIL = 6; // seconds after the last cue before the random show resumes
// An optional second line gets its own cue, a moment after the message and a little lower.
const SECOND_LINE = 1.6;
// Burst heights: the message, the second line, the recipient's name.
const HEIGHT = { message: 132, message2: 104, to: 76 };

export function create(ctx) {
  const { config } = ctx;
  let cues = [];
  let next = 0;
  let start = 0;
  let end = -Infinity;
  let now = 0;
  let words = { message: '', message2: '', to: '' };
  let allowed = null;
  let occasion = null;
  let deluxe = false;

  const director = {
    active: false,
    /** Plays `occasion`'s ending with these words; returns how long it lasts. */
    play(nextOccasion, nextWords, withDeluxe) {
      occasion = nextOccasion;
      deluxe = withDeluxe;
      allowed = allowedEffects(occasion, deluxe);
      words = nextWords;
      cues = withWords(occasion.ending.filter((cue) => deluxe || !cue.deluxe), words);
      next = 0;
      start = now + 0.3;
      end = start + (cues.length ? cues[cues.length - 1].at : 0) + TAIL;
      director.active = true;
      return end - start;
    },
    stop() {
      director.active = false;
      next = cues.length;
    },
  };
  ctx.director = director;

  // The occasion's cues plus the second line's (made once per play, not per frame).
  function withWords(list, w) {
    if (!w.message2) return list;
    const extra = list.filter((cue) => cue.text === 'message').map((cue) => ({ at: cue.at + SECOND_LINE, text: 'message2' }));
    return list.concat(extra).sort((a, b) => a.at - b.at);
  }

  // A Deluxe effect in a free greeting becomes the occasion's stand-in.
  function resolve(item) {
    if (occasion.deluxe.includes(item) && !allowed.has(item)) return occasion.fallback[item] || (GROUND.has(item) ? 'fountains' : 'peony');
    return item;
  }

  function fire(cue) {
    const fireworks = ctx.fireworks;
    if (!fireworks) return;
    const middle = config.show.bargePosition[0];
    if (cue.text) {
      const text = cue.text in HEIGHT ? words[cue.text] : cue.text;
      if (!text) return;
      config.look.text = text;
      config.look.textWidth = Math.min(250, Math.max(100, 60 + text.length * 10));
      // The name goes well below the message, which is still sinking when it bursts.
      fireworks.launchAt('text', middle, HEIGHT[cue.text] || 132);
    } else if (cue.ground) {
      if (ctx.fountains) ctx.fountains.play(resolve(cue.ground));
    } else if (cue.shell) {
      // Pulled in on an upright phone, so shells at the sides stay on screen.
      const squeeze = ctx.camera.aspect < 1 ? 0.72 : 1;
      fireworks.launchAt(resolve(cue.shell), middle + cue.x * squeeze, cue.h);
    }
  }

  return {
    update(dt, time) {
      now = time;
      if (!director.active) return;
      while (next < cues.length && time >= start + cues[next].at) fire(cues[next++]);
      if (time >= end) director.active = false;
    },

    dispose() {
      ctx.director = null;
    },
  };
}
