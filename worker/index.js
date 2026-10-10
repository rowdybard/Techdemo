// The static renderer stays build-free. This Worker owns prices, payment confirmation,
// normalized greeting records and strongly consistent moderation/rate limits.
import { HttpError, json } from './common.js';
import { checkout, greeting, share, webhook } from './greetings.js';
import { autoshowPage, pageRequest, preview, withOffer } from './pages.js';
import { offer } from './pricing.js';
import { report, takenDown } from './reports.js';
import { resend } from './resend.js';
import { maintenance } from './maintenance.js';
export { GreetingGuard } from './guard.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/api/config' && request.method === 'GET') return json({ ...offer(env),
        payments: Boolean(env.STRIPE_SECRET_KEY), webhook: Boolean(env.STRIPE_WEBHOOK_SECRET), email: Boolean(env.RESEND_API_KEY && env.STRIPE_SECRET_KEY) });
      if (url.pathname === '/api/checkout' && request.method === 'POST') return await checkout(request, env, url);
      if (url.pathname === '/api/stripe-webhook' && request.method === 'POST') return await webhook(request, env);
      if (url.pathname === '/api/share' && request.method === 'POST') return await share(request, env);
      if (url.pathname === '/api/greeting' && request.method === 'GET') return await greeting(env, url.searchParams.get('id'));
      if (url.pathname === '/api/report' && request.method === 'POST') return await report(request, env);
      if (url.pathname === '/api/resend' && request.method === 'POST') return await resend(request, env);
      if (url.pathname === '/api/taken-down' && request.method === 'GET') return await takenDown(env, url.searchParams);
      if (url.pathname === '/api/maintenance' && request.method === 'POST') return await maintenance(request, env);
      if (url.pathname.startsWith('/api/')) return json({ error: 'Not found' }, 404);
      if (url.pathname === '/autoshow/') return Response.redirect(`${url.origin}/autoshow${url.search}`, 301);
      if (url.pathname === '/autoshow' && request.method === 'GET') return await autoshowPage(request, env, url);
      if (url.pathname === '/' && request.method === 'GET' && (url.searchParams.has('g') || url.searchParams.has('msg'))) return await preview(request, env, url);
      const page = await env.ASSETS.fetch(pageRequest(request));
      return withOffer(page, offer(env));
    } catch (error) {
      // Never log greeting ids, words, inboxes, provider responses or credentials.
      const status = error instanceof HttpError ? error.status : 500;
      console.error(JSON.stringify({ event: 'request_failed', status }));
      return json({ error: error instanceof HttpError ? error.message : 'Something went wrong. Please try again.' }, status);
    }
  },
};
