// Exercise the real workerd runtime and SQLite storage with entirely local providers.
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { offer, LAUNCH_DURATION_MS } from '../worker/pricing.js';
import { backupLook, backupMetadata, verify } from '../worker/stripe.js';
import { MAX_LOOK_BYTES, normalizeLook } from '../src/design.js';
import { runtime } from './worker-fixtures.mjs';
import { convertV4MiniflareOptions } from 'miniflare';

const app = await runtime();
after(() => app.mf.dispose());
const words = { occasion: 'birthday', message: 'HAPPY BIRTHDAY', message2: '', to: 'FRIEND', from: 'Alex' };
const paidLook = { ver: 2, design: { place: { environment: 'lake' }, lake: { open: 0.37 },
  fountains: { enabled: true, style: 'waterfall,candles', sideBarges: true }, look: { mix: { peony: 1, skull: 2 } } } };
const create = async (ip, look = paidLook) => {
  const response = await app.call('/api/checkout', { ...words, look, expectedPriceCents: 499 }, ip);
  assert.equal(response.status, 200);
  const payload = await response.json();
  const session = [...app.state.sessions.values()].at(-1);
  return { payload, session, id: session.client_reference_id };
};

test('launch offer is inactive without a valid UTC start and has an exact half-open 30-day interval', () => {
  const start = Date.parse('2026-10-09T00:00:00Z');
  const env = { DELUXE_LAUNCH_START_UTC: '2026-10-09T00:00:00Z' };
  for (const value of [undefined, '', '2026-02-30T00:00:00Z', '2026-10-09', '2026-10-09T00:00:00-04:00']) {
    assert.equal(offer({ DELUXE_LAUNCH_START_UTC: value }, start).priceCents, 499);
  }
  assert.equal(offer(env, start - 1).priceCents, 499);
  assert.equal(offer(env, start).priceCents, 199);
  assert.equal(offer(env, start + LAUNCH_DURATION_MS - 1).priceCents, 199);
  assert.equal(offer(env, start + LAUNCH_DURATION_MS).priceCents, 499);
  assert.equal(Date.parse(offer(env, start).promotion.end) - start, LAUNCH_DURATION_MS);
});

test('missing or stale checkout quotes return the current offer before contacting Stripe', async () => {
  const before = app.state.stripeCalls;
  for (const expectedPriceCents of [undefined, 199, '499']) {
    const response = await app.call('/api/checkout', { ...words, expectedPriceCents }, '198.51.100.2');
    assert.equal(response.status, 409);
    const data = await response.json();
    assert.equal(data.error, 'price_changed'); assert.equal(data.priceCents, 499); assert.equal(data.promotion.active, false);
  }
  assert.equal(app.state.stripeCalls, before);
  const config = await (await app.call('/api/config')).json();
  assert.equal(config.currency, 'USD'); assert.equal(config.regularPriceCents, 499); assert.equal(typeof config.serverNow, 'number');
});

test('new Free shares strip Deluxe effects and side barges even from forged v1, keeping authored lake settings', async () => {
  for (const look of [paidLook, { ver: 1, a: 'lake', o: 0.37, e: 1, g: 'waterfall,candles', m: { peony: 1, skull: 2 } }]) {
    const response = await app.call('/api/share', { ...words, look }, '198.51.100.3');
    assert.equal(response.status, 200);
    const { id } = await response.json();
    const record = await app.kv.get(`g:${id}`, { type: 'json' });
    assert.equal(record.look.ver, 2); assert.equal(record.look.design.place.environment, 'lake');
    assert.equal(record.look.design.lake.open, 0.37); assert.equal(record.look.design.fountains.sideBarges, false);
    assert.equal(record.look.design.look.mix.skull, 0); assert.ok(!record.look.design.fountains.style.includes('waterfall'));
    assert.equal(record.expiresAt - record.created, 365 * 24 * 3600000);
  }
  const oversized = await app.call('/api/share', { ...words, look: { ver: 1, ignored: 'é'.repeat(MAX_LOOK_BYTES) } }, '198.51.100.3');
  assert.equal(oversized.status, 400);
});

