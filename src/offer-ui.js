// Server quotes are authoritative. A failed refresh never leaves an old paid price actionable.
export function createOffer(signal, changed) {
  let quote = null, timer = 0, loading = false, sequence = 0;
  const format = (cents) => new Intl.NumberFormat('en-US', { style: 'currency', currency: quote?.currency || 'USD' }).format(cents / 100);
  async function refresh() {
    const request = ++sequence;
    clearTimeout(timer); loading = true; changed();
    try {
      const response = await fetch('/api/config', { signal, cache: 'no-store' });
      const data = response.ok ? await response.json() : null;
      if (!data || !Number.isInteger(data.priceCents) || data.priceCents < 50) throw new Error('Price unavailable');
      if (request !== sequence) return false;
      quote = data;
      const boundary = Date.parse(data.promotion?.active ? data.promotion.end : data.promotion?.start);
      const now = typeof data.serverNow === 'number' ? data.serverNow : Date.parse(data.serverNow) || Date.now();
      if (boundary > now) timer = setTimeout(refresh, Math.min(boundary - now + 100, 2147483647));
    } catch { if (request === sequence) quote = null; }
    finally { if (request === sequence) { loading = false; changed(); } }
    return Boolean(quote);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); }, { signal });
  signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
  return {
    refresh,
    get ready() { return Boolean(quote) && !loading; },
    get quote() { return quote; },
    get price() { return quote ? format(quote.priceCents) : 'Price unavailable'; },
    get label() { return quote ? `${format(quote.priceCents)}${quote.promotion?.active ? ' launch price' : ''}` : 'Price unavailable'; },
    get note() {
      if (!quote) return 'Deluxe pricing is unavailable. Free previews and Free sends still work.';
      const end = quote.promotion?.active ? new Date(quote.promotion.end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
      return `${end ? `Launch offer ends ${end}; regular price ${format(quote.regularPriceCents || 499)}. ` : ''}One payment per greeting. No subscription.`;
    },
  };
}
