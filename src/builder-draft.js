// Full authored design, committed send version and temporary comparisons are separate.
import { takeDesign, putDesign, sanitizeDesign } from './design.js';
import { freeDesign, deluxeFeatures } from './catalog.js';

export function createDraft(config) {
  let full = takeDesign(config), tier = null, candidate = null, shown = null;
  const clone = (value) => structuredClone(value);
  function version(design, value) {
    return value === 'free' ? freeDesign(design) : clone(design);
  }
  function display(design) { putDesign(config, design); shown = takeDesign(config); }
  function selected() { return version(full, tier); }
  function commit(value) {
    if (candidate) full = candidate.full;
    tier = value; candidate = null; display(selected());
  }
  // Preserve paid weights when editing a Free version. Only actual edited values are merged.
  function mergeChanges(base, before, after) {
    for (const key of Object.keys(after)) {
      if (after[key] && typeof after[key] === 'object' && !Array.isArray(after[key])) {
        if (!base[key] || typeof base[key] !== 'object') base[key] = {};
        mergeChanges(base[key], before?.[key] || {}, after[key]);
      } else if (JSON.stringify(before?.[key]) !== JSON.stringify(after[key])) base[key] = clone(after[key]);
    }
  }
  return {
    commit,
    compare(value) { candidate = { full: clone(full), tier: value }; display(version(full, value)); },
    previewChange(change) {
      if (!candidate) display(selected());
      change();
      const next = takeDesign(config);
      if (tier === 'free' && deluxeFeatures(next).length) candidate = { full: next, tier: 'deluxe' };
      else { full = next; candidate = null; }
      shown = takeDesign(config);
    },
    changed() {
      const next = takeDesign(config);
      if (candidate) candidate.full = next;
      else if (tier === 'free' && deluxeFeatures(next).length) {
        const upgraded = clone(full);
        mergeChanges(upgraded, shown || selected(), next);
        candidate = { full: upgraded, tier: 'deluxe' };
        display(upgraded);
      }
      else if (tier === 'free') mergeChanges(full, shown || selected(), next);
      else full = next;
      shown = takeDesign(config);
    },
    cancel() { candidate = null; display(selected()); },
    restoreDisplay() { display(candidate ? version(candidate.full, candidate.tier) : selected()); },
    resetDesign(change) { change(); full = takeDesign(config); candidate = null; display(selected()); },
    reset() { full = takeDesign(config); tier = null; candidate = null; shown = clone(full); },
    snapshot() { return { full: clone(full), tier }; },
    restore(data) { full = sanitizeDesign(data.full); tier = ['free', 'deluxe'].includes(data.tier) ? data.tier : null; candidate = null; display(selected()); },
    get tier() { return tier; },
    get previewTier() { return candidate?.tier || tier || 'deluxe'; },
    get pending() { return Boolean(candidate); },
    get canSend() { return tier !== null && !candidate; },
    sendDesign() { return selected(); },
  };
}
