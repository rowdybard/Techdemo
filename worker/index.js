// SkyGreeting server: the only code that runs on Cloudflare rather than in the browser.
// Everything else on the site is static files (index.html and src/), served as assets.
//
//   POST /api/checkout        saves a Deluxe greeting as pending and opens a Stripe
//                             Checkout page for it; returns { url }
//   POST /api/stripe-webhook  Stripe says a checkout was paid: the greeting is kept for good
//   GET  /api/greeting?id=…   a greeting's words and occasion, once paid (asks Stripe
//                             directly if the webhook hasn't arrived yet)
//   GET  /api/config          the Deluxe price, for the send button
//
// Secrets (Cloudflare → Worker → Settings → Variables and Secrets, type Secret):
//   STRIPE_SECRET_KEY, and STRIPE_WEBHOOK_SECRET once a webhook exists.
// Plain variables (wrangler.jsonc): DELUXE_PRICE_CENTS. Storage: the GREETINGS KV namespace.

const OCCASIONS = new Set(['halloween', 'birthday', 'love', 'congrats', 'thanks']);
const LIMITS = { message: 24, to: 16, from: 24 };
const PENDING_SECONDS = 2 * 24 * 3600; // unpaid greetings are forgotten after two days
const WEBHOOK_TOLERANCE = 300; // seconds a Stripe signature stays valid

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/api/config' && request.method === 'GET') return json({ priceCents: price(env) });
      if (url.pathname === '/api/checkout' && request.method === 'POST') return await checkout(request, env, url);
      if (url.pathname === '/api/stripe-webhook' && request.method === 'POST') return await webhook(request, env);
      if (url.pathname === '/api/greeting' && request.method === 'GET') return await greeting(env, url.searchParams.get('id'));
      if (url.pathname.startsWith('/api/')) return json({ error: 'Not found' }, 404);
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
    success_url: `${site}/?g=${id}&sent=1`,
    cancel_url: `${site}/?canceled=1`,
  });
  const session = await stripe(env, 'POST', '/v1/checkout/sessions', form);
  if (!session.url) return json({ error: 'Checkout could not start. Please try again.' }, 502);

  await env.GREETINGS.put(`g:${id}`, JSON.stringify({ ...words, deluxe: true, status: 'pending', session: session.id, created: Date.now() }),
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
    if (session.payment_status === 'paid' && session.client_reference_id) await markPaid(env, session.client_reference_id);
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
    if (session.payment_status === 'paid') record = await markPaid(env, id);
  }
  if (record.status !== 'paid') return json({ status: 'pending' });
  const { occasion, message, to, from, deluxe } = record;
  return json({ status: 'paid', occasion, message, to, from, deluxe });
}

async function load(env, id) {
  const text = await env.GREETINGS.get(`g:${id}`);
  return text ? JSON.parse(text) : null;
}

async function markPaid(env, id) {
  const record = await load(env, id);
  if (!record) return null;
  if (record.status !== 'paid') {
    record.status = 'paid';
    record.paid = Date.now();
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
