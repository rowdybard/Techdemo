// SkyGreeting server: the only code that runs on Cloudflare rather than in the browser.
// Everything else on the site is static files (index.html and src/), served as assets.
//
//   POST /api/checkout        saves a Deluxe greeting as pending and opens a Stripe
//                             Checkout page for it; returns { url }
//   POST /api/stripe-webhook  Stripe says a checkout was paid: the greeting is kept for good
//   GET  /api/greeting?id=…   a greeting's words and occasion, once paid (asks Stripe
//                             directly if the webhook hasn't arrived yet)
//   POST /api/report          a recipient reports a greeting (three people take it down)
//   GET  /api/taken-down?o=…  whether a free greeting has been taken down
//   GET  /?g=… or /?msg=…     the page itself, with the link preview filled in for that greeting
//   GET  /api/config          the Deluxe price, for the send button, and whether the
//                             Stripe keys are present (true/false, never the keys)
//
// Secrets (Cloudflare → Worker → Settings → Variables and Secrets, type Secret):
//   STRIPE_SECRET_KEY, and STRIPE_WEBHOOK_SECRET once a webhook exists.
// Plain variables (wrangler.jsonc): DELUXE_PRICE_CENTS. Storage: the GREETINGS KV namespace.

import { greetingBlocked } from '../src/moderate.js';

const OCCASIONS = new Set(['halloween', 'birthday', 'love', 'congrats', 'thanks']);
const LIMITS = { message: 24, to: 16, from: 24 };
const PENDING_SECONDS = 2 * 24 * 3600; // unpaid greetings are forgotten after two days
const WEBHOOK_TOLERANCE = 300; // seconds a Stripe signature stays valid

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/api/config' && request.method === 'GET') {
        // Whether each key is present (never the key itself), to check the setup from outside.
        return json({ priceCents: price(env), payments: Boolean(env.STRIPE_SECRET_KEY), webhook: Boolean(env.STRIPE_WEBHOOK_SECRET) });
      }
      if (url.pathname === '/api/checkout' && request.method === 'POST') return await checkout(request, env, url);
      if (url.pathname === '/api/stripe-webhook' && request.method === 'POST') return await webhook(request, env);
      if (url.pathname === '/api/greeting' && request.method === 'GET') return await greeting(env, url.searchParams.get('id'));
      if (url.pathname === '/api/report' && request.method === 'POST') return await report(request, env);
      if (url.pathname === '/api/taken-down' && request.method === 'GET') return await takenDown(env, url.searchParams);
      if (url.pathname.startsWith('/api/')) return json({ error: 'Not found' }, 404);
      if (url.pathname === '/' && request.method === 'GET' && (url.searchParams.has('g') || url.searchParams.has('msg'))) {
        return await preview(request, env, url);
      }
    } catch (error) {
      console.error(error);
      return json({ error: 'Something went wrong. Please try again.' }, 500);
    }
    return env.ASSETS.fetch(request);
  },
};

function price(env) {
  const cents = Number.parseInt(env.DELUXE_PRICE_CENTS, 10);
  return Number.isFinite(cents) && cents >= 50 ? cents : 499; // Stripe's minimum is 50¢
}

async function checkout(request, env, url) {
  if (!env.STRIPE_SECRET_KEY) return json({ error: 'Payments are not set up yet.' }, 503);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Bad request' }, 400);
  }
  const words = {
    occasion: OCCASIONS.has(body.occasion) ? body.occasion : 'birthday',
    message: clean(body.message, LIMITS.message).toUpperCase(),
    to: clean(body.to, LIMITS.to).toUpperCase(),
    from: clean(body.from, LIMITS.from),
  };
  if (!words.message) return json({ error: 'Type a message first.' }, 400);
  if (greetingBlocked(words)) return json({ error: 'That can’t go in the sky. Please keep it kind.' }, 400);
  // The sender's design (checked value by value when it's shown, in the page's look.js).
  const look = body.look && typeof body.look === 'object' && !Array.isArray(body.look) && JSON.stringify(body.look).length < 1500 ? body.look : null;

  const id = newId();
  const site = url.origin;
  const form = new URLSearchParams({
    mode: 'payment',
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(price(env)),
    'line_items[0][price_data][product_data][name]': 'SkyGreeting Deluxe',
    'line_items[0][price_data][product_data][description]': `A ${words.occasion} fireworks greeting with every effect and the grand finale`,
    client_reference_id: id,
    'metadata[greeting]': id,
    // Stripe asks for the buyer's email. Its receipt shows this description, so the
    // private link reaches their inbox (with receipts turned on in Stripe's settings).
    'payment_intent_data[description]': `Your SkyGreeting: ${site}/?g=${id}`,
    'custom_text[submit][message]': `Your private SkyGreeting link is shown right after payment and sent with your receipt. Terms and refunds: ${site}/terms`,
    success_url: `${site}/?g=${id}&sent=1`,
    cancel_url: `${site}/?canceled=1`,
  });
  const session = await stripe(env, 'POST', '/v1/checkout/sessions', form);
  if (!session.url) {
    // Stripe's own reason (it masks keys), so a setup problem can be read off the page.
    const reason = session.error && session.error.message ? ` (Stripe: ${session.error.message})` : '';
    return json({ error: `Checkout could not start.${reason}` }, 502);
  }

  await env.GREETINGS.put(`g:${id}`, JSON.stringify({ ...words, look, deluxe: true, status: 'pending', session: session.id, created: Date.now() }),
    { expirationTtl: PENDING_SECONDS });
  return json({ url: session.url });
}

