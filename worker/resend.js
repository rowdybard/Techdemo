// No inbox existence leaks. Rates are atomic, and provider failures never say an email was sent.
import { HttpError, json, readJSON, validId } from './common.js';
import { takeRate } from './policy.js';
import { markPaid, paidRecord } from './storage.js';
import { stripe } from './stripe.js';

const SITE = 'https://skygreeting.com';
const FROM = 'SkyGreeting <hello@skygreeting.com>';
const NAMES = { halloween: 'Halloween', birthday: 'Birthday', love: 'Love', congrats: 'Congrats', thanks: 'Thank you', newyear: 'New Year' };

export async function resend(request, env) {
  const body = await readJSON(request);
  const typed = String(body.email || '').trim().slice(0, 254);
  const email = typed.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Type the email you paid with.' }, 400);
  if (!env.RESEND_API_KEY || !env.STRIPE_SECRET_KEY) {
    return json({ error: 'This isn’t switched on yet. Email hello@skygreeting.com and we’ll send your link.' }, 503);
  }
  if (!(await takeRate(env, 'find-connection', request.headers.get('cf-connecting-ip') || 'unknown', 5, 3600000))
    || !(await takeRate(env, 'find-email', email, 3, 86400000))) return json({ error: 'That’s a lot of tries. Please try again later.' }, 429);
  const greetings = await bought(env, typed, email);
  if (greetings.length) await send(env, email, greetings);
  return json({ ok: true });
}

export async function bought(env, typed, email) {
  const sessions = new Map();
  for (const address of new Set([typed, email])) {
    let cursor = '';
    for (;;) {
      const query = new URLSearchParams({ 'customer_details[email]': address, status: 'complete', limit: '100' });
      if (cursor) query.set('starting_after', cursor);
      const page = await stripe(env, 'GET', `/v1/checkout/sessions?${query}`);
      if (!Array.isArray(page.data)) throw new HttpError(502, 'The payment service could not be reached. Please try again.');
      for (const session of page.data) {
        if (session.payment_status === 'paid' && validId(session.client_reference_id)) sessions.set(session.client_reference_id, session);
      }
      if (!page.has_more) break;
      const next = page.data.at(-1)?.id;
      if (!next || next === cursor) throw new HttpError(502, 'The payment service could not be reached. Please try again.');
      cursor = next;
    }
  }
  const greetings = [];
  for (const [id, session] of sessions) {
    // Recover this exact paid session's backup, including when its webhook never arrived.
    const record = await markPaid(env, id, session) || await paidRecord(env, id);
    if (record?.status === 'paid' && !record.hidden && !record.deleted) greetings.push({ id, occasion: record.occasion, message: record.message, to: record.to });
  }
  return greetings;
}

async function send(env, email, greetings) {
  const lines = greetings.map((g) => `${NAMES[g.occasion] || 'SkyGreeting'}: ${g.message}${g.to ? ` (to ${g.to})` : ''}\n${SITE}/?g=${g.id}`);
  const items = greetings.map((g) => `<li style="margin:0 0 14px"><strong>${escape(g.message)}</strong>${g.to ? ` to ${escape(g.to)}` : ''}<br><a href="${SITE}/?g=${g.id}">${SITE}/?g=${g.id}</a></li>`);
  const several = greetings.length > 1;
  let response;
  try { response = await fetch('https://api.resend.com/emails', {
    method: 'POST', signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [email], subject: several ? 'Your SkyGreeting links' : 'Your SkyGreeting link',
      text: `Here ${several ? 'are the SkyGreetings' : 'is the SkyGreeting'} bought with this email:\n\n${lines.join('\n\n')}\n\nYou asked for this at ${SITE}/find. If you didn't, you can ignore this email.`,
      html: `<p>Your SkyGreeting ${several ? 'links' : 'link'}:</p><ul>${items.join('')}</ul><p>You asked for this at ${SITE}/find. If you didn't, you can ignore this email.</p>` }),
  }); } catch { throw new HttpError(502, 'Email could not be sent right now. Please try again later.'); }
  if (response.body) await response.body.cancel();
  if (!response.ok) throw new HttpError(502, 'Email could not be sent right now. Please try again later.');
}

function escape(text) {
  return String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