test('checkout snapshots quote and backup; confirmation returns actual payment and the same analytics transaction', async () => {
  const { payload, session, id } = await create('198.51.100.4');
  assert.match(payload.transactionId, /^[a-f0-9-]{36}$/);
  assert.equal(session.amount_total, 499);
  const intent = app.state.intents.get(session.payment_intent);
  assert.equal(intent.metadata.quoted_amount, '499'); assert.equal(intent.metadata.analytics_transaction_id, payload.transactionId);
  assert.equal(backupLook(intent.metadata).design.lake.open, 0.37);
  for (const [key, value] of Object.entries(intent.metadata)) if (/^look\d+$/.test(key)) assert.ok(value.length <= 480);
  app.pay(session);
  const response = await app.call(`/api/greeting?id=${id}`);
  const greeting = await response.json();
  assert.equal(greeting.status, 'paid'); assert.equal(greeting.deluxe, true); assert.equal(greeting.paidAmountCents, 499);
  assert.equal(greeting.currency, 'USD'); assert.equal(greeting.transactionId, payload.transactionId);
  assert.equal(greeting.email, undefined); assert.equal(greeting.session, undefined);
  assert.equal((await app.kv.get(`g:${id}`, { type: 'json' })).expiresAt, undefined);
});

test('existing launch-priced paid sessions are honored after the current offer returns to regular', async () => {
  const { session, id } = await create('198.51.100.5');
  session.amount_total = 199;
  const intent = app.state.intents.get(session.payment_intent);
  intent.amount = 199; intent.metadata.quoted_amount = '199';
  const pending = await app.kv.get(`g:${id}`, { type: 'json' });
  pending.quotedAmountCents = 199; pending.quote.priceCents = 199;
  await app.kv.put(`g:${id}`, JSON.stringify(pending));
  app.pay(session);
  assert.equal((await (await app.call('/api/config')).json()).priceCents, 499);
  const data = await (await app.call(`/api/greeting?id=${id}`)).json();
  assert.equal(data.status, 'paid'); assert.equal(data.paidAmountCents, 199);
});

test('SQLite rate counters remain atomic under concurrent requests and expire at the bucket boundary', async () => {
  const guard = app.guards.getByName('rate:fixture');
  const now = Date.now();
  const results = await Promise.all(Array.from({ length: 40 }, () => guard.takeRate('same', 20, now + 60000, now)));
  assert.equal(results.filter(Boolean).length, 20);
  assert.equal(await guard.takeRate('same', 20, now + 120000, now + 60000), true);
});

test('distinct reports are atomic, expire reporter hashes at 90 days, and keep the hidden status', async () => {
  const guard = app.guards.getByName('target:fixture-votes');
  const now = Date.now();
  const duplicate = await Promise.all(Array.from({ length: 8 }, () => guard.vote('same-hash', now)));
  assert.ok(duplicate.every((result) => result.count === 1));
  await Promise.all([guard.vote('second-hash', now), guard.vote('third-hash', now)]);
  assert.equal((await guard.status()).hidden, 1);
  const pruned = await guard.vote('new-hash', now + 90 * 24 * 3600000);
  assert.equal(pruned.count, 1); assert.equal(pruned.hidden, 1);
});

test('reporting a Free greeting does not rewrite or extend its original expiry', async () => {
  const free = await app.call('/api/share', { ...words, look: paidLook }, '198.51.100.6');
  const { id } = await free.json();
  const before = await app.kv.get(`g:${id}`);
  for (let i = 0; i < 3; i++) assert.equal((await app.call('/api/report', { id, reason: 'other' }, `203.0.113.${i + 1}`)).status, 200);
  assert.equal(await app.kv.get(`g:${id}`), before);
  assert.equal((await (await app.call(`/api/greeting?id=${id}`)).json()).status, 'hidden');
  const metadata = await app.kv.list({ prefix: `g:${id}` });
  assert.ok(metadata.keys[0].expiration);
});

test('central hidden/deleted status wins over showcase, KV and Stripe backup paths', async () => {
  await app.guards.getByName('target:g:Hx7kQm2a').setStatus({ deleted: true });
  assert.equal((await (await app.call('/api/greeting?id=Hx7kQm2a')).json()).status, 'hidden');
  const { session, id } = await create('198.51.100.7'); app.pay(session);
  await app.kv.delete(`g:${id}`);
  const searchBefore = app.state.searchCalls;
  await app.guards.getByName(`target:g:${id}`).setStatus({ deleted: true });
  assert.equal((await (await app.call(`/api/greeting?id=${id}`)).json()).status, 'hidden');
  assert.equal(app.state.searchCalls, searchBefore); assert.equal(await app.kv.get(`g:${id}`), null);
  await app.kv.put('h:g:Bd4tRw9e', '1');
  await app.kv.put('n:g:Bd4tRw9e', JSON.stringify({ by: ['legacy-a', 'legacy-b', 'legacy-c'] }));
  assert.equal((await (await app.call('/api/greeting?id=Bd4tRw9e')).json()).status, 'hidden');
  assert.equal((await app.guards.getByName('target:g:Bd4tRw9e').status()).imported, 1);
  assert.equal(await app.kv.get('n:g:Bd4tRw9e'), null);
});

