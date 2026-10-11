import { greetingBlocked } from '../src/moderate.js';
import { lookPlace, MAX_LOOK_BYTES } from '../src/design.js';
import { clean, LIMITS, OCCASIONS, validId } from './common.js';
import { hiddenText } from './policy.js';
import { offer, priceText, promotionText } from './pricing.js';
import { load, restore } from './storage.js';

const EMOJI = { halloween: '🎃', birthday: '🎂', love: '❤️', congrats: '🎉', thanks: '🙏', newyear: '🎆' };
const setMeta = (value) => ({ element(element) { element.setAttribute('content', value); } });
const PUBLIC_PAGES = new Set(['about', 'ideas', 'birthday-fireworks', 'love-you-fireworks', 'congratulations-fireworks',
  'thank-you-fireworks', 'halloween-fireworks-ecard', 'new-years-eve-virtual-fireworks', 'name-in-fireworks',
  'silent-fireworks', 'gift-for-someone-who-has-everything', 'find', 'terms', 'privacy']);

// Only known page aliases redirect: an unknown .html path must keep its asset 404.
export function canonicalPageRedirect(url) {
  let path = url.pathname;
  if (path === '/index.html') path = '/';
  else if (path === '/autoshow/') path = '/autoshow';
  else {
    const slug = path.slice(1).replace(/(?:\.html|\/)$/, '');
    if (PUBLIC_PAGES.has(slug)) path = `/${slug}`;
  }
  if (path === url.pathname) return null;
  const target = new URL(url);
  target.pathname = path; // preserve the complete query, including greeting and checkout parameters
  const headers = new Headers({ location: target.href });
  if (path === '/' && (url.searchParams.has('g') || url.searchParams.has('msg'))) {
    headers.set('x-robots-tag', 'noindex, nofollow');
    headers.set('cache-control', 'no-store');
  }
  return new Response(null, { status: 301, headers });
}

/** HEAD has the page's GET status and headers, with no response body. */
export async function pageHead(response, request) {
  if (request.method !== 'HEAD') return response;
  await response.body?.cancel();
  return new Response(null, response);
}

// Conditional asset requests must not return an old 304 body containing an expired offer.
export function pageRequest(request, url = request.url) {
  const headers = new Headers(request.headers);
  headers.delete('if-none-match');
  headers.delete('if-modified-since');
  return new Request(url, { method: request.method, headers });
}

export function withOffer(page, quote) {
  if (!page.headers.get('content-type')?.includes('text/html') || page.status !== 200) return page;
  const schemaText = [];
  const rewriter = new HTMLRewriter()
    .on('[data-sg-price]', { element(el) { el.setInnerContent(priceText(quote)); } })
    .on('[data-sg-regular-price]', { element(el) { el.setInnerContent(`$${(quote.regularPriceCents / 100).toFixed(2)}`); } })
    .on('[data-sg-promotion]', { element(el) { el.setInnerContent(promotionText(quote)); } })
    .on('script[type="application/ld+json"]', {
      element() { schemaText.length = 0; },
      text(chunk) {
        schemaText.push(chunk.text);
        chunk.remove();
        if (!chunk.lastInTextNode) return;
        let raw = schemaText.join('');
        try {
          const schema = JSON.parse(raw);
          rewriteOffers(schema, quote);
          raw = JSON.stringify(schema).replace(/</g, '\\u003c');
        } catch { /* Preserve unrelated structured data. */ }
        chunk.after(raw, { html: true });
      },
    });
  const rewritten = rewriter.transform(page);
  const response = new Response(rewritten.body, rewritten);
  response.headers.set('cache-control', 'no-store');
  response.headers.set('cdn-cache-control', 'no-store');
  response.headers.delete('etag');
  response.headers.delete('last-modified');
  response.headers.delete('content-length');
  return response;
}

export function rewriteOffers(value, quote) {
  if (!value || typeof value !== 'object') return;
  if (value['@type'] === 'Offer' && (/deluxe/i.test(value.name || '') || Number(value.price) > 0)) {
    value.price = (quote.priceCents / 100).toFixed(2);
    value.priceCurrency = quote.currency;
    if (quote.promotion.active) value.priceValidUntil = quote.promotion.end;
    else delete value.priceValidUntil;
  }
  for (const child of Object.values(value)) if (typeof child === 'object') rewriteOffers(child, quote);
}

