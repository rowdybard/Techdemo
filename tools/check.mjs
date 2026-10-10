#!/usr/bin/env node
// Headless check for the scene. It serves the repo, opens the page in Chromium at a
// desktop and a phone size, reports console problems and the debug overlay's numbers,
// saves screenshots, then presses Shift+R over and over and compares memory counters
// with the first start. It then does the same on the frozen lake (the other place), and
// switches between the two places over and over to check that nothing is left behind.
//
//   npm install                   once; then `npx playwright install chromium` if Chromium is missing
//   npm run check                 20 rebuilds, screenshots in .check/
//   npm run check -- --cycles 5 --wait 2
//   npm run check -- --soak 600   also runs the Finale preset for 10 minutes and samples
//                                 the counts and heap every 30 s; they should stay flat
//
// Chromium draws with SwiftShader (software WebGL) so this runs on machines with no GPU.
// That makes the FPS it reports meaningless; judge speed on real hardware. SwiftShader
// also drops line segments that cross behind the camera, so a screenshot can miss lines
// that a real GPU draws.

import { createServer } from 'node:http';
import { access, mkdir, readFile, readdir } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, '.check');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};
// Counts that must come back to their startup values after every rebuild.
const STABLE = ['calls', 'geometries', 'textures', 'programs'];
const WARM_UP = 5; // rebuilds before the memory baseline

const { values: options } = parseArgs({
  options: {
    cycles: { type: 'string', default: '20' },
    wait: { type: 'string', default: '3' },
    soak: { type: 'string', default: '0' },
  },
});
const soakSeconds = Number(options.soak);
const cycles = Number(options.cycles);
const waitMs = Number(options.wait) * 1000;

