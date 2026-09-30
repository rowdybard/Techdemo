// Debug overlay: frame rate, renderer.info counts, particle pool use and JS heap.
// It refreshes a few times a second and only touches the DOM for values that changed.
// A tap folds it down to the FPS line (the default on phones, where it would cover the
// sky), and the backquote key (`) hides it.

const ROWS = [
  ['fps', 'FPS'],
  ['frame', 'Frame'],
  ['calls', 'Draw calls'],
  ['triangles', 'Triangles'],
  ['geometries', 'Geometries'],
  ['textures', 'Textures'],
  ['programs', 'Programs'],
  ['pool', 'Particles'],
  ['heap', 'JS heap'],
  ['canvas', 'Canvas'],
  ['quality', 'Quality'],
];

export function create({ renderer, container, config, stats, signal, phone }) {
  const root = document.createElement('div');
  root.className = 'debug';
  root.classList.toggle('compact', phone);
  root.hidden = !(config.debug.visible || location.hash === '#debug');

  const list = document.createElement('dl');
  const cells = {};
  const shown = {};
  for (const [key, label] of ROWS) {
    const term = document.createElement('dt');
    term.textContent = label;
    const value = document.createElement('dd');
    value.dataset.stat = key; // tools/check.mjs reads the values by this attribute
    list.append(term, value);
    cells[key] = value;
    shown[key] = '';
  }
  const hint = document.createElement('p');
  hint.textContent = 'Tap to fold · Shift+R rebuilds · ` hides';
  root.append(list, hint);
  container.append(root);

  root.addEventListener('click', () => root.classList.toggle('compact'), { signal });
  addEventListener(
    'keydown',
    (event) => {
      if (event.code === 'Backquote' && !event.repeat && !isTyping(event)) root.hidden = !root.hidden;
    },
    { signal },
  );
  // Time spent hidden would read as one very slow frame.
  document.addEventListener('visibilitychange', restartWindow, { signal });

  const { info } = renderer;
  const canvas = renderer.domElement;
  const interval = 1000 / config.debug.refreshHz;
  let frames = 0;
  let windowStart = performance.now();

  function restartWindow() {
    frames = 0;
    windowStart = performance.now();
  }

  function set(key, text) {
    if (shown[key] === text) return;
    shown[key] = text;
    cells[key].textContent = text;
  }

  function refresh(elapsed) {
    const { memory } = performance; // Chrome only
    set('fps', String(Math.round((frames * 1000) / elapsed)));
    set('frame', `${(elapsed / frames).toFixed(1)} ms`);
    set('calls', String(info.render.calls));
    set('triangles', info.render.triangles.toLocaleString('en-US'));
    set('geometries', String(info.memory.geometries));
    set('textures', String(info.memory.textures));
    set('programs', String(info.programs ? info.programs.length : 0));
    set('pool', stats.poolSize > 0 ? `${stats.poolUsed.toLocaleString('en-US')} / ${stats.poolSize.toLocaleString('en-US')}` : '–');
    set('heap', memory ? `${(memory.usedJSHeapSize / 1048576).toFixed(1)} MB` : 'n/a');
    set('canvas', `${canvas.width}×${canvas.height} @${renderer.getPixelRatio()}x`);
    set('quality', stats.quality || '–');
  }

  return {
    // Runs before the frame renders, so the render counts are the previous frame's totals.
    update() {
      frames++;
      const now = performance.now();
      const elapsed = now - windowStart;
      if (elapsed < interval) return;
      if (!root.hidden) refresh(elapsed);
      frames = 0;
      windowStart = now;
    },

    dispose() {
      root.remove();
    },
  };
}

/** True when a key press is meant for a text field, so shortcuts should ignore it. */
export function isTyping(event) {
  return event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable]') !== null;
}
