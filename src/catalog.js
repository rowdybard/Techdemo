// Product entitlements, shared by the browser and Worker. Choreography never sets prices.
export const FREE_SHELLS = Object.freeze(['peony', 'willow', 'palm', 'ring', 'crossette', 'strobe', 'multibreak', 'heart', 'star', 'pumpkin', 'ghost']);
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
  for (const name of DELUXE_SHELLS) if (result.look?.mix) result.look.mix[name] = 0;
  if (result.look?.mix && !FREE_SHELLS.some((name) => result.look.mix[name] > 0)) result.look.mix.peony = 1;
  if (result.fountains) {
    const styles = groundStyles(result.fountains.style).filter((name) => FREE_EFFECTS.has(name));
    result.fountains.style = styles.join(',') || 'fountains';
    result.fountains.sideBarges = false;
  }
  return result;
}
