import { boundedText, HttpError } from './common.js';
import { MAX_LOOK_BYTES } from '../src/design.js';

export async function stripe(env, method, path, form) {
  let response;
  try {
    response = await fetch(`https://api.stripe.com${path}`, {
      method, signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form ? form.toString() : undefined,
    });
  } catch { throw new HttpError(502, 'The payment service could not be reached. Please try again.'); }
  let data;
  try { data = JSON.parse(await boundedText(response, 2 * 1024 * 1024)); } catch { throw new HttpError(502, 'The payment service could not be reached. Please try again.'); }
  if (!response.ok || data.error) throw new HttpError(502, 'The payment service could not be reached. Please try again.');
  return data;
}

export function backupMetadata(id, words, look, quote, transactionId) {
  const metadata = { greeting: id, ...words, quoted_amount: String(quote.priceCents), currency: quote.currency,
    analytics_transaction_id: transactionId, offer_id: quote.promotion.active ? quote.promotion.id : 'regular',
    offer_start: quote.promotion.start || '', offer_end: quote.promotion.end || '' };
  const packed = look ? JSON.stringify(look) : '';
  const count = Math.ceil(packed.length / 480);
  metadata.look_parts = String(count);
  for (let part = 0; part < count; part++) metadata[`look${part}`] = packed.slice(part * 480, (part + 1) * 480);
  return metadata;
}

export function backupLook(metadata) {
  // Existing Stripe backups have four chunks and no look_parts key.
  const count = metadata.look_parts === undefined ? 4 : Number(metadata.look_parts);
  if (!Number.isInteger(count) || count < 0 || count > Math.ceil(MAX_LOOK_BYTES / 480)) return null;
  const parts = [];
  for (let part = 0; part < count; part++) {
    if (metadata.look_parts !== undefined && typeof metadata[`look${part}`] !== 'string') return null;
    parts.push(metadata[`look${part}`] || '');
  }
  const packed = parts.join('');
  if (!packed || new TextEncoder().encode(packed).length > MAX_LOOK_BYTES) return null;
  try {
    const look = JSON.parse(packed);
    return look && typeof look === 'object' && !Array.isArray(look) ? look : null;
  } catch { return null; }
}

export function paidDetails(payment, metadata = {}) {
  const cents = payment.amount_total ?? payment.amount_received ?? payment.amount;
  const currency = String(payment.currency || metadata.currency || '').toUpperCase();
  return { paidAmountCents: Number.isInteger(cents) && cents >= 0 ? cents : null,
    currency: /^[A-Z]{3}$/.test(currency) ? currency : null,
    transactionId: /^[A-Za-z0-9_-]{16,80}$/.test(metadata.analytics_transaction_id || '') ? metadata.analytics_transaction_id : null };
}

export async function verify(body, header, secret, now = Date.now()) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(',').map((part) => part.split('=', 2)));
  const signed = header.split(',').filter((part) => part.startsWith('v1=')).map((part) => part.slice(3));
  const time = Number(parts.t);
  if (!time || !signed.length || Math.abs(now / 1000 - time) > 300) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${time}.${body}`));
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return signed.some((candidate) => {
    if (candidate.length !== expected.length) return false;
    let difference = 0;
    for (let i = 0; i < expected.length; i++) difference |= candidate.charCodeAt(i) ^ expected.charCodeAt(i);
    return difference === 0;
  });
}
