// Product entitlements, shared by the browser and Worker. Choreography never sets prices.
export const FREE_SHELLS = Object.freeze(['peony', 'willow', 'palm', 'ring', 'crossette', 'strobe', 'multibreak', 'heart', 'star', 'helmet', 'pumpkin', 'ghost']);
export const DELUXE_SHELLS = Object.freeze(['chrysanthemum', 'crackle', 'kamuro', 'dahlia', 'saturn', 'fish', 'whirl', 'leaves', 'skull', 'bat', 'web', 'brew', 'eyes', 'wisp']);
export const FREE_GROUND = Object.freeze(['fountains', 'shooters', 'candles', 'mines', 'fans', 'lanterns']);
export const DELUXE_GROUND = Object.freeze(['waterfall', 'cauldron', 'wisps', 'lightning']);
export const SHELLS = Object.freeze([...FREE_SHELLS, ...DELUXE_SHELLS]);
export const GROUND_EFFECTS = Object.freeze([...FREE_GROUND, ...DELUXE_GROUND]);
export const FREE_EFFECTS = new Set([...FREE_SHELLS, ...FREE_GROUND, 'text']);
export const DELUXE_EFFECTS = new Set([...DELUXE_SHELLS, ...DELUXE_GROUND, 'finale', 'sideBarges']);
export const GROUND_MIXES = Object.freeze({
  mixed: Object.freeze(['fountains', 'shooters', 'candles', 'mines', 'fans', 'waterfall']),
  halloween: Object.freeze(['cauldron', 'wisps', 'lightning', 'lanterns']),
});

export function groundStyles(style) {
  return [...new Set(String(style || '').split(',').flatMap((name) => GROUND_MIXES[name] || (GROUND_EFFECTS.includes(name) ? [name] : [])))];
}

export function isDeluxe(item) { return DELUXE_EFFECTS.has(item); }

// The free shell nearest each paid one, so a look's Free version keeps its character (a free
// Halloween still fills with pumpkins and ghosts) instead of thinning out to plain peonies.
export const FREE_STAND_IN = Object.freeze({
  chrysanthemum: 'peony', crackle: 'strobe', kamuro: 'willow', dahlia: 'peony', saturn: 'ring', fish: 'crossette',
  whirl: 'crossette', leaves: 'willow', skull: 'ghost', bat: 'ghost', web: 'ring', brew: 'pumpkin', eyes: 'pumpkin', wisp: 'ghost',
});

/** How much of a design's shell mix is paid shells, 0..1 (text aside). */
export function paidShare(mix = {}) {
  let paid = 0;
  let all = 0;
  for (const name of SHELLS) {
    const weight = mix[name] > 0 ? mix[name] : 0;
    all += weight;
    if (DELUXE_SHELLS.includes(name)) paid += weight;
  }
  return all > 0 ? paid / all : 0;
}

export function deluxeFeatures(design) {
  const used = DELUXE_SHELLS.filter((name) => design.look?.mix?.[name] > 0);
  if (design.fountains?.enabled) {
    used.push(...groundStyles(design.fountains.style).filter(isDeluxe));
    if (design.fountains.sideBarges) used.push('sideBarges');
  }
  return used;
}

// This operates on a copy owned by the caller; the full authored design is never stripped.
export function freeDesign(design) {
  const result = structuredClone(design);
  const mix = result.look?.mix;
  if (mix) {
    for (const name of DELUXE_SHELLS) {
      const stand = FREE_STAND_IN[name];
      if (mix[name] > 0) mix[stand] = Math.min(5, (mix[stand] > 0 ? mix[stand] : 0) + mix[name]); // weights run 0..5
      mix[name] = 0;
    }
  }
  if (result.look?.mix && !FREE_SHELLS.some((name) => result.look.mix[name] > 0)) result.look.mix.peony = 1;
  if (result.fountains) {
    const styles = groundStyles(result.fountains.style).filter((name) => FREE_EFFECTS.has(name));
    result.fountains.style = styles.join(',') || 'fountains';
    result.fountains.sideBarges = false;
  }
  return result;
}
