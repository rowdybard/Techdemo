// Counts the moments that matter in Google Analytics (index.html loads it): a free
// greeting sent, checkout started, a Deluxe greeting paid for, a video saved. Never a
// greeting's words, names or private id. Does nothing where Analytics isn't loaded
// (embeds, the preview, tests).
export function track(name, params = {}) {
  if (typeof window.gtag === 'function') window.gtag('event', name, params);
}

const PRICE_KEY = 'skygreeting-checkout-cents'; // survives the trip to Stripe and back, in this tab

/** Remembers the price as checkout starts, for the purchase event after. */
export function rememberPrice(cents) {
  try {
    sessionStorage.setItem(PRICE_KEY, String(cents));
  } catch {
    // Storage blocked: the purchase is counted at the list price.
  }
}

/** The price remembered at checkout, once. */
export function takePrice(fallbackCents) {
  try {
    const cents = Number(sessionStorage.getItem(PRICE_KEY));
    sessionStorage.removeItem(PRICE_KEY);
    if (cents > 0) return cents;
  } catch {
    // As above.
  }
  return fallbackCents;
}
