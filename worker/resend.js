// "Email me my link again" (skygreeting.com/find): someone who lost a Deluxe greeting's
// link types the email they paid with, and the links are emailed to that inbox. Stripe
// already knows every checkout made with an email (its client_reference_id is the
// greeting's id), so this covers every purchase, old or new, with no index of our own.
// Mail goes out through Resend (the RESEND_API_KEY secret in Cloudflare); until that key
// is set, the page says to email us instead. The answer never says whether an email
// bought anything, and tries are limited per address and per connection.

const SITE = 'https://skygreeting.com';
const FROM = 'SkyGreeting <hello@skygreeting.com>';
const PER_CONNECTION_HOUR = 5;
const PER_EMAIL_DAY = 3;
const NAMES = { halloween: 'Halloween', birthday: 'Birthday', love: 'Love', congrats: 'Congrats', thanks: 'Thank you', newyear: 'New Year' };

/** POST /api/resend { email }. `h` is the worker's helpers: json, sha256, stripe, load. */
export async function resend(request, env, h) {
  let body;
  try {
    body = await request.json();
  } catch {
    return h.json({ error: 'Bad request' }, 400);
  }
  const typed = String((body && body.email) || '').trim().slice(0, 254);
  const email = typed.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return h.json({ error: 'Type the email you paid with.' }, 400);
  if (!env.RESEND_API_KEY || !env.STRIPE_SECRET_KEY) {
    return h.json({ error: 'This isn’t switched on yet. Email hello@skygreeting.com and we’ll send your link.' }, 503);
  }
  const who = (await h.sha256(`skygreeting:find:${request.headers.get('cf-connecting-ip') || 'unknown'}`)).slice(0, 16);
  const inbox = (await h.sha256(`skygreeting:find:${email}`)).slice(0, 16);
  const hour = Math.floor(Date.now() / 3600000);
  const day = Math.floor(Date.now() / 86400000);
  if (!(await allowed(env, `l:f:${who}:${hour}`, PER_CONNECTION_HOUR, 3700)) || !(await allowed(env, `l:fe:${inbox}:${day}`, PER_EMAIL_DAY, 90000))) {
    return h.json({ error: 'That’s a lot of tries. Please try again later.' }, 429);
  }
  const greetings = await bought(env, typed, email, h);
  if (greetings.length) await send(env, email, greetings);
  return h.json({ ok: true });
}

// Counts a try; false once the limit is reached.
async function allowed(env, key, limit, ttl) {
  const count = Number((await env.GREETINGS.get(key)) || 0);
  if (count >= limit) return false;
  await env.GREETINGS.put(key, String(count + 1), { expirationTtl: ttl });
  return true;
}

// The paid greetings Stripe has for this email (as typed, and in lower case).
async function bought(env, typed, email, h) {
  const ids = new Set();
  for (const address of new Set([typed, email])) {
    const query = new URLSearchParams({ 'customer_details[email]': address, status: 'complete', limit: '50' });
    const page = await h.stripe(env, 'GET', `/v1/checkout/sessions?${query}`);
    for (const session of (page && page.data) || []) {
      if (session.payment_status === 'paid' && /^[A-Za-z0-9]{8}$/.test(session.client_reference_id || '')) ids.add(session.client_reference_id);
    }
  }
  const greetings = [];
  for (const id of ids) {
    const record = await h.load(env, id);
    if (record && !record.hidden) greetings.push({ id, occasion: record.occasion, message: record.message, to: record.to });
  }
  return greetings;
}

async function send(env, email, greetings) {
  const lines = greetings.map((g) => `${NAMES[g.occasion] || 'SkyGreeting'}: ${g.message}${g.to ? ` (to ${g.to})` : ''}\n${SITE}/?g=${g.id}`);
  const items = greetings.map((g) => `<li style="margin:0 0 14px"><strong>${escape(g.message)}</strong>${g.to ? ` to ${escape(g.to)}` : ''}<br><a href="${SITE}/?g=${g.id}" style="color:#d9822b">${SITE}/?g=${g.id}</a></li>`);
  const several = greetings.length > 1;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM,
      to: [email],
      subject: several ? 'Your SkyGreeting links' : 'Your SkyGreeting link',
      text: `Here ${several ? 'are the SkyGreetings' : 'is the SkyGreeting'} bought with this email:\n\n${lines.join('\n\n')}\n\nSend the link to whoever it's for. It plays in any browser.\n\nYou asked for this at ${SITE}/find. If you didn't, you can ignore this email.`,
      html: `<p>Here ${several ? 'are the SkyGreetings' : 'is the SkyGreeting'} bought with this email:</p><ul style="padding-left:18px">${items.join('')}</ul><p>Send the link to whoever it's for. It plays in any browser.</p><p style="color:#888;font-size:13px">You asked for this at ${SITE}/find. If you didn't, you can ignore this email.</p>`,
    }),
  });
  if (!response.ok) console.error('Resend', response.status, (await response.text()).slice(0, 300));
}

function escape(text) {
  return String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