async function webhook(request, env) {
  const body = await request.text();
  if (!env.STRIPE_WEBHOOK_SECRET || !(await verify(body, request.headers.get('stripe-signature'), env.STRIPE_WEBHOOK_SECRET))) {
    return json({ error: 'Bad signature' }, 400);
  }
  const event = JSON.parse(body);
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const session = event.data.object;
    if (session.payment_status === 'paid' && session.client_reference_id) await markPaid(env, session.client_reference_id, session);
  }
  return json({ received: true });
}

async function greeting(env, id) {
  if (!id || !/^[A-Za-z0-9]{8}$/.test(id)) return json({ error: 'Not found' }, 404);
  let record = await load(env, id);
  if (!record) return json({ error: 'Not found' }, 404);
  // The buyer may land here before Stripe's webhook does: ask Stripe directly.
  if (record.status !== 'paid' && record.session && env.STRIPE_SECRET_KEY) {
    const session = await stripe(env, 'GET', `/v1/checkout/sessions/${encodeURIComponent(record.session)}`);
    if (session.payment_status === 'paid') record = await markPaid(env, id, session);
  }
  if (record.status !== 'paid') return json({ status: 'pending' });
  if (record.hidden) return json({ status: 'hidden' });
  const { occasion, message, to, from, deluxe, look } = record;
  return json({ status: 'paid', occasion, message, to, from, deluxe, look: look || null });
}

// Reports. A recipient reports a greeting with a reason; reports are kept 90 days under
// "r:" keys (read them in the Cloudflare dashboard: KV → skygreeting-greetings). Three
// reports from different people take a greeting down for everyone. Reporters are told
// apart by a salted hash of their IP address; the address itself is never stored, and
// each may send at most 10 reports an hour.
const REASONS = new Set(['hateful', 'threatening', 'sexual', 'spam', 'other']);
const TAKE_DOWN_AT = 3;
const REPORTS_PER_HOUR = 10;

async function report(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Bad request' }, 400);
  }
  const reason = REASONS.has(body.reason) ? body.reason : 'other';
  const note = clean(body.note, 200);
  const id = typeof body.id === 'string' && /^[A-Za-z0-9]{8}$/.test(body.id) ? body.id : null;
  const words = {
    occasion: clean(body.occasion, 20),
    message: clean(body.message, LIMITS.message).toUpperCase(),
    to: clean(body.to, LIMITS.to).toUpperCase(),
    from: clean(body.from, LIMITS.from),
  };
  if (!id && !words.message) return json({ error: 'Nothing to report.' }, 400);

  const reporter = (await sha256(`skygreeting:${request.headers.get('cf-connecting-ip') || 'unknown'}`)).slice(0, 16);
  const hour = Math.floor(Date.now() / 3600000);
  const limitKey = `l:${reporter}:${hour}`;
  const sent = Number((await env.GREETINGS.get(limitKey)) || 0);
  if (sent >= REPORTS_PER_HOUR) return json({ error: 'Too many reports. Try again later.' }, 429);
  await env.GREETINGS.put(limitKey, String(sent + 1), { expirationTtl: 3700 });

  const target = id ? `g:${id}` : `t:${await textKey(words)}`;
  const at = new Date().toISOString();
  await env.GREETINGS.put(`r:${at}:${newId()}`, JSON.stringify({ target, id, ...(id ? {} : words), reason, note, at }),
    { expirationTtl: 90 * 24 * 3600 });

  // Count different reporters; at three, take it down.
  const tallyKey = `n:${target}`;
  const tally = JSON.parse((await env.GREETINGS.get(tallyKey)) || '{"by":[]}');
  if (!tally.by.includes(reporter)) {
    tally.by.push(reporter);
    await env.GREETINGS.put(tallyKey, JSON.stringify(tally));
    if (tally.by.length >= TAKE_DOWN_AT) {
      if (id) {
        const record = await load(env, id);
        if (record && !record.hidden) {
          record.hidden = true;
          await env.GREETINGS.put(`g:${id}`, JSON.stringify(record));
        }
      } else {
        await env.GREETINGS.put(`h:${target}`, '1');
      }
    }
  }
  return json({ received: true });
}

