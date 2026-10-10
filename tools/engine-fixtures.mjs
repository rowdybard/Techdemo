// Offline Node harness: use the browser's vendored Three modules without a renderer.
import { registerHooks } from 'node:module';

const vendor = new URL('../vendor/three-0.186.1/', import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    let url;
    if (specifier === 'three') url = new URL('build/three.module.min.js', vendor);
    else if (specifier.startsWith('three/addons/')) url = new URL(`examples/jsm/${specifier.slice(13)}`, vendor);
    else if (specifier === './three.core.js' && context.parentURL?.startsWith(vendor.href)) url = new URL('build/three.core.min.js', vendor);
    return url ? { url: url.href, shortCircuit: true } : nextResolve(specifier, context);
  },
});
export const THREE = await import('three');
const { config: defaults } = await import('../src/config.js');

export class ElementStub extends EventTarget {
  children = [];
  classList = { add() {}, remove() {}, toggle() {} };
  style = {};
  append(child) { this.children.push(child); }
  remove() {}
  closest() { return null; }
}
export function installDOM() {
  const events = new EventTarget();
  const document = new EventTarget();
  document.hidden = false;
  document.createElement = () => new ElementStub();
  globalThis.Element = ElementStub;
  globalThis.document = document;
  globalThis.addEventListener = events.addEventListener.bind(events);
  return events;
}

export function fixture() {
  let target = null;
  const renders = [];
  const renderer = {
    domElement: new ElementStub(), renders,
    coordinateSystem: THREE.WebGLCoordinateSystem,
    reversedDepthBuffer: false, xr: { enabled: false },
    getRenderTarget: () => target,
    setRenderTarget(value) { target = value; },
    getActiveCubeFace: () => 0,
    getActiveMipmapLevel: () => 0,
    getDrawingBufferSize: (out) => out.set(800, 600),
    getClearAlpha: () => 1,
    getClearColor: (out) => out.set(0),
    setClearColor() {},
    render(scene, camera) { renders.push({ target, scene, camera }); },
  };
  const abort = new AbortController();
  const ctx = {
    config: structuredClone(defaults), renderer, scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(), phone: false, stats: {},
    signal: abort.signal, abort, container: new ElementStub(),
    link: {}, controls: { enabled: true }, viewLocked: false,
    sky: { uniforms: { uMoon: { value: new THREE.Vector4(0, 1, 0, 1) } } },
    burstLights: { uniforms: { uBurstPosition: { value: [new THREE.Vector4(0, 0, 0, 1)] } } },
    countdown: { uniforms: {} }, beam: {}, place: 'beach',
  };
  ctx.setCameraPreset = (name) => {
    ctx.walk?.stop();
    ctx.camera.position.fromArray(ctx.config.camera.presets[name].position);
  };
  return ctx;
}
