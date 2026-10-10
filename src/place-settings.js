// Remember each place's scene independently. These values never choose a paid tier.
import { applyPreset, applyPresetSections, SCENE, LANDING_PRESET } from './presets.js';
import { takeDesign, sanitizeDesign } from './design.js';
import { PLACES } from './places.js';
const KEY = 'skygreeting-place-scenes-v1';
const SECTIONS = ['place', 'sky', 'snow', 'lake', 'ocean', 'beach', 'landmarks'];
export function createPlaceSettings(config) {
  let scenes = {};
  try { const saved = JSON.parse(localStorage.getItem(KEY)); if (saved && typeof saved === 'object') scenes = saved; } catch { /* Optional visitor storage. */ }
  function capture() { const design = takeDesign(config); return Object.fromEntries(SECTIONS.map((key) => [key, structuredClone(design[key])])); }
  function restore(scene) {
    const safe = sanitizeDesign(scene, takeDesign(config));
    for (const key of SECTIONS) Object.assign(config[key], safe[key]);
  }
  function remember() {
    scenes[config.place.environment] = capture();
    try { localStorage.setItem(KEY, JSON.stringify(scenes)); } catch { /* Current-tab choices still work. */ }
  }
  function choose(name) {
    if (!PLACES[name] || config.place.environment === name) return;
    remember();
    if (scenes[name]) restore(scenes[name]);
    else {
      const copy = structuredClone(config);
      if (PLACES[name].look) applyPresetSections(copy, PLACES[name].look, SCENE);
      else applyPreset(copy, LANDING_PRESET);
      copy.place.environment = name;
      restore(takeDesign(copy));
    }
    config.place.environment = name; remember();
  }
  scenes[config.place.environment] = capture();
  return { capture, restore, remember, choose };
}
