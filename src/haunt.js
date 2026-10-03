// Halloween ground effects, fired from the barge's tubes like the others in ground.js:
//   cauldron   each tube boils over: low green spray, with violet and green bubbles popping
//   wisps      will-o'-the-wisps: pale lights that wander up out of the tubes, weaving
//   lightning  jagged bolts striking down onto the barge, each with a quick second flash
//   lanterns   glowing orange lanterns that float up off the deck and drift on the wind
//
// Some of these move along paths the spark motion can't follow (weaving, rising). Those
// are drawn as a moving head: short-lived sparks laid along the path, each born when the
// head passes, so the head glides and leaves a fading trail. Like everything else, all
// of it is written into the pool at once, with later birth times.
import { KIND } from './fireworks.glsl.js';
import { positionAt } from './particles.js';

const SLIME = [0.22, 0.75, 0.12];
const VIOLET = [0.5, 0.14, 0.85];
const ECTO = [0.55, 0.95, 0.7];
const BOLT = [0.85, 0.8, 1];
const LANTERN = [1, 0.45, 0.06];
const FLAME = [1, 0.8, 0.3];

const p = [0, 0, 0];
const path = []; // lightning bolt corners, reused
for (let i = 0; i < 24; i++) path.push([0, 0, 0]);

// smoke: how much smoke the effect gives off (smoke.js), 0 for none. sound: what it
// sounds like (audio.js): 'hiss', 'whoosh', 'pops', 'boom', 'bubble', 'thunder' or 'none'.
function light(record, start, hold, x, y, z, color, size, smoke = 1, sound = 'hiss') {
  record.smoke = smoke;
  record.sound = sound;
  record.time = start;
  record.hold = hold;
  record.x = x;
  record.y = y;
  record.z = z;
  record.r = color[0];
  record.g = color[1];
  record.b = color[2];
  record.size = size;
}

export function cauldron(pool, config, phone, start, tubes, y, z, palette, lights) {
  const { physics, look } = config;
  const g = 9.81 * physics.gravity;
  const duration = 8;
  const spray = Math.round(duration * (phone ? 22 : 40));
  const bubbles = phone ? 40 : 70;
  const top = Math.sqrt(2 * g * config.fountains.height * 0.45) * 1.15;
  let i = pool.begin(tubes.length * (spray + bubbles));
  for (let t = 0; t < tubes.length; t++) {
    const x = tubes[t];
    for (let k = 0; k < spray; k++) {
      const born = start + (k / spray) * duration;
      const speed = top * (0.6 + Math.random() * 0.4);
      const spread = 0.55 * Math.sqrt(Math.random());
      const around = Math.random() * Math.PI * 2;
      pool.set(i++, x, y, z, born,
        Math.sin(spread) * Math.cos(around) * speed, Math.cos(spread) * speed, Math.sin(spread) * Math.sin(around) * speed, 0.5,
        SLIME[0], SLIME[1], SLIME[2], SLIME[0] * 0.5, SLIME[1] * 0.5, SLIME[2] * 0.5, 1.2,
        1.8 + Math.random() * 0.6, 0.24 * look.sparkSize, 0.2, KIND.glitter);
    }
    // Bubbles swell and pop in a dome over the brew.
    for (let k = 0; k < bubbles; k++) {
      const born = start + 0.6 + Math.random() * (duration - 0.6);
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 5;
      const c = k % 2 === 0 ? VIOLET : SLIME;
      pool.set(i++, x + Math.cos(a) * r, y + 2 + Math.random() * config.fountains.height * 0.35, z + Math.sin(a) * r, born,
        0, 1, 0, 3, c[0] * 1.6, c[1] * 1.6, c[2] * 1.6, c[0], c[1], c[2], 99, 0.28, 1.3 * look.sparkSize, 0, KIND.pop);
    }
    light(lights[t], start, duration, x, y + 10, z, SLIME, 20, 1, 'bubble');
  }
  pool.end();
}

export function wisps(pool, config, phone, start, tubes, y, z, palette, lights) {
  const { look } = config;
  const perTube = 2;
  const duration = 7;
  const rate = phone ? 16 : 30; // trail sparks per second
  const steps = Math.round(duration * rate);
  const rise = config.fountains.height * 1.6;
  let i = pool.begin(tubes.length * perTube * steps);
  for (let t = 0; t < tubes.length; t++) {
    for (let w = 0; w < perTube; w++) {
      const delay = Math.random() * 1.5 + w * 0.8;
      const sway = 4 + Math.random() * 6;
      const wobble = 0.6 + Math.random() * 0.8;
      const phase = Math.random() * 6.28;
      const c = w === 0 ? ECTO : VIOLET;
      for (let s = 0; s < steps; s++) {
        const age = s / rate;
        const along = age / duration;
        // Up out of the tube, weaving side to side and to and fro, slowing near the top.
        const hx = tubes[t] + Math.sin(age * wobble * 2 + phase) * sway * along;
        const hy = y + rise * (1 - (1 - along) * (1 - along));
        const hz = z + Math.cos(age * wobble * 1.3 + phase) * sway * 0.6 * along;
        const fade = Math.min(1, (1 - along) * 3);
        pool.set(i++, hx, hy, hz, start + delay + age, 0, 0.6, 0, 4,
          c[0] * fade, c[1] * fade, c[2] * fade, c[0] * 0.2, c[1] * 0.2, c[2] * 0.2, 0.25,
          0.75, 0.75 * look.sparkSize, 0.12, KIND.spark);
      }
    }
    light(lights[t], start, duration, tubes[t], y + rise * 0.5, z, ECTO, 14, 0, 'none');
  }
  pool.end();
}

