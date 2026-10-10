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
//
// A barge plays one show at a time. A show started while another is still pouring (a style
// picked in Customize, an ending's next effect) stops the one before it: its sparks already in
// the air fall, and nothing more comes out of its tubes. The schedule waits for a show to end. Only
// an ending's cue marked `layer` (midnight's eruption) plays over what's running.
import { KIND } from './fireworks.glsl.js';
import { BARGE_LENGTH, SIDE_BARGE_LENGTH, SIDE_BARGE_OFFSET } from './fireworks.js';
import { candles, fans, mines, shooters, waterfall } from './ground.js';
import { cauldron, lanterns, lightning, wisps } from './haunt.js';
import { groundStyles } from './catalog.js';

const EFFECTS = { shooters, candles, mines, fans, waterfall, cauldron, wisps, lightning, lanterns };

const MAX_NOZZLES = 14;
const SIDE_TUBES = 4; // on each side barge
const SIDE_GAP = 1.2; // seconds between side shows
const SIDE_SCALE = 0.72; // side effects reach this much of the main barge's height
// Every ground effect sizes itself from the fountain height and the spark size, so a show
// is drawn with both raised by this much (on the owner's word: about 10% bigger).
const GROUND_SCALE = 1.1;
const PATTERNS = ['together', 'sweep', 'alternate', 'sweep-back'];
const MAIN = 1; // the pool's owner ids for each barge's sparks
const SIDES = 2;
const BREATH = 3; // seconds between the end of one scheduled show and the next, at the least
// Dimmer than shell colours: hundreds of sparks overlap in a fountain.
const COLORS = {
  gold: [[0.6, 0.34, 0.09], [0.55, 0.18, 0.04]],
  silver: [[0.42, 0.42, 0.47], [0.3, 0.32, 0.46]], // dimmer than it looks: white sparks pile up into a white blob
};

