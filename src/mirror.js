// What the ice and the open water reflect: the sky and moon, the land, the pines, the islands
// and the village, photographed once into a cube map from the camera's end of the lake. The lake shader looks the
// reflection up with a bent view ray (so it blurs on ice and wobbles on water for free), and adds
// the bursts itself. The scenery never moves, so one capture serves a whole show;
// it's taken again, at most twice a second, only when the moon or the sky's brightness changes
// the way it's lit. Every capture hides everything not marked userData.mirrored, and the burst
// lights, so a flash can't be photographed into the water.
import * as THREE from 'three';

const CENTRE = new THREE.Vector3(0, 2, 0);
const RADIUS = 700; // about how far off the village is: the distance the lookup treats the scenery at

export function create(ctx) {
  const { scene, renderer, config, phone } = ctx;
  const size = phone ? 256 : 512;
  const target = new THREE.WebGLCubeRenderTarget(size, {
    type: THREE.HalfFloatType, // windows are brighter than white
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
  });
  const camera = new THREE.CubeCamera(1, 7000, target);
  camera.position.copy(CENTRE);

  ctx.mirror = {
    uniforms: {
      uEnv: { value: target.texture },
      uEnvCentre: { value: CENTRE },
      uEnvRadius: { value: RADIUS },
    },
  };

  const clearColor = new THREE.Color();
  const lights = ctx.burstLights.uniforms.uBurstPosition.value;
  const savedStrength = new Float32Array(lights.length);
  const hidden = [];
  let lastKey = '';
  let lastAt = -1e9;

  function capture() {
    for (const child of scene.children) {
      if (child.userData.mirrored || !child.visible) continue;
      child.visible = false;
      hidden.push(child);
    }
    for (let i = 0; i < lights.length; i++) {
      savedStrength[i] = lights[i].w;
      lights[i].w = 0;
    }
    const alpha = renderer.getClearAlpha();
    renderer.getClearColor(clearColor);
    renderer.setClearColor(0x000000, 1);
    camera.update(renderer, scene);
    renderer.setClearColor(clearColor, alpha);
    for (let i = 0; i < lights.length; i++) lights[i].w = savedStrength[i];
    for (let i = 0; i < hidden.length; i++) hidden[i].visible = true;
    hidden.length = 0;
  }

  return {
    update(dt, time) {
      // What changes the scenery's look: how bright the night is, and the moon.
      const key = `${Math.round(config.sky.timeOfDay * 50)}|${ctx.sky.uniforms.uMoon.value.w}`;
      if (key !== lastKey && time - lastAt > 0.5) {
        lastKey = key;
        lastAt = time;
        capture();
      }
    },

    dispose() {
      target.dispose();
      ctx.mirror = null;
    },
  };
}
