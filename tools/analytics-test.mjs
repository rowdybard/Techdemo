// Privacy and attribution across the public landing page -> greeting funnel.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const source = readFileSync(new URL('../src/analytics.js', import.meta.url), 'utf8');
let passed = 0;
function boot({ url = 'https://skygreeting.com/', referrer = '', title = 'SkyGreeting', app = true, ready = 'loading' } = {}) {
  const handlers = {}, scripts = [], timers = [];
  const context = { URL, URLSearchParams, Date, location: new URL(url),
    setTimeout(fn) { timers.push(fn); }, addEventListener(name, fn) { handlers[name] = fn; },
    document: { referrer, title, readyState: ready,
      addEventListener(name, fn) { handlers[name] = fn; },
      getElementById() { return app ? {} : null; },
      createElement() { return {}; }, head: { appendChild(node) { scripts.push(node); } },
    },
  };
  context.window = context;
  runInNewContext(source, context);
  const events = () => Array.from(context.dataLayer || [], (args) => Array.from(args));
  return { handlers, scripts, timers, events,
    config: () => events().find((args) => args[0] === 'config')?.[2],
    click(href) { handlers.click({ target: { closest: () => ({ href }) } }); },
  };
}
function test(name, fn) { fn(); passed++; console.log(`PASS ${name}`); }

test('private greeting details stay out of page views and referrers', () => {
  for (const suffix of ['?g=PRIVATE1&sent=1', '?msg=SECRET&from=PERSON#details', '?g=']) {
    const page = boot({ url: `https://skygreeting.com/${suffix}`, title: 'PERSON made you a SkyGreeting',
      referrer: 'https://skygreeting.com/?msg=SECRET&from=PERSON' });
    assert.equal(page.config().page_location, 'https://skygreeting.com/?view=greeting');
    assert.equal(page.config().page_title, 'SkyGreeting greeting');
    assert.equal(page.config().page_referrer, 'https://skygreeting.com/');
    assert.doesNotMatch(JSON.stringify(page.events()), /SECRET|PERSON|PRIVATE1|details/);
  }
});
test('landing visits identify the page and search origin without query strings', () => {
  const page = boot({ url: 'https://skygreeting.com/birthday-fireworks?text=SECRET#NAME', app: false,
    referrer: 'https://www.google.com/search?q=PERSON', title: 'Birthday fireworks' });
  assert.equal(page.config().page_location, 'https://skygreeting.com/birthday-fireworks');
  assert.equal(page.config().page_referrer, 'https://www.google.com/');
  assert.doesNotMatch(JSON.stringify(page.events()), /SECRET|PERSON|NAME/);
  assert.equal(page.scripts.length, 0);
  page.handlers.load(); assert.equal(page.scripts.length, 1);
});
test('only valid internal greeting CTAs emit category-only attribution', () => {
  const page = boot({ url: 'https://skygreeting.com/name-in-fireworks', app: false });
  page.click('https://skygreeting.com/?make=birthday&text=SECRET');
  page.click('https://example.com/?make=birthday');
  page.click('https://skygreeting.com/?make=PERSON');
  page.click('https://skygreeting.com/other?make=birthday');
  const clicks = page.events().filter((args) => args[1] === 'landing_cta');
  assert.equal(clicks.length, 1);
  assert.equal(clicks[0][2].page_slug, 'name-in-fireworks');
  assert.equal(clicks[0][2].content_type, 'birthday');
  assert.doesNotMatch(JSON.stringify(page.events()), /SECRET|PERSON/);
});
test('greeting entry retains its public landing referrer and defers script until scene-ready', () => {
  const page = boot({ url: 'https://skygreeting.com/?make=birthday&text=SECRET',
    referrer: 'https://skygreeting.com/birthday-fireworks?private=SECRET' });
  assert.equal(page.config().page_referrer, 'https://skygreeting.com/birthday-fireworks');
  assert.equal(page.config().page_location, 'https://skygreeting.com/');
  assert.equal(page.scripts.length, 0);
  page.handlers['scene-ready'](); page.timers[0]();
  assert.equal(page.scripts.length, 1);
  assert.equal(page.config().allow_google_signals, false);
  assert.equal(page.config().allow_ad_personalization_signals, false);
  assert.equal(page.events()[0][2].ad_storage, 'denied');
  assert.equal(page.events()[1][2].analytics_storage, 'denied');
});
test('client embeds never initialize analytics', () => {
  const page = boot({ url: 'https://skygreeting.com/?embed=1&msg=SECRET' });
  assert.equal(page.events().length, 0); assert.equal(page.scripts.length, 0); assert.equal(page.timers.length, 0);
});
test('local previews never pollute production search and conversion measurements', () => {
  const page = boot({ url: 'http://127.0.0.1:4173/birthday-fireworks', app: false, ready: 'complete' });
  assert.equal(page.events().length, 0); assert.equal(page.scripts.length, 0); assert.equal(page.timers.length, 0);
});
console.log(`Analytics privacy and landing attribution: ${passed} PASS`);
