// The frozen lake's surface: one quad at the waterline, drawn by the shader in ice.glsl.js. The
// land around it (land.js) hides its edges, so it only has to be bigger than the lake.
import * as THREE from 'three';
import { iceVertex, iceFragment } from './ice.glsl.js';

export function create(ctx) {
  const { scene, config } = ctx;
  const settings = config.lake;

  const uniforms = {
    ...ctx.sky.uniforms,
    ...ctx.burstLights.uniforms,
    ...ctx.mirror.uniforms,
    uTime: { value: 0 },
    uOpen: { value: settings.open },
  };
  const geometry = new THREE.PlaneGeometry(2400, 760).rotateX(-Math.PI / 2).translate(0, 0, -330);
  geometry.deleteAttribute('normal');
  geometry.deleteAttribute('uv');
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.ShaderMaterial({ name: 'Ice', uniforms, vertexShader: iceVertex, fragmentShader: iceFragment }),
  );
  mesh.frustumCulled = false;
  scene.add(mesh);

  return {
    update(dt, time) {
      uniforms.uTime.value = time;
      uniforms.uOpen.value = settings.open;
    },

    dispose() {
      scene.remove(mesh);
      geometry.dispose();
      mesh.material.dispose();
    },
  };
}
