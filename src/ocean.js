// Ocean mesh: a grid in world space whose rows bunch up near the shore and spread out
// toward the horizon, drawn with the Gerstner shader in ocean.glsl.js. The panel's wave
// height, choppiness, surf and foam settings are uniforms, so they change live.
import * as THREE from 'three';
import { WAVE_COUNT, oceanFragment, oceanVertex } from './ocean.glsl.js';

const NEAR = 30; // how far up the beach the grid reaches, for the surf to run up
const FAR = 5500; // out to just inside the camera's far plane
const HALF_WIDTH = 5000;

// Direction (degrees from straight at the shore), wavelength (m) and amplitude (m).
const WAVES = [
  [-8, 42, 0.3],
  [14, 25, 0.19],
  [-22, 15.5, 0.11],
  [30, 9.5, 0.065],
  [5, 6.2, 0.04],
  [-35, 3.9, 0.022],
];

export function create(ctx) {
  const { scene, config, phone } = ctx;
  const settings = config.ocean;

  const waves = WAVES.slice(0, WAVE_COUNT).map(([angle, length, amplitude]) => {
    const a = (angle * Math.PI) / 180;
    return new THREE.Vector4(Math.sin(a), Math.cos(a), length, amplitude);
  });

  const uniforms = {
    ...ctx.sky.uniforms,
    uTime: { value: 0 },
    uWaveHeight: { value: settings.waveHeight },
    uChoppiness: { value: settings.choppiness },
    uSwash: { value: settings.surf },
    uFoam: { value: settings.foam },
    uWaves: { value: waves },
  };
  // The beach reads the same time and surf, so its wet band follows the swash.
  ctx.ocean = { uniforms };

  const [columns, rows] = phone ? settings.resolution.phone : settings.resolution.desktop;
  const mesh = new THREE.Mesh(
    oceanGeometry(columns, rows),
    new THREE.ShaderMaterial({
      name: 'Ocean',
      uniforms,
      vertexShader: oceanVertex,
      fragmentShader: oceanFragment,
      transparent: true,
    }),
  );
  mesh.frustumCulled = false; // the shader moves every vertex, so the bounds would be wrong
  scene.add(mesh);

  return {
    update(dt, time) {
      uniforms.uTime.value = time;
      uniforms.uWaveHeight.value = settings.waveHeight;
      uniforms.uChoppiness.value = settings.choppiness;
      uniforms.uSwash.value = settings.surf;
      uniforms.uFoam.value = settings.foam;
    },

    dispose() {
      scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
      ctx.ocean = null;
    },
  };
}

// Rows are spaced exponentially: about 0.3 m apart at the shore, hundreds of metres at
// the horizon. Columns do the same outward from the middle.
function oceanGeometry(columns, rows) {
  const spread = (t, sharpness) => (Math.exp(sharpness * t) - 1) / (Math.exp(sharpness) - 1);
  const positions = new Float32Array(columns * rows * 3);
  let i = 0;
  for (let row = 0; row < rows; row++) {
    const z = NEAR - spread(row / (rows - 1), 6) * (NEAR + FAR);
    for (let column = 0; column < columns; column++) {
      const v = (column / (columns - 1)) * 2 - 1;
      positions[i++] = Math.sign(v) * spread(Math.abs(v), 5) * HALF_WIDTH;
      positions[i++] = 0;
      positions[i++] = z;
    }
  }

  const index = new Uint32Array((columns - 1) * (rows - 1) * 6);
  let j = 0;
  for (let row = 0; row < rows - 1; row++) {
    for (let column = 0; column < columns - 1; column++) {
      const a = row * columns + column;
      const b = a + columns;
      index[j++] = a;
      index[j++] = a + 1;
      index[j++] = b;
      index[j++] = b;
      index[j++] = a + 1;
      index[j++] = b + 1;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  return geometry;
}
