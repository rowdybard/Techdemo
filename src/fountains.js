// Ground show, fired from a row of tubes along the barge every so often. The 'mixed'
// style rotates through fountains (gerbs spraying sparks that arc over and rain back into
// the water, all together, sweeping either way, or at alternating heights), sweeping
// shooters, roman candles, mines and V fans (those four are in ground.js); a single
// style can be chosen instead. Like the shells, each effect writes all of its particles
// at once with birth times spread over its run, so nothing is simulated on the CPU, and
// each tube is a steady light the water and sand reflect while it runs.
//
// Two small side barges (config.fountains.sideBarges) keep a ground show going almost
// all the time from four tubes each, smaller than the main barge's, always the same
// style the main barge last played: when it changes, they change with it.
import { KIND } from './fireworks.glsl.js';
import { BARGE_LENGTH, SIDE_BARGE_LENGTH, SIDE_BARGE_OFFSET } from './fireworks.js';
import { candles, fans, mines, shooters } from './ground.js';
import { cauldron, lanterns, lightning, wisps } from './haunt.js';

const STYLES = ['fountains', 'shooters', 'candles', 'mines', 'fans'];
const HALLOWEEN = ['cauldron', 'wisps', 'lightning', 'lanterns']; // style 'halloween' rotates these
const EFFECTS = { shooters, candles, mines, fans, cauldron, wisps, lightning, lanterns };

const MAX_NOZZLES = 14;
const SIDE_TUBES = 4; // on each side barge
const SIDE_GAP = 1.2; // seconds between side shows
const SIDE_SCALE = 0.72; // side effects reach this much of the main barge's height
const PATTERNS = ['together', 'sweep', 'alternate', 'sweep-back'];
// Dimmer than shell colours: hundreds of sparks overlap in a fountain.
const COLORS = {
  gold: [[0.6, 0.34, 0.09], [0.55, 0.18, 0.04]],
  silver: [[0.55, 0.55, 0.6], [0.4, 0.42, 0.6]],
};

