// Autoshow (skygreeting.com/autoshow, or ?autoshow=1): an endless, text-less fireworks
// show that is never the same twice, made to leave on a screen. It runs in acts of about
// half a minute to a minute, and inside each act something happens every 5 to 12 seconds
// (a volley, a sweep, mirrored pairs, a climbing tower, a zigzag, a rainbow arc, a rapid
// barrage, shells answered across the sky, a crown; a pause before a big volley, a burst
// of pace, a new kind of shell, new colours, the ground show). Each act draws its own design at random: which shells and how many kinds, the colours (a preset
// palette or freshly mixed hues), size, sparkle, trails, pace, the ground show and its
// style, side barges, smoke, the pier and lighthouse, the sky, the wind and sometimes the
// view. Within an act the pace swells toward the end, some acts close on a grand finale,
// and a short breather follows before the next. Sky, clouds, wind and smoke ease to their
// new values instead of jumping; shell changes only touch shells launched after them.
// It only writes config (as Customize does) and never saves it, so nobody's own design
// is touched. No words ever go up.

const CLASSIC = ['peony', 'chrysanthemum', 'willow', 'palm', 'ring', 'crossette', 'strobe', 'crackle', 'multibreak', 'heart', 'star',
  'kamuro', 'dahlia', 'saturn', 'fish', 'whirl', 'leaves'];
const SPOOKY = ['pumpkin', 'skull', 'bat', 'ghost', 'web', 'brew', 'eyes', 'wisp'];
const PALETTES = ['classic', 'usa', 'gold', 'neon', 'pastel', 'rainbow', 'royal', 'ocean', 'cosmic', 'rose', 'sakura', 'autumn', 'ice'];
const GROUND = ['fountains', 'shooters', 'candles', 'mines', 'fans', 'waterfall', 'mixed'];
const SPOOKY_GROUND = ['cauldron', 'wisps', 'lightning', 'lanterns', 'halloween'];
const LIGHT_COLORS = ['warm', 'white', 'red', 'green'];
const CAMERAS = ['sand', 'sand', 'sand', 'drone', 'water'];
const EASE = 1 / 25; // eased values move about 1/25 of their full range a second
// What happens next, picked at random (repeats weigh it): launch patterns, and changes.
const MOMENTS = ['volley', 'sweep', 'hush', 'rush', 'swap', 'recolour', 'ground', 'volley', 'sweep',
  'mirror', 'tower', 'zigzag', 'arc', 'barrage', 'echo', 'crown', 'mirror', 'arc', 'zigzag'];
const QUEUE = 48; // shells waiting to launch at set times (the launch patterns)

const rand = (a, b) => a + Math.random() * (b - a);
const chance = (p) => Math.random() < p;
const pickOne = (list) => list[(Math.random() * list.length) | 0];

// A bright, saturated colour of a random hue, linear RGB.
function hue() {
  const h = Math.random() * 6;
  const x = 1 - Math.abs((h % 2) - 1);
  const rgb = [[1, x, 0], [x, 1, 0], [0, 1, x], [0, x, 1], [x, 0, 1], [1, 0, x]][h | 0];
  const floor = rand(0.02, 0.15);
  return rgb.map((v) => Math.max(floor, v * v));
}