const server = createServer(async (request, response) => {
  const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  // The one server route the page calls on load (worker/index.js answers it live).
  if (path === '/api/config') {
    return void response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({priceCents:499,regularPriceCents:499,currency:'USD',serverNow:Date.now(),payments:true,promotion:{active:false,id:'launch-30days',start:null,end:null}}));
  }
  const file = resolve(ROOT, `.${path.endsWith('/') ? `${path}index.html` : path}`);
  if (!file.startsWith(ROOT)) return void response.writeHead(403).end();
  try {
    const body = await readFile(file);
    response.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    response.end(body);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const url = `http://127.0.0.1:${server.address().port}/`;

// Cloud sandboxes reach the CDN through a proxy; a local run usually has none. Chromium's
// own flag is used because Playwright's proxy option also routes 127.0.0.1 through it.
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const browser = await chromium.launch({
  args: [
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--enable-precise-memory-info',
    ...(proxy ? [`--proxy-server=${proxy}`] : []),
  ],
});

let failed = false;
try {
  await mkdir(OUT, { recursive: true });
  console.log(`Scene check · ${url}\n`);

  // One page at a time: software rendering can't keep two scenes running at once.
  const phone = await open('phone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await phone.context.close();
  const desktop = await open('desktop', { viewport: { width: 1280, height: 720 } });

  const leaks = await rebuild(desktop);
  if (soakSeconds > 0) leaks.push(...(await soak(desktop.page)));
  await desktop.context.close();

  // The frozen lake, opened as a visitor who chose it would: the saved settings say so.
  const lake = await open('lake', { viewport: { width: 1280, height: 720 } }, { place: { environment: 'lake' }, snow: { amount: 0.5 }, sky: { timeOfDay: 0.9 } });
  leaks.push(...(await rebuild(lake, { name: 'lake', warm: 2, count: Math.min(cycles, 6) })));
  leaks.push(...(await swapPlaces(lake)));
  await lake.context.close();

  const problems = [...desktop.problems, ...phone.problems, ...lake.problems, ...(await preloadProblems())];
  console.log(problems.length ? `\nConsole problems:\n  ${problems.join('\n  ')}` : '\nConsole: clean');
  console.log(`Screenshots: ${['desktop', 'phone', 'rebuilt', 'lake', 'lake-rebuilt'].map((name) => relative(ROOT, join(OUT, `${name}.png`))).join(', ')}`);
  failed = problems.length > 0 || leaks.length > 0;
  console.log(failed ? '\nFAIL' : '\nPASS');
} finally {
  await browser.close();
  server.close();
}
process.exitCode = failed ? 1 : 0;

// Load time depends on index.html preloading every module (see the comment there): a
// module left off the list is fetched only after the file importing it, restarting the
// chain. Reports modules imported but not preloaded, and preloads of files that are gone.
async function preloadProblems() {
  const html = await readFile(join(ROOT, 'index.html'), 'utf8');
  const preloaded = new Set([...html.matchAll(/<link rel="modulepreload" href="([^"]+)">/g)].map((m) => m[1]));
  const files = (await readdir(join(ROOT, 'src'))).filter((name) => name.endsWith('.js'));
  const wanted = new Set();
  for (const name of files) {
    const source = await readFile(join(ROOT, 'src', name), 'utf8');
    for (const [, spec] of source.matchAll(/from '([^']+)'/g)) {
      if (spec.startsWith('./')) wanted.add(`./src/${spec.slice(2)}`);
      else if (spec.startsWith('three/addons/')) wanted.add(`./vendor/three-0.186.1/examples/jsm/${spec.slice(13)}`);
    }
  }
  wanted.add('./src/main.js');
  const out = [];
  for (const href of wanted) if (!preloaded.has(href)) out.push(`not preloaded in index.html: ${href}`);
  for (const href of preloaded) {
    if (href.startsWith('./src/') && !files.includes(href.slice(6))) out.push(`preloaded but missing: ${href}`);
    if (href.startsWith('./vendor/') && !(await exists(join(ROOT, href)))) out.push(`preloaded but missing: ${href}`);
  }
  return out;
}

async function open(name, contextOptions, saved = null) {
  const context = await browser.newContext(contextOptions);
  // Settings a visitor would have saved (the page reads them as it starts).
  if (saved) await context.addInitScript((json) => localStorage.setItem('beach-fireworks-settings', json), JSON.stringify(saved));
  // Google Analytics is answered here, so a test run never reaches it (or counts as a visit).
  await context.route(/googletagmanager\.com|google-analytics\.com/, (route) => route.fulfill({ status: 204, body: '' }));
  const page = await context.newPage();
  const problems = watch(page);
  await page.goto(`${url}#debug`, { timeout: 90000 }); // #debug shows the overlay this reads
  try {
    await page.waitForSelector('canvas', { timeout: 20000 });
  } catch {
    throw new Error(`No canvas on the ${name} page after 20 s.\n  ${problems.join('\n  ') || 'No console output.'}`);
  }
  await page.waitForTimeout(waitMs);
  await rendered(page);
  const overlay = await readOverlay(page);
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  const { width, height } = contextOptions.viewport;
  console.log(`${name.padEnd(8)} ${`${width}×${height}`.padEnd(9)} ${formatOverlay(overlay)}`);
  return { context, page, problems, overlay };
}

// Shift+R destroys the app and builds a new one. After many rebuilds, every counter
// should be back where it started. A few warm-up rebuilds come first (WARM_UP), so V8
// compiling the rebuild code isn't mistaken for a leak.
async function rebuild({ page, overlay }, { name = 'desktop', warm = WARM_UP, count = cycles } = {}) {
  const cdp = await page.context().newCDPSession(page);
  for (let i = 0; i < warm; i++) {
    await page.keyboard.press('Shift+R');
    await rendered(page);
  }
  await page.waitForTimeout(waitMs);
  const before = await counters(page, cdp);
  for (let i = 0; i < count; i++) {
    await page.keyboard.press('Shift+R');
    await rendered(page);
  }
  await page.waitForTimeout(waitMs);
  const after = await counters(page, cdp);
  const overlayAfter = await readOverlay(page);
  await page.screenshot({ path: join(OUT, name === 'lake' ? 'lake-rebuilt.png' : 'rebuilt.png') });

  const leaks = [];
  if (after.canvases !== 1) leaks.push(`${after.canvases} canvases on the page`);
  if (after.listeners > before.listeners) leaks.push(`${after.listeners - before.listeners} extra event listeners`);
  if (after.nodes > before.nodes + 10) leaks.push(`${after.nodes - before.nodes} extra DOM nodes`);
  if (after.heapMB > before.heapMB + 1) leaks.push(`JS heap grew ${(after.heapMB - before.heapMB).toFixed(2)} MB`);
  for (const key of STABLE) {
    if (overlayAfter[key] !== overlay[key]) leaks.push(`${key} ${overlay[key]} at start, ${overlayAfter[key]} after rebuilding`);
  }

  console.log(`\nRebuilt ${count} times with Shift+R after ${warm} warm-up rebuilds${name === 'lake' ? ' (on the lake)' : ''} (memory read after forced GC):`);
  console.log(`  canvases         ${before.canvases} → ${after.canvases}`);
  console.log(`  event listeners  ${before.listeners} → ${after.listeners}`);
  console.log(`  DOM nodes        ${before.nodes} → ${after.nodes}`);
  console.log(`  JS heap          ${before.heapMB.toFixed(2)} → ${after.heapMB.toFixed(2)} MB`);
  console.log(`  overlay          ${formatOverlay(overlayAfter)}`);
  console.log(leaks.length ? `  Leaks: ${leaks.join('; ')}` : '  No leaks: every count is back to its startup value');
  return leaks;
}

// Switches the place from the lake to the beach and back through Customize, a few times: the
// scenery of each is built and taken down in the middle of a show, and every count must come
// back to what it was on the lake.
async function swapPlaces({ page, overlay }) {
  const cdp = await page.context().newCDPSession(page);
  await page.click('.studio-open');
  const choose = async (label) => {
    await page.click(`.studio-segment:has-text("${label}")`);
    await drawnFrames(page, 8);
  };
  await choose('Beach'); // once first, so the memory baseline is a settled one
  await choose('Frozen lake');
  const before = await counters(page, cdp);
  for (let i = 0; i < 3; i++) {
    await choose('Beach');
    await choose('Frozen lake');
  }
  await settled(page); // a new place compiles its shaders and photographs itself first, slowly in software
  const after = await counters(page, cdp);
  const overlayAfter = await readOverlay(page);
  await page.click('.studio-done');
  const leaks = [];
  if (after.listeners > before.listeners) leaks.push(`${after.listeners - before.listeners} extra event listeners after switching places`);
  if (after.nodes > before.nodes + 10) leaks.push(`${after.nodes - before.nodes} extra DOM nodes after switching places`);
  if (after.heapMB > before.heapMB + 1) leaks.push(`JS heap grew ${(after.heapMB - before.heapMB).toFixed(2)} MB switching places`);
  for (const key of STABLE) {
    if (overlayAfter[key] !== overlay[key]) leaks.push(`${key} ${overlay[key]} on the lake at start, ${overlayAfter[key]} after switching places`);
  }
  console.log(`\nSwitched beach ↔ lake 3 times: heap ${before.heapMB.toFixed(2)} → ${after.heapMB.toFixed(2)} MB, listeners ${before.listeners} → ${after.listeners}`);
  console.log(`  overlay          ${formatOverlay(overlayAfter)}`);
  console.log(leaks.length ? `  Leaks: ${leaks.join('; ')}` : '  No leaks: the places come and go cleanly');
  return leaks;
}

// Waits until the draw counts stop changing (three looks in a row, two seconds and at least eight
// drawn frames apart). The frames matter on a slow machine: below a frame a second the overlay
// doesn't refresh between looks, and its stale numbers (a cube capture mid-frame) read as settled.
async function settled(page) {
  let last = '';
  let same = 0;
  for (let i = 0; i < 40 && same < 3; i++) {
    await page.waitForTimeout(2000);
    await drawnFrames(page, 8);
    const o = await readOverlay(page);
    const now = [o.calls, o.geometries, o.programs].join('/');
    same = now === last ? same + 1 : 0;
    last = now;
  }
}

// Runs the Finale preset (chosen in Customize, as a person would) and samples the counts
// and heap. The particle pool wraps many times; nothing should grow.
async function soak(page) {
  const cdp = await page.context().newCDPSession(page);
  await page.click('.studio-open');
  await page.click('.studio-card:has-text("Big finale")');
  await page.click('.studio-done');
  const samples = [];
  const started = Date.now();
  console.log(`\nSoak: Finale preset for ${soakSeconds} s`);
  while (Date.now() - started < soakSeconds * 1000) {
    await page.waitForTimeout(Math.min(30000, soakSeconds * 1000));
    const memory = await counters(page, cdp);
    const overlay = await readOverlay(page);
    samples.push({ ...memory, ...overlay });
    const t = Math.round((Date.now() - started) / 1000);
    console.log(`  ${String(t).padStart(4)} s  heap ${memory.heapMB.toFixed(2)} MB · geometries ${overlay.geometries} · textures ${overlay.textures} · programs ${overlay.programs} · particles ${overlay.pool} · listeners ${memory.listeners}`);
  }
  const problems = [];
  const first = samples[0];
  const last = samples[samples.length - 1];
  for (const key of ['geometries', 'textures', 'programs']) {
    if (samples.some((sample) => sample[key] !== first[key])) problems.push(`${key} changed during the soak`);
  }
  if (last.listeners !== first.listeners) problems.push('event listeners changed during the soak');
  // Allow the heap to saw; flag a steady climb.
  if (samples.length >= 4 && last.heapMB > first.heapMB + 2) problems.push(`heap climbed ${(last.heapMB - first.heapMB).toFixed(2)} MB during the soak`);
  console.log(problems.length ? `  Soak problems: ${problems.join('; ')}` : '  Soak: counts flat, heap steady');
  return problems;
}

async function counters(page, cdp) {
  await cdp.send('HeapProfiler.collectGarbage');
  const { usedSize } = await cdp.send('Runtime.getHeapUsage');
  const { nodes, jsEventListeners } = await cdp.send('Memory.getDOMCounters');
  const canvases = await page.locator('canvas').count();
  return { heapMB: usedSize / 1048576, nodes, listeners: jsEventListeners, canvases };
}

async function rendered(page) {
  await page.waitForFunction(() => document.querySelector('canvas')?.sgRenderedFrames >= 3 &&
    ['calls', 'geometries', 'textures', 'programs'].every((key) => Number(document.querySelector(`[data-stat="${key}"]`)?.textContent) > 0), null, { timeout: 120000 });
}
async function drawnFrames(page, count) {
  const start = await page.evaluate(() => document.querySelector('canvas')?.sgRenderedFrames || 0);
  await page.waitForFunction(({ start, count }) => document.querySelector('canvas')?.sgRenderedFrames >= start + count, { start, count }, { timeout: 120000 });
}
async function readOverlay(page) {
  const result = await page.$$eval('[data-stat]', (cells) => Object.fromEntries(cells.map((cell) => [cell.dataset.stat, cell.textContent])));
  if (STABLE.some((key) => !Number.isFinite(Number(result[key])) || Number(result[key]) <= 0)) throw new Error('Missing or unrendered debug measurements: ' + JSON.stringify(result));
  return result;
}

function formatOverlay(o) {
  return `calls ${o.calls} · triangles ${o.triangles} · geometries ${o.geometries} · textures ${o.textures} · programs ${o.programs} · particles ${o.pool} · heap ${o.heap} · canvas ${o.canvas} · fps ${o.fps}`;
}

function watch(page) {
  const problems = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') problems.push(`${message.type()}: ${message.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`uncaught: ${error.message}`));
  page.on('requestfailed', (request) => {
    const error = request.failure()?.errorText;
    // The builder's price fetch is cancelled on purpose when a rebuild disposes it (its signal);
    // on a slow machine a Shift+R can land while it's in flight. That's teardown, not a failure.
    if (error === 'net::ERR_ABORTED' && new URL(request.url()).pathname === '/api/config') return;
    problems.push(`request failed: ${request.url()} (${error})`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) problems.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  return problems;
}

async function exists(path) {
  return access(path).then(() => true, () => false);
}
