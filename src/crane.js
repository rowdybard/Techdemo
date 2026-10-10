// The Deluxe finale's camera move: while an ending's crane cue runs (director.js), the camera lifts
// and glides toward the show, then settles back where it was when the cue or the ending is over.
// It moves the camera and the orbit controls' target together, so each view's angle limits still
// hold and a drag still looks around. It waits while someone walks, and if the view is put back
// (a camera picked, a walk ended) it forgets the move instead of undoing it from the wrong place.
import * as THREE from 'three';

const RISE = 7; // seconds to the top of the move
const SETTLE = 5; // seconds back down
const LIFT = 9; // metres up
const GLIDE = 55; // metres toward the barge

export function create(ctx) {
  const { camera, controls, config } = ctx;
  const applied = new THREE.Vector3(); // how far the camera has been moved so far
  const wanted = new THREE.Vector3();
  const toward = new THREE.Vector3();
  const expectTarget = new THREE.Vector3().copy(controls.target);
  let amount = 0; // 0 at rest, 1 at the top
  function reset() {
    if (controls.target.distanceToSquared(expectTarget) <= 0.01) {
      camera.position.sub(applied);
      controls.target.sub(applied);
    }
    applied.set(0, 0, 0);
    amount = 0;
    expectTarget.copy(controls.target);
  }
  ctx.crane = { reset, get remaining() { return amount * SETTLE; } };

  return {
    update(dt, time) {
      // Something else put the view back: what was applied is gone with it.
      if (controls.target.distanceToSquared(expectTarget) > 0.01) {
        applied.set(0, 0, 0);
        amount = 0;
      }
      if (ctx.walk && ctx.walk.active) return;
      const director = ctx.director;
      const up = director && director.active && time >= director.craneFrom && time < director.craneUntil;
      if (up && amount === 0) {
        // Toward the barge along the ground, from where the camera stands as the move begins.
        const [bx, , bz] = config.show.bargePosition;
        toward.set(bx - camera.position.x, 0, bz - camera.position.z).normalize();
      }
      amount = Math.min(1, Math.max(0, amount + (up ? dt / RISE : -dt / SETTLE)));
      const s = amount * amount * (3 - 2 * amount);
      wanted.copy(toward).multiplyScalar(GLIDE * s);
      wanted.y = LIFT * s;
      camera.position.add(wanted).sub(applied);
      controls.target.add(wanted).sub(applied);
      applied.copy(wanted);
      expectTarget.copy(controls.target);
    },

    dispose() { reset(); ctx.crane = null; },
  };
}
