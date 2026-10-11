// The ideas pages (made by tools/make-ideas.py from tools/ideas/): checks everything that could
// quietly rot. Pages match their fragments, titles and descriptions are useful and unique,
// breadcrumbs describe the real hierarchy, links and pictures exist, and each main CTA opens
// the intended occasion. Length and word-count quotas cannot establish a page's usefulness.
// The sky examples fit the real limits and say how many characters they are correctly, any price
// matches the product's, and every page is in the sitemap and linked from the hub.
// Prints counts only. Run by `npm run check`; on its own: node tools/pages-test.mjs
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SITE = 'https://skygreeting.com';
const problems = [];
const fail = (page, message) => problems.push(`${page}: ${message}`);
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const decode = (text) => text.replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code) => String.fromCodePoint(code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code)))
  .replace(/&quot;/g, '"').replace(/&apos;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const plain = (html) => decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const key = (text) => text.replace(/\s+/g, ' ').trim().toLowerCase();
const meaningful = (text) => /[\p{L}\p{N}]/u.test(text.replace(/SkyGreeting/gi, ''));
const attr = (attributes, name) => new RegExp(`(?:^|\\s)${name}(?:="([^"]*)")?(?=\\s|$)`).exec(attributes)?.[1];
const anchors = (html) => [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map(([, attributes, label]) => ({
  href: decode(attr(attributes, 'href') || ''), label: plain(label), attributes,
}));

// What the product itself says: limits, price, occasions, the filter.
const link = read('src/link.js');
const MESSAGE_LIMIT = Number(/MESSAGE_LIMIT = (\d+)/.exec(link)[1]);
const NAME_LIMIT = Number(/NAME_LIMIT = (\d+)/.exec(link)[1]);
const { REGULAR_PRICE_CENTS } = await import(pathToFileURL(join(ROOT, 'worker/pricing.js')));
const PRICE = `$${(REGULAR_PRICE_CENTS / 100).toFixed(2)}`;
const OCCASIONS = new Set([...read('src/occasions.js').matchAll(/^  (\w+): \{$/gm)].map((m) => m[1]));
const { isBlocked } = await import(pathToFileURL(join(ROOT, 'src/moderate.js')));

// Are the generated pages what the fragments say they should be?
const fresh = mkdtempSync(join(tmpdir(), 'ideas-'));
const made = spawnSync(process.env.PYTHON || 'python3', [join(ROOT, 'tools/make-ideas.py'), fresh], { encoding: 'utf8' });
if (made.status !== 0) fail('make-ideas.py', made.stderr || made.stdout || `${made.error?.message}. Set PYTHON to your Python executable.`);

const pages = readdirSync(ROOT).filter((f) => f.endsWith('.html') && read(f).includes('Made by tools/make-ideas.py'));
const fragments = readdirSync(join(ROOT, 'tools/ideas')).filter((file) => file.endsWith('.html'));
for (const file of fragments) if (!pages.includes(file)) fail(file, 'has a fragment but no generated page');
for (const file of pages) if (!fragments.includes(file)) fail(file, 'has a generated page but no source fragment');
const slugs = new Set(pages.map((f) => f.replace(/\.html$/, '')));
const sitemap = read('sitemap.xml');
const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen',
  'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty', 'twenty-one', 'twenty-two', 'twenty-three', 'twenty-four'];
const KNOWN = new Set(['/', '/autoshow', '/find', '/about', '/terms', '/privacy', '/ideas']);
const titles = new Map();
const descriptions = new Map();
let links = 0;
let examples = 0;

for (const file of pages) {
  const slug = file.replace(/\.html$/, '');
  const source = read(file);
  const tag = (re) => (re.exec(source) || [])[1];
  const fragment = fragments.includes(file) ? read(`tools/ideas/${file}`) : '';
  const metadata = Object.fromEntries((/^\s*<!--([\s\S]*?)-->/.exec(fragment)?.[1] || '').split(/\r?\n/)
    .map((line) => /^([^:]+):\s*(.*)$/.exec(line)).filter(Boolean).map(([, name, value]) => [name.trim(), value.trim()]));

  if (!existsSync(join(fresh, file))) fail(file, 'was not produced by the page generator');
  else if (readFileSync(join(fresh, file), 'utf8').replace(/\r\n/g, '\n') !== source.replace(/\r\n/g, '\n')) fail(file, 'is out of date; run python3 tools/make-ideas.py and commit the result');

  // Head.
  const title = decode(tag(/<title>([^<]*)<\/title>/) || '');
  const description = decode(tag(/<meta name="description" content="([^"]*)"/) || '');
  if (!meaningful(title)) fail(file, 'needs a descriptive page title');
  if (!meaningful(description)) fail(file, 'needs a useful page description');
  if (titles.has(key(title))) fail(file, `same title as ${titles.get(key(title))}`);
  if (descriptions.has(key(description))) fail(file, `same description as ${descriptions.get(key(description))}`);
  titles.set(key(title), file);
  descriptions.set(key(description), file);
  for (const [name, expected] of [['canonical', `${SITE}/${slug}`], ['og:url', `${SITE}/${slug}`]]) {
    const matches = [...source.matchAll(name === 'canonical' ? /<link rel="canonical" href="([^"]*)"/g : /<meta property="og:url" content="([^"]*)"/g)];
    if (matches.length !== 1 || matches[0][1] !== expected) fail(file, `needs one ${name} pointing to ${expected}`);
  }
  if (/noindex/i.test(source)) fail(file, 'is marked noindex');
  if ((source.match(/<h1[ >]/g) || []).length !== 1) fail(file, 'needs exactly one <h1>');
  const expectedCrumbs = [{ name: 'SkyGreeting', item: `${SITE}/` }, { name: 'Ideas', item: `${SITE}/ideas` }];
  if (slug !== 'ideas') expectedCrumbs.push({ name: metadata.crumb, item: `${SITE}/${slug}` });
  try {
    const breadcrumb = JSON.parse(tag(/<script type="application\/ld\+json">([^<]*)<\/script>/));
    const expected = expectedCrumbs.map((crumb, i) => ({ '@type': 'ListItem', position: i + 1, ...crumb }));
    const items = breadcrumb.itemListElement;
    if (breadcrumb['@context'] !== 'https://schema.org' || breadcrumb['@type'] !== 'BreadcrumbList' ||
      !Array.isArray(items) || items.length !== expected.length || expected.some((crumb, i) =>
        Object.keys(crumb).some((name) => items[i]?.[name] !== crumb[name]))) fail(file, 'breadcrumb structured data does not describe its real page hierarchy');
  } catch {
    fail(file, 'its structured data (JSON-LD) does not parse');
  }
  const trail = tag(/<nav class="crumbs" aria-label="Breadcrumb">([\s\S]*?)<\/nav>/) || '';
  const visibleCrumbs = anchors(trail);
  const parents = expectedCrumbs.slice(0, -1);
  if (visibleCrumbs.length !== parents.length || parents.some((crumb, i) =>
    visibleCrumbs[i]?.href !== new URL(crumb.item).pathname || visibleCrumbs[i]?.label !== crumb.name)) fail(file, 'visible breadcrumb links differ from the structured hierarchy');
  const current = /<span aria-current="page">([^<]*)<\/span>/.exec(trail)?.[1];
  if (decode(current || '') !== expectedCrumbs.at(-1).name) fail(file, 'breadcrumb must mark the current page by its own name');

  // One clear action per row, pointing at this page's intended greeting rather than a competing show.
  const actions = [...source.matchAll(/<p class="actions">([\s\S]*?)<\/p>/g)];
  if (!actions.length) fail(file, 'has no main greeting action');
  for (const [, row] of actions) {
    const buttons = anchors(row);
    if (buttons.length !== 1) { fail(file, 'each action row needs one main greeting link'); continue; }
    const button = buttons[0];
    let url;
    try { url = new URL(button.href, SITE); } catch { fail(file, 'main CTA has an invalid URL'); continue; }
    if (url.origin !== SITE || url.pathname !== '/' || url.searchParams.get('make') !== metadata.occasion ||
      (url.searchParams.get('text') || '') !== (metadata.text || '') || !OCCASIONS.has(metadata.occasion)) fail(file, 'main CTA does not open its intended greeting and message');
    if (button.label !== metadata.cta || !button.label) fail(file, 'main CTA has no matching descriptive label');
    if (!/\bdata-sg-make(?:\s|$)/.test(button.attributes)) fail(file, 'main CTA lacks the public conversion-event marker');
  }
  if (!source.includes('<link rel="modulepreload" href="/src/analytics.js">') ||
    !source.includes('<script type="module" src="/src/analytics.js"></script>')) fail(file, 'must load the shared privacy-conscious page analytics');

  const cardSection = slug === 'ideas' ? source : tag(/<section class="related"[^>]*>([\s\S]*?)<\/section>/) || '';
  const cardLists = [...cardSection.matchAll(/<ul class="cards">([\s\S]*?)<\/ul>/g)];
  const related = cardLists.flatMap(([, list]) => anchors(list).map((a) => a.href));
  const expectedPages = [...slugs].filter((item) => item !== 'ideas');
  if (slug === 'ideas') {
    if (related.length !== expectedPages.length || expectedPages.some((item) => !related.includes(`/${item}`))) fail(file, 'hub cards must list each landing page exactly once');
  } else if (related.length < 2 || related.length > 3 || new Set(related).size !== related.length ||
    related.some((href) => href === `/${slug}` || !expectedPages.some((item) => href === `/${item}`))) fail(file, 'needs two or three distinct related landing pages, excluding itself');

  // Picture: exists, sized (no layout shift), described.
  const image = /<img src="([^"]*)" width="(\d+)" height="(\d+)" alt="([^"]*)"/.exec(source);
  if (!image) fail(file, 'the picture needs src, width, height and alt');
  else {
    if (!existsSync(join(ROOT, image[1].slice(1)))) fail(file, `picture ${image[1]} is missing`);
    if (!meaningful(decode(image[4]))) fail(file, 'the picture needs descriptive alt text');
  }
  const ogImage = tag(/<meta property="og:image" content="([^"]*)"/);
  if (!ogImage || !existsSync(join(ROOT, ogImage.replace(SITE + '/', '')))) fail(file, `og:image ${ogImage} is missing`);

  // Content quality is reviewed by a person; detect placeholders, not an arbitrary word quota.
  const text = decode(source.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' '));
  if (/TODO|lorem|undefined|\{\{/i.test(text)) fail(file, 'has placeholder text');

  // Links.
  for (const [, encoded] of source.matchAll(/(?:href|src)="([^"]*)"/g)) {
    const href = decode(encoded);
    if (/^(mailto:|#)/.test(href)) continue;
    let url;
    try { url = new URL(href, SITE); } catch { fail(file, `invalid URL ${href}`); continue; }
    if (url.origin !== SITE) continue;
    links++;
    const path = url.pathname;
    if (path === '/' && url.searchParams.has('make')) {
      const make = url.searchParams.get('make');
      const words = url.searchParams.get('text') || '';
      if (!OCCASIONS.has(make)) fail(file, `${href} names an occasion that doesn't exist`);
      if (words.length > MESSAGE_LIMIT) fail(file, `${href} has more than ${MESSAGE_LIMIT} characters of text`);
      if (words && isBlocked(words)) fail(file, `${href} has text the filter blocks`);
      continue;
    }
    if (KNOWN.has(path) || slugs.has(path.slice(1))) continue;
    if (existsSync(join(ROOT, path.slice(1)))) continue;
    fail(file, `link ${href} goes nowhere`);
  }
  if (slug !== 'ideas' && !source.includes('href="/ideas"')) fail(file, 'does not link to the hub');

  // Anything with a price in it must be the product's price; limits must be the product's too.
  const prices = [...text.matchAll(/(\$\d+(?:\.\d\d)?)/g)].map((match) => match[1]).filter((price) => Number(price.slice(1)) !== 0);
  for (const price of prices) if (price !== PRICE) fail(file, `mentions ${price}, but the regular price is ${PRICE}`);
  const livePrices = [...source.matchAll(/<span\b[^>]*\bdata-sg-(?:price|regular-price)\b[^>]*>\s*(\$\d+(?:\.\d\d)?)\s*<\/span>/g)];
  if (livePrices.length !== prices.length) fail(file, 'paid prices must keep the live offer markers');
  if (prices.length && !/\bdata-sg-promotion\b/.test(source)) fail(file, 'paid pricing needs the live promotion explanation marker');
  for (const [, count] of text.matchAll(/\b(\d+) characters/g)) if (![MESSAGE_LIMIT, NAME_LIMIT].includes(Number(count))) fail(file, `says "${count} characters", but the limits are ${MESSAGE_LIMIT} and ${NAME_LIMIT}`);

  // The words shown in the sky: fit, and "Seventeen characters" means seventeen.
  for (const [, body] of source.matchAll(/<ul class="examples">([\s\S]*?)<\/ul>/g)) {
    for (const [, shown, rest] of body.matchAll(/<li><b>([^<]*)<\/b>([^<]*)/g)) {
      examples++;
      const [message, name] = decode(shown).split(' / ');
      if (message.length > MESSAGE_LIMIT) fail(file, `"${message}" is ${message.length} characters (limit ${MESSAGE_LIMIT})`);
      if (name !== undefined && name.length > NAME_LIMIT) fail(file, `name "${name}" is ${name.length} characters (limit ${NAME_LIMIT})`);
      if (isBlocked(decode(shown))) fail(file, `"${shown}" is blocked by the filter`);
      const claim = /^([A-Z][a-z]+(?:-[a-z]+)?) characters\b/.exec(decode(rest).trim());
      if (claim) {
        const said = NUMBER_WORDS.indexOf(claim[1].toLowerCase());
        if (said !== message.length) fail(file, `"${message}" is ${message.length} characters, but the page says ${claim[1].toLowerCase()}`);
      }
    }
  }

  // In the sitemap.
  if (!sitemap.includes(`<loc>${SITE}/${slug}</loc>`)) fail(file, 'is not in sitemap.xml');
}

// The hub lists every page; the home page and About point at the hub.
const hub = read('ideas.html');
for (const slug of slugs) if (slug !== 'ideas' && !hub.includes(`href="/${slug}"`)) fail('ideas.html', `does not list /${slug}`);
if (!read('index.html').includes('href="/ideas"')) fail('index.html', 'has no link to /ideas');
if (!read('about.html').includes('href="/ideas"')) fail('about.html', 'has no link to /ideas');
if (!read('wrangler.jsonc').includes('*.html')) fail('wrangler.jsonc', 'the build command must copy *.html, or new pages never go live');

// This path was created above; only remove our own immediate child of the temporary directory.
if (dirname(resolve(fresh)) === resolve(tmpdir()) && basename(fresh).startsWith('ideas-')) rmSync(fresh, { recursive: true, force: true });

if (problems.length) {
  console.error(`FAIL: ${problems.length} problem(s) with the ideas pages:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`Pages OK: ${pages.length} pages, ${links} links and ${examples} sky examples checked.`);
