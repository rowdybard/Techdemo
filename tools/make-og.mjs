#!/usr/bin/env node
// Renders the 1200x630 pictures in src/og/: the preview image of a greeting's link (one per
// occasion, see worker/index.js) and the pictures on the ideas pages. Each is a real frame of
// the show: the page opens a greeting link, the ending plays, and the scene's own clock is
// frozen at the chosen moment (software WebGL runs at a few frames a second, so wall-clock
// time would catch the wrong moment). Nothing in the app changes: a hook is added to main.js
// as the page is served.
//
//   node tools/make-og.mjs --sheet birthday 7,8,9   contact sheet of those moments (seconds into the ending), and every frame
//                                                    saved as .check/og/birthday-<seconds>.jpg. Slow: the scene runs at about a fifth of
//                                                    real time, so budget a minute of waiting per second of show.
//   node tools/make-og.mjs --pick birthday=7         copies the saved frame at that moment into src/og/birthday.jpg
//   node tools/make-og.mjs birthday=9.5              renders src/og/birthday.jpg afresh from 9.5 s into the ending
//   node tools/make-og.mjs --all                     renders every picture at its moment in JOBS below. Each run is a little
//                                                    different (the shells are random), so a picture is kept once chosen: look at
//                                                    a sheet and use --pick rather than re-rendering.
//
// Needs `npm install` once (Playwright).
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json' };

// name: the file (src/og/<name>.jpg). o, msg, msg2, to: the greeting link. at: seconds into the
// ending to freeze on. sky: optional time of day (0 sunset, 1 midnight).
const JOBS = {
  birthday: { o: 'birthday', msg: 'HAPPY BIRTHDAY', at: 6.8 },
  love: { o: 'love', msg: 'I LOVE YOU', at: 7.3 },
  congrats: { o: 'congrats', msg: 'CONGRATULATIONS', at: 7 },
  thanks: { o: 'thanks', msg: 'THANK YOU', at: 10.2 },
  newyear: { o: 'newyear', msg: 'HAPPY NEW YEAR', at: 15.6 }, // the clock at 3, shells climbing
  names: { o: 'birthday', msg: 'HAPPY BIRTHDAY', to: 'SOPHIE', at: 11.6 },
  gift: { o: 'love', msg: 'FOR YOU', at: 10.6 },
  calm: { o: 'birthday', msg: 'HAPPY BIRTHDAY', at: 8 },
  // halloween.jpg was rendered earlier and is kept as it is.
};

