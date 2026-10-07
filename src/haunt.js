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
const path = []; // lightning corners, reused: the channel's, then each fork's
for (let i = 0; i < 32; i++) path.push([0, 0, 0]);

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
  const top = Math.sqrt(2 * g * config.fountains.height * 0.85) * 1.15;
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
        2 + Math.random() * 0.7, 0.36 * look.sparkSize, 0.25, KIND.glitter);
    }
    // Bubbles swell and pop in a dome over the brew.
    for (let k = 0; k < bubbles; k++) {
      const born = start + 0.6 + Math.random() * (duration - 0.6);
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 9;
      const c = k % 2 === 0 ? VIOLET : SLIME;
      pool.set(i++, x + Math.cos(a) * r, y + 3 + Math.random() * config.fountains.height * 0.7, z + Math.sin(a) * r, born,
        0, 1, 0, 3, c[0] * 1.6, c[1] * 1.6, c[2] * 1.6, c[0], c[1], c[2], 99, 0.32, 2 * look.sparkSize, 0, KIND.pop);
    }
    light(lights[t], start, duration, x, y + 18, z, SLIME, 24, 0.7, 'bubble');
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
      const sway = 7 + Math.random() * 9;
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
          0.85, 1.2 * look.sparkSize, 0.14, KIND.spark);
      }
    }
    light(lights[t], start, duration, tubes[t], y + rise * 0.5, z, ECTO, 14, 0, 'none');
  }
  pool.end();
}

// Lightning, as a real strike goes: a faint leader steps down from high in the sky to a
// tube, the channel blazes, and it re-strikes along the same path, with forks off it.
// Each segment of the path is one spark that runs from corner to corner under heavy drag
// and keeps its tail at the start, so the channel is an unbroken jagged line, not dots;
// a second spark runs each segment the other way, evening out the trail's fade. They're
// pops, which flash on at once (other sparks ease in). STRIKES is when the channel blazes
// after the leader starts, and how brightly; burstlights.js flashes the scene to match.
export const STRIKES = [[0.1, 1], [0.19, 0.6], [0.32, 0.4]];
const LEADER = 0.1; // seconds the leader takes to come down
const FORKS = 2;
const FORK_CORNERS = 5;

export function lightning(pool, config, phone, start, tubes, y, z, palette, lights) {
  const { physics, look } = config;
  const g = 9.81 * physics.gravity;
  const bolts = phone ? 7 : 11;
  const every = 0.65;
  const corners = phone ? 12 : 16;
  const segments = corners + FORKS * FORK_CORNERS;
  let i = pool.begin(bolts * (1 + STRIKES.length) * segments * 2);
  for (let b = 0; b < bolts; b++) {
    const t = (Math.random() * tubes.length) | 0;
    const born = start + b * every + Math.random() * 0.3;
    // A random walk from high up down to the tube: tortuous, settling as it nears it.
    const top = y + 110 + Math.random() * 70;
    const x0 = tubes[t] + (Math.random() - 0.5) * 70;
    let walk = 0;
    for (let c = 0; c <= corners; c++) {
      const f = c / corners;
      walk = walk * 0.8 + (Math.random() - 0.5) * 16;
      const corner = path[c];
      corner[0] = x0 + (tubes[t] - x0) * f + (c === corners ? 0 : walk * (1 - f * 0.6));
      corner[1] = top + (y - top) * (f + (c === 0 || c === corners ? 0 : (Math.random() - 0.5) * 0.5 / corners));
      corner[2] = z + (c === corners ? 0 : (Math.random() - 0.5) * 5);
    }
    // The leader: dim, each segment a moment after the one above.
    for (let c = 0; c < corners; c++) {
      i = segment(pool, i, path[c], path[c + 1], born + (c / corners) * LEADER, 0.12, 0.5 * look.sparkSize, 0.9, 60, physics, g);
    }
    // Two forks off the middle of the channel, angling down and away, the same every stroke.
    for (let k = 0; k < FORKS; k++) {
      const from = path[Math.round(corners * (0.25 + Math.random() * 0.35))];
      const side = k === 0 ? -1 : 1;
      const base = corners + 1 + k * (FORK_CORNERS + 1);
      for (let c = 0; c <= FORK_CORNERS; c++) {
        const corner = path[base + c];
        corner[0] = c === 0 ? from[0] : path[base + c - 1][0] + side * (1.5 + Math.random() * 4.5);
        corner[1] = c === 0 ? from[1] : path[base + c - 1][1] - 6 - Math.random() * 7;
        corner[2] = from[2] + (c === 0 ? 0 : (Math.random() - 0.5) * 3);
      }
      const reached = born + ((top - from[1]) / (top - y)) * LEADER; // when the leader gets there
      for (let c = 0; c < FORK_CORNERS; c++) {
        i = segment(pool, i, path[base + c], path[base + c + 1], reached + c * 0.008, 0.12, 0.4 * look.sparkSize, 0.8, 60, physics, g);
      }
    }
    // The strokes: the whole channel at once, forks a little dimmer.
    for (let s = 0; s < STRIKES.length; s++) {
      const [at, bright] = STRIKES[s];
      for (let c = 0; c < corners; c++) {
        i = segment(pool, i, path[c], path[c + 1], born + at, 0.14, 0.9 * look.sparkSize, 2.6 * bright, 250, physics, g);
      }
      for (let k = 0; k < FORKS; k++) {
        const base = corners + 1 + k * (FORK_CORNERS + 1);
        for (let c = 0; c < FORK_CORNERS; c++) {
          i = segment(pool, i, path[base + c], path[base + c + 1], born + at + 0.01, 0.12, 0.5 * look.sparkSize, 1.5 * bright, 250, physics, g);
        }
      }
    }
    light(lights[t], born, STRIKES[STRIKES.length - 1][0] + 0.4, tubes[t], y + 60, z, BOLT, 80, 0, 'thunder');
  }
  pool.end();
}

// One straight stretch of a bolt: a spark each way between corners a and e, born at
// `born`, flying under drag `stop` so it halts at the far corner with its tail at the near.
function segment(pool, i, a, e, born, life, radius, bright, stop, physics, g) {
  for (let way = 0; way < 2; way++) {
    const from = way ? e : a;
    const to = way ? a : e;
    pool.set(i++, from[0], from[1], from[2], born,
      (to[0] - from[0]) * stop + physics.windX, (to[1] - from[1]) * stop - g / stop, (to[2] - from[2]) * stop + physics.windZ, stop,
      BOLT[0] * bright, BOLT[1] * bright, BOLT[2] * bright, BOLT[0] * bright, BOLT[1] * bright, BOLT[2] * bright, 99,
      life, radius, 50, KIND.pop);
  }
  return i;
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
      pool.set(i++, p[0] + Math.sin(age * 1.7 + t) * 1.6 + (Math.random() - 0.5) * 2.4, p[1] + (Math.random() - 0.5) * 2.6,
        p[2] + (Math.random() - 0.5) * 1.8, start + delay + age, 0, 0.8, 0, 5,
        c[0] * fade * flicker, c[1] * fade * flicker, c[2] * fade * flicker, c[0] * fade * 0.3, c[1] * fade * 0.3, c[2] * fade * 0.3,
        0.3, 0.6, 1.3 * look.sparkSize, 0.05, KIND.spark);
    }
    light(lights[t], start + delay, duration, tubes[t], y + 15, z, LANTERN, 16, 0, 'none');
  }
  pool.end();
}
