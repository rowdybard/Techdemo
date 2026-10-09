// Customize: the friendly settings drawer. Big preset cards, colour swatches, chips for
// the fireworks and ground show, and plain-language sliders (Pace, Size, Sky, Wind,
// Smoke) that each move one or two real settings. A bottom sheet on phones, a card on
// the right on larger screens. The full developer panel (ui.js) is behind "Advanced
// settings". Every change writes the config the modules read each frame, so it's live.
import { PRESETS, applyPreset, remember } from './presets.js';
import { LABELS } from './occasions.js';
import { LIGHT_COLORS } from './lighthouse.js';
import { PLACES } from './places.js';

const PRESET_CARDS = [
  ['Default', '🎆', 'Classic'], ['Halloween', '🎃', 'Halloween'], ['Fourth of July', '🇺🇸', 'Fourth of July'],
  ['Gold Willows', '✨', 'Gold willows'], ['Lake Michigan', '🗼', 'Lake Michigan'], ['Neon', '💜', 'Neon'],
  ['Calm', '🌙', 'Calm'], ['Winter', '❄️', 'Winter'], ['Finale', '💥', 'Big finale'],
];
const PALETTES = [['classic', 'Classic'], ['usa', 'Red, white & blue'], ['gold', 'Gold'], ['neon', 'Neon'], ['pastel', 'Pastel'], ['halloween', 'Halloween']];
const SHELLS = {
  Classic: ['peony', 'chrysanthemum', 'willow', 'palm', 'ring', 'crossette', 'strobe', 'crackle', 'multibreak', 'heart', 'star'],
  Halloween: ['pumpkin', 'ghost', 'bat', 'skull', 'web', 'brew', 'eyes', 'wisp'],
};
const GROUND = [['off', 'Off'], ['mixed', 'A bit of everything'], ['halloween', 'Halloween mix'], ['fountains', 'Fountains'], ['shooters', 'Shooters'],
  ['candles', 'Roman candles'], ['mines', 'Mines'], ['fans', 'V fans'], ['cauldron', 'Cauldrons'], ['wisps', 'Wisps'], ['lightning', 'Lightning'], ['lanterns', 'Lanterns']];
const CAMERAS = ['sand', 'drone', 'water']; // named by the place (places.js)

// Sliders: what they show, and how they map to settings (value 0..1 both ways).
const SLIDERS = [
  { name: 'Pace', low: 'Calm', high: 'Wild',
    get: (c) => (c.show.shellsPerMinute - 8) / 82,
    set: (c, v) => { c.show.shellsPerMinute = Math.round(8 + v * 82); c.show.maxShells = Math.round(3 + v * 11); } },
  { name: 'Size', low: 'Small', high: 'Huge', get: (c) => (c.look.burstSize - 30) / 70, set: (c, v) => { c.look.burstSize = Math.round(30 + v * 70); } },
  { name: 'Sparkle', low: 'Soft', high: 'Dazzling', get: (c) => (c.look.brightness - 0.8) / 2.2, set: (c, v) => { c.look.brightness = 0.8 + v * 2.2; } },
  { name: 'Sky', low: 'Sunset', high: 'Midnight', get: (c) => c.sky.timeOfDay, set: (c, v) => { c.sky.timeOfDay = v; } },
  { name: 'Wind', low: 'Still', high: 'Gusty', get: (c) => c.physics.windSpeed / 10, set: (c, v) => { c.physics.windSpeed = v * 10; } },
  { name: 'Smoke', low: 'None', high: 'Lots', get: (c) => (c.smoke.enabled ? c.smoke.amount / 2 : 0),
    set: (c, v) => { c.smoke.amount = v * 2; c.smoke.enabled = v > 0.01; } },
  { name: 'Snow', low: 'None', high: 'Blizzard', get: (c) => c.snow.amount, set: (c, v) => { c.snow.amount = v; } },
];
// The lighthouse's light, shown while the pier is on.
const LIGHTHOUSE = [
  { name: 'Light', low: 'Off', high: 'Bright', get: (c) => c.landmarks.light / 2, set: (c, v) => { c.landmarks.light = v * 2; } },
  { name: 'Beam', low: 'Still', high: 'Fast', get: (c) => c.landmarks.sweep / 20, set: (c, v) => { c.landmarks.sweep = v * 20; } },
];
const LIGHT_NAMES = { warm: 'Warm', white: 'White', red: 'Red', green: 'Green' };

