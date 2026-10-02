// Wind that lives. The panel sets the average speed and direction; on top of that the
// wind gusts and lulls every few seconds and its direction wanders slowly, from smooth
// noise, so nothing repeats and nobody has to touch it. Gustiness 0 holds it steady.
//
// Each frame this writes the current wind into config.physics.windX/windZ, which the
// shells, ground show and spark shader read. It also keeps a running total of how far
// the air has moved (ctx.wind.offset), so long-lived smoke drifts with the wind it
// actually met instead of swinging round whenever the wind changes now.
import * as THREE from 'three';

const DEG = Math.PI / 180;

export function create(ctx) {
  const { config } = ctx;
  const physics = config.physics;
  const offset = new THREE.Vector3(); // metres the air has moved since the scene began
  const seed = Math.random() * 1000;
  ctx.wind = { offset, speed: 0 };

  function sample(time) {
    const gusty = physics.gustiness;
    // Gusts: a slow swell with quicker gusts riding on it. Squared, so gusts are short
    // and sharp and the lulls between them long.
    const swell = noise(seed + time / 11);
    const gust = noise(seed + 50 + time / 3.3);
    const strength = 0.55 + 0.75 * swell * swell + 0.5 * gust * gust;
    const speed = Math.max(0, physics.windSpeed * (1 + gusty * (strength - 1)));
    // The direction wanders up to about 25 degrees either way, slowly, and twitches in gusts.
    const wander = (noise(seed + 100 + time / 29) - 0.5) * 50 + (gust - 0.5) * 10;
    const angle = (physics.windDirection + gusty * wander) * DEG;
    physics.windX = Math.sin(angle) * speed;
    physics.windZ = -Math.cos(angle) * speed;
    ctx.wind.speed = speed;
  }
  sample(0);

  return {
    update(dt, time) {
      sample(time);
      offset.x += physics.windX * dt;
      offset.z += physics.windZ * dt;
    },

    dispose() {
      ctx.wind = null;
    },
  };
}

// Smooth 1D value noise from 0 to 1.
function noise(x) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return hash(i) * (1 - u) + hash(i + 1) * u;
}

function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}
