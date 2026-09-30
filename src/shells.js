// Shells. Launching one writes its whole life into the particle pool at once: the rising
// comet, the sparks it sheds, and the burst, whose particles are born later, at the
// moment the fuse runs out. Burst positions come from the same closed-form motion the
// shader uses, so the burst appears exactly where the rocket is. Scratch arrays are
// allocated once; nothing here allocates per shell.
import { positionAt, velocityAt } from './particles.js';
import { KIND } from './fireworks.glsl.js';
import { burst } from './bursts.js';

const ROCKET_DRAG = 0.06;
const SHED = 22; // sparks shed along the climb

const at = [0, 0, 0];
const velocity = [0, 0, 0];

/**
 * Fills `shell` (a reusable plain object) with a random plan, from the config.
 * `shell.launch` must already be set.
 */
export function planShell(shell, config, phone) {
  const { physics, look, show } = config;
  const g = 9.81 * physics.gravity;
  const [bx, by, bz] = show.bargePosition;

  shell.x = bx + (Math.random() * 2 - 1) * physics.launchSpread;
  shell.y = by + 2;
  shell.z = bz + (Math.random() * 2 - 1) * 6;
  const height = physics.heightMin + Math.random() * (physics.heightMax - physics.heightMin);
  const climb = Math.sqrt(2 * g * height) * 1.12; // a little extra to overcome drag
  const lean = ((Math.random() * 2 - 1) * physics.angleVariance * Math.PI) / 180;
  const heading = Math.random() * Math.PI * 2;
  shell.vx = Math.sin(lean) * Math.cos(heading) * climb;
  shell.vy = Math.cos(lean) * climb;
  shell.vz = Math.sin(lean) * Math.sin(heading) * climb * 0.4;
  // Time until the climb slows almost to a stop.
  shell.fuse = 0.95 * Math.log(1 + (shell.vy * ROCKET_DRAG) / g) / ROCKET_DRAG;
  shell.type = pickType(look.mix);
  shell.count = Math.round(look.particles * (phone ? 0.55 : 1));
  shell.size = look.burstSize * (0.8 + Math.random() * 0.4);
  return shell;
}

/** Writes the planned shell into the pool. Returns when it bursts and where. */
export function fireShell(pool, shell, config, palette, out) {
  const { physics } = config;
  const g = 9.81 * physics.gravity;
  const wx = physics.windX;
  const wz = physics.windZ;
  const { launch, fuse } = shell;

  // The rising comet and the sparks it sheds on the way up.
  let i = pool.begin(1 + SHED);
  pool.set(i++, shell.x, shell.y, shell.z, launch, shell.vx, shell.vy, shell.vz, ROCKET_DRAG,
    1.0, 0.62, 0.3, 1.0, 0.62, 0.3, 99, fuse, 0.5, 0.25, KIND.comet);
  for (let s = 0; s < SHED; s++) {
    const t = ((s + 0.5) / SHED) * fuse;
    positionAt(at, shell.x, shell.y, shell.z, shell.vx, shell.vy, shell.vz, ROCKET_DRAG, t, g, wx, wz);
    pool.set(i++, at[0], at[1], at[2], launch + t,
      (Math.random() - 0.5) * 6, -2 - Math.random() * 4, (Math.random() - 0.5) * 6, 2.5,
      1.0, 0.55, 0.2, 0.8, 0.3, 0.1, 0.3, 0.5 + Math.random() * 0.5, 0.18, 0.08, KIND.glitter);
  }
  pool.end();

  // The burst, at the top of the climb.
  positionAt(at, shell.x, shell.y, shell.z, shell.vx, shell.vy, shell.vz, ROCKET_DRAG, fuse, g, wx, wz);
  velocityAt(velocity, shell.vx, shell.vy, shell.vz, ROCKET_DRAG, fuse, g, wx, wz);
  burst(pool, shell, config, palette, launch + fuse, at, velocity, out);
  return out;
}

// Weighted pick from the shell mix, e.g. { peony: 2, willow: 1 }.
function pickType(mix) {
  let total = 0;
  for (const name in mix) total += mix[name];
  let roll = Math.random() * total;
  for (const name in mix) {
    roll -= mix[name];
    if (roll <= 0) return name;
  }
  return 'peony';
}
