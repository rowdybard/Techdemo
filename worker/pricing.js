// One clock and one offer for config, HTML and checkout. The release start is configured
// once at the approved release; an absent/invalid start never activates the promotion.
export const REGULAR_PRICE_CENTS = 499;
export const LAUNCH_PRICE_CENTS = 199;
export const LAUNCH_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

export function offer(env = {}, now = Date.now()) {
  const value = env.DELUXE_LAUNCH_START_UTC;
  const valid = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value);
  const parsed = valid ? Date.parse(value) : NaN;
  const canonical = valid && !value.includes('.') ? value.replace('Z', '.000Z') : value;
  const start = Number.isFinite(parsed) && new Date(parsed).toISOString() === canonical ? parsed : null;
  const end = start === null ? null : start + LAUNCH_DURATION_MS;
  const active = start !== null && now >= start && now < end;
  return {
    priceCents: active ? LAUNCH_PRICE_CENTS : REGULAR_PRICE_CENTS,
    regularPriceCents: REGULAR_PRICE_CENTS,
    currency: 'USD',
    promotion: { active, id: 'launch-30days', start: start === null ? null : new Date(start).toISOString(), end: end === null ? null : new Date(end).toISOString() },
    serverNow: now,
  };
}

export function priceText(quote) { return `$${(quote.priceCents / 100).toFixed(2)}`; }

export function promotionText(quote) {
  return quote.promotion.active ? `Launch offer ends ${quote.promotion.end.replace('T', ' ').replace(/(?:\.000)?Z$/, ' UTC')}; then $${(quote.regularPriceCents / 100).toFixed(2)}.` : '';
}