export function create(ctx) {
  const { config, phone } = ctx;
  const settings = config.fountains;

  // One light per nozzle, read by burstlights.js: steady while the fountain runs.
  const lights = [];
  for (let i = 0; i < MAX_NOZZLES; i++) {
    lights.push({ time: -1e9, hold: 0, x: 0, y: 0, z: 0, r: 0, g: 0, b: 0, size: 0, smoke: 0, sound: 'none' });
  }
  // The side barges' tubes: their own lights (after the main barge's in the same list) and
  // where they stand.
  const sideLights = [[], []];
  const sideTubes = [[], []];
  for (let s = 0; s < 2; s++) {
    for (let i = 0; i < SIDE_TUBES; i++) {
      const record = { time: -1e9, hold: 0, x: 0, y: 0, z: 0, r: 0, g: 0, b: 0, size: 0, smoke: 0, sound: 'none' };
      lights.push(record);
      sideLights[s].push(record);
      const span = SIDE_BARGE_LENGTH * 0.8;
      sideTubes[s].push(config.show.bargePosition[0] + (s ? 1 : -1) * SIDE_BARGE_OFFSET - span / 2 + (span * (i + 0.5)) / SIDE_TUBES);
    }
  }
  let current = ''; // the style the main barge last played
  let nextSide = settings.firstAt;
  let nextShow = settings.firstAt;
  let pattern = 0;
  let turn = 0;
  let now = 0;
  const tubes = []; // x of each tube along the barge, reused show to show
  let listFor = ''; // a style list, split once
  let list = [];

  // The style a show plays: a mix or a list takes its next turn.
  function resolve(style) {
    if (style === 'mixed') return STYLES[turn++ % STYLES.length];
    if (style === 'halloween') return HALLOWEEN[turn++ % HALLOWEEN.length];
    if (style.includes(',')) {
      // A list of styles (an occasion's ground effects) takes turns.
      if (style !== listFor) {
        listFor = style;
        list = style.split(',');
      }
      return list[turn++ % list.length];
    }
    return style;
  }

  function runShow(start, forced = null) {
    const pool = ctx.fireworks && ctx.fireworks.pool;
    if (!pool) return;
    pool.groundShow(true);
    playMain(pool, start, forced);
    pool.groundShow(false);
  }

  function playMain(pool, start, forced) {
    const nozzles = Math.min(MAX_NOZZLES, Math.round(settings.nozzles * (phone ? 0.6 : 1)));
    const [bx, by, bz] = config.show.bargePosition;
    const span = BARGE_LENGTH * 0.85;
    tubes.length = 0;
    for (let i = 0; i < nozzles; i++) tubes.push(bx - span / 2 + (span * (i + 0.5)) / nozzles);
    const style = resolve(forced || settings.style);
    // The side barges switch to it at once.
    current = style;
    nextSide = start;
    if (EFFECTS[style]) {
      EFFECTS[style](pool, config, phone, start, tubes, by + 2.5, bz, config.palettes[config.look.palette], lights);
      return;
    }
    const kind = PATTERNS[pattern];
    pattern = (pattern + 1) % PATTERNS.length;
    for (let i = 0; i < nozzles; i++) {
      const x = tubes[i];
      let delay = 0;
      if (kind === 'sweep') delay = i * 0.3;
      if (kind === 'sweep-back') delay = (nozzles - 1 - i) * 0.3;
      const height = settings.height * (kind === 'alternate' && i % 2 === 1 ? 0.62 : 1);
      spray(pool, start + delay, x, by + 2.5, bz, height, lights[i], 1);
    }
  }

  // Both side barges at once, in the main barge's style, smaller. Returns when it ends.
  function runSides(start) {
    const pool = ctx.fireworks && ctx.fireworks.pool;
    if (!pool) return start + 2;
    pool.groundShow(true);
    const end = playSides(pool, start);
    pool.groundShow(false);
    return end;
  }

  function playSides(pool, start) {
    const style = current || firstStyle();
    const [, by, bz] = config.show.bargePosition;
    let end = start + 2;
    for (let s = 0; s < 2; s++) {
      if (EFFECTS[style]) {
        // The effects size themselves from the fountain height: lowered for the call.
        const height = settings.height;
        settings.height = height * SIDE_SCALE;
        EFFECTS[style](pool, config, phone, start, sideTubes[s], by + 1.8, bz, config.palettes[config.look.palette], sideLights[s]);
        settings.height = height;
      } else {
        for (let i = 0; i < SIDE_TUBES; i++) {
          spray(pool, start + i * 0.15, sideTubes[s][i], by + 1.8, bz, settings.height * SIDE_SCALE, sideLights[s][i], 0.5);
        }
      }
      for (let i = 0; i < SIDE_TUBES; i++) {
        const record = sideLights[s][i];
        if (record.time >= start - 0.01) {
          end = Math.max(end, record.time + record.hold);
          record.smoke *= 0.5; // small barges, small tubes: half the smoke
        }
      }
    }
    return end;
  }

  // Before the main barge has played: the style it will start with.
  function firstStyle() {
    const style = settings.style;
    if (style === 'mixed') return STYLES[0];
    if (style === 'halloween') return HALLOWEEN[0];
    return style.split(',')[0];
  }

  // One fountain; rate scales how many sparks it throws (the side barges' are thinner).
  function spray(pool, start, x, y, z, height, light, rate) {
    const { physics, look } = config;
    const g = 9.81 * physics.gravity;
    const duration = settings.duration;
    const perSecond = (phone ? 60 : 120) * rate;
    const count = Math.round(perSecond * duration);
    const drag = 0.35;
    const [hot, cool] = COLORS[settings.color] || COLORS.gold;
    // Launch speed for the height, with a little extra to overcome drag.
    const top = Math.sqrt(2 * g * height) * 1.18;
    let i = pool.begin(count);
    for (let k = 0; k < count; k++) {
      const t = (k / count) * duration;
      // It swells up over the first second and dies down over the last.
      const swell = Math.min(1, 0.45 + t / 1.2) * Math.min(1, 0.4 + (duration - t) / 1.4);
      const speed = top * swell * (0.7 + Math.random() * 0.35);
      // A cone that opens out, so the spray arcs over and falls like a plume.
      const spread = 0.32 * Math.sqrt(Math.random());
      const around = Math.random() * Math.PI * 2;
      pool.set(i++, x + (Math.random() - 0.5) * 0.4, y, z + (Math.random() - 0.5) * 0.4, start + t + Math.random() / perSecond,
        Math.sin(spread) * Math.cos(around) * speed, Math.cos(spread) * speed, Math.sin(spread) * Math.sin(around) * speed, drag,
        hot[0], hot[1], hot[2], cool[0], cool[1], cool[2], 1.0,
        2.2 + Math.random() * 0.9, 0.22 * look.sparkSize, 0.22, KIND.glitter);
    }
    pool.end();
    light.time = start;
    light.hold = duration;
    light.x = x;
    light.y = y + height * 0.6;
    light.z = z;
    light.r = hot[0];
    light.g = hot[1];
    light.b = hot[2];
    light.size = 26;
    light.smoke = 1; // fountains pour smoke the whole time they burn
    light.sound = 'hiss';
  }

  ctx.fountains = {
    lights,
    /** Starts a ground show right away. */
    start: () => runShow(now),
    /** Starts one ground effect right away, whatever the style setting. */
    play: (style) => runShow(now, style),
  };

  return {
    update(dt, time) {
      now = time;
      if (!settings.enabled) {
        nextShow = Math.max(nextShow, time + 2);
        nextSide = Math.max(nextSide, time + 2);
        return;
      }
      // The side barges, almost without a break (endings included: they follow its style).
      if (settings.sideBarges) {
        if (nextSide < time - 1) nextSide = time;
        if (time >= nextSide) nextSide = runSides(nextSide) + SIDE_GAP;
      }
      // An ending is playing: it fires its own ground effects.
      if (ctx.director && ctx.director.active) {
        nextShow = Math.max(nextShow, time + 6);
        return;
      }
      // After a long pause, skip the shows that were missed.
      if (nextShow < time - 1) nextShow = time;
      if (time >= nextShow) {
        runShow(nextShow);
        nextShow += settings.every;
      }
    },

    dispose() {
      ctx.fountains = null;
    },
  };
}
