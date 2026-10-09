// The frozen lake's surface: one quad at the waterline, drawn by the shader in ice.glsl.js. The
// land around it (land.js) hides its edges, so it only has to be bigger than the lake. Its fixed
// patterns (open water, frost, wind streaks, which cracks show) are drawn into a texture once,
// on the GPU, as it's built.
import * as THREE from 'three';
import { ICE_RECT, iceVertex, iceFragment, maskFragment, maskVertex } from './ice.glsl.js';

export function create(ctx) {
  const { scene, config } = ctx;
  const settings = config.lake;
  const { renderer, phone } = ctx;

  // The masks, drawn once: a full-screen triangle pair into a render target.
  const masks = new THREE.WebGLRenderTarget(phone ? 512 : 1024, phone ? 256 : 384, {
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
  });
  {
    const bakeScene = new THREE.Scene();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ vertexShader: maskVertex, fragmentShader: maskFragment }));
    quad.frustumCulled = false;
    bakeScene.add(quad);
    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(masks);
    renderer.render(bakeScene, new THREE.Camera());
    renderer.setRenderTarget(previous);
    quad.geometry.dispose();
    quad.material.dispose();
  }

  const uniforms = {
    ...ctx.sky.uniforms,
    ...ctx.burstLights.uniforms,
    ...ctx.mirror.uniforms,
    ...ctx.countdown.uniforms,
    uTime: { value: 0 },
    uOpen: { value: settings.open },
    uMasks: { value: masks.texture },
  };
  const geometry = new THREE.PlaneGeometry(ICE_RECT.width, ICE_RECT.depth).rotateX(-Math.PI / 2).translate(ICE_RECT.x + ICE_RECT.width / 2, 0, ICE_RECT.z + ICE_RECT.depth / 2);
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
      masks.dispose();
    },
  };
}
