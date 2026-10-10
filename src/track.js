// Funnel events contain categories only, never greeting words, private URLs or ids.
const PENDING = 'skygreeting-checkout-transaction';
const COUNTED = 'skygreeting-counted-purchases';
const seen = new Set();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function track(name, params = {}) {
  if (typeof window.gtag === 'function') window.gtag('event', name, params);
}

/** Match this browser's checkout to the server-confirmed transaction after Stripe. */
export function rememberCheckout(transactionId) {
  if (!UUID.test(transactionId || '')) return;
  try { sessionStorage.setItem(PENDING, transactionId); } catch { /* No unverified fallback. */ }
}

export function trackPurchase(data, occasion) {
  const id = data?.transactionId;
  if (data?.status !== 'paid' || data.deluxe !== true || !UUID.test(id || '') ||
      !Number.isInteger(data.paidAmountCents) || data.paidAmountCents <= 0 || data.currency !== 'USD' || seen.has(id)) return false;
  try {
    if (sessionStorage.getItem(PENDING) !== id) return false;
    const prior = JSON.parse(localStorage.getItem(COUNTED) || '[]');
    if (!Array.isArray(prior) || prior.includes(id)) return false;
    seen.add(id);
    localStorage.setItem(COUNTED, JSON.stringify([...prior.slice(-99), id]));
    sessionStorage.removeItem(PENDING);
  } catch { return false; }
  track('purchase', { transaction_id: id, currency: 'USD', value: data.paidAmountCents / 100,
    items: [{ item_name: 'SkyGreeting Deluxe', item_category: occasion }] });
  return true;
}