test('concurrent paid restore writes cannot recreate KV content after retirement', async () => {
  const guard = app.guards.getByName('target:g:RaceTest');
  const restored = { ...words, status: 'paid', deluxe: true };
  await Promise.all([guard.saveGreeting('RaceTest', restored), guard.retireGreeting('RaceTest'), guard.saveGreeting('RaceTest', restored)]);
  assert.equal((await guard.status()).deleted, 1); assert.equal(await app.kv.get('g:RaceTest'), null);
  assert.equal(await guard.saveGreeting('RaceTest', restored), false);
  assert.equal(await app.kv.get('g:RaceTest'), null);
});

test('valid legacy v1 records stay unchanged on read, and bootstrap place only accepts known saved values', async () => {
  const legacy = { a: 'lake', o: 0.25, e: 1, m: { skull: 1 }, ver: 1 };
  await app.kv.put('g:OldLook1', JSON.stringify({ ...words, look: legacy, deluxe: true, status: 'paid' }));
  assert.deepEqual((await (await app.call('/api/greeting?id=OldLook1')).json()).look, legacy);
  const page = await app.call('/?g=OldLook1');
  const html = await page.text();
  assert.match(html, /name="sg-place" content="lake"/); assert.match(html, /name="sg-occasion" content="birthday"/);
  await app.kv.put('g:BadPlace', JSON.stringify({ ...words, look: { a: 'invalid-place' }, status: 'free' }));
  assert.match(await (await app.call('/?g=BadPlace')).text(), /name="sg-place" content="beach"/);
});

test('pending and missing-KV paid lake greetings bootstrap the authored place before the first scene', async () => {
  const { session, id } = await create('198.51.100.13');
  let html = await (await app.call(`/?g=${id}`)).text();
  assert.match(html, /name="sg-place" content="lake"/);
  assert.ok(!html.includes('Alex made you a SkyGreeting'));
  app.pay(session); await app.kv.delete(`g:${id}`);
  html = await (await app.call(`/?g=${id}`)).text();
  assert.match(html, /name="sg-place" content="lake"/);
  assert.equal((await app.kv.get(`g:${id}`, { type: 'json' })).status, 'paid');
});

test('HTML price markers and JSON-LD share the offer; conditional cached prices cannot produce 304', async () => {
  const response = await app.call('/about', undefined, '198.51.100.8', { 'if-none-match': 'old' });
  const html = await response.text();
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('etag'), null); assert.equal(app.state.assetCalls.at(-1).conditional, false);
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((match) => JSON.parse(match[1]));
  assert.equal(scripts[0].offers[0].price, '0'); assert.equal(scripts[0].offers[1].price, '4.99');
  assert.equal(scripts[0].offers[1].priceValidUntil, undefined); assert.equal(scripts[1].name, 'A & B');
  assert.match(html, /data-sg-price>\$4\.99/);
});

test('active and expired launch HTML never retain an expired schema price or launch label', async () => {
  const launch = await runtime({ DELUXE_LAUNCH_START_UTC: new Date(Date.now() - 86400000).toISOString() });
  try {
    let html = await (await launch.call('/birthday-fireworks/')).text();
    assert.match(html, /data-sg-price>\$1\.99/); assert.match(html, /Launch offer ends/);
    assert.match(html, /"price":"1.99"/); assert.match(html, /"priceValidUntil":/);
    await launch.mf.setOptions(convertV4MiniflareOptions({ ...launch.options,
      bindings: { ...launch.options.bindings, DELUXE_LAUNCH_START_UTC: new Date(Date.now() - LAUNCH_DURATION_MS).toISOString() } }));
    html = await (await launch.call('/birthday-fireworks/')).text();
    assert.match(html, /data-sg-price>\$4\.99/); assert.ok(!html.includes('Launch offer ends'));
    assert.ok(!html.includes('"price":"1.99"')); assert.ok(!html.includes('priceValidUntil'));
  } finally { await launch.mf.dispose(); }
});

