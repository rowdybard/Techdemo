// Ground show, fired from a row of tubes along the barge every so often. The 'mixed'
// style rotates through fountains (gerbs spraying sparks that arc over and rain back into
// the water, all together, sweeping either way, or at alternating heights), sweeping
// shooters, roman candles, mines and V fans (those four are in ground.js); a single
// style can be chosen instead. Like the shells, each effect writes all of its particles
// at once with birth times spread over its run, so nothing is simulated on the CPU, and
// each tube is a steady light the water and sand reflect while it runs.
import { KIND } from './fireworks.glsl.js';
import { BARGE_LENGTH } from './fireworks.js';
import { candles, fans, mines, shooters } from './ground.js';
import { cauldron, lanterns, lightning, wisps } from './haunt.js';

const STYLES = ['fountains', 'shooters', 'candles', 'mines', 'fans'];
const HALLOWEEN = ['cauldron', 'wisps', 'lightning', 'lanterns']; // style 'halloween' rotates these
const EFFECTS = { shooters, candles, mines, fans, cauldron, wisps, lightning, lanterns };

const MAX_NOZZLES = 14;
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
    lights.push({ time: -1e9, hold: 0, x: 0, y: 0, z: 0, r: 0, g: 0, b: 0, size: 0 });
  }
  let nextShow = settings.firstAt;
  let pattern = 0;
  let turn = 0;
  let now = 0;
  const tubes = []; // x of each tube along the barge, reused show to show
  let listFor = ''; // a style list, split once
  let list = [];

  function runShow(start, forced = null) {
    const pool = ctx.fireworks && ctx.fireworks.pool;
    if (!pool) return;
    const nozzles = Math.min(MAX_NOZZLES, Math.round(settings.nozzles * (phone ? 0.6 : 1)));
    const [bx, by, bz] = config.show.bargePosition;
    const span = BARGE_LENGTH * 0.85;
    tubes.length = 0;
    for (let i = 0; i < nozzles; i++) tubes.push(bx - span / 2 + (span * (i + 0.5)) / nozzles);
    let style = forced || settings.style;
    if (style === 'mixed') style = STYLES[turn++ % STYLES.length];
    else if (style === 'halloween') style = HALLOWEEN[turn++ % HALLOWEEN.length];
    else if (style.includes(',')) {
      // A list of styles (an occasion's ground effects) takes turns.
      if (style !== listFor) {
        listFor = style;
        list = style.split(',');
      }
      style = list[turn++ % list.length];
    }
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
      spray(pool, start + delay, x, by + 2.5, bz, height, i);
    }
  }

  function spray(pool, start, x, y, z, height, index) {
    const { physics, look } = config;
    const g = 9.81 * physics.gravity;
    const duration = settings.duration;
    const rate = phone ? 60 : 120; // sparks per second
    const count = Math.round(rate * duration);
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
      pool.set(i++, x + (Math.random() - 0.5) * 0.4, y, z + (Math.random() - 0.5) * 0.4, start + t + Math.random() / rate,
        Math.sin(spread) * Math.cos(around) * speed, Math.cos(spread) * speed, Math.sin(spread) * Math.sin(around) * speed, drag,
        hot[0], hot[1], hot[2], cool[0], cool[1], cool[2], 1.0,
        2.2 + Math.random() * 0.9, 0.22 * look.sparkSize, 0.22, KIND.glitter);
    }
    pool.end();
    const light = lights[index];
    light.time = start;
    light.hold = duration;
    light.x = x;
    light.y = y + height * 0.6;
    light.z = z;
    light.r = hot[0];
    light.g = hot[1];
    light.b = hot[2];
    light.size = 26;
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
        return;
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
