// Customize: the friendly settings drawer. It leads with the Looks (looks.js), each a whole show
// in one tap, then the place, the colours, three plain-language sliders (Pace, Size, Sparkle) and
// the words in the sky. Everything else (the fireworks one by one, the ground show, sky and
// weather, extras, the lighthouse, the views) is folded under "More options" (studio-more.js). A
// bottom sheet on phones, a card on the right on larger screens; the full developer panel (ui.js)
// is behind "Advanced settings". Every change writes the config the modules read each frame, so
// it's live.
import { PRESETS, SCENE, applyPreset, applyPresetSections, defaultScene, putScene, remember, takeScene } from './presets.js';
import { LOOKS } from './looks.js';
import { PLACES } from './places.js';
import { MESSAGE_LIMIT, cleanText } from './link.js';
import { isBlocked } from './moderate.js';
import { controls, el, gradient, section, strip } from './studio-kit.js';
import { buildMore } from './studio-more.js';

const PALETTES = [['classic', 'Classic'], ['rainbow', 'Rainbow'], ['gold', 'Gold'], ['royal', 'Royal'], ['ocean', 'Ocean'], ['cosmic', 'Cosmic'],
  ['rose', 'Rose'], ['sakura', 'Cherry blossom'], ['autumn', 'Autumn'], ['ice', 'Ice'], ['usa', 'Red, white & blue'], ['neon', 'Neon'],
  ['pastel', 'Pastel'], ['halloween', 'Halloween']];

// The three sliders most people want (value 0..1 both ways); sky, wind, smoke and snow are under More options.
const FEEL = [
  { name: 'Pace', low: 'Calm', high: 'Wild',
    get: (c) => (c.show.shellsPerMinute - 8) / 82,
    set: (c, v) => { c.show.shellsPerMinute = Math.round(8 + v * 82); c.show.maxShells = Math.round(3 + v * 11); } },
  { name: 'Size', low: 'Small', high: 'Huge', get: (c) => (c.look.burstSize - 30) / 70, set: (c, v) => { c.look.burstSize = Math.round(30 + v * 70); } },
  { name: 'Sparkle', low: 'Soft', high: 'Dazzling', get: (c) => (c.look.brightness - 0.8) / 2.2, set: (c, v) => { c.look.brightness = 0.8 + v * 2.2; } },
];

