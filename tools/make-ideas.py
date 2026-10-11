#!/usr/bin/env python3
"""Builds the ideas pages (skygreeting.com/ideas and the pages it lists) from tools/ideas/*.html.

Each fragment in tools/ideas/ is one page: a comment block of `key: value` lines, then the page's
body. This script wraps it in the shared head, breadcrumb, picture, buttons, a "More ideas" list and
footer, and writes <slug>.html at the repo root (the build command copies *.html, see
wrangler.jsonc). Edit the fragments, never the generated pages. Then run `npm run check`, which
verifies every page (titles, descriptions, links, pictures, sitemap).

Keys: title (a clear, descriptive <title>), description (a useful summary), h1, lead, image (a file in
src/og/), alt, crumb (the breadcrumb's last step), occasion (what the button opens the builder on),
text (optional words it starts with), cta (the button), card + blurb (how other pages list it).
The hub (ideas) lists the pages in ORDER and has `type: hub` and a {{cards}} marker in its body.

Usage: python3 tools/make-ideas.py [OUT_DIR]   (default: the repo root; tools/pages-test.mjs uses a
temporary folder to check the pages are up to date)
"""
import html
import json
import os
import re
import sys
from urllib.parse import quote

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(ROOT, 'tools', 'ideas')
SITE = 'https://skygreeting.com'
# The hub lists every page; landing pages suggest just a few relevant next steps.
ORDER = [
    'birthday-fireworks', 'love-you-fireworks', 'congratulations-fireworks', 'thank-you-fireworks',
    'halloween-fireworks-ecard', 'new-years-eve-virtual-fireworks', 'name-in-fireworks',
    'silent-fireworks', 'gift-for-someone-who-has-everything',
]
RELATED = {
    'birthday-fireworks': ['name-in-fireworks', 'gift-for-someone-who-has-everything', 'love-you-fireworks'],
    'love-you-fireworks': ['name-in-fireworks', 'birthday-fireworks', 'gift-for-someone-who-has-everything'],
    'congratulations-fireworks': ['name-in-fireworks', 'thank-you-fireworks', 'birthday-fireworks'],
    'thank-you-fireworks': ['name-in-fireworks', 'congratulations-fireworks'],
    'halloween-fireworks-ecard': ['name-in-fireworks', 'birthday-fireworks'],
    'new-years-eve-virtual-fireworks': ['name-in-fireworks', 'love-you-fireworks', 'silent-fireworks'],
    'name-in-fireworks': ['birthday-fireworks', 'love-you-fireworks', 'congratulations-fireworks'],
    'silent-fireworks': ['love-you-fireworks', 'new-years-eve-virtual-fireworks'],
    'gift-for-someone-who-has-everything': ['birthday-fireworks', 'love-you-fireworks', 'name-in-fireworks'],
}
REQUIRED = ['title', 'description', 'h1', 'lead', 'image', 'alt', 'crumb', 'occasion', 'cta', 'card', 'blurb']


def read(slug):
    text = open(os.path.join(SOURCE, slug + '.html'), encoding='utf-8').read()
    match = re.match(r'\s*<!--\n(.*?)\n-->\s*(.*)\Z', text, re.S)
    if not match:
        sys.exit(f'{slug}: the fragment must start with a <!-- key: value --> block')
    meta = {}
    for line in match.group(1).split('\n'):
        if line.strip():
            key, _, value = line.partition(':')
            meta[key.strip()] = value.strip()
    missing = [key for key in REQUIRED if not meta.get(key)]
    if missing:
        sys.exit(f'{slug}: missing {", ".join(missing)}')
    meta['slug'] = slug
    meta['body'] = match.group(2).strip()
    return meta


def make_link(page):
    link = f'/?make={page["occasion"]}'
    if page.get('text'):
        link += '&text=' + quote(page['text'])
    return link


def esc(value):
    return html.escape(value, quote=True)


