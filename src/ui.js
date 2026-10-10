// The show designer panel (lil-gui). Every control writes into the config the modules
// read each frame, so changes apply live; quality and camera go through their own
// functions. Presets, JSON copy and paste, a remembered setup and hero mode live here.
import GUI from 'lil-gui';
import { PRESETS, applyPreset, loadSettings, remember, settingsJSON } from './presets.js';
import { clientLink, embedCode } from './link.js';
import { createHero } from './hero.js';
import { isTyping } from './debug.js';
import { PLACES } from './places.js';
import { isDeluxe, groundStyles } from './catalog.js';

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
  pumpkin: "Jack-o'-lantern",
  skull: 'Skull',
  bat: 'Bat',
  ghost: 'Ghost',
  web: 'Spider web',
  brew: "Witch's brew",
  eyes: 'Eyes in the dark',
  wisp: "Will-o'-the-wisp",
  kamuro: 'Gold crown',
  dahlia: 'Colour-changing dahlia',
  saturn: 'Saturn',
  fish: 'Swimming fish',
  whirl: 'Whirlwind',
  leaves: 'Falling leaves',
};

export function create(ctx) {
  const { config, container, phone, signal, navigation: nav } = ctx;
  // Remembered settings and anything in the link were applied in main.js (link.js).

  const gui = new GUI({ container, title: 'Show designer', width: phone ? 280 : 300 });
  gui.domElement.classList.add('panel');
  ctx.gui = gui; // main.js destroys it early in teardown
  // The friendly Customize drawer (studio.js) is the everyday panel. This one is
  // "Advanced settings": hidden unless asked for, or opened from the link with #advanced.
  gui.hide();
  const unregister = nav.register('advanced', { element: gui.domElement,
    show() { gui.show(); gui.open(); refresh(); }, hide() { gui.hide(); } });
  ctx.advanced = {
    open() {
      nav.open('advanced', { parent: 'studio' });
    },
    refresh() {
      for (const controller of gui.controllersRecursive()) controller.updateDisplay();
      refreshScene();
    },
  };
  gui.add({ back: () => nav.back() }, 'back').name('← Back to Customize');

  const state = {
    preset: 'Default',
    hero: false,
    quality: config.quality.tier,
    finale: () => ctx.fireworks && ctx.fireworks.finale(),
    launch: () => ctx.fireworks && ctx.fireworks.launch(),
    launchText: () => ctx.fireworks && ctx.fireworks.launch('text'),
    fountains: () => ctx.fountains && ctx.fountains.start(),
  };

  // Presets and the big buttons.
  gui.add(state, 'preset', Object.keys(PRESETS)).name('Preset').onChange((name) => {
    if (ctx.studio) ctx.studio.pickLook(name); else applyPreset(config, name);
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
  show.add(config.show, 'launchSite', { 'Offshore barge': 'barge', 'Along the shore': 'shore' }).name('Launch site');
  show.add(config.loop, 'timeScale', 0.1, 1, 0.05).name('Slow motion');

  const ground = gui.addFolder('Ground show').close();
  ground.add(state, 'fountains').name('Ground show now');
  ground.add(config.fountains, 'enabled').name('Ground show on');
  const groundNames = { 'Mix of everything': 'mixed', Fountains: 'fountains', 'Sweeping shooters': 'shooters',
    'Roman candles': 'candles', Mines: 'mines', 'V fans': 'fans', Waterfall: 'waterfall', 'Halloween mix': 'halloween',
    'Bubbling cauldrons': 'cauldron', "Will-o'-the-wisps": 'wisps', Lightning: 'lightning', 'Floating lanterns': 'lanterns' };
  const groundOptions = Object.fromEntries(Object.entries(groundNames).map(([label, style]) =>
    [`${label}${groundStyles(style).some(isDeluxe) ? ' · Deluxe' : ''}`, style]));
  ground.add(config.fountains, 'style', groundOptions).name('Style');
  ground.add(config.fountains, 'every', 8, 90, 1).name('Every (s)');
  ground.add(config.fountains, 'duration', 3, 20, 0.5).name('Run time (s)');
  ground.add(config.fountains, 'height', 8, 50, 1).name('Height (m)');
  ground.add(config.fountains, 'nozzles', 2, 14, 1).name('Tubes');
  const width = gui.addFolder('Show width');
  width.add(config.fountains, 'sideBarges').name('Side-barge fountains · Deluxe').onChange((on) => { if (on) config.fountains.enabled = true; });
  ground.add(config.fountains, 'color', { Gold: 'gold', Silver: 'silver' }).name('Fountain colour');

  const mix = gui.addFolder('Shell mix').close();
  for (const type in TYPE_LABELS) {
    if (typeof config.look.mix[type] !== 'number') config.look.mix[type] = 0; // a partial mix leaves the rest off
    mix.add(config.look.mix, type, 0, 5, 0.1).name(`${TYPE_LABELS[type]}${isDeluxe(type) ? ' · Deluxe' : ''}`);
  }

  const look = gui.addFolder('Look').close();
  look.add(config.look, 'palette', { Classic: 'classic', Rainbow: 'rainbow', Gold: 'gold', Royal: 'royal', Ocean: 'ocean', Cosmic: 'cosmic', Rose: 'rose', 'Cherry blossom': 'sakura', Autumn: 'autumn', Ice: 'ice', 'Red, white & blue': 'usa', Neon: 'neon', Pastel: 'pastel', Halloween: 'halloween', Custom: 'custom' }).name('Palette');
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
  physics.add(config.physics, 'gustiness', 0, 2, 0.05).name('Gustiness');
  physics.add(config.physics, 'heightMin', 40, 200, 1).name('Lowest burst (m)');
  physics.add(config.physics, 'heightMax', 60, 260, 1).name('Highest burst (m)');
  physics.add(config.physics, 'launchSpread', 0, 150, 1).name('Launch spread (m)');
  physics.add(config.physics, 'angleVariance', 0, 25, 0.5).name('Launch lean (°)');

  const scene = gui.addFolder('Scene').close();
  const beachControls = [], lakeControls = [];
  const placeChoice = { place: config.place.environment };
  scene.add(placeChoice, 'place', Object.fromEntries(Object.entries(PLACES).map(([id, place]) => [place.label, id]))).name('Place')
    .onChange((name) => { ctx.studio?.choosePlace(name); refreshScene(); });
  scene.add(config.sky, 'timeOfDay', 0, 1, 0.01).name('Dusk → night');
  scene.add(config.sky, 'cloudCoverage', 0, 0.8, 0.01).name('Clouds');
  scene.add(config.sky, 'starBrightness', 0, 2, 0.05).name('Stars');
  beachControls.push(scene.add(config.ocean, 'waveHeight', 0, 2.5, 0.05).name('Wave height'));
  beachControls.push(scene.add(config.ocean, 'choppiness', 0, 1.2, 0.05).name('Choppiness'));
  beachControls.push(scene.add(config.ocean, 'surf', 0, 1.6, 0.01).name('Breakers (m)'));
  beachControls.push(scene.add(config.landmarks, 'pier').name('Pier & lighthouse'));
  beachControls.push(scene.add(config.landmarks, 'grass').name('Dune grass'));
  beachControls.push(scene.add(config.landmarks, 'light', 0, 2, 0.05).name('Lighthouse light'));
  beachControls.push(scene.add(config.landmarks, 'sweep', 0, 20, 0.5).name('Beam turns a minute'));
  beachControls.push(scene.add(config.landmarks, 'lightColor', ['warm', 'white', 'red', 'green']).name('Lighthouse colour'));
  beachControls.push(scene.add(config.beach, 'glints', 0, 2, 0.05).name('Sand glints'));
  lakeControls.push(scene.add(config.snow, 'amount', 0, 1, 0.01).name('Snowfall'));
  lakeControls.push(scene.add(config.lake, 'open', 0, 1, 0.01).name('Ice → open water'));
  scene.add(config.look, 'sceneLight', 0, 3, 0.05).name('Firework light');
  scene.add(config.smoke, 'enabled').name('Smoke');
  scene.add(config.smoke, 'amount', 0, 2, 0.05).name('Smoke amount');
  scene.add(config.smoke, 'linger', 8, 60, 1).name('Smoke lingers (s)');
  const cameraChoice = scene.add(config.camera, 'preset', { 'On the sand': 'sand', 'From above': 'drone', 'In the water': 'water' }).name('View')
    .onChange((name) => ctx.setCameraPreset(name));
  scene.add(config.renderer, 'exposure', 0.3, 2, 0.01).name('Exposure');
  scene.add(config.bloom, 'strength', 0, 2, 0.01).name('Bloom strength');
  scene.add(config.bloom, 'radius', 0, 1, 0.01).name('Bloom radius');
  scene.add(config.bloom, 'threshold', 0.5, 2, 0.01).name('Bloom threshold');
  scene.add(state, 'quality', { Auto: 'auto', Low: 'low', Medium: 'medium', High: 'high' }).name('Quality')
    .onChange((tier) => {
      config.quality.tier = tier;
      if (ctx.post) { if (tier === 'auto') ctx.post.remeasure(); else ctx.post.setTier(tier); }
    });

  const sound = gui.addFolder('Sound').close();
  sound.add(config.sound, 'enabled').name('Sound on');
  sound.add(config.sound, 'volume', 0, 1, 0.01).name('Volume');

  // Client mockup: the header text for a prospect, and links to send them or embed.
  const client = gui.addFolder('Client mockup').close();
  const showText = () => hero.refresh();
  client.add(config.hero, 'business').name('Business name').onChange(showText);
  client.add(config.hero, 'headline').name('Headline').onChange(showText);
  client.add(config.hero, 'copy').name('Tagline').onChange(showText);
  client.add(config.hero, 'button').name('Button').onChange(showText);
  const clientActions = {
    nameInSky: () => {
      config.look.text = String(config.hero.business).toUpperCase().slice(0, 24);
      refresh();
      if (ctx.fireworks) ctx.fireworks.launch('text');
    },
    copyLink: () => share(clientLink(config), 'Client link copied. It opens as their homepage header.'),
    copyEmbed: () => share(embedCode(config), 'Embed code copied. It goes where their header should be.'),
  };
  client.add(clientActions, 'nameInSky').name('Spell the business name');
  client.add(clientActions, 'copyLink').name('Copy client link');
  client.add(clientActions, 'copyEmbed').name('Copy embed code');
  const shareBox = document.createElement('div');
  shareBox.className = 'panel-json';
  shareBox.innerHTML = '<textarea id="client-link" rows="3" spellcheck="false" readonly aria-label="Client link"></textarea><p class="panel-json-status" role="status"></p>';
  client.$children.append(shareBox);
  const shareText = shareBox.querySelector('textarea');
  const shareStatus = shareBox.querySelector('.panel-json-status');
  function share(text, done) {
    shareText.value = text;
    shareText.select();
    shareStatus.textContent = 'Selected in the box. Copy it from there.';
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => { shareStatus.textContent = done; }, () => {});
  }

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
    if (!error) { ctx.builder?.designChanged(); ctx.studio?.refresh(); refresh(); }
  }, { signal });

  function refresh() {
    for (const controller of gui.controllersRecursive()) controller.updateDisplay();
    hero.refresh();
    refreshScene();
    remember(config);
  }
  let namedPlace = null;
  function refreshScene() {
    const place = PLACES[config.place.environment] || PLACES.beach;
    placeChoice.place = config.place.environment;
    for (const controller of beachControls) { controller.show(place.capabilities.beach); controller.domElement.hidden = !place.capabilities.beach; }
    for (const controller of lakeControls) { controller.show(place.capabilities.ice); controller.domElement.hidden = !place.capabilities.ice; }
    if (namedPlace !== place) { cameraChoice.options(Object.fromEntries(Object.entries(place.views).map(([id, label]) => [label, id]))); namedPlace = place; }
  }
  gui.onFinishChange(() => { ctx.builder?.designChanged(); ctx.studio?.refresh(); refreshScene(); remember(config); });

  // Hero mode: from the panel, the H key, or a link ending in #hero.
  const hero = createHero(ctx, () => {
    state.hero = false;
    hero.set(false);
    if (ctx.studio) ctx.studio.open();
    refresh();
  });
  addEventListener('keydown', (event) => {
    if (event.code !== 'KeyH' || event.repeat || event.ctrlKey || event.metaKey || event.altKey || isTyping(event)) return;
    state.hero = !state.hero;
    hero.set(state.hero);
    for (const controller of gui.controllersRecursive()) controller.updateDisplay();
  }, { signal });
  // How the link asked to open: hero mode, or a bare embed with no panel, text or hints.
  if (ctx.link.hero) {
    state.hero = true;
    hero.set(true);
    for (const controller of gui.controllersRecursive()) controller.updateDisplay();
  }
  if (ctx.link.embed) container.classList.add('embed-mode');
  if (location.hash.includes('advanced')) container.addEventListener('scene-ready', () => ctx.advanced.open(), { once: true, signal });

  return {
    update() {},
    dispose() {
      hero.dispose();
      unregister();
      container.classList.remove('embed-mode');
      ctx.gui = null; // main.js has already destroyed it
      ctx.advanced = null;
    },
  };
}
