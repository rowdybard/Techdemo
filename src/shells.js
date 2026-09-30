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

// Where tubes stand for the 'shore' launch site: a line along the water, nearer the beach.
const SHORE_Z = -130;
const SHORE_HALF_WIDTH = 220;

/**
 * Fills `shell` (a reusable plain object) with a random plan, from the config.
 * `shell.launch` must already be set. Pass an aim point (x, height) to send the shell
 * there from the barge, or NaN for a random shell from the configured launch site.
 */
export function planShell(shell, config, phone, aimX = NaN, aimY = NaN, type = null) {
  const { physics, look, show } = config;
  const g = 9.81 * physics.gravity;
  const [bx, by, bz] = show.bargePosition;
  shell.type = type || pickType(look.mix);
  // Text reads best straight ahead, from the middle of the barge, at a middle height.
  if (shell.type === 'text' && Number.isNaN(aimX)) {
    aimX = bx;
    aimY = (physics.heightMin + physics.heightMax) / 2;
  }
  const aimed = !Number.isNaN(aimX);
  const shore = !aimed && show.launchSite === 'shore';

  if (shore) {
    shell.x = (Math.random() * 2 - 1) * SHORE_HALF_WIDTH;
    shell.z = SHORE_Z + (Math.random() * 2 - 1) * 10;
  } else {
    shell.x = bx + (aimed ? 0 : (Math.random() * 2 - 1) * physics.launchSpread);
    shell.z = bz + (Math.random() * 2 - 1) * 6;
  }
  shell.y = by + 2;
  // Shells from the shore are nearer, so they break lower to stay in view.
  const height = aimed ? aimY : (physics.heightMin + Math.random() * (physics.heightMax - physics.heightMin)) * (shore ? 0.6 : 1);
  const climb = Math.sqrt(2 * g * Math.max(height - shell.y, 10)) * 1.12; // a little extra to overcome drag
  // Time until the climb slows almost to a stop.
  shell.fuse = 0.95 * Math.log(1 + (climb * ROCKET_DRAG) / g) / ROCKET_DRAG;
  if (aimed) {
    // Lean just enough to drift over to the aim point by the time the fuse runs out.
    shell.vx = ((aimX - shell.x) / shell.fuse) * 1.05;
    shell.vy = climb;
    shell.vz = 0;
  } else {
    const lean = ((Math.random() * 2 - 1) * physics.angleVariance * Math.PI) / 180;
    const heading = Math.random() * Math.PI * 2;
    shell.vx = Math.sin(lean) * Math.cos(heading) * climb;
    shell.vy = Math.cos(lean) * climb;
    shell.vz = Math.sin(lean) * Math.sin(heading) * climb * 0.4;
  }
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
  out.type = shell.type;
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