export function create(ctx) {
  const { config, phone } = ctx;
  const settings = config.fountains;

  // One light per nozzle, read by burstlights.js: steady while the fountain runs.
  const lights = [];
  for (let i = 0; i < MAX_NOZZLES; i++) {
    lights.push({ owner: MAIN, time: -1e9, hold: 0, x: 0, y: 0, z: 0, r: 0, g: 0, b: 0, size: 0, smoke: 0, sound: 'none' });
  }
  // The side barges' tubes: their own lights (after the main barge's in the same list) and
  // where they stand.
  const sideLights = [[], []];
  const sideTubes = [[], []];
  for (let s = 0; s < 2; s++) {
    for (let i = 0; i < SIDE_TUBES; i++) {
      const record = { owner: SIDES, time: -1e9, hold: 0, x: 0, y: 0, z: 0, r: 0, g: 0, b: 0, size: 0, smoke: 0, sound: 'none' };
      lights.push(record);
      sideLights[s].push(record);
      const span = SIDE_BARGE_LENGTH * 0.8;
      sideTubes[s].push(config.show.bargePosition[0] + (s ? 1 : -1) * SIDE_BARGE_OFFSET - span / 2 + (span * (i + 0.5)) / SIDE_TUBES);
    }
  }
  let current = ''; // the style the main barge last played
  let mainUntil = -1e9; // when the main barge's show stops pouring
  let nextSide = settings.firstAt;
  let nextShow = settings.firstAt;
  let pattern = 0;
  let turn = 0;
  let now = 0;
  let mainEnabled = settings.enabled;
  let sidesEnabled = settings.enabled && settings.sideBarges;
  const tubes = []; // x of each tube along the barge, reused show to show
  let listFor = ''; // a style list, split once
  let list = [];

  function stylesFor(style) {
    if (style !== listFor) {
      listFor = style;
      list = groundStyles(style);
    }
    return list;
  }
  // Rendering and entitlement labels expand mixed ground shows identically.
  function resolve(style) {
    const styles = stylesFor(style);
    return styles.length > 1 ? styles[turn++ % styles.length] : styles[0] || 'fountains';
  }

  // `layer`: play over the show that's running instead of stopping it, and leave the side barges be.
  function runShow(start, forced = null, layer = false) {
    const pool = ctx.fireworks && ctx.fireworks.pool;
    if (!pool) return;
    if (!layer && start < mainUntil) {
      stopShow(MAIN, start);
    }
    pool.groundShow(MAIN);
    grow();
    playMain(pool, start, forced, layer);
    shrink();
    pool.groundShow(0);
    let until = layer ? mainUntil : start;
    for (let i = 0; i < MAX_NOZZLES; i++) {
      const record = lights[i];
      if (record.time >= start - 0.01) until = Math.max(until, record.time + record.hold);
    }
    mainUntil = until;
    return pool.latestDeath(MAIN);
  }

  function stopShow(owner, time) {
    ctx.fireworks?.pool.cut(owner, time);
    ctx.smoke?.cutGround(owner, time);
    ctx.audio?.cutGround(owner);
    stopLights(lights, owner === MAIN ? 0 : MAX_NOZZLES, owner === MAIN ? MAX_NOZZLES : lights.length, time);
  }

  // Ends the lights of a show that was stopped: a short fade, and none for tubes yet to fire.
  function stopLights(list, from, to, time) {
    for (let i = from; i < to; i++) {
      const record = list[i];
      if (record.time + record.hold <= time) continue;
      if (record.time >= time) record.time = -1e9;
      else record.hold = Math.min(record.hold, time - record.time + 0.6);
    }
  }

  function playMain(pool, start, forced, layer) {
    const nozzles = Math.min(MAX_NOZZLES, Math.round(settings.nozzles * (phone ? 0.6 : 1)));
    const [bx, by, bz] = config.show.bargePosition;
    const span = BARGE_LENGTH * 0.85;
    tubes.length = 0;
    for (let i = 0; i < nozzles; i++) tubes.push(bx - span / 2 + (span * (i + 0.5)) / nozzles);
    const style = resolve(forced || settings.style);
    // The side barges switch to it at once (a layered effect leaves them be).
    if (!layer) {
      current = style;
      nextSide = start;
      if (sidesUntil > start) {
        stopShow(SIDES, start);
      }
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
      spray(pool, start + delay, x, by + 2.5, bz, height, lights[i], 1);
    }
  }

  // Both side barges at once, in the main barge's style, smaller. Returns when it ends.
  let sidesUntil = -1e9;
  function runSides(start) {
    const pool = ctx.fireworks && ctx.fireworks.pool;
    if (!pool) return start + 2;
    pool.groundShow(SIDES);
    grow();
    sidesUntil = playSides(pool, start);
    shrink();
    pool.groundShow(0);
    return sidesUntil;
  }

  function playSides(pool, start) {
    // Every style, the waterfall too (its density is by the metre, so a side barge's is a short curtain).
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

  // Raise the height and spark size while a show is written, then put them back (the
  // settings stay as the person set them; only the effects come out bigger).
  let grownHeight = 0;
  let grownSize = 0;
  function grow() {
    grownHeight = settings.height;
    grownSize = config.look.sparkSize;
    settings.height = grownHeight * GROUND_SCALE;
    config.look.sparkSize = grownSize * GROUND_SCALE;
  }
  function shrink() {
    settings.height = grownHeight;
    config.look.sparkSize = grownSize;
  }

  // Before the main barge has played: the style it will start with.
  function firstStyle() {
    return stylesFor(settings.style)[0] || 'fountains';
  }

  // One fountain; rate scales how many sparks it throws (the side barges' are thinner).
  function spray(pool, start, x, y, z, height, light, rate) {
    const { physics, look } = config;
    const g = 9.81 * physics.gravity;
    const duration = settings.duration;
    const perSecond = (phone ? 40 : 80) * rate; // thinned a third: denser plumes glowed into blobs
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
    /** Starts a ground show right away (stopping the one running); the next scheduled one is a full gap later. */
    start: () => {
      runShow(now);
      nextShow = now + settings.every;
    },
    /** Starts one ground effect right away, whatever the style setting; `layer` plays it over the one running. */
    play: (style, layer = false) => runShow(now, style, layer),
  };

  return {
    update(dt, time) {
      now = time;
      const sidesOn = settings.enabled && settings.sideBarges;
      if (!sidesOn && (sidesEnabled || sidesUntil > time)) {
        stopShow(SIDES, time);
        sidesUntil = time;
        nextSide = time + SIDE_GAP;
      }
      sidesEnabled = sidesOn;
      if (!settings.enabled) {
        if (mainEnabled || mainUntil > time) {
          stopShow(MAIN, time);
          mainUntil = time;
        }
        mainEnabled = false;
        nextShow = Math.max(nextShow, time + 2);
        nextSide = Math.max(nextSide, time + 2);
        return;
      }
      mainEnabled = true;
      if (ctx.recordingTail) {
        nextShow = Math.max(nextShow, time + 2);
        nextSide = Math.max(nextSide, time + SIDE_GAP);
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
      // After a long pause, skip the shows that were missed. One still pouring (started from
      // Customize, or an ending's last) is let finish first.
      if (nextShow < time - 1) nextShow = time;
      if (time >= nextShow && time < mainUntil) nextShow = mainUntil + BREATH;
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
