// State contracts independent of rendering: no GPU or network needed.
import assert from 'node:assert/strict';
import { setMaxListeners } from 'node:events';
import { config as original } from '../src/config.js';
import { applyPreset } from '../src/presets.js';
import { takeDesign } from '../src/design.js';
import { deluxeFeatures } from '../src/catalog.js';
import { createDraft } from '../src/builder-draft.js';
import { createPlaceSettings } from '../src/place-settings.js';
import { create as createNavigation } from '../src/navigation.js';
import { createOffer } from '../src/offer-ui.js';
import { LOOKS } from '../src/looks.js';
import { create as createGift } from '../src/gift.js';
import { create as createDirector } from '../src/director.js';

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

// Run recipient controls and the real cue director without a renderer. Text belongs
// to the authored ending; leaving the page open must not repeat one isolated line.
class GiftElement extends EventTarget {
  children = []; hidden = false; className = ''; textContent = '';
  classList = {
    add: (...names) => { this.className = [...new Set([...this.className.split(' '), ...names])].join(' '); },
    remove: (...names) => { this.className = this.className.split(' ').filter((name) => !names.includes(name)).join(' '); },
    toggle: (name, on) => on ? this.classList.add(name) : this.classList.remove(name),
  };
  append(...nodes) { this.children.push(...nodes); }
  get lastChild() { return this.children.at(-1); }
  setAttribute() {} focus() {} remove() {}
  click() { this.dispatchEvent(new Event('click')); }
  find(className) {
    if (this.className.split(' ').includes(className)) return this;
    for (const child of this.children) {
      const found = child.find?.(className);
      if (found) return found;
    }
    return null;
  }
}
globalThis.document = { createElement: () => new GiftElement() };
globalThis.window = {};
globalThis.location = new URL('https://example.test/');
for (const kind of ['legacy free', 'stored Deluxe', 'stored free']) {
  const isDeluxe = kind === 'stored Deluxe', stored = kind !== 'legacy free';
  const recipientConfig = structuredClone(original), recipientAbort = new AbortController();
  setMaxListeners(0, recipientAbort.signal);
  // Old local settings and untrusted saved designs must not re-enable ambient text.
  recipientConfig.look.mix.text = 5;
  const design = takeDesign(recipientConfig); design.look.mix.text = 5;
  const data = { occasion: 'love', message: 'HELLO THERE', message2: 'YOU MADE TODAY BETTER', to: 'ALEX', from: 'Sam',
    ...(stored ? { status: isDeluxe ? 'paid' : 'free', deluxe: isDeluxe, look: { ver: 2, design } } : {}),
    ...(isDeluxe ? { recipientFirst: true } : {}) };
  globalThis.fetch = async (url) => {
    assert.equal(new URL(url, location).pathname, stored ? '/api/greeting' : '/api/taken-down');
    return { ok: true, json: async () => stored ? data : { hidden: false } };
  };
  const launched = [];
  let captured = null;
  const recipient = { config: recipientConfig, signal: recipientAbort.signal, container: new GiftElement(),
    link: { gift: stored ? { id: 'Test1234' } : data }, camera: { aspect: 1.5 },
    fireworks: { launchAt(type) { if (type === 'text') launched.push(recipientConfig.look.text); }, cancelDirected() {} },
    video: { supported: true, capture(options) { captured = options; options.play(); } },
  };
  const direction = createDirector(recipient), giftModule = createGift(recipient);
  await new Promise((resolve) => setImmediate(resolve)); // settle the mocked greeting response
  const silent = (phase) => assert.equal(recipientConfig.look.mix.text, 0, `${kind}: random text disabled ${phase}`);
  const tick = (time) => { direction.update(0.5, time); giftModule.update(0.5, time); silent(`at ${time}s`); };
  const playThrough = (from, until) => { for (let time = from; time <= until; time += 0.5) tick(time); };
  const expected = isDeluxe ? ['ALEX', 'HELLO THERE', 'YOU MADE TODAY BETTER', 'FROM SAM'] : ['HELLO THERE', 'YOU MADE TODAY BETTER', 'ALEX'];
  try {
    silent('as soon as ready');
    if (isDeluxe) {
      playThrough(0, 5);
      assert.equal(recipient.director.active, false, 'Wrapped Deluxe must wait for opening');
      assert.deepEqual(launched, []);
      recipient.container.find('gift-wrap-quiet').click();
    }
    playThrough(isDeluxe ? 5.5 : 0, 120);
    assert.equal(recipient.director.active, false);
    assert.deepEqual(launched, expected, `${kind}: first ending preserves both phrase lines and name`);
    assert.equal(recipient.container.find('gift-card').className.includes('gift-watching'), false);
    const count = launched.length;
    playThrough(120.5, 180);
    assert.equal(launched.length, count, 'The finished ending must not restart itself');
    recipient.container.find('gift-card').find('send-secondary').click();
    tick(180.5);
    assert.equal(recipient.director.active, true, 'Watch again explicitly restarts the ending');
    playThrough(181, 300);
    assert.deepEqual(launched, [...expected, ...expected], `${kind}: explicit replay preserves the full phrase`);
    recipient.container.find('gift-video').click();
    assert(captured, 'Save as video receives the directed ending');
    assert.equal(captured.watermark, !isDeluxe);
    playThrough(300.5, 420);
    captured.returnTo();
    tick(420.5);
    assert.deepEqual(launched, [...expected, ...expected, ...expected], `${kind}: video capture preserves the full phrase`);
  } finally {
    giftModule.dispose(); direction.dispose(); recipientAbort.abort();
  }
}
console.log(`PASS: ${LOOKS.length} full/free design round trips, candidate cancellation, place memory, navigation parents, unavailable-price safety, and recipient phrase lifecycle/replay/video`);