export function create(ctx) {
  const { config, container, signal } = ctx;
  const refreshers = [];
  const kit = controls({ config, signal, refreshers, changed, sync, remember });
  const { button, slider } = kit;

  const open = button('studio-open', '🎨 Customize', () => show(true));
  const sheet = el('section', 'studio');
  sheet.hidden = true;
  sheet.setAttribute('aria-label', 'Customize the show');

  const head = el('div', 'studio-head');
  const finale = button('studio-finale', '💥 Finale', () => ctx.fireworks && ctx.fireworks.finale());
  finale.title = 'A few seconds of everything at once';
  const done = button('studio-done', 'Done', () => show(false));
  head.append(el('h2', '', 'Customize'), finale, done);
  // While making a greeting: what it is and what sending it costs, and the ✦ key.
  const making = el('p', 'studio-making');
  refreshers.push(() => {
    const summary = ctx.builder ? ctx.builder.summary : '';
    making.hidden = !ctx.builder;
    making.textContent = summary ? `${summary}. ✦ effects make it a Deluxe send.`
      : ctx.builder ? `✦ marks Deluxe effects. Using any makes the send ${ctx.builder.price}; everything else sends free.` : '';
  });

  // The Looks: a whole show in one tap, with its colours along the bottom of the card.
  const looks = el('div', 'studio-looks');
  let currentPreset = 'Default';
  for (const look of LOOKS) {
    if (!PRESETS[look.preset]) continue;
    const card = button('studio-card', '', () => pickLook(look.preset));
    const palette = config.palettes[(PRESETS[look.preset].look || {}).palette || 'classic'];
    const colours = el('span', 'studio-card-strip');
    colours.style.background = strip(palette);
    card.append(el('span', 'studio-card-icon', look.icon), el('span', 'studio-card-name', look.label), el('span', 'studio-card-line', look.line), colours);
    refreshers.push(() => card.setAttribute('aria-pressed', String(currentPreset === look.preset)));
    looks.append(card);
  }
  function pickLook(name) {
    currentPreset = name;
    // Away from the beach a look changes the fireworks, not the place: the frozen lake keeps its
    // own midnight sky and snow (Place picks those).
    const scene = config.place.environment !== 'beach' ? takeScene(config) : null;
    applyPreset(config, name);
    if (scene) putScene(config, scene);
    changed();
    // Show it at once: a few of its shells break within a second or so and its ground show
    // starts, rather than whenever the next ones happen to.
    if (!(ctx.director && ctx.director.active)) {
      if (ctx.fireworks) ctx.fireworks.sample();
      if (config.fountains.enabled && ctx.fountains) ctx.fountains.start();
    }
  }

  // Where the show is set. A place with a look of its own (the frozen lake: midnight, falling
  // snow) brings it, and going back to the beach gives back the sky and snow it had (or the
  // beach's own, if the page opened on the lake).
  let beachScene = null;
  function choosePlace(name) {
    if (config.place.environment === name) return;
    const look = PLACES[name].look;
    if (look) {
      if (config.place.environment === 'beach') beachScene = takeScene(config);
      applyPresetSections(config, look, SCENE);
    } else {
      putScene(config, beachScene || defaultScene());
      beachScene = null;
    }
    config.place.environment = name;
  }
  const places = el('div', 'studio-segments');
  for (const name in PLACES) {
    const segment = button('studio-segment', `${PLACES[name].icon} ${PLACES[name].label}`, () => {
      choosePlace(name);
      changed();
    });
    refreshers.push(() => segment.setAttribute('aria-pressed', String(config.place.environment === name)));
    places.append(segment);
  }

  const swatches = el('div', 'studio-swatches');
  for (const [name, label] of PALETTES) {
    if (!config.palettes[name]) continue;
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

  const feel = el('div', 'studio-sliders');
  for (const def of FEEL) feel.append(slider(def));

  // Words in the sky: spelled now and then, like any other shell. Empty is none. While a
  // greeting is being made its message is what goes up, so the box steps aside then.
  const wordsRow = el('label', 'send-field builder-loud studio-words');
  const wordsInput = el('input');
  wordsInput.maxLength = MESSAGE_LIMIT;
  wordsInput.placeholder = 'Empty: no words';
  wordsInput.autocomplete = 'off';
  wordsInput.enterKeyHint = 'done';
  const wordsNote = el('span', 'studio-words-note');
  wordsRow.append(el('span', '', 'Words in the sky'), wordsInput, wordsNote);
  let wordsTimer = 0;
  wordsInput.addEventListener('input', () => {
    clearTimeout(wordsTimer);
    const words = cleanText(wordsInput.value, MESSAGE_LIMIT).toUpperCase();
    if (words && isBlocked(words)) {
      wordsNote.textContent = 'Those words can’t go in the sky.';
      return;
    }
    wordsNote.textContent = '';
    config.look.text = words;
    if (words && !(config.look.mix.text > 0)) config.look.mix.text = 0.5;
    // A moment after they stop typing, the sky spells it once, so they see it.
    wordsTimer = setTimeout(() => { if (words && ctx.fireworks) ctx.fireworks.launch('text'); }, 900);
  }, { signal });
  wordsInput.addEventListener('change', () => remember(config), { signal });
  wordsInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') wordsInput.blur(); }, { signal });
  refreshers.push(() => {
    if (document.activeElement !== wordsInput) wordsInput.value = config.look.text;
    wordsRow.hidden = Boolean(ctx.builder && ctx.builder.summary);
  });

  const more = buildMore(ctx, {
    kit, refreshers, changed, deluxeItem,
    startOver: () => { currentPreset = 'Default'; config.look.text = ''; applyPreset(config, 'Default'); changed(); },
    advanced: () => { onDone = null; show(false); if (ctx.advanced) ctx.advanced.open(); },
  });

  // Opened on its own (not from the builder): a way to send the show as it is now.
  const sendBar = el('div', 'studio-sendbar');
  const sendShow = button('studio-send', 'Send this show →', () => {
    onDone = null;
    show(false);
    if (ctx.builder) ctx.builder.open();
  });
  sendShow.append(el('small', '', 'Add your words and send it. It plays just like this.'));
  sendBar.append(sendShow);

  sheet.append(head, making, section('Looks', looks, 'studio-looks-section'), section('Place', places), section('Colours', swatches),
    section('Feel', feel), wordsRow, more, sendBar);
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

  ctx.studio = {
    open(then = null) {
      onDone = then;
      show(true);
    },
    /** Marks a Look as the one in use (the builder applies an occasion's look without a tap here). */
    get style() { return currentPreset; },
    setStyle(name) {
      currentPreset = name;
      refresh();
    },
  };
  refresh();

  return {
    update() {},
    dispose() {
      clearTimeout(wordsTimer);
      open.remove();
      sheet.remove();
      container.classList.remove('customizing');
      ctx.studio = null;
    },
  };
}