export function create(ctx) {
  const { config, container, signal } = ctx;
  if (!ctx.link.autoshow) return { update() {}, dispose() {} };
  container.classList.add('autoshow-mode');
  const { look, show, fountains, physics, sky, smoke, landmarks } = config;
  look.text = '';
  look.mix.text = 0;

  // The only controls: sound, and a way to make your own.
  const bar = document.createElement('div');
  bar.className = 'autoshow-bar';
  const sound = document.createElement('button');
  sound.type = 'button';
  sound.className = 'autoshow-button';
  const make = document.createElement('a');
  make.className = 'autoshow-button autoshow-make';
  make.href = '/';
  make.textContent = '🎆 Make your own';
  bar.append(sound, make);
  container.append(bar);
  const label = () => { sound.textContent = config.sound.volume > 0 ? '🔊 Sound on' : '🔈 Sound off'; };
  config.sound.enabled = true;
  config.sound.volume = 0;
  label();
  sound.addEventListener('click', () => {
    config.sound.volume = config.sound.volume > 0 ? 0 : 0.6;
    label();
  }, { signal });

  // Keep the screen awake while it plays (a TV or a phone on a stand), where allowed.
  let lock = null;
  const keepAwake = () => {
    if (document.hidden || !navigator.wakeLock) return;
    navigator.wakeLock.request('screen').then((l) => { lock = l; }, () => {});
  };
  keepAwake();
  document.addEventListener('visibilitychange', keepAwake, { signal });

  // Values that ease toward a target: [object, key, target, full range].
  const eased = [
    [sky, 'timeOfDay', sky.timeOfDay, 1],
    [sky, 'cloudCoverage', sky.cloudCoverage, 0.8],
    [physics, 'windSpeed', physics.windSpeed, 8],
    [physics, 'windDirection', physics.windDirection, 360],
    [smoke, 'amount', smoke.amount, 0.5],
  ];
  const target = (key, value) => { for (const e of eased) if (e[1] === key) e[2] = value; };

  let actEnd = 0; // when this act ends (show time, seconds)
  let swellAt = 0; // when the pace picks up for the act's close
  let finale = false;
  let breathUntil = 0; // a quiet moment between acts
  let basePace = 20;
  let started = false;
  let nextMoment = 0;
  let rushUntil = 0;
  let pool = CLASSIC;
  // Shells timed by a moment, in a fixed ring (nothing allocated while it plays).
  const queue = [];
  for (let q = 0; q < QUEUE; q++) queue.push({ at: Infinity, type: '', x: 0, h: 0 });
  let queued = 0;
  function later(at, type, x, h) {
    const slot = queue[queued++ % QUEUE];
    slot.at = at;
    slot.type = type;
    slot.x = x;
    slot.h = h;
  }
  // A shell type from this act's mix, at random by weight.
  function mixed() {
    let total = 0;
    for (const type in look.mix) total += look.mix[type];
    let roll = Math.random() * total;
    for (const type in look.mix) {
      roll -= look.mix[type];
      if (roll <= 0 && look.mix[type] > 0) return type;
    }
    return 'peony';
  }
  const middle = config.show.bargePosition[0];

  function moment(time) {
    const kind = pickOne(MOMENTS);
    const low = physics.heightMin;
    const span = physics.heightMax - physics.heightMin;
    const wide = ctx.camera && ctx.camera.aspect < 1 ? 150 : 220; // metres across the sky in view
    if (kind === 'volley' || kind === 'hush') {
      // Several at once (after a short hush, a bigger one), fanned across the sky.
      const count = kind === 'hush' ? 6 + ((Math.random() * 4) | 0) : 3 + ((Math.random() * 4) | 0);
      const start = time + (kind === 'hush' ? rand(2.5, 4) : 0.2);
      if (kind === 'hush') rushUntil = -start; // negative: hold the random show until `start`
      const type = chance(0.5) ? mixed() : '';
      for (let k = 0; k < count; k++) {
        later(start + k * rand(0.05, 0.25), type || mixed(), middle + (k / Math.max(1, count - 1) - 0.5) * rand(0.55, 1) * wide, low + Math.random() * span);
      }
    } else if (kind === 'sweep') {
      // One after another across the sky, left to right or back, rising or falling.
      const count = 5 + ((Math.random() * 5) | 0);
      const way = chance(0.5) ? 1 : -1;
      const climb = rand(-1, 1);
      const type = mixed();
      for (let k = 0; k < count; k++) {
        const share = k / (count - 1);
        later(time + 0.2 + k * rand(0.25, 0.45), type, middle + way * (share - 0.5) * wide, low + span * (0.5 + climb * (share - 0.5)));
      }
    } else if (kind === 'mirror') {
      // Pairs at once from both sides, walking in to the middle or out from it.
      const pairs = 3 + ((Math.random() * 3) | 0);
      const inward = chance(0.5);
      const type = mixed();
      const h = low + span * rand(0.3, 0.8);
      for (let k = 0; k < pairs; k++) {
        const out = (inward ? pairs - k : k + 1) / pairs;
        const at = time + 0.2 + k * rand(0.35, 0.55);
        later(at, type, middle - out * wide * 0.5, h);
        later(at, type, middle + out * wide * 0.5, h);
      }
    } else if (kind === 'tower') {
      // A column climbing the sky: one spot, each break higher than the last.
      const count = 4 + ((Math.random() * 3) | 0);
      const x = middle + rand(-0.35, 0.35) * wide;
      const type = chance(0.5) ? mixed() : '';
      for (let k = 0; k < count; k++) later(time + 0.2 + k * rand(0.3, 0.5), type || mixed(), x + rand(-6, 6), low + span * (k / (count - 1)));
    } else if (kind === 'zigzag') {
      // Left, right, left, right, closing in or opening out.
      const count = 6 + ((Math.random() * 5) | 0);
      const closing = chance(0.5);
      const type = mixed();
      for (let k = 0; k < count; k++) {
        const reach = closing ? 1 - k / count : (k + 1) / count;
        later(time + 0.2 + k * rand(0.22, 0.38), type, middle + (k % 2 ? 1 : -1) * reach * wide * 0.5, low + span * rand(0.2, 0.9));
      }
    } else if (kind === 'arc') {
      // A rainbow across the sky: low at the ends, high in the middle, drawn either way.
      const count = 5 + ((Math.random() * 4) | 0);
      const way = chance(0.5) ? 1 : -1;
      const type = mixed();
      for (let k = 0; k < count; k++) {
        const share = k / (count - 1);
        later(time + 0.2 + k * rand(0.18, 0.3), type, middle + way * (share - 0.5) * wide, low + span * Math.sin(share * Math.PI));
      }
    } else if (kind === 'barrage') {
      // A rapid burst of small shells all over, like a mid-show salute.
      const count = (ctx.phone ? 6 : 8) + ((Math.random() * 5) | 0); // phones have a smaller particle pool
      for (let k = 0; k < count; k++) later(time + 0.2 + k * rand(0.08, 0.16), mixed(), middle + rand(-0.5, 0.5) * wide, low + span * Math.random());
    } else if (kind === 'echo') {
      // A shell, answered by the same kind on the other side, three or four times over.
      const rounds = 3 + ((Math.random() * 2) | 0);
      let at = time + 0.2;
      for (let k = 0; k < rounds; k++) {
        const type = mixed();
        const x = rand(0.2, 0.5) * wide;
        const h = low + span * Math.random();
        later(at, type, middle - x, h);
        later(at + rand(0.5, 0.8), type, middle + x, h);
        at += rand(1.2, 1.8);
      }
    } else if (kind === 'crown') {
      // A crown or a W: tall at both ends and the middle, low in between, all at once.
      const type = mixed();
      const up = chance(0.5);
      for (let k = 0; k < 5; k++) {
        const high = k % 2 === 0 ? up : !up;
        later(time + 0.2 + rand(0, 0.12), type, middle + (k / 4 - 0.5) * wide, low + span * (high ? rand(0.75, 1) : rand(0, 0.25)));
      }
    } else if (kind === 'rush') {
      rushUntil = time + rand(5, 9);
    } else if (kind === 'swap') {
      // Drop one kind of shell and bring in another.
      const on = [];
      for (const type in look.mix) if (look.mix[type] > 0 && type !== 'text') on.push(type);
      if (on.length > 1) look.mix[pickOne(on)] = 0;
      look.mix[pickOne(pool)] += rand(0.8, 2.2);
    } else if (kind === 'recolour') {
      if (look.palette === 'custom' && chance(0.6)) config.palettes.custom[(Math.random() * config.palettes.custom.length) | 0] = hue();
      else look.palette = chance(0.5) ? 'custom' : pickOne(look.palette === 'halloween' ? ['halloween', 'neon'] : PALETTES);
      if (look.palette === 'custom' && config.palettes.custom.length < 2) config.palettes.custom.push(hue(), hue());
    } else if (kind === 'ground' && ctx.fountains) {
      fountains.enabled = true;
      ctx.fountains.start();
    }
  }
  // Most in the air at once, for a pace; phones have a smaller particle pool.
  const shellCap = (pace) => Math.min(ctx.phone ? 9 : 16, Math.round(3 + pace / 7));

  function newAct(time) {
    // Halloween turns up now and then all year, most of the time in October.
    const spooky = chance(new Date().getMonth() === 9 ? 0.6 : 0.15);
    pool = spooky ? SPOOKY.concat(chance(0.5) ? ['willow', 'crackle', 'strobe'] : []) : CLASSIC;
    for (const type in look.mix) look.mix[type] = 0;
    const kinds = 2 + ((Math.random() * 5) | 0);
    for (let k = 0; k < kinds; k++) look.mix[pickOne(pool)] += rand(0.5, 2.5);
    if (!spooky && chance(0.2)) look.mix[pickOne(SPOOKY)] = rand(0.3, 0.8); // a surprise
    look.mix.text = 0;

    if (spooky) look.palette = chance(0.7) ? 'halloween' : 'custom';
    else look.palette = chance(0.3) ? 'custom' : pickOne(PALETTES);
    if (look.palette === 'custom') {
      const colours = config.palettes.custom;
      colours.length = 0;
      const count = 2 + ((Math.random() * 3) | 0);
      for (let c = 0; c < count; c++) colours.push(hue());
    }
    look.burstSize = rand(55, 95);
    look.brightness = rand(1.6, 2.6);
    look.lifetime = rand(2.2, 3.4);
    look.trailLength = rand(0.7, 1.6);
    look.glitter = rand(0.3, 1);
    look.sparkSize = rand(0.85, 1.3);

    basePace = rand(12, 42);
    show.shellsPerMinute = basePace;
    show.maxShells = shellCap(basePace);
    physics.heightMin = rand(75, 105);
    physics.heightMax = physics.heightMin + rand(60, 110);

    fountains.enabled = chance(0.75);
    fountains.style = spooky ? pickOne(SPOOKY_GROUND) : pickOne(GROUND);
    fountains.color = chance(0.5) ? 'gold' : 'silver';
    fountains.every = rand(14, 35);
    fountains.duration = rand(6, 11);
    fountains.height = rand(30, 52);
    fountains.sideBarges = chance(0.6);
    if (fountains.enabled && chance(0.5) && ctx.fountains) ctx.fountains.start();

    landmarks.pier = chance(0.3);
    landmarks.lightColor = pickOne(LIGHT_COLORS);
    landmarks.light = rand(0.6, 1.6);

    target('timeOfDay', spooky ? rand(0.7, 1) : rand(0.15, 1));
    target('cloudCoverage', rand(0, 0.6));
    target('windSpeed', rand(0.5, 6));
    target('windDirection', rand(0, 360));
    target('amount', rand(0.06, 0.4));

    const length = rand(25, 60);
    rushUntil = 0;
    nextMoment = time + rand(3, 7);
    actEnd = time + length;
    swellAt = time + length * rand(0.7, 0.85);
    finale = chance(0.35);
  }

  return {
    update(dt, time) {
      if (!started) {
        started = true;
        newAct(time);
      }
      for (const e of eased) {
        const [object, key, goal, range] = e;
        const step = range * EASE * dt;
        const gap = goal - object[key];
        if (gap !== 0) object[key] = Math.abs(gap) <= step ? goal : object[key] + Math.sign(gap) * step;
      }
      look.mix.text = 0; // never any words

      // Shells a moment timed.
      for (let q = 0; q < QUEUE; q++) {
        const slot = queue[q];
        if (slot.at <= time) {
          slot.at = Infinity;
          if (ctx.fireworks) ctx.fireworks.launchAt(slot.type, slot.x, slot.h);
        }
      }

      if (breathUntil) {
        if (time < breathUntil) return;
        breathUntil = 0;
        show.autoLaunch = true;
        // Now and then the next act is seen from somewhere else.
        if (chance(0.2) && ctx.setCameraPreset) ctx.setCameraPreset(pickOne(CAMERAS));
        newAct(time);
        return;
      }
      // Something happens every few seconds; a hush holds the random show back.
      if (time >= nextMoment && time < swellAt) {
        nextMoment = time + rand(5, 12);
        moment(time);
      }
      show.autoLaunch = !(rushUntil < 0 && time < -rushUntil);
      let pace = basePace * (rushUntil > time ? 2.2 : 1);
      if (time >= swellAt && time < actEnd) pace *= 1 + ((time - swellAt) / Math.max(1, actEnd - swellAt)) * 1.6;
      show.shellsPerMinute = pace;
      show.maxShells = shellCap(pace);
      if (time >= actEnd) {
        if (finale && ctx.fireworks) ctx.fireworks.finale();
        show.autoLaunch = false; // let it ring out
        breathUntil = time + (finale ? 9 : rand(3, 6));
      }
    },

    dispose() {
      bar.remove();
      container.classList.remove('autoshow-mode');
      if (lock) lock.release().catch(() => {});
    },
  };
}
