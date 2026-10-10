import { showcase } from './showcase.js';
import { targetGuard, targetStatus } from './policy.js';
import { backupLook, paidDetails, stripe } from './stripe.js';
import { validId, wordsOf } from './common.js';

export async function load(env, id) {
  if (!validId(id)) return null;
  const status = await targetStatus(env, `g:${id}`);
  if (status.hidden || status.deleted) return { status: 'hidden', hidden: true, deleted: Boolean(status.deleted) };
  const shown = showcase(id);
  if (shown) return shown;
  const raw = await env.GREETINGS.get(`g:${id}`);
  let record;
  try { record = raw ? JSON.parse(raw) : null; } catch { return null; }
  if (!record || typeof record !== 'object') return null;
  if (record.hidden || record.deleted) {
    await targetGuard(env, `g:${id}`).setStatus({ hidden: Boolean(record.hidden), deleted: Boolean(record.deleted) });
    return { status: 'hidden', hidden: true };
  }
  if (record.expiresAt && Date.now() >= record.expiresAt && record.status !== 'paid') return null;
  return record;
}

export async function restore(env, id) {
  if (!validId(id) || !env.STRIPE_SECRET_KEY) return null;
  const status = await targetStatus(env, `g:${id}`);
  if (status.hidden || status.deleted) return { status: 'hidden', hidden: true };
  const query = new URLSearchParams({ query: `metadata['greeting']:'${id}'`, limit: '10' });
  const found = await stripe(env, 'GET', `/v1/payment_intents/search?${query}`);
  const intent = found.data?.find((item) => item.status === 'succeeded' && item.metadata?.greeting === id);
  if (!intent) return null;
  const record = recordFromIntent(intent);
  if (!record) return null;
  // Check again after the provider round trip. Tombstones always beat recovered content.
  const current = await targetStatus(env, `g:${id}`);
  if (current.hidden || current.deleted) return { status: 'hidden', hidden: true };
  if (!(await targetGuard(env, `g:${id}`).saveGreeting(id, record))) return { status: 'hidden', hidden: true };
  return record;
}

export function recordFromIntent(intent) {
  const metadata = intent.metadata || {};
  const words = wordsOf(metadata);
  if (!words.message) return null;
  const details = paidDetails(intent, metadata);
  if (details.paidAmountCents === null || details.currency !== 'USD') return null;
  const quoted = Number(metadata.quoted_amount);
  const record = { ...words, look: backupLook(metadata), deluxe: true, status: 'paid',
    created: intent.created * 1000 || Date.now(), paid: intent.created * 1000 || Date.now(), restored: Date.now(),
    ...details, transactionId: details.transactionId || crypto.randomUUID(),
    quotedAmountCents: Number.isInteger(quoted) && quoted >= 0 ? quoted : details.paidAmountCents };
  if (intent.receipt_email) record.email = String(intent.receipt_email).slice(0, 254);
  return record;
}

export async function markPaid(env, id, session) {
  if (!validId(id) || session.client_reference_id !== id || session.payment_status !== 'paid') return null;
  let record = await load(env, id);
  if (record?.hidden) return record;
  if (!record && session.payment_intent) {
    const intent = typeof session.payment_intent === 'object' ? session.payment_intent
      : await stripe(env, 'GET', `/v1/payment_intents/${encodeURIComponent(session.payment_intent)}`);
    if (intent.status === 'succeeded' && intent.metadata?.greeting === id) record = recordFromIntent(intent);
  }
  if (!record || record.status === 'free' || record.showcase) return record;
  const metadata = session.metadata || {};
  const details = paidDetails(session, metadata);
  if (details.paidAmountCents === null || details.currency !== 'USD') return null;
  if (record.quotedAmountCents != null && record.quotedAmountCents !== details.paidAmountCents) return null;
  const status = await targetStatus(env, `g:${id}`);
  if (status.hidden || status.deleted) return { status: 'hidden', hidden: true };
  record.status = 'paid';
  record.paid ||= Date.now();
  record.paidAmountCents = details.paidAmountCents;
  record.currency = details.currency;
  record.transactionId ||= details.transactionId || crypto.randomUUID();
  delete record.expiresAt;
  const email = session.customer_details?.email;
  if (email) record.email = String(email).slice(0, 254);
  if (!(await targetGuard(env, `g:${id}`).saveGreeting(id, record))) return { status: 'hidden', hidden: true };
  return record;
}

export async function paidRecord(env, id) {
  let record = await load(env, id);
  if (!record) record = await restore(env, id);
  if (record && !record.hidden && record.status !== 'paid' && record.session && env.STRIPE_SECRET_KEY) {
    const session = await stripe(env, 'GET', `/v1/checkout/sessions/${encodeURIComponent(record.session)}`);
    if (session.payment_status === 'paid') record = await markPaid(env, id, session) || record;
  }
  return record;
}
