// State contracts independent of rendering: no GPU or network needed.
import assert from 'node:assert/strict';
import { config as original } from '../src/config.js';
import { applyPreset } from '../src/presets.js';
import { takeDesign } from '../src/design.js';
import { deluxeFeatures } from '../src/catalog.js';
import { createDraft } from '../src/builder-draft.js';
import { createPlaceSettings } from '../src/place-settings.js';
import { create as createNavigation } from '../src/navigation.js';
import { createOffer } from '../src/offer-ui.js';
import { LOOKS } from '../src/looks.js';

for (const look of LOOKS) {
  const config = structuredClone(original); applyPreset(config, look.preset);
  const full = takeDesign(config), draft = createDraft(config);
  assert.equal(draft.tier, null); assert.equal(draft.canSend, false);
  draft.commit('free'); assert.equal(deluxeFeatures(takeDesign(config)).length, 0);
  assert.equal(config.fountains.sideBarges, false);
  draft.commit('deluxe'); assert.deepEqual(takeDesign(config), full, `${look.preset}: Free must not erase the full design`);
  draft.commit('free'); const free = takeDesign(config);
  draft.previewChange(() => applyPreset(config, 'Royal'));
  assert.equal(draft.tier, 'free'); assert.equal(draft.pending, true); assert.equal(draft.canSend, false);
  assert.deepEqual(draft.sendDesign(), free, 'An unpaid candidate cannot replace the chosen send');
  draft.cancel(); assert.deepEqual(takeDesign(config), free);
  draft.compare('deluxe'); assert.equal(draft.pending, true); assert.equal(draft.tier, 'free');
  draft.commit('deluxe'); assert.deepEqual(takeDesign(config), full);
}
const config = structuredClone(original); applyPreset(config, 'Galaxy');
const draft = createDraft(config), saturn = config.look.mix.saturn;
draft.commit('free'); config.look.palette = 'royal'; draft.changed();
draft.commit('deluxe'); assert.equal(config.look.palette, 'royal'); assert.equal(config.look.mix.saturn, saturn);
draft.commit('free'); config.fountains.sideBarges = true; draft.changed();
assert.equal(draft.pending, true); assert.equal(draft.tier, 'free'); assert.equal(config.look.mix.saturn, saturn);
draft.cancel(); assert.equal(config.fountains.sideBarges, false);
draft.resetDesign(() => applyPreset(config, 'Galaxy')); assert.equal(draft.tier, 'free'); assert.equal(draft.pending, false); assert.equal(deluxeFeatures(takeDesign(config)).length, 0);
const storage = new Map();
globalThis.localStorage = { getItem: (key) => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) };
const places = createPlaceSettings(config);
config.sky.timeOfDay = 0.78; config.ocean.waveHeight = 0.4;
places.choose('lake'); assert.equal(config.sky.timeOfDay, 0.9); assert.equal(config.snow.amount, 0.5);
config.snow.amount = 0.23; config.lake.open = 0.67; places.remember();
places.choose('beach'); assert.equal(config.sky.timeOfDay, 0.78); assert.equal(config.ocean.waveHeight, 0.4);
places.choose('lake'); assert.equal(config.snow.amount, 0.23); assert.equal(config.lake.open, 0.67);
const reload = createPlaceSettings(config); reload.choose('beach'); reload.choose('lake'); assert.equal(config.lake.open, 0.67);

const events = new EventTarget(), abort = new AbortController();
globalThis.addEventListener = events.addEventListener.bind(events);
globalThis.location = { href: 'https://example.test/?g=PRIVATE' };
let entries = [null], position = 0;
globalThis.history = {
  get state() { return entries[position]; },
  replaceState(state) { entries[position] = state; },
  pushState(state) { entries = entries.slice(0, ++position); entries.push(state); },
  back() { if (position > 0) { position--; const event = new Event('popstate'); event.state = entries[position]; events.dispatchEvent(event); } },
};
globalThis.document = new EventTarget(); document.activeElement = null; document.hidden = false;
const container = new EventTarget(); container.dataset = {}; container.classList = { toggle() {}, remove() {} };
const ctx = { container, signal: abort.signal }, navigationModule = createNavigation(ctx), nav = ctx.navigation;
const element = () => ({ hidden: true, scrollTop: 0, querySelector: () => null });
for (const id of ['builder', 'studio', 'advanced', 'builder-preview']) nav.register(id, { element: element() });
nav.open('builder'); nav.open('studio'); nav.open('advanced');
assert.equal(nav.current, 'advanced'); assert.equal(nav.parent, 'studio');
nav.back(); assert.equal(nav.current, 'studio'); nav.back(); assert.equal(nav.current, 'builder'); nav.back(); assert.equal(nav.current, null);
nav.open('studio'); nav.open('builder'); nav.open('builder-preview'); nav.back(); assert.equal(nav.current, 'builder');
history.back(); assert.equal(nav.current, 'studio'); history.back(); assert.equal(nav.current, null);
assert(!JSON.stringify(history.state).includes('PRIVATE'), 'Private greeting URLs must not enter navigation state');
nav.open('builder'); nav.open('builder-preview'); nav.replace('builder'); nav.back(); assert.equal(nav.current, null);
navigationModule.dispose(); abort.abort();

let fail = false;
globalThis.fetch = async () => ({ ok: !fail, json: async () => ({ priceCents: 199, regularPriceCents: 499, currency: 'USD', promotion: { active: true, start: null, end: null }, serverNow: Date.now() }) });
const offerAbort = new AbortController(), offer = createOffer(offerAbort.signal, () => {});
await offer.refresh(); assert.equal(offer.ready, true); assert.equal(offer.label, '$1.99 launch price');
fail = true; await offer.refresh(); assert.equal(offer.ready, false); assert.equal(offer.quote, null);
offerAbort.abort();
console.log(`PASS: ${LOOKS.length} full/free design round trips, candidate cancellation, place memory, navigation parents, and unavailable-price safety`);
