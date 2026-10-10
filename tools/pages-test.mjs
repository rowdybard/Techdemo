// The ideas pages (made by tools/make-ideas.py from tools/ideas/): checks everything that could
// quietly rot. Pages match their fragments, titles and descriptions are the right length and
// unique, every internal link and picture exists, every "make" button names a real occasion,
// the sky examples fit the real limits and say how many characters they are correctly, any price
// matches the product's, and every page is in the sitemap and linked from the hub.
// Prints counts only. Run by `npm run check`; on its own: node tools/pages-test.mjs
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SITE = 'https://skygreeting.com';
const problems = [];
const fail = (page, message) => problems.push(`${page}: ${message}`);
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

// What the product itself says: limits, price, occasions, the filter.
const link = read('src/link.js');
const MESSAGE_LIMIT = Number(/MESSAGE_LIMIT = (\d+)/.exec(link)[1]);
const NAME_LIMIT = Number(/NAME_LIMIT = (\d+)/.exec(link)[1]);
const PRICE = /PRICE = '(\$[\d.]+)'/.exec(read('src/occasions.js'))[1];
const OCCASIONS = new Set([...read('src/occasions.js').matchAll(/^  (\w+): \{$/gm)].map((m) => m[1]));
const { isBlocked } = await import(pathToFileURL(join(ROOT, 'src/moderate.js')));

// Are the generated pages what the fragments say they should be?
const fresh = mkdtempSync(join(tmpdir(), 'ideas-'));
const made = spawnSync(process.env.PYTHON || 'python3', [join(ROOT, 'tools/make-ideas.py'), fresh], { encoding: 'utf8' });
if (made.status !== 0) fail('make-ideas.py', made.stderr || made.stdout || `${made.error?.message}. Set PYTHON to your Python executable.`);

const pages = readdirSync(ROOT).filter((f) => f.endsWith('.html') && read(f).includes('Made by tools/make-ideas.py'));
if (pages.length < 10) fail('pages', `expected at least 10 generated pages, found ${pages.length}`);
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
  const decode = (text) => text.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

  if (existsSync(join(fresh, file)) && readFileSync(join(fresh, file), 'utf8').replace(/\r\n/g, '\n') !== source.replace(/\r\n/g, '\n')) fail(file, 'is out of date; run python3 tools/make-ideas.py and commit the result');

  // Head.
  const title = decode(tag(/<title>([^<]*)<\/title>/) || '');
  const description = decode(tag(/<meta name="description" content="([^"]*)"/) || '');
  if (title.length < 25 || title.length > 62) fail(file, `title is ${title.length} characters (want 25 to 62)`);
  if (description.length < 100 || description.length > 165) fail(file, `description is ${description.length} characters (want 100 to 165)`);
  if (titles.has(title)) fail(file, `same title as ${titles.get(title)}`);
  if (descriptions.has(description)) fail(file, `same description as ${descriptions.get(description)}`);
  titles.set(title, file);
  descriptions.set(description, file);
  for (const [name, expected] of [['canonical', `${SITE}/${slug}`], ['og:url', `${SITE}/${slug}`]]) {
    const found = name === 'canonical' ? tag(/<link rel="canonical" href="([^"]*)"/) : tag(/<meta property="og:url" content="([^"]*)"/);
    if (found !== expected) fail(file, `${name} is ${found}, want ${expected}`);
  }
  if (/noindex/i.test(source)) fail(file, 'is marked noindex');
  if ((source.match(/<h1[ >]/g) || []).length !== 1) fail(file, 'needs exactly one <h1>');
  try {
    JSON.parse(tag(/<script type="application\/ld\+json">([^<]*)<\/script>/));
  } catch {
    fail(file, 'its structured data (JSON-LD) does not parse');
  }

  // Picture: exists, sized (no layout shift), described.
  const image = /<img src="([^"]*)" width="(\d+)" height="(\d+)" alt="([^"]*)"/.exec(source);
  if (!image) fail(file, 'the picture needs src, width, height and alt');
  else {
    if (!existsSync(join(ROOT, image[1].slice(1)))) fail(file, `picture ${image[1]} is missing`);
    if (image[4].length < 15) fail(file, 'the picture\'s alt text is too short');
  }
  const ogImage = tag(/<meta property="og:image" content="([^"]*)"/);
  if (!ogImage || !existsSync(join(ROOT, ogImage.replace(SITE + '/', '')))) fail(file, `og:image ${ogImage} is missing`);

  // Enough words to be worth a page.
  const text = decode(source.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' '));
  const words = text.split(/\s+/).filter(Boolean).length;
  const wanted = slug === 'ideas' ? 250 : 420;
  if (words < wanted) fail(file, `only ${words} words (want ${wanted}+)`);
  if (/TODO|lorem|undefined|\{\{/i.test(text)) fail(file, 'has placeholder text');

  // Links.
  for (const [, href] of source.matchAll(/(?:href|src)="([^"]*)"/g)) {
    if (/^(https?:|mailto:|#)/.test(href)) continue;
    links++;
    const url = new URL(href, SITE);
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
  for (const [, price] of text.matchAll(/(\$\d+(?:\.\d\d)?)/g)) if (price !== PRICE) fail(file, `mentions ${price}, but the price is ${PRICE}`);
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

if (problems.length) {
  console.error(`FAIL: ${problems.length} problem(s) with the ideas pages:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`Pages OK: ${pages.length} pages, ${links} links and ${examples} sky examples checked.`);
