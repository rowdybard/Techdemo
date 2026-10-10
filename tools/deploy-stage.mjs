// Copy only deployable assets; works on Windows and Cloudflare's Linux builder.
import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const destination = resolve(root, '.deploy');
if (dirname(destination) !== resolve(root) || basename(destination) !== '.deploy') throw new Error('Unsafe deploy staging directory');
await rm(destination, { recursive: true, force: true });
await mkdir(destination);
const pages = (await readdir(root)).filter((name) => name.endsWith('.html'));
const assets = [...pages, 'robots.txt', 'sitemap.xml', 'favicon.ico', 'favicon.svg', 'site.webmanifest', 'icons', '_headers', 'src', 'vendor'];
for (const name of assets) await cp(join(root, name), join(destination, name), { recursive: true });
console.log(`Staged ${pages.length} HTML pages and public assets.`);
