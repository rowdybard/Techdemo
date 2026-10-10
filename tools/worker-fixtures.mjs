// Local-only provider fixtures. Every outbound request is intercepted; no credentials or network.
import { build } from 'esbuild';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
export const fixtureHTML = `<!doctype html><html><head><title>SkyGreeting</title>
<meta name="description" content="A fireworks show"><meta property="og:title" content="SkyGreeting">
<meta property="og:description" content="A fireworks show"><meta property="og:image" content="birthday.jpg">
<meta property="og:url" content="https://skygreeting.com"><link rel="canonical" href="https://skygreeting.com">
<script type="application/ld+json">{"@type":"Product","offers":[{"@type":"Offer","name":"Free","price":"0"},{"@type":"Offer","name":"Deluxe","price":"4.99","priceValidUntil":"old"}]}</script>
<script type="application/ld+json">{"@type":"BreadcrumbList","name":"A & B"}</script>
</head><body>Deluxe <span data-sg-price>$4.99</span><span data-sg-regular-price>$4.99</span><span data-sg-promotion></span></body></html>`;

const reply = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

export async function runtime(bindings = {}) {
  const built = await build({ absWorkingDir: root, entryPoints: ['worker/index.js'], bundle: true, write: false,
    format: 'esm', platform: 'neutral', external: ['cloudflare:workers'] });
  const state = { stripeCalls: 0, mailCalls: 0, assetCalls: [], sessions: new Map(), intents: new Map(),
    mailStatus: 200, stripeStatus: 200, listPages: [], pageCalls: [], searchCalls: 0 };
  const options = { modules: true, script: built.outputFiles[0].text, compatibilityDate: '2026-09-30', telemetry: { enabled: false },
    kvNamespaces: ['GREETINGS'], durableObjects: { GUARDS: { className: 'GreetingGuard', useSQLite: true } },
    bindings: { STRIPE_SECRET_KEY: 'fixture-payment-token', STRIPE_WEBHOOK_SECRET: 'fixture-signature-token',
      RESEND_API_KEY: 'fixture-email-token', ...bindings },
    serviceBindings: { ASSETS: (request) => {
      state.assetCalls.push({ url: request.url, conditional: request.headers.has('if-none-match') });
      return new Response(fixtureHTML, { headers: { 'content-type': 'text/html', etag: 'old', 'cache-control': 'public,max-age=3600' } });
    } },
    outboundService: async (request) => {
      const url = new URL(request.url);
      if (url.hostname === 'api.resend.com') { state.mailCalls++; return reply({ id: 'fixture-mail' }, state.mailStatus); }
      if (url.hostname !== 'api.stripe.com') throw new Error('Unexpected outbound host');
      state.stripeCalls++;
      if (state.stripeStatus !== 200) return reply({ error: { message: 'Provider failed' } }, state.stripeStatus);
      if (url.pathname === '/v1/checkout/sessions' && request.method === 'POST') {
        const form = new URLSearchParams(await request.text());
        const id = form.get('client_reference_id');
        const number = state.sessions.size + 1;
        const session = { id: `fixture-session-${number}`, url: `https://checkout.stripe.com/fixture-${number}`,
          client_reference_id: id, payment_status: 'unpaid', status: 'open', currency: 'usd',
          amount_total: Number(form.get('line_items[0][price_data][unit_amount]')), payment_intent: `fixture-intent-${number}`,
          metadata: {}, customer_details: { email: 'friend@example.invalid' } };
        const metadata = {};
        for (const [key, value] of form) {
          const backup = /^payment_intent_data\[metadata\]\[(.+)\]$/.exec(key);
          const top = /^metadata\[(.+)\]$/.exec(key);
          if (backup) metadata[backup[1]] = value;
          if (top) session.metadata[top[1]] = value;
        }
        state.sessions.set(session.id, session);
        state.intents.set(session.payment_intent, { id: session.payment_intent, metadata, status: 'requires_payment_method',
          amount: session.amount_total, amount_received: 0, currency: 'usd', created: Math.floor(Date.now() / 1000), receipt_email: 'friend@example.invalid' });
        return reply(session);
      }
      if (url.pathname === '/v1/checkout/sessions') {
        state.pageCalls.push(url.searchParams.get('starting_after'));
        return reply(state.listPages.shift() || { data: [], has_more: false });
      }
      if (url.pathname.startsWith('/v1/checkout/sessions/')) return reply(state.sessions.get(decodeURIComponent(url.pathname.split('/').at(-1))) || { error: {} });
      if (url.pathname === '/v1/payment_intents/search') {
        state.searchCalls++;
        const id = /:'([^']+)'/.exec(url.searchParams.get('query'))?.[1];
        return reply({ data: [...state.intents.values()].filter((intent) => intent.metadata.greeting === id), has_more: false });
      }
      if (url.pathname.startsWith('/v1/payment_intents/')) return reply(state.intents.get(decodeURIComponent(url.pathname.split('/').at(-1))) || { error: {} });
      throw new Error('Unexpected provider path');
    } };
  const mf = new Miniflare(convertV4MiniflareOptions(options));
  const kv = await mf.getKVNamespace('GREETINGS');
  const guards = await mf.getDurableObjectNamespace('GUARDS');
  const call = (path, body, ip = '198.51.100.1', headers = {}) => mf.dispatchFetch(`https://skygreeting.com${path}`, {
    method: body === undefined ? 'GET' : 'POST', body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip, ...headers },
  });
  const pay = (session) => {
    session.payment_status = 'paid'; session.status = 'complete';
    const intent = state.intents.get(session.payment_intent);
    intent.status = 'succeeded'; intent.amount_received = session.amount_total;
  };
  return { mf, kv, guards, state, call, pay, options };
}
