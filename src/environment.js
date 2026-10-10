// The environment: the scenery a show is set in, kept apart from the show itself. One module
// stands in the update order where the beach used to be; it builds the pieces of the place in
// config.place.environment (see places.js), and when that setting changes it takes them down
// and builds the next place's, in the middle of a show if need be. The fireworks, smoke, snow
// and sky are shared and never touched.
//
// A piece is an ordinary module (create(ctx) returning { update, dispose }). Pieces build in
// order and may read what earlier pieces put on ctx. Each place lists its own, so adding a
// city is a new list and new pieces, not a change to the show.
import * as THREE from 'three';
import { PLACES } from './places.js';
import * as ocean from './ocean.js';
import * as beach from './beach.js';
import * as landmarks from './landmarks.js';
import * as lighthouse from './lighthouse.js';
import * as walk from './walk.js';
import * as lake from './lake.js';
import * as land from './land.js';
import * as pines from './pines.js';
import * as village from './village.js';
import * as mirror from './mirror.js';

const BUILDERS = {
  beach: () => [ocean, beach, landmarks, lighthouse, walk],
  lake: () => [land, pines, village, mirror, lake],
};
// Config survives Shift+R, including the camera views the lake installed in it.
// Remember each config's beach baseline once rather than snapshotting the lake on rebuild.
const BEACH_VIEWS = new WeakMap();

export function create(ctx) {
  const { config } = ctx;
  if (!BEACH_VIEWS.has(config)) BEACH_VIEWS.set(config, JSON.parse(JSON.stringify(config.camera.presets)));
  const startViews = BEACH_VIEWS.get(config);

  // The lighthouse beam, as the smoke sees it. It outlives any one place, so the smoke's shader
  // keeps working when the beach comes and goes; only the lighthouse writes to it.
  ctx.beam = {
    uBeamOrigin: { value: new THREE.Vector3() },
    uBeamDir: { value: new THREE.Vector3(1, 0, 0) },
    uBeamColor: { value: new THREE.Color(0, 0, 0) },
    uBeamShape: { value: new THREE.Vector2(1, 0.05) },
  };

  let place = null;
  let parts = [];
  let pieces = null; // an AbortController for the pieces now standing: whatever listens with their signal lets go when they go

  function build(name) {
    takeDown();
    place = name;
    ctx.place = name;
    const views = PLACES[name].cameras || startViews;
    for (const view in views) config.camera.presets[view] = JSON.parse(JSON.stringify(views[view]));
    // The pieces listen with ctx.signal, which would outlive them (it ends with the whole app), so
    // while they're made they get a signal of their own that ends with them, or with the app.
    pieces = new AbortController();
    const appSignal = ctx.signal;
    appSignal.addEventListener('abort', () => pieces.abort(), { once: true, signal: pieces.signal });
    ctx.signal = pieces.signal;
    try {
      for (const piece of BUILDERS[name]()) parts.push(piece.create(ctx));
    } catch (error) {
      ctx.signal = appSignal;
      takeDown();
      throw error;
    }
    ctx.signal = appSignal;
  }

  function takeDown() {
    if (pieces) pieces.abort();
    pieces = null;
    for (let i = parts.length - 1; i >= 0; i--) parts[i].dispose();
    parts = [];
  }

  const known = (name) => Object.hasOwn(BUILDERS, name);
  const wanted = () => (known(config.place.environment) ? config.place.environment : 'beach');

  build(wanted());
  if (place !== 'beach') ctx.setCameraPreset(config.camera.preset); // main.js aimed the camera with the beach's views

  return {
    update(dt, time) {
      if (wanted() !== place) {
        build(wanted());
        ctx.setCameraPreset(config.camera.preset);
      }
      for (let i = 0; i < parts.length; i++) parts[i].update(dt, time);
    },

    dispose() {
      takeDown();
      ctx.place = null;
      ctx.beam = null;
    },
  };
}