test('maintenance is disabled by default; approved retirement and bounded legacy import commit status before cleanup', async () => {
  assert.equal((await app.call('/api/maintenance', { action: 'retire', id: 'Hx7kQm2a', apply: true })).status, 404);
  const token = 'fixture-maintenance-token-000000000000';
  const operator = await runtime({ MAINTENANCE_TOKEN: token });
  const headers = { authorization: `Bearer ${token}` };
  try {
    await operator.kv.put('g:RetireMe', JSON.stringify({ ...words, status: 'paid', deluxe: true }));
    assert.equal((await operator.call('/api/maintenance', { action: 'retire', id: 'RetireMe' }, undefined, headers)).status, 200);
    assert.ok(await operator.kv.get('g:RetireMe')); assert.equal((await operator.guards.getByName('target:g:RetireMe').status()).deleted, 0);
    assert.equal((await operator.call('/api/maintenance', { action: 'retire', id: 'RetireMe', apply: true }, undefined, headers)).status, 200);
    assert.equal(await operator.kv.get('g:RetireMe'), null); assert.equal((await operator.guards.getByName('target:g:RetireMe').status()).deleted, 1);
    await operator.kv.put('n:g:Untouch1', JSON.stringify({ by: ['a', 'b', 'c'] }));
    let result = await (await operator.call('/api/maintenance', { action: 'legacy-tallies' }, undefined, headers)).json();
    assert.equal(result.hidden, 1); assert.ok(await operator.kv.get('n:g:Untouch1'));
    result = await (await operator.call('/api/maintenance', { action: 'legacy-tallies', apply: true }, undefined, headers)).json();
    assert.equal(result.processed, 1); assert.equal(await operator.kv.get('n:g:Untouch1'), null);
    assert.equal((await operator.guards.getByName('target:g:Untouch1').status()).hidden, 1);
  } finally { await operator.mf.dispose(); }
});

test('resend paginates purchases and restores the exact paid backup; provider failure does not claim success', async () => {
  const { session, id } = await create('198.51.100.9'); app.pay(session);
  await app.kv.delete(`g:${id}`);
  app.state.listPages.push({ data: [{ id: 'first-page-tail', payment_status: 'unpaid' }], has_more: true }, { data: [session], has_more: false });
  let response = await app.call('/api/resend', { email: 'friend@example.invalid' }, '198.51.100.10');
  assert.equal(response.status, 200); assert.equal(app.state.pageCalls.at(-1), 'first-page-tail');
  assert.equal((await app.kv.get(`g:${id}`, { type: 'json' })).status, 'paid'); assert.equal(app.state.mailCalls, 1);
  app.state.listPages.push({ data: [session], has_more: false }); app.state.mailStatus = 503;
  response = await app.call('/api/resend', { email: 'friend@example.invalid' }, '198.51.100.11');
  assert.equal(response.status, 502); assert.notEqual((await response.json()).ok, true); app.state.mailStatus = 200;
  app.state.stripeStatus = 503;
  response = await app.call('/api/resend', { email: 'different@example.invalid' }, '198.51.100.12');
  assert.equal(response.status, 502); app.state.stripeStatus = 200;
});

test('Stripe backups support bounded 480-character chunks and older four-chunk data', () => {
  const look = normalizeLook(paidLook);
  const metadata = backupMetadata('abcdefgh', words, look, offer(), crypto.randomUUID());
  assert.deepEqual(backupLook(metadata), look);
  assert.deepEqual(backupLook({ look0: '{"a":"lake",', look1: '"ver":1}', look2: '', look3: '' }), { a: 'lake', ver: 1 });
  assert.equal(backupLook({ look_parts: '2', look0: '{}' }), null);
  assert.equal(backupLook({ look_parts: '99' }), null);
});

test('webhook signatures require a valid HMAC within the replay window and accept rotated signatures', async () => {
  const body = JSON.stringify({ type: 'fixture' }); const secret = 'fixture-signature-token';
  const time = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = Buffer.from(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${time}.${body}`))).toString('hex');
  assert.equal(await verify(body, `t=${time},v1=invalid,v1=${signature}`, secret), true);
  assert.equal(await verify(body + ' ', `t=${time},v1=${signature}`, secret), false);
  assert.equal(await verify(body, `t=${time},v1=${signature}`, secret, (time + 301) * 1000), false);
});