function linkedLook(packed) {
  if (!packed || packed.length > Math.ceil(MAX_LOOK_BYTES * 4 / 3) + 4) return null;
  try {
    const binary = atob(packed.replace(/-/g, '+').replace(/_/g, '/'));
    if (binary.length > MAX_LOOK_BYTES) return null;
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0))));
  } catch { return null; }
}

export async function preview(request, env, url) {
  const quote = offer(env);
  const page = withOffer(await env.ASSETS.fetch(pageRequest(request, new URL('/', url))), quote);
  let occasion = '';
  let from = '';
  let place = null;
  const id = url.searchParams.get('g');
  if (validId(id)) {
    let record = await load(env, id);
    if (!record) {
      try { record = await restore(env, id); } catch { /* The client can retry payment recovery. */ }
    }
    if (record && !record.hidden && ['paid', 'free', 'pending'].includes(record.status)) place = lookPlace(record.look);
    if (record && ['paid', 'free'].includes(record.status) && !record.hidden) {
      ({ occasion, from } = record);
    }
  } else if (!id) {
    const words = { occasion: clean(url.searchParams.get('o'), 20), message: clean(url.searchParams.get('msg'), LIMITS.message).toUpperCase(),
      message2: clean(url.searchParams.get('msg2'), LIMITS.message2).toUpperCase(), to: clean(url.searchParams.get('to'), LIMITS.to).toUpperCase(), from: clean(url.searchParams.get('from'), LIMITS.from) };
    if (!greetingBlocked(words) && !(await hiddenText(env, words))) {
      ({ occasion, from } = words);
      place = lookPlace(linkedLook(url.searchParams.get('l')));
    }
  }
  if (!OCCASIONS.has(occasion)) occasion = 'birthday';
  if (greetingBlocked({ message: '', to: '', from })) from = '';
  place ||= occasion === 'newyear' ? 'lake' : 'beach';
  const title = `${from ? `${from} made you a SkyGreeting` : 'You’ve got a SkyGreeting'} ${EMOJI[occasion]}`;
  const description = 'A fireworks show made just for you. Tap to watch it light up the sky.';
  const image = `${url.origin}/src/og/${occasion}.jpg`;
  const rewritten = new HTMLRewriter()
    .on('title', { element(el) { el.setInnerContent(title); } })
    .on('meta[property="og:title"], meta[name="twitter:title"]', setMeta(title))
    .on('meta[property="og:description"], meta[name="description"], meta[name="twitter:description"]', setMeta(description))
    .on('meta[property="og:image"], meta[name="twitter:image"]', setMeta(image))
    .on('meta[property="og:url"]', setMeta(url.href))
    .on('head', { element(el) { el.append(`<meta name="sg-occasion" content="${occasion}"><meta name="sg-place" content="${place}">`, { html: true }); } })
    .transform(page);
  const response = new Response(rewritten.body, rewritten);
  response.headers.set('x-robots-tag', 'noindex, nofollow');
  response.headers.set('cache-control', 'no-store');
  return response;
}

export async function autoshowPage(request, env, url) {
  const page = withOffer(await env.ASSETS.fetch(pageRequest(request, new URL('/', url))), offer(env));
  const title = 'SkyGreeting Autoshow: an endless fireworks show, never the same twice';
  const description = 'A live fireworks show over a night beach that designs itself as it goes. Leave it running.';
  return new HTMLRewriter()
    .on('title', { element(el) { el.setInnerContent(title); } })
    .on('meta[property="og:title"], meta[name="twitter:title"]', setMeta(title))
    .on('meta[property="og:description"], meta[name="description"], meta[name="twitter:description"]', setMeta(description))
    .on('meta[property="og:url"]', setMeta(`${url.origin}/autoshow`))
    .on('link[rel="canonical"]', { element(el) { el.setAttribute('href', `${url.origin}/autoshow`); } })
    .transform(page);
}
