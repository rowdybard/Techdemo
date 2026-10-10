// Post-processing and quality tiers. The scene renders into a half-float target, so the
// fireworks keep values above 1; bloom then picks up only what is brighter than its
// threshold, and OutputPass applies the renderer's tone mapping and sRGB conversion.
//
// Tiers set the pixel-ratio cap, multisampling and the bloom's resolution. On 'auto' the
// app keeps measuring frame time and steps down if sustained work is too slow. This
// includes later finales and scene changes, not only a quiet opening.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// Runs before bloom. A single NaN or infinite pixel (a GPU's answer to some edge-case maths)
// would otherwise be blurred by bloom across the whole screen as a white or black flood.
// It becomes black here, and very bright values are capped so they can't overflow.
const SafeShader = {
  name: 'SafeColors',
  uniforms: { tDiffuse: { value: null } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0);
      gl_FragColor = min(c, vec4(200.0));
    }
  `,
};

const ORDER = ['low', 'medium', 'high'];
const WARM_UP = 700; // ms of shader compiling and first uploads, not counted
const WINDOW = 2000; // ms per measurement
const SLOW = 20; // ms per frame that counts as too slow

/** Bounded, allocation-free frame monitor; exported for deterministic clock tests. */
export function createQualityMonitor(downshift, clock = () => performance.now()) {
  let mode = null;
  let place = null;
  let last = clock();
  let windowStart = last + WARM_UP;
  let total = 0;
  let largest = 0;
  let frames = 0;
  function reset(warmup = WARM_UP) {
    last = clock();
    windowStart = last + warmup;
    total = largest = frames = 0;
  }
  return {
    reset,
    update(nextMode, nextPlace, tier) {
      if (nextMode !== mode || nextPlace !== place) {
        const changedPlace = place !== null && nextPlace !== place;
        mode = nextMode;
        place = nextPlace;
        reset(changedPlace ? WARM_UP * 2 : WARM_UP);
      }
      const now = clock();
      const frame = now - last;
      last = now;
      if (mode !== 'auto' || now < windowStart || !(frame > 0)) return;
      total += frame;
      largest = Math.max(largest, frame);
      frames++;
      if (now - windowStart < WINDOW || frames < 4) return;
      // Ignore one isolated stall, but keep sustained 300 ms (or slower) frames.
      const average = (total - largest) / (frames - 1);
      const index = ORDER.indexOf(tier);
      if (average > SLOW && index > 0) {
        downshift(ORDER[index - 1]);
        reset();
      } else {
        reset(0); // keep watching for a later, heavier workload
      }
    },
  };
}

export function create(ctx) {
  const { renderer, scene, camera, config, phone, stats } = ctx;
  const settings = config.quality;

  let tierName = settings.tier === 'auto' ? (phone ? 'medium' : 'high') : settings.tier;
  let tier = settings.tiers[tierName];
  ctx.quality = { pixelRatio: pixelRatioFor(tier) };

  const composer = new EffectComposer(renderer, makeTarget(tier.samples));
  const renderPass = new RenderPass(scene, camera);
  const safe = new ShaderPass(SafeShader);
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), config.bloom.strength, config.bloom.radius, config.bloom.threshold);
  const output = new OutputPass();
  composer.addPass(renderPass);
  composer.addPass(safe);
  composer.addPass(bloom);
  composer.addPass(output);

  ctx.render = () => composer.render();
  // Compiles the scene's shaders for the target they'll draw into (a program for the
  // screen would differ: tone mapping and sRGB happen in OutputPass here).
  // The passes' own shaders (all but OutputPass, which sets its defines as it first
  // draws) compile alongside, on stand-in quads. Hidden parts of the scene (the pier
  // when it's off) are left out, as a render would; they compile when first shown.
  ctx.compile = () => {
    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(composer.renderTarget1);
    const children = scene.children;
    scene.children = children.filter((child) => child.visible);
    const quad = new THREE.PlaneGeometry(2, 2).deleteAttribute('normal'); // as the passes' own quad, or the programs differ
    const passes = new THREE.Scene();
    for (const material of [safe.material, bloom.materialHighPassFilter, ...bloom.separableBlurMaterials, bloom.compositeMaterial, bloom.blendMaterial]) {
      if (material) passes.add(new THREE.Mesh(quad, material));
    }
    const done = Promise.all([renderer.compileAsync(scene, camera), renderer.compileAsync(passes, camera)]);
    scene.children = children;
    renderer.setRenderTarget(previous);
    return done.finally(() => quad.dispose());
  };
  ctx.onResize = (width, height) => {
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(width, height);
    if (tier.bloomScale < 1) {
      const scale = renderer.getPixelRatio() * tier.bloomScale;
      bloom.setSize(Math.round(width * scale), Math.round(height * scale));
    }
  };

  function setTier(name) {
    const next = settings.tiers[name];
    if (!next || name === tierName) return;
    if (next.samples !== tier.samples) composer.reset(makeTarget(next.samples)); // disposes the old targets
    tierName = name;
    tier = next;
    ctx.quality.pixelRatio = pixelRatioFor(tier);
    stats.quality = tierName;
    ctx.resize();
  }
  const monitor = createQualityMonitor(setTier);
  ctx.post = { setTier, remeasure: monitor.reset, get tier() { return tierName; } };
  stats.quality = tierName;

  function makeTarget(samples) {
    return new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples });
  }

  function pixelRatioFor(t) {
    return phone ? t.pixelRatio.phone : t.pixelRatio.desktop;
  }

  return {
    update() {
      bloom.strength = config.bloom.strength;
      bloom.radius = config.bloom.radius;
      bloom.threshold = config.bloom.threshold;

      monitor.update(settings.tier, ctx.place, tierName);
    },

    dispose() {
      // Passes first, then the composer's own targets.
      renderPass.dispose();
      safe.dispose();
      bloom.dispose();
      output.dispose();
      composer.dispose();
      ctx.render = null;
      ctx.compile = null;
      ctx.onResize = null;
      ctx.post = null;
      ctx.quality = null;
    },
  };
}
