#!/usr/bin/env python3
"""Builds the claude.ai preview artifact's page from index.html.

A claude.ai artifact is one HTML fragment plus supporting files, and it may only load
scripts from a few CDNs. So the copy differs from the real page: no <html>/<head>
wrapper, three.js and lil-gui from jsDelivr (the site serves its own copies from
vendor/), no Google Analytics, no icon links.

Usage: python3 tools/make-preview.py [OUT_DIR]      (default: .preview/)
Writes OUT_DIR/index.html and prints the `files` map to pass to the Artifact tool
along with it (every src/*.js and src/studio.css), e.g. as JSON.
"""
import json
import os
import re
import sys

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(root, '.preview')
os.makedirs(out, exist_ok=True)

page = open(os.path.join(root, 'index.html')).read()
for pattern in [r'<!doctype html>\n', r'<html lang="en">\n', r'<head>\n', r'<meta charset="utf-8">\n', r'<meta name="viewport"[^>]*>\n', r'</head>\n', r'<body>\n', r'</body>\n', r'</html>\n']:
    page, count = re.subn(pattern, '', page, count=1)
    assert count == 1, f'index.html no longer matches {pattern}'
page = page.replace('./vendor/three-0.186.1/', 'https://cdn.jsdelivr.net/npm/three@0.186.1/')
page = page.replace('./vendor/lil-gui-0.21.0/', 'https://cdn.jsdelivr.net/npm/lil-gui@0.21.0/')
page = re.sub(r'<script>\n  // Google Analytics.*?</script>\n', '', page, flags=re.S)
page = re.sub(r'<link rel="(icon|apple-touch-icon|manifest)"[^>]*>\n', '', page)
open(os.path.join(out, 'index.html'), 'w').write(page)

src = os.path.join(root, 'src')
files = {f'src/{name}': os.path.join(src, name) for name in sorted(os.listdir(src)) if name.endswith(('.js', '.css'))}
print(json.dumps(files))