// Whether a free greeting (its words travel in the link) has been taken down.
async function takenDown(env, params) {
  const words = {
    occasion: clean(params.get('o'), 20),
    message: clean(params.get('msg'), LIMITS.message).toUpperCase(),
    to: clean(params.get('to'), LIMITS.to).toUpperCase(),
    from: clean(params.get('from'), LIMITS.from),
  };
  if (!words.message) return json({ hidden: false });
  return json({ hidden: Boolean(await env.GREETINGS.get(`h:t:${await textKey(words)}`)) });
}

// A free greeting is known by its words (the same words make the same key).
async function textKey({ occasion, message, to, from }) {
  return (await sha256([occasion, message, to, from].join('\u0001'))).slice(0, 24);
}

async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Link previews: when a greeting's link is shared, messaging apps fetch the page and show
// its title, description and picture. The page is served with those filled in for the
// greeting: who made it, the occasion's emoji and picture. Never the message itself (the
// recipient should see that in the sky first).
const EMOJI = { halloween: '🎃', birthday: '🎂', love: '❤️', congrats: '🎉', thanks: '🙏' };

async function preview(request, env, url) {
  const page = await env.ASSETS.fetch(new Request(new URL('/', url), request));
  let occasion = '';
  let from = '';
  const id = url.searchParams.get('g');
  if (id && /^[A-Za-z0-9]{8}$/.test(id)) {
    const record = await load(env, id);
    if (record && record.status === 'paid' && !record.hidden) ({ occasion, from } = record);
  } else {
    occasion = clean(url.searchParams.get('o'), 20);
    from = clean(url.searchParams.get('from'), LIMITS.from);
  }
  if (!OCCASIONS.has(occasion)) occasion = 'birthday';
  if (greetingBlocked({ message: '', to: '', from })) from = '';
  const title = `${from ? `${from} made you a SkyGreeting` : 'You’ve got a SkyGreeting'} ${EMOJI[occasion]}`;
  const description = 'A fireworks show made just for you. Tap to watch it light up the sky.';
  const image = `${url.origin}/src/og/${occasion}.jpg`;
  const set = (value) => ({ element(element) { element.setAttribute('content', value); } });
  const rewritten = new HTMLRewriter()
    .on('title', { element(element) { element.setInnerContent(title); } })
    .on('meta[property="og:title"], meta[name="twitter:title"]', set(title))
    .on('meta[property="og:description"], meta[name="description"], meta[name="twitter:description"]', set(description))
    .on('meta[property="og:image"], meta[name="twitter:image"]', set(image))
    .on('meta[property="og:url"]', set(url.href))
    .transform(page);
  // A greeting is private: search engines leave it out (the home page is what they index).
  const response = new Response(rewritten.body, rewritten);
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return response;
}

async function load(env, id) {
  const text = await env.GREETINGS.get(`g:${id}`);
  return text ? JSON.parse(text) : null;
}

// Keeps the greeting for good, with the buyer's email (from Stripe), so a lost link can be resent.
async function markPaid(env, id, session) {
  const record = await load(env, id);
  if (!record) return null;
  if (record.status !== 'paid') {
    record.status = 'paid';
    record.paid = Date.now();
    const email = session && session.customer_details && session.customer_details.email;
    if (email) record.email = String(email).slice(0, 254);
    await env.GREETINGS.put(`g:${id}`, JSON.stringify(record)); // no expiry: a paid link lasts
  }
  return record;
}

async function stripe(env, method, path, form) {
  const response = await fetch(`https://api.stripe.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form ? form.toString() : undefined,
  });
  const data = await response.json();
  if (!response.ok) console.error('Stripe', response.status, data.error && data.error.message);
  return data;
}

// Stripe signs webhooks: header "t=…,v1=…", HMAC-SHA256 of "t.body" with the secret.
async function verify(body, header, secret) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(',').map((part) => part.split('=', 2)));
  const signed = header.split(',').filter((part) => part.startsWith('v1=')).map((part) => part.slice(3));
  const time = Number(parts.t);
  if (!time || !signed.length || Math.abs(Date.now() / 1000 - time) > WEBHOOK_TOLERANCE) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${time}.${body}`));
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return signed.some((candidate) => same(candidate, expected));
}

function same(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function newId() {
  const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
}

function clean(value, limit) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, limit);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}
