// A one-tap sound switch on the screen (🔊 / 🔇), beside the view lock. The sound used to be a
// switch inside Customize, where few found it. Turning it on is the tap browsers want before
// audio can start (audio.js listens for it). A visitor's choice is remembered with the rest of
// their settings; someone watching a greeting isn't saving a design, so theirs isn't.
import { remember } from './presets.js';

export function create(ctx) {
  const { config, container, signal } = ctx;
  if (ctx.link.embed || ctx.link.autoshow) return { update() {}, dispose() {} }; // the autoshow has its own

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'sound-toggle';
  button.addEventListener('click', () => {
    const on = !(config.sound.enabled && config.sound.volume > 0);
    config.sound.enabled = true;
    config.sound.volume = on ? 0.6 : 0;
    if (!ctx.link.gift) remember(config);
    draw();
  }, { signal });
  container.append(button);

  let shown = null;
  function draw() {
    const on = config.sound.enabled && config.sound.volume > 0;
    if (on === shown) return;
    shown = on;
    button.textContent = on ? '🔊' : '🔇';
    button.setAttribute('aria-pressed', String(on));
    button.setAttribute('aria-label', on ? 'Sound on' : 'Sound off');
    button.title = on ? 'Turn the sound off' : 'Turn the sound on';
  }
  draw();

  return {
    // Follows changes made elsewhere: a gift's Tap to open, the panel, a remembered setting.
    update() {
      draw();
    },
    dispose() {
      button.remove();
    },
  };
}