def cards(pages):
    items = ''.join(
        f'<li><a href="/{p["slug"]}"><strong>{esc(p["card"])}</strong><span>{esc(p["blurb"])}</span></a></li>' for p in pages
    )
    return f'<ul class="cards">{items}</ul>'


def page_html(page, pages):
    url = f'{SITE}/{page["slug"]}'
    image = f'{SITE}/src/og/{page["image"]}'
    is_hub = page.get('type') == 'hub'
    crumbs = [('SkyGreeting', f'{SITE}/', '/'), ('Ideas', f'{SITE}/ideas', '/ideas')]
    if not is_hub:
        crumbs.append((page['crumb'], url, None))
    else:
        crumbs = crumbs[:1] + [('Ideas', url, None)]
    ld = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        'itemListElement': [{'@type': 'ListItem', 'position': i + 1, 'name': name, 'item': item} for i, (name, item, _) in enumerate(crumbs)],
    }
    trail = ' › '.join(f'<a href="{href}">{esc(name)}</a>' if href else f'<span aria-current="page">{esc(name)}</span>' for name, _, href in crumbs)
    body = page['body'].replace('{{cards}}', cards(pages))
    more = ''
    if not is_hub:
        by_slug = {p['slug']: p for p in pages}
        related = [by_slug[slug] for slug in RELATED[page['slug']]]
        more = f'<section class="related" aria-labelledby="related-title"><h2 id="related-title">More greeting ideas</h2>{cards(related)}<p><a href="/ideas">All the ideas →</a></p></section>'
    cta = f'<p class="actions"><a class="cta" data-sg-make href="{esc(make_link(page))}">{esc(page["cta"])}</a></p>'
    return f'''<!doctype html>
<html lang="en">
<head>
<!-- Made by tools/make-ideas.py from tools/ideas/{page["slug"]}.html. Edit that, not this file. -->
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(page["title"])}</title>
<meta name="description" content="{esc(page["description"])}">
<link rel="canonical" href="{url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="SkyGreeting">
<meta property="og:title" content="{esc(page["title"])}">
<meta property="og:description" content="{esc(page["description"])}">
<meta property="og:image" content="{image}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:url" content="{url}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{esc(page["title"])}">
<meta name="twitter:description" content="{esc(page["description"])}">
<meta name="twitter:image" content="{image}">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#161e38">
<link rel="stylesheet" href="/src/pages.css">
<link rel="modulepreload" href="/src/analytics.js">
<script type="module" src="/src/analytics.js"></script>
<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>
</head>
<body>
<main>
<nav class="crumbs" aria-label="Breadcrumb">{trail}</nav>
<h1>{esc(page["h1"])}</h1>
<p class="lead">{esc(page["lead"])}</p>
{cta}
<p class="offer">Free greeting, or Deluxe for <span data-sg-price>$4.99</span> once per greeting. <a href="/about#pricing">What’s included</a></p>
<figure class="hero"><img src="/src/og/{page["image"]}" width="1200" height="630" alt="{esc(page["alt"])}" fetchpriority="high"></figure>
{body}
{cta if not is_hub else ""}
{more}
</main>
<footer>
<p><a href="/">SkyGreeting</a> · <a href="/ideas">Ideas</a> · <a href="/about">About &amp; pricing</a> · <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a> · <a href="/find">Lost a link?</a></p>
<p>skygreeting.com · <a href="mailto:hello@skygreeting.com">hello@skygreeting.com</a></p>
</footer>
</body>
</html>
'''


def main():
    target = sys.argv[1] if len(sys.argv) > 1 else ROOT
    pages = [read(slug) for slug in ORDER]
    hub = read('ideas')
    everything = pages + [hub]
    for page in everything:
        out = os.path.join(target, page['slug'] + '.html')
        content = page_html(page, pages)
        with open(out, 'w', encoding='utf-8', newline='\n') as handle:
            handle.write(content)
        print(f'wrote {page["slug"]}.html  ({len(content):,} bytes)')


if __name__ == '__main__':
    main()