export function create(ctx) {
  const { config, container, signal } = ctx;
  const refreshers = [];

  const open = el('button', 'studio-open', '🎨 Customize');
  open.type = 'button';
  const sheet = el('section', 'studio');
  sheet.hidden = true;
  sheet.setAttribute('aria-label', 'Customize the show');

  const head = el('div', 'studio-head');
  const done = el('button', 'studio-done', 'Done');
  done.type = 'button';
  head.append(el('h2', '', 'Customize'), done);
  // While making a greeting: what it is and what sending it costs, and the ✦ key.
  const making = el('p', 'studio-making');
  refreshers.push(() => {
    const summary = ctx.builder ? ctx.builder.summary : '';
    // Making a greeting: what it is and costs. Playing first: what ✦ means, so no surprise.
    making.hidden = !ctx.builder;
    making.textContent = summary ? `${summary}. ✦ effects make it a Deluxe send.`
      : ctx.builder ? `✦ marks Deluxe effects. Using any makes the send ${ctx.builder.price}; everything else sends free.` : '';
  });

  // Big moments.
  const actions = el('div', 'studio-actions');
  actions.append(
    button('studio-action', '💥 Finale!', () => ctx.fireworks && ctx.fireworks.finale()),
    button('studio-action', '🚀 Launch one', () => ctx.fireworks && ctx.fireworks.launch()),
  );

  // Presets.
  const presets = el('div', 'studio-cards');
  let currentPreset = 'Default';
  for (const [name, icon, label] of PRESET_CARDS) {
    if (!PRESETS[name]) continue;
    const card = button('studio-card', '', () => {
      currentPreset = name;
      applyPreset(config, name);
      changed();
    });
    card.append(el('span', 'studio-card-icon', icon), el('span', '', label));
    refreshers.push(() => card.setAttribute('aria-pressed', String(currentPreset === name)));
    presets.append(card);
  }

  // Colours.
  const swatches = el('div', 'studio-swatches');
  for (const [name, label] of PALETTES) {
    const swatch = button('studio-swatch', '', () => {
      config.look.palette = name;
      changed();
    });
    swatch.title = label;
    swatch.setAttribute('aria-label', label);
    swatch.style.background = gradient(config.palettes[name]);
    refreshers.push(() => swatch.setAttribute('aria-pressed', String(config.look.palette === name)));
    swatches.append(swatch);
  }

  // Which fireworks.
  const shellGroups = el('div', 'studio-groups');
  const kept = {}; // weights from before a type was switched off
  for (const group in SHELLS) {
    const chips = el('div', 'studio-chips');
    for (const type of SHELLS[group]) {
      const chip = button('studio-chip', LABELS[type] || type, () => {
        const mix = config.look.mix;
        if (mix[type] > 0) {
          let on = 0;
          for (const key in mix) if (mix[key] > 0 && key !== 'text') on++;
          if (on <= 1) return; // keep at least one
          kept[type] = mix[type];
          mix[type] = 0;
        } else {
          mix[type] = kept[type] || 1;
        }
        if (ctx.builder) ctx.builder.picked(type, mix[type] > 0); // a Deluxe shell switched on makes the send Deluxe
        changed();
      });
      refreshers.push(() => {
        chip.setAttribute('aria-pressed', String(config.look.mix[type] > 0));
        chip.classList.toggle('is-deluxe', deluxeItem(type));
      });
      chips.append(chip);
    }
    shellGroups.append(el('p', 'studio-sub', group), chips);
  }

  // Ground show.
  const ground = el('div', 'studio-chips');
  for (const [style, label] of GROUND) {
    const chip = button('studio-chip', label, () => {
      config.fountains.enabled = style !== 'off';
      if (style !== 'off') config.fountains.style = style;
      changed();
      if (style !== 'off' && ctx.fountains) ctx.fountains.start();
    });
    refreshers.push(() => {
      chip.setAttribute('aria-pressed', String(style === 'off' ? !config.fountains.enabled : config.fountains.enabled && config.fountains.style === style));
      // The Halloween mix holds paid effects, so it's marked too ("A bit of everything" is the
      // free default: a free send uses only its free effects).
      chip.classList.toggle('is-deluxe', deluxeItem(style) || (style === 'halloween' && Boolean(ctx.builder)));
    });
    ground.append(chip);
  }

  // Sliders.
  const sliders = el('div', 'studio-sliders');
  for (const def of SLIDERS) sliders.append(slider(def));
  const lighthouse = el('div', 'studio-sliders');
  for (const def of LIGHTHOUSE) lighthouse.append(slider(def));
  const lightColors = el('div', 'studio-chips');
  for (const name in LIGHT_COLORS) {
    const chip = button('studio-chip', LIGHT_NAMES[name], () => {
      config.landmarks.lightColor = name;
      changed();
    });
    refreshers.push(() => chip.setAttribute('aria-pressed', String(config.landmarks.lightColor === name)));
    lightColors.append(chip);
  }
  lighthouse.append(lightColors);

  // Switches.
  const switches = el('div', 'studio-switches');
  const beachOnly = [toggle('Pier & lighthouse', () => config.landmarks.pier, (on) => { config.landmarks.pier = on; }),
    toggle('Dune grass', () => config.landmarks.grass, (on) => { config.landmarks.grass = on; })];
  switches.append(
    toggle('Sound', () => config.sound.enabled && config.sound.volume > 0, (on) => { config.sound.enabled = true; config.sound.volume = on ? 0.6 : 0; }),
    toggle('Side barges', () => config.fountains.sideBarges, (on) => { config.fountains.sideBarges = on; }),
    ...beachOnly,
  );

  // Where the show is set, and the camera views, which the place names.
  const places = el('div', 'studio-segments');
  for (const name in PLACES) {
    const segment = button('studio-segment', `${PLACES[name].icon} ${PLACES[name].label}`, () => {
      config.place.environment = name;
      changed();
    });
    refreshers.push(() => segment.setAttribute('aria-pressed', String(config.place.environment === name)));
    places.append(segment);
  }
  const cameras = el('div', 'studio-segments');
  for (const name of CAMERAS) {
    const segment = button('studio-segment', '', () => {
      ctx.setCameraPreset(name);
      changed();
    });
    refreshers.push(() => {
      segment.textContent = (PLACES[config.place.environment] || PLACES.beach).views[name];
      segment.setAttribute('aria-pressed', String(config.camera.preset === name));
    });
    cameras.append(segment);
  }

  const lighthouseSection = section('Lighthouse', lighthouse);
  refreshers.push(() => {
    const beach = config.place.environment === 'beach';
    lighthouseSection.hidden = !beach || !config.landmarks.pier;
    for (const row of beachOnly) row.hidden = !beach;
  });

  const footer = el('div', 'studio-footer');
  footer.append(
    button('studio-link', 'Start over', () => { currentPreset = 'Default'; applyPreset(config, 'Default'); changed(); }),
    button('studio-link', 'Advanced settings', () => { onDone = null; show(false); if (ctx.advanced) ctx.advanced.open(); }),
  );

  // Opened on its own (not from the builder): a way to send the show as it is now.
  const sendBar = el('div', 'studio-sendbar');
  const sendShow = button('studio-send', 'Send this show →', () => {
    onDone = null;
    show(false);
    if (ctx.builder) ctx.builder.open();
  });
  sendShow.append(el('small', '', 'Add your words and send it. It plays just like this.'));
  sendBar.append(sendShow);

  sheet.append(head, making, actions,
    section('Style', presets), section('Colours', swatches), section('Fireworks', shellGroups),
    section('Ground show', ground), section('Feel', sliders), section('Extras', switches), lighthouseSection, section('Place', places), section('View', cameras), footer, sendBar);
  container.append(open, sheet);

  // Opened from the greeting builder, Done goes back to it.
  let onDone = null;
  function show(on) {
    if (on) refresh();
    sendBar.hidden = Boolean(onDone) || !ctx.builder; // from the builder, Done goes back to it
    sheet.hidden = !on;
    open.hidden = on;
    container.classList.toggle('customizing', on);
    if (!on && onDone) {
      const back = onDone;
      onDone = null;
      back();
    }
  }
  function deluxeItem(item) {
    const deluxe = ctx.builder && ctx.builder.deluxe;
    return Boolean(deluxe && deluxe.includes(item));
  }
  open.addEventListener('click', () => show(true), { signal });
  done.addEventListener('click', () => show(false), { signal });
  sheet.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') show(false);
  }, { signal });

  // After any change: redraw this drawer and the advanced panel, and remember it.
  function changed() {
    if (ctx.builder) ctx.builder.refresh(); // the send price follows the design
    sync();
    remember(config);
  }
  function sync() {
    refresh();
    if (ctx.advanced) ctx.advanced.refresh();
  }
  function refresh() {
    for (let i = 0; i < refreshers.length; i++) refreshers[i]();
  }

  function slider(def) {
    const row = el('label', 'studio-slider');
    const input = el('input');
    input.type = 'range';
    input.min = '0';
    input.max = '1';
    input.step = '0.01';
    const ends = el('span', 'studio-ends');
    ends.append(el('span', '', def.low), el('span', '', def.high));
    row.append(el('span', 'studio-slider-name', def.name), input, ends);
    input.addEventListener('input', () => { def.set(config, Number(input.value)); sync(); }, { signal });
    input.addEventListener('change', () => remember(config), { signal });
    refreshers.push(() => { input.value = String(Math.min(1, Math.max(0, def.get(config)))); });
    return row;
  }

  function toggle(label, get, set) {
    const row = el('label', 'studio-switch');
    const input = el('input');
    input.type = 'checkbox';
    input.setAttribute('role', 'switch');
    input.addEventListener('change', () => { set(input.checked); changed(); }, { signal });
    refreshers.push(() => { input.checked = get(); });
    row.append(el('span', '', label), input);
    return row;
  }

  function button(className, text, onClick) {
    const node = el('button', className, text);
    node.type = 'button';
    node.addEventListener('click', onClick, { signal });
    return node;
  }

  ctx.studio = {
    open(then = null) {
      onDone = then;
      show(true);
    },
  };
  refresh();

  return {
    update() {},
    dispose() {
      open.remove();
      sheet.remove();
      container.classList.remove('customizing');
      ctx.studio = null;
    },
  };
}

function section(title, body) {
  const node = el('div', 'studio-section');
  node.append(el('h3', '', title), body);
  return node;
}

// A swatch: the palette's colours around a circle (linear RGB shown as sRGB).
function gradient(colors) {
  const css = colors.map((c) => `rgb(${c.map((v) => Math.round(255 * Math.min(1, v) ** (1 / 2.2))).join(' ')})`);
  return `conic-gradient(${css.concat(css[0]).join(', ')})`;
}

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}
