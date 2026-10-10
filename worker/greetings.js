import { greetingBlocked } from '../src/moderate.js';
import { normalizeLook, MAX_LOOK_BYTES } from '../src/design.js';
import { boundedText, HttpError, json, newId, PENDING_SECONDS, readJSON, SHARE_SECONDS, validId, wordsOf } from './common.js';
import { offer } from './pricing.js';
import { backupMetadata, stripe, verify } from './stripe.js';
import { markPaid, paidRecord } from './storage.js';
import { takeRate } from './policy.js';

function validatedWords(body) {
  const words = wordsOf(body);
  if (!words.message) throw new HttpError(400, 'Type a message first.');
  if (greetingBlocked(words)) throw new HttpError(400, 'That can’t go in the sky. Please keep it kind.');
  return words;
}

function normalizedLook(body, tier) {
  const look = normalizeLook(body.look ?? {}, { tier });
  if (!look || new TextEncoder().encode(JSON.stringify(look)).length > MAX_LOOK_BYTES) throw new HttpError(400, 'The show settings could not be saved. Please choose a Look again.');
  return look;
}

export async function checkout(request, env, url) {
  const body = await readJSON(request);
  const quote = offer(env); // Exactly one snapshot; expiry during Stripe I/O cannot alter this quote.
  if (!Number.isInteger(body.expectedPriceCents) || body.expectedPriceCents !== quote.priceCents) {
    return json({ error: 'price_changed', ...quote }, 409);
  }
  if (!env.STRIPE_SECRET_KEY) return json({ error: 'Payments are not set up yet.' }, 503);
  const words = validatedWords(body);
  const look = normalizedLook(body, 'deluxe');
  const who = request.headers.get('cf-connecting-ip') || 'unknown';
  if (!(await takeRate(env, 'checkout', who, 20, 3600000))) return json({ error: 'Too many checkout attempts. Please try again later.' }, 429);
  const id = newId();
  const transactionId = crypto.randomUUID();
  const metadata = backupMetadata(id, words, look, quote, transactionId);
  const form = new URLSearchParams({ mode: 'payment', 'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': quote.currency.toLowerCase(), 'line_items[0][price_data][unit_amount]': String(quote.priceCents),
    'line_items[0][price_data][product_data][name]': 'SkyGreeting Deluxe',
    'line_items[0][price_data][product_data][description]': 'A grand finale, every effect and side-barge fountains, a gift-wrapped opening, your name in the sky and initials in a heart.',
    client_reference_id: id, 'metadata[greeting]': id, 'metadata[analytics_transaction_id]': transactionId,
    'payment_intent_data[description]': `Your SkyGreeting: ${url.origin}/?g=${id}`,
    'custom_text[submit][message]': `Your private link is shown after payment. Lost it? ${url.origin}/find. Terms: ${url.origin}/terms`,
    success_url: `${url.origin}/?g=${id}&sent=1`, cancel_url: `${url.origin}/?canceled=1` });
  for (const [key, value] of Object.entries(metadata)) form.set(`payment_intent_data[metadata][${key}]`, value);
  const session = await stripe(env, 'POST', '/v1/checkout/sessions', form);
  if (!session.url || !session.id) throw new HttpError(502, 'Checkout could not start. Please try again.');
  const created = Date.now();
  await env.GREETINGS.put(`g:${id}`, JSON.stringify({ ...words, look, deluxe: true, status: 'pending', session: session.id,
    created, expiresAt: created + PENDING_SECONDS * 1000, quote, quotedAmountCents: quote.priceCents,
    currency: quote.currency, paidAmountCents: null, transactionId }), { expirationTtl: PENDING_SECONDS });
  return json({ url: session.url, transactionId, ...quote });
}

export async function share(request, env) {
  const body = await readJSON(request);
  const words = validatedWords(body);
  const look = normalizedLook(body, 'free'); // Old or forged envelopes never bypass current Free entitlements.
  if (!(await takeRate(env, 'share', request.headers.get('cf-connecting-ip') || 'unknown', 40, 3600000))) {
    return json({ error: 'That’s a lot of greetings. Try again in an hour.' }, 429);
  }
  const id = newId();
  const created = Date.now();
  await env.GREETINGS.put(`g:${id}`, JSON.stringify({ ...words, look, deluxe: false, status: 'free', created,
    expiresAt: created + SHARE_SECONDS * 1000 }), { expirationTtl: SHARE_SECONDS });
  return json({ id });
}

export async function webhook(request, env) {
  const body = await boundedText(request, 65536);
  if (!(await verify(body, request.headers.get('stripe-signature'), env.STRIPE_WEBHOOK_SECRET))) return json({ error: 'Bad signature' }, 400);
  let event;
  try { event = JSON.parse(body); } catch { return json({ error: 'Bad request' }, 400); }
  if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) {
    const session = event.data?.object;
    if (session?.payment_status === 'paid' && validId(session.client_reference_id)) await markPaid(env, session.client_reference_id, session);
  }
  return json({ received: true });
}

export async function greeting(env, id) {
  if (!validId(id)) return json({ error: 'Not found' }, 404);
  const record = await paidRecord(env, id);
  if (!record) return json({ error: 'Not found' }, 404);
  if (record.hidden) return json({ status: 'hidden' });
  if (record.status !== 'paid' && record.status !== 'free') return json({ status: 'pending' });
  const { occasion, message, message2, to, from, deluxe, look } = record;
  const payment = record.status === 'paid' && !record.showcase ? {
    paidAmountCents: record.paidAmountCents ?? null, currency: record.currency ?? null, transactionId: record.transactionId ?? null,
  } : {};
  return json({ status: record.status, occasion, message, message2: message2 || '', to, from, deluxe: Boolean(deluxe), look: look || null, ...payment });
}