const server = createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url, 'http://x').pathname);
  if (path === '/api/config') return void response.writeHead(200, { 'content-type': 'application/json' }).end('{"priceCents":499}');
  if (path.startsWith('/api/')) return void response.writeHead(404).end('{}');
  const file = join(ROOT, path === '/' ? 'index.html' : path);
  if (!file.startsWith(ROOT) || !existsSync(file)) return void response.writeHead(404).end('not found');
  response.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(readFileSync(file));
}).listen(0);
await new Promise((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = process.argv[2] === '--pick' ? { close() {} } : await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

/** Opens the greeting for `job`, waits for its ending to start, and calls shoot(seconds) for each moment, in order. */
async function run(job, moments, shoot) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.route('**/src/main.js', async (route) => {
    const body = (await (await route.fetch()).text()).replace('  resize();\n  resizeObserver.observe(container);', '  window.__ctx = ctx;\n  resize();\n  resizeObserver.observe(container);');
    route.fulfill({ contentType: 'text/javascript', body });
  });
  const query = new URLSearchParams({ o: job.o, msg: job.msg, from: 'a friend' });
  if (job.to) query.set('to', job.to);
  await page.goto(`${base}/?${query}`, { waitUntil: 'domcontentloaded' });
  await page.addStyleTag({ content: '.site-links, .send-open, .studio-open, .walk-hint, .gift-card, .debug, .video-pill, .loader { display: none !important; }' });
  await page.waitForFunction(() => window.__ctx && window.__ctx.director && window.__ctx.fireworks && window.__ctx.fireworks.pool, null, { timeout: 120000 });
  const now = () => page.evaluate(() => window.__ctx.fireworks.pool.mesh.material.uniforms.uTime.value);
  await page.evaluate(() => { window.__ctx.config.loop.maxDt = 0.2; });
  await page.waitForFunction(() => window.__ctx.director.active, null, { timeout: 120000, polling: 100 });
  const start = await now();
  if (job.sky !== undefined) await page.evaluate((sky) => { window.__ctx.config.sky.timeOfDay = sky; }, job.sky);
  await page.evaluate(() => { window.__ctx.config.loop.maxDt = 0.06; }); // small steps, so a frozen frame lands close to its moment
  for (const seconds of moments) {
    while ((await now()) < start + seconds) await page.waitForTimeout(80);
    await page.evaluate(() => { window.__ctx.config.loop.timeScale = 0; });
    await page.waitForTimeout(350); // a frame or two to draw the frozen moment
    await shoot(page, seconds);
    await page.evaluate(() => { window.__ctx.config.loop.timeScale = 1; });
  }
  await page.close();
}

const args = process.argv.slice(2);
let failed = false;
try {
  if (args[0] === '--sheet') {
    const name = args[1];
    const job = JOBS[name];
    if (!job) throw new Error(`unknown picture "${name}" (${Object.keys(JOBS).join(', ')})`);
    const times = (args[2] || '6,7,8,9,10,11,12,13').split(',').map(Number);
    mkdirSync(join(ROOT, '.check/og'), { recursive: true });
    const frames = [];
    await run(job, times, async (page, seconds) => {
      const picture = await page.screenshot({ type: 'jpeg', quality: 85, timeout: 180000 });
      writeFileSync(join(ROOT, `.check/og/${name}-${seconds}.jpg`), picture);
      frames.push([seconds, picture.toString('base64')]);
    });
    const sheet = await browser.newPage({ viewport: { width: 1600, height: 320 * Math.ceil(frames.length / 4) } });
    await sheet.setContent(`<body style="margin:0;background:#000;display:grid;grid-template-columns:repeat(4,400px)">${frames.map(([s, b]) => `<figure style="margin:0;position:relative"><img src="data:image/jpeg;base64,${b}" width="400"><figcaption style="position:absolute;left:6px;top:4px;color:#fff;font:14px sans-serif;text-shadow:0 0 3px #000">${name} ${s}s</figcaption></figure>`).join('')}</body>`);
    await sheet.screenshot({ path: join(ROOT, `.check/og/${name}.jpg`), type: 'jpeg', quality: 85 });
    console.log(`.check/og/${name}.jpg  (moments ${times.join(', ')} s)`);
  } else if (args[0] === '--pick') {
    for (const arg of args.slice(1)) {
      const [name, seconds] = arg.split('=');
      const saved = join(ROOT, `.check/og/${name}-${seconds}.jpg`);
      if (!existsSync(saved)) throw new Error(`no saved frame ${saved}; run --sheet ${name} ${seconds} first`);
      writeFileSync(join(ROOT, `src/og/${name}.jpg`), readFileSync(saved));
      console.log(`src/og/${name}.jpg  <-  ${name} at ${seconds} s`);
    }
  } else {
    const todo = args[0] === '--all' ? Object.keys(JOBS).map((name) => [name, JOBS[name].at]) : args.map((arg) => arg.split('=')).map(([name, at]) => [name, Number(at ?? JOBS[name]?.at)]);
    for (const [name, at] of todo) {
      const job = JOBS[name];
      if (!job || !Number.isFinite(at)) throw new Error(`bad picture "${name}"`);
      await run(job, [at], async (page) => {
        writeFileSync(join(ROOT, `src/og/${name}.jpg`), await page.screenshot({ type: 'jpeg', quality: 82, timeout: 180000 }));
        console.log(`wrote src/og/${name}.jpg from ${at} s`);
      });
    }
  }
} catch (error) {
  console.error(error.message);
  failed = true;
}
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