export function lightning(pool, config, phone, start, tubes, y, z, palette, lights) {
  const { look } = config;
  const bolts = phone ? 7 : 11;
  const every = 0.65;
  const corners = 14;
  const perMetre = phone ? 0.5 : 0.8;
  const top = y + config.fountains.height * 3;
  // Count first: each bolt is drawn twice (strike and re-strike), with one branch.
  const length = (top - y) * 1.35;
  const sparksPerBolt = Math.ceil(length * perMetre) + Math.ceil(length * 0.35 * perMetre);
  let i = pool.begin(bolts * sparksPerBolt * 2);
  for (let b = 0; b < bolts; b++) {
    const t = (Math.random() * tubes.length) | 0;
    const born = start + b * every + Math.random() * 0.3;
    // A jagged path from the sky down to the tube, wandering less as it nears the ground.
    const x0 = tubes[t] + (Math.random() - 0.5) * 60;
    for (let c = 0; c <= corners; c++) {
      const f = c / corners;
      const corner = path[c];
      corner[0] = x0 + (tubes[t] - x0) * f + (c === corners ? 0 : (Math.random() - 0.5) * 18 * (1 - f * 0.7));
      corner[1] = top + (y - top) * f;
      corner[2] = z + (Math.random() - 0.5) * 6;
    }
    const sparks = Math.ceil(length * perMetre); // exactly what the count above reserved
    const branch = sparksPerBolt - sparks;
    const forkAt = 4 + ((Math.random() * 5) | 0);
    for (let pass = 0; pass < 2; pass++) {
      const flash = born + pass * 0.13;
      const life = pass === 0 ? 0.16 : 0.24;
      for (let s = 0; s < sparks; s++) {
        const f = (s / sparks) * corners;
        const c = Math.min(corners - 1, f | 0);
        const u = f - c;
        const a = path[c];
        const e = path[c + 1];
        // The bolt runs down from the sky in a few hundredths of a second.
        pool.set(i++, a[0] + (e[0] - a[0]) * u, a[1] + (e[1] - a[1]) * u, a[2] + (e[2] - a[2]) * u, flash + (s / sparks) * 0.05,
          0, 0, 0, 8, BOLT[0] * 2.2, BOLT[1] * 2.2, BOLT[2] * 2.2, VIOLET[0], VIOLET[1], VIOLET[2], 0.08,
          life, 0.55 * look.sparkSize, 0.02, KIND.spark);
      }
      // A thinner fork off one corner, angling away.
      const from = path[forkAt];
      const side = Math.random() < 0.5 ? -1 : 1;
      for (let s = 0; s < branch; s++) {
        const f = s / branch;
        const jag = (Math.random() - 0.5) * 3;
        pool.set(i++, from[0] + side * f * 26 + jag, from[1] - f * 30, from[2], flash + 0.02 + f * 0.03,
          0, 0, 0, 8, BOLT[0] * 1.4, BOLT[1] * 1.4, BOLT[2] * 1.4, VIOLET[0], VIOLET[1], VIOLET[2], 0.06,
          life * 0.8, 0.35 * look.sparkSize, 0.02, KIND.spark);
      }
    }
    light(lights[t], born, 0.45, tubes[t], y + 30, z, BOLT, 60, 0, 'thunder');
  }
  pool.end();
}

export function lanterns(pool, config, phone, start, tubes, y, z, palette, lights) {
  const { physics, look } = config;
  const duration = 10;
  const rate = phone ? 14 : 26; // glow sparks per second per lantern
  const steps = Math.round(duration * rate);
  let i = pool.begin(tubes.length * steps);
  for (let t = 0; t < tubes.length; t++) {
    const delay = t * 0.35 + Math.random() * 0.4;
    const climb = 3 + Math.random() * 1.5; // metres per second
    const drift = 0.6 + Math.random() * 0.5; // share of the wind it catches
    for (let s = 0; s < steps; s++) {
      const age = s / rate;
      // Up off the deck, carried by the wind, with a slow sway.
      positionAt(p, tubes[t], y + 3, z, physics.windX * drift, climb, physics.windZ * drift, 0.0001, age, 0, 0, 0);
      const fade = Math.min(1, age / 0.8, (duration - age) / 2.5);
      const flicker = 0.75 + Math.random() * 0.25;
      const c = s % 3 === 0 ? FLAME : LANTERN;
      pool.set(i++, p[0] + Math.sin(age * 1.7 + t) * 1.2 + (Math.random() - 0.5) * 1.6, p[1] + (Math.random() - 0.5) * 1.8,
        p[2] + (Math.random() - 0.5) * 1.2, start + delay + age, 0, 0.8, 0, 5,
        c[0] * fade * flicker, c[1] * fade * flicker, c[2] * fade * flicker, c[0] * fade * 0.3, c[1] * fade * 0.3, c[2] * fade * 0.3,
        0.3, 0.55, 0.8 * look.sparkSize, 0.05, KIND.spark);
    }
    light(lights[t], start + delay, duration, tubes[t], y + 15, z, LANTERN, 16, 0, 'none');
  }
  pool.end();
}
