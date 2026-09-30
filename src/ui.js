// The show designer panel (lil-gui). Every control writes into the config the modules
// read each frame, so changes apply live; quality and camera go through their own
// functions. Presets, JSON copy and paste, a remembered setup and hero mode live here.
import GUI from 'lil-gui';
import { PRESETS, applyPreset, loadSettings, recall, remember, settingsJSON } from './presets.js';
import { createHero } from './hero.js';
import { isTyping } from './debug.js';

const TYPE_LABELS = {
  peony: 'Peony',
  chrysanthemum: 'Chrysanthemum',
  willow: 'Willow',
  palm: 'Palm',
  ring: 'Ring',
  crossette: 'Crossette',
  strobe: 'Strobe',
  crackle: 'Crackle',
  multibreak: 'Multi-break',
  heart: 'Heart',
  star: 'Star',
  text: 'Your text',
};

export function create(ctx) {
  const { config, container, phone, signal } = ctx;
  recall(config);

  const gui = new GUI({ container, title: 'Show designer', width: phone ? 280 : 300 });
  gui.domElement.classList.add('panel');
  ctx.gui = gui; // main.js destroys it early in teardown
  if (phone) gui.close();

  const state = {
    preset: 'Default',
    hero: false,
    quality: config.quality.tier,
    finale: () => ctx.fireworks && ctx.fireworks.finale(),
    launch: () => ctx.fireworks && ctx.fireworks.launch(),
    launchText: () => ctx.fireworks && ctx.fireworks.launch('text'),
  };

  // Presets and the big buttons.
  gui.add(state, 'preset', Object.keys(PRESETS)).name('Preset').onChange((name) => {
    applyPreset(config, name);
    refresh();
  });
  gui.add(state, 'finale').name('Finale!');
  gui.add(state, 'launch').name('Launch one shell');
  gui.add(config.look, 'text').name('Text in the sky').onFinishChange(() => remember(config));
  gui.add(state, 'launchText').name('Spell it now');
  gui.add(state, 'hero').name('Hero mode').onChange((on) => hero.set(on));

  const show = gui.addFolder('Show');
  show.add(config.show, 'autoLaunch').name('Auto-launch');
  show.add(config.show, 'shellsPerMinute', 4, 120, 1).name('Shells per minute');
  show.add(config.show, 'maxShells', 1, 20, 1).name('Most in the air');
  show.add(config.show, 'launchSite', { 'Offshore barge': 'barge', 'Along the shore': 'shore', 'Tap the sky to aim': 'tap' }).name('Launch site');
  show.add(config.loop, 'timeScale', 0.1, 1, 0.05).name('Slow motion');

  const mix = gui.addFolder('Shell mix').close();
  for (const type in TYPE_LABELS) {
    if (typeof config.look.mix[type] !== 'number') config.look.mix[type] = 0; // a partial mix leaves the rest off
    mix.add(config.look.mix, type, 0, 5, 0.1).name(TYPE_LABELS[type]);
  }

  const look = gui.addFolder('Look').close();
  look.add(config.look, 'palette', { Classic: 'classic', 'Red, white & blue': 'usa', Gold: 'gold', Neon: 'neon', Pastel: 'pastel', Custom: 'custom' }).name('Palette');
  const custom = config.palettes.custom;
  for (let i = 0; i < custom.length; i++) look.addColor(custom, i).name(`Custom colour ${i + 1}`);
  look.add(config.look, 'textWidth', 60, 260, 1).name('Text width (m)');
  look.add(config.look, 'burstSize', 20, 110, 1).name('Burst size (m)');
  look.add(config.look, 'particles', 80, 900, 10).name('Sparks per shell');
  look.add(config.look, 'lifetime', 1, 5, 0.1).name('Lifetime (s)');
  look.add(config.look, 'trailLength', 0, 3, 0.05).name('Trail length');
  look.add(config.look, 'glitter', 0, 1, 0.05).name('Glitter');
  look.add(config.look, 'sparkSize', 0.3, 3, 0.05).name('Spark size');
  look.add(config.look, 'brightness', 0.5, 4, 0.05).name('Brightness');

  const physics = gui.addFolder('Physics').close();
  physics.add(config.physics, 'gravity', 0.2, 2, 0.05).name('Gravity (× Earth)');
  physics.add(config.physics, 'drag', 0.3, 2.5, 0.05).name('Air drag');
  physics.add(config.physics, 'windSpeed', 0, 15, 0.1).name('Wind (m/s)');
  physics.add(config.physics, 'windDirection', 0, 360, 1).name('Wind direction (°)');
  physics.add(config.physics, 'heightMin', 40, 200, 1).name('Lowest burst (m)');
  physics.add(config.physics, 'heightMax', 60, 260, 1).name('Highest burst (m)');
  physics.add(config.physics, 'launchSpread', 0, 150, 1).name('Launch spread (m)');
  physics.add(config.physics, 'angleVariance', 0, 25, 0.5).name('Launch lean (°)');

  const scene = gui.addFolder('Scene').close();
  scene.add(config.sky, 'timeOfDay', 0, 1, 0.01).name('Dusk → night');
  scene.add(config.sky, 'cloudCoverage', 0, 0.8, 0.01).name('Clouds');
  scene.add(config.sky, 'starBrightness', 0, 2, 0.05).name('Stars');
  scene.add(config.ocean, 'waveHeight', 0, 2.5, 0.05).name('Wave height');
  scene.add(config.ocean, 'choppiness', 0, 1.2, 0.05).name('Choppiness');
  scene.add(config.ocean, 'surf', 0, 0.6, 0.01).name('Surf run-up (m)');
  scene.add(config.beach, 'glints', 0, 2, 0.05).name('Sand glints');
  scene.add(config.look, 'sceneLight', 0, 3, 0.05).name('Firework light');
  scene.add(config.camera, 'preset', { 'On the sand': 'sand', Drone: 'drone', 'Water level': 'water' }).name('Camera')
    .onChange((name) => ctx.setCameraPreset(name));
  scene.add(config.renderer, 'exposure', 0.3, 2, 0.01).name('Exposure');
  scene.add(config.bloom, 'strength', 0, 2, 0.01).name('Bloom strength');
  scene.add(config.bloom, 'radius', 0, 1, 0.01).name('Bloom radius');
  scene.add(config.bloom, 'threshold', 0.5, 2, 0.01).name('Bloom threshold');
  scene.add(state, 'quality', { Auto: 'auto', Low: 'low', Medium: 'medium', High: 'high' }).name('Quality')
    .onChange((tier) => {
      config.quality.tier = tier;
      if (tier !== 'auto' && ctx.post) ctx.post.setTier(tier);
    });

  const sound = gui.addFolder('Sound').close();
  sound.add(config.sound, 'enabled').name('Sound on');
  sound.add(config.sound, 'volume', 0, 1, 0.01).name('Volume');

  // Save and load: JSON in a text box, since downloads don't work everywhere this runs.
  const saving = gui.addFolder('Save & load').close();
  const box = document.createElement('div');
  box.className = 'panel-json';
  box.innerHTML = `
    <textarea id="settings-json" rows="6" spellcheck="false" aria-label="Settings as JSON"></textarea>
    <div class="panel-json-row">
      <button type="button" data-action="copy">Copy settings</button>
      <button type="button" data-action="load">Load settings</button>
    </div>
    <p class="panel-json-status" role="status"></p>
  `;
  saving.$children.append(box);
  const text = box.querySelector('textarea');
  const status = box.querySelector('.panel-json-status');
  box.querySelector('[data-action="copy"]').addEventListener('click', () => {
    text.value = settingsJSON(config);
    text.select();
    status.textContent = 'Settings are in the box.';
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text.value).then(
        () => { status.textContent = 'Copied to the clipboard.'; },
        () => { status.textContent = 'Selected in the box. Copy it from there.'; },
      );
    }
  }, { signal });
  box.querySelector('[data-action="load"]').addEventListener('click', () => {
    const error = loadSettings(config, text.value);
    status.textContent = error || 'Loaded.';
    if (!error) refresh();
  }, { signal });

  function refresh() {
    for (const controller of gui.controllersRecursive()) controller.updateDisplay();
    remember(config);
  }
  gui.onFinishChange(() => remember(config));

  // Hero mode: from the panel, the H key, or a link ending in #hero.
  const hero = createHero(ctx, () => {
    state.hero = false;
    hero.set(false);
    gui.open();
    refresh();
  });
  addEventListener('keydown', (event) => {
    if (event.code !== 'KeyH' || event.repeat || event.ctrlKey || event.metaKey || event.altKey || isTyping(event)) return;
    state.hero = !state.hero;
    hero.set(state.hero);
    for (const controller of gui.controllersRecursive()) controller.updateDisplay();
  }, { signal });
  if (location.hash === '#hero') {
    state.hero = true;
    hero.set(true);
    for (const controller of gui.controllersRecursive()) controller.updateDisplay();
  }

  return {
    update() {},
    dispose() {
      hero.dispose();
      ctx.gui = null; // main.js has already destroyed it
    },
  };
}
