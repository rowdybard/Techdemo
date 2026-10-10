// Director: plays an occasion's ending, a timed sequence of shells, ground effects and
// words (see occasions.js). While it plays, the random show and the scheduled ground
// show hold off, so the ending reads as one authored piece.
//
// A cue { at, countdown: 10 } starts the giant clock (countdown.js), which reaches zero that many
// seconds later. Cues with `zero: s` are timed from that zero instead of from the start: a shell
// then bursts exactly at zero + s, so the director sends it up a fuse's length (LEAD) early, and
// the climb itself is part of the build-up. A ground effect fires at zero + s itself.
import { GROUND, allowedEffects } from './occasions.js';

const TAIL = 6; // seconds after the last cue before the random show resumes
const LEAD = 6.3; // how long before it bursts a timed shell must leave (the longest fuse is 5.7 s)
// An optional second line gets its own cue, a moment after the message and a little lower.
const SECOND_LINE = 1.6;
// Burst heights: the message, the second line, the recipient's name.
const HEIGHT = { message: 132, message2: 104, to: 76, year: 132, from: 112 };
const SKY_LIMIT = 24; // characters a text shell spells

// The first letter of a name, for the keepsake heart.
function initial(name) {
  const letter = (name || '').toUpperCase().match(/[\p{L}\p{N}]/u);
  return letter ? letter[0] : '';
}

// How the sender signs a Deluxe show: FROM SAM, or the name alone if that's too long.
function signature(name) {
  const upper = (name || '').trim().toUpperCase();
  if (!upper) return '';
  return `FROM ${upper}`.length <= SKY_LIMIT ? `FROM ${upper}` : upper.slice(0, SKY_LIMIT);
}

// Cues timed from the clock's zero get their real times (a copy, so the occasion's own list is
// left as it was), and everything is put in the order it fires.
function timed(list) {
  const clock = list.find((cue) => cue.countdown);
  const zero = clock ? clock.at + clock.countdown : 0;
  return list.map((cue) => {
    if (cue.zero === undefined) return cue;
    const burst = zero + cue.zero;
    return { ...cue, burst, at: cue.shell || cue.text || cue.keepsake ? burst - LEAD : burst };
  }).sort((a, b) => a.at - b.at);
}

// When the last cue fires (or bursts), and the tail after it.
function lengthOf(cues) {
  return cues.reduce((last, cue) => Math.max(last, cue.burst === undefined ? cue.at : cue.burst), 0) + TAIL;
}

/** How long an occasion's ending runs, in seconds, free or Deluxe (the builder shows it). */
export function endingLength(occasion, deluxe) {
  return lengthOf(timed(occasion.ending.filter((cue) => deluxe || !cue.deluxe)));
}

// The year about to begin: from the middle of the year on, next year's.
function newYear() {
  const now = new Date();
  return now.getFullYear() + (now.getMonth() >= 5 ? 1 : 0);
}

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
  let originalText = null;

  const director = {
    active: false,
    // A crane cue's span (scene seconds), for crane.js.
    craneFrom: -Infinity,
    craneUntil: -Infinity,
    /** Plays `occasion`'s ending with these words; returns how long it lasts. */
    play(nextOccasion, nextWords, withDeluxe, { legacy = false } = {}) {
      director.stop();
      originalText = { text: config.look.text, width: config.look.textWidth };
      occasion = nextOccasion;
      deluxe = withDeluxe;
      allowed = allowedEffects(occasion, deluxe, legacy);
      words = { ...nextWords, year: String(newYear()), from: signature(nextWords.from),
        initials: [initial(nextWords.from), initial(nextWords.to)].filter(Boolean).join(' + ') };
      cues = withWords(timed(occasion.ending.filter((cue) => deluxe || !cue.deluxe)), words);
      next = 0;
      start = now + 0.3;
      director.craneFrom = -Infinity;
      director.craneUntil = -Infinity;
      end = start + lengthOf(cues);
      director.active = true;
      return end - start;
    },
    stop({ settle = false } = {}) {
      director.active = false;
      next = cues.length;
      director.craneUntil = -Infinity;
      if (ctx.countdown) ctx.countdown.stop();
      if (!settle) { ctx.crane?.reset(); ctx.fireworks?.cancelDirected?.(now); }
      if (originalText) {
        config.look.text = originalText.text;
        config.look.textWidth = originalText.width;
        originalText = null;
      }
    },
    get remaining() { return director.active ? Math.max(0, end - now) : 0; },
  };
  ctx.director = director;

  // The occasion's cues plus the second line's (made once per play, not per frame).
  function withWords(list, w) {
    if (!w.message2) return list;
    const extra = list.filter((cue) => cue.text === 'message').map((cue) => ({
      at: cue.at + SECOND_LINE, ...(cue.burst === undefined ? {} : { burst: cue.burst + SECOND_LINE }), text: 'message2',
    }));
    return list.concat(extra).sort((a, b) => a.at - b.at);
  }

  // A Deluxe effect in a free greeting becomes the occasion's stand-in.
  function resolve(item) {
    if (!allowed.has(item)) return occasion.fallback[item] || (GROUND.has(item) ? 'fountains' : 'peony');
    return item;
  }

  function fire(cue) {
    const fireworks = ctx.fireworks;
    if (!fireworks) return;
    const middle = config.show.bargePosition[0];
    const burstAt = cue.burst === undefined ? NaN : start + cue.burst;
    if (cue.countdown) {
      if (ctx.countdown) ctx.countdown.start(start + cue.at + cue.countdown);
    } else if (cue.keepsake) {
      // Their initials in a heart (or one initial, if only one name was given; none, no heart).
      if (!words.initials) return;
      config.look.text = words.initials;
      extend(fireworks.launchAt('initials', middle, cue.h || 150, burstAt, null, true));
    } else if (cue.crane) {
      director.craneFrom = start + cue.at;
      director.craneUntil = director.craneFrom + cue.crane;
    } else if (cue.text) {
      const text = cue.text in HEIGHT ? words[cue.text] : cue.text;
      if (!text) return;
      config.look.text = text;
      config.look.textWidth = cue.width || Math.min(250, Math.max(100, 60 + text.length * 10));
      // The name goes well below the message, which is still sinking when it bursts.
      extend(fireworks.launchAt('text', middle, HEIGHT[cue.text] || 132, burstAt, cue.palette, true));
    } else if (cue.ground) {
      if (ctx.fountains) extend(ctx.fountains.play(resolve(cue.ground), Boolean(cue.layer)));
    } else if (cue.shell) {
      // Pulled in on an upright phone, so shells at the sides stay on screen.
      const squeeze = ctx.camera.aspect < 1 ? 0.72 : 1;
      extend(fireworks.launchAt(resolve(cue.shell), middle + cue.x * squeeze, cue.h, burstAt, cue.palette, true));
    }
  }
  function extend(lastDeath) {
    if (Number.isFinite(lastDeath)) end = Math.max(end, lastDeath + 0.5);
  }

  return {
    update(dt, time) {
      now = time;
      if (!director.active) return;
      while (next < cues.length && time >= start + cues[next].at) fire(cues[next++]);
      if (time >= end) director.stop({ settle: true });
    },

    dispose() {
      director.stop();
      ctx.director = null;
    },
  };
}
