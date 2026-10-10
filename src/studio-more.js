// Customize's "More options", folded away by default: the fireworks one by one, the ground show,
// sky and weather, the beach's extras, the lighthouse and the camera views. The Looks, colours and
// three sliders above them cover most of what people change; this is for the rest.
import { LABELS } from './occasions.js';
import { LIGHT_COLORS } from './lighthouse.js';
import { PLACES } from './places.js';
import { el, section } from './studio-kit.js';

const SHELLS = {
  Classic: ['peony', 'chrysanthemum', 'willow', 'palm', 'ring', 'crossette', 'strobe', 'crackle', 'multibreak', 'heart', 'star'],
  Showpieces: ['kamuro', 'dahlia', 'saturn', 'fish', 'whirl', 'leaves'],
  Halloween: ['pumpkin', 'ghost', 'bat', 'skull', 'web', 'brew', 'eyes', 'wisp'],
};
const GROUND = [['off', 'Off'], ['mixed', 'A bit of everything'], ['halloween', 'Halloween mix'], ['fountains', 'Fountains'], ['shooters', 'Shooters'],
  ['candles', 'Roman candles'], ['mines', 'Mines'], ['fans', 'V fans'], ['waterfall', 'Waterfall'], ['cauldron', 'Cauldrons'], ['wisps', 'Wisps'], ['lightning', 'Lightning'], ['lanterns', 'Lanterns']];
const CAMERAS = ['sand', 'drone', 'water']; // named by the place (places.js)
const WEATHER = [
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

/**
 * Builds the folded section. `kit` holds the drawer's controls (studio-kit.js), `deluxeItem(name)`
 * says whether to mark an effect ✦, `startOver` and `advanced` are the footer's two links.
 */
export function buildMore(ctx, { kit, refreshers, changed, deluxeItem, startOver, advanced }) {
  const { config } = ctx;
  const { button, slider, toggle } = kit;
  const more = el('details', 'studio-more');
  more.append(el('summary', '', 'More options'));

  // The fireworks, one by one. Turning one off remembers its weight for when it comes back.
  const shellGroups = el('div', 'studio-groups');
  const kept = {};
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

  const weather = el('div', 'studio-sliders');
  for (const def of WEATHER) weather.append(slider(def));

  const switches = el('div', 'studio-switches');
  const beachOnly = [toggle('Pier & lighthouse', () => config.landmarks.pier, (on) => { config.landmarks.pier = on; }),
    toggle('Dune grass', () => config.landmarks.grass, (on) => { config.landmarks.grass = on; })];
  switches.append(toggle('Side barges', () => config.fountains.sideBarges, (on) => { config.fountains.sideBarges = on; }), ...beachOnly);

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
  const lighthouseSection = section('Lighthouse', lighthouse);
  refreshers.push(() => {
    const beach = config.place.environment === 'beach';
    lighthouseSection.hidden = !beach || !config.landmarks.pier;
    for (const row of beachOnly) row.hidden = !beach;
  });

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

  const footer = el('div', 'studio-footer');
  footer.append(button('studio-link', 'Start over', startOver), button('studio-link', 'Advanced settings', advanced));

  more.append(section('Fireworks', shellGroups), section('Ground show', ground), section('Sky & weather', weather),
    section('Extras', switches), lighthouseSection, section('View', cameras), footer);
  return more;
}
