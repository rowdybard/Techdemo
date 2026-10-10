// Run alone: functional menu/payment-state checks with local API fixtures and software WebGL.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { config as original } from '../src/config.js';
import { takeDesign } from '../src/design.js';
const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, '.check');
let price = 199, checkoutCalls = 0;
const types = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
const quote = () => ({ priceCents: price, regularPriceCents: 499, currency: 'USD', promotion: { active: price === 199, id: 'launch-30days', start: null, end: null }, serverNow: Date.now() });
const server = createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  if (path === '/api/config') return void response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(quote()));
  if (path === '/api/greeting') {
    const paid = new URL(request.url, 'http://localhost').searchParams.get('id') === 'PAID1234';
    return void response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ status: paid ? 'paid' : 'free', deluxe: paid, occasion: 'birthday', message: 'OLD GIFT WORDS', message2: '', to: 'SAM', from: 'A FRIEND', look: { ver: 2, design: takeDesign(original) } }));
  }
  if (path === '/api/checkout') {
    checkoutCalls++;
    let body = ''; for await (const chunk of request) body += chunk;
    const parsed = JSON.parse(body);
    if (checkoutCalls === 1) { assert.equal(parsed.expectedPriceCents, 199); price = 499; return void response.writeHead(409, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'price_changed', ...quote() })); }
    assert.equal(parsed.expectedPriceCents, 499);
    return void response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ url: '/?canceled=1', transactionId: '01234567-89ab-4def-8123-456789abcdef' }));
  }
  const file = resolve(root, `.${path === '/' ? '/index.html' : path}`);
  if (!file.startsWith(root)) return void response.writeHead(403).end();
  try {
    let body = await readFile(file);
    if (path === '/src/main.js') body = body.toString().replace(/resize\(\);\r?\n  resizeObserver.observe\(container\);/, 'window.__ctx = ctx; resize();\n  resizeObserver.observe(container);');
    response.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' }).end(body);
  }
  catch { response.writeHead(404).end(); }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  await mkdir(out, { recursive: true });
  for (const [name, viewport] of process.argv.some((arg) => ['--gift-only', '--waterfall-only'].includes(arg)) ? [] : [['desktop', { width: 1280, height: 720 }], ['phone', { width: 390, height: 844 }]]) {
    price = 199; checkoutCalls = 0;
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: name === 'phone', hasTouch: name === 'phone' });
    await context.route(/googletagmanager\.com|google-analytics\.com/, (route) => route.fulfill({ status: 204, body: '' }));
    const page = await context.newPage(), errors = [];
    page.setDefaultTimeout(30000);
    page.on('pageerror', (error) => { errors.push(error.message); console.error(error.message); });
    await page.goto(url, { timeout: 90000 });
    console.log(`${name}: loaded`);
    await page.locator('.studio-open').click();
    // Looks read as free to send; the Deluxe price is said once, above them.
    await page.locator('.studio-making').filter({ hasText: '$1.99' }).waitFor();
    assert.equal(await page.locator('.studio-card-tier').first().textContent(), 'Free');
    await page.getByRole('button', { name: '🏔️ Frozen lake', exact: true }).click();
    await page.getByLabel('Ice & water').waitFor();
    await page.getByText('More options', { exact: true }).click();
    assert.equal(await page.getByText('Beach details', { exact: true }).isVisible(), false);
    await page.getByRole('button', { name: 'Advanced settings', exact: true }).click();
    assert.equal(await page.locator('.panel').isVisible(), true);
    await page.getByRole('button', { name: '← Back to Customize', exact: true }).click();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    console.log(`${name}: lake and Advanced navigation passed`);
    await page.locator('.send-open').click();
    await page.getByLabel('Message', { exact: true }).fill('HAPPY TEST DAY');
    await page.getByRole('radio', { name: /^Free version/ }).click();
    assert.equal(await page.getByRole('button', { name: 'Send free greeting', exact: true }).isEnabled(), true);
    await page.getByRole('button', { name: '🎨 Customize the show', exact: true }).click();
    await page.getByRole('button', { name: /Galaxy Saturns/ }).click();
    assert.equal(await page.locator('.studio-candidate').isVisible(), true);
    await page.getByRole('button', { name: 'Back to my chosen show', exact: true }).click();
    await page.getByRole('switch', { name: 'Side-barge fountains · Deluxe', exact: true }).check();
    await page.getByRole('button', { name: 'Use Deluxe · $1.99 launch price', exact: true }).click();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    assert.equal(await page.getByLabel('Message', { exact: true }).inputValue(), 'HAPPY TEST DAY');
    await page.getByRole('button', { name: 'Preview the show', exact: true }).click();
    // Previewing the chosen version again keeps the choice: lit, and checkout ready.
    await page.getByRole('radio', { name: /^Deluxe preview/ }).click();
    assert.equal(await page.locator('.builder-use').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('.builder-use').textContent(), '✓ Deluxe chosen');
    assert.equal(await page.locator('.builder-bar .send-primary').isEnabled(), true);
    assert.equal(await page.locator('.builder-film').isVisible(), false, 'A Deluxe preview must not offer a free video');
    await page.getByRole('radio', { name: /^Free preview/ }).click();
    assert.equal(await page.locator('.builder-bar .send-primary').isDisabled(), true);
    await page.getByRole('button', { name: 'Use Free', exact: true }).click();
    assert.equal(await page.locator('.builder-use').textContent(), '✓ Free chosen');
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    console.log(`${name}: explicit candidate/preview versions passed`);
    await page.getByRole('radio', { name: /^Full Deluxe show/ }).click();
    await page.getByRole('button', { name: 'Continue to checkout · $1.99', exact: true }).click();
    await page.getByText('The price changed.', { exact: false }).waitFor();
    assert.equal(checkoutCalls, 1, 'Price change must require another deliberate click');
    await page.getByRole('button', { name: 'Continue to checkout · $4.99', exact: true }).click();
    await page.getByText('Checkout canceled. Your greeting is ready to edit.', { exact: true }).waitFor({ timeout: 90000 });
    assert.equal(await page.getByLabel('Message', { exact: true }).inputValue(), 'HAPPY TEST DAY');
    assert.equal(await page.getByRole('radio', { name: /^Full Deluxe show/ }).getAttribute('aria-checked'), 'true');
    await page.screenshot({ path: join(out, `ui-${name}-checkout-cancel.png`) });
    await page.getByRole('button', { name: '🎨 Customize the show', exact: true }).click();
    await page.getByText('More options', { exact: true }).click();
    await page.getByRole('button', { name: 'Advanced settings', exact: true }).click();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.studio').isVisible(), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.builder').isVisible(), true);
    await page.getByRole('button', { name: '🎨 Customize the show', exact: true }).click();
    await page.screenshot({ path: join(out, `ui-${name}-lake-customize.png`) });
    await page.getByLabel('Ice & water').scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(out, `ui-${name}-lake-settings.png`) });
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`PASS ${name}: scene capabilities, Advanced return, explicit tier/candidate selection, price change, checkout draft recovery, Escape`);
  }
  if (!process.argv.includes('--waterfall-only')) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await context.route(/googletagmanager\.com|google-analytics\.com/, (route) => route.fulfill({ status: 204, body: '' }));
    const page = await context.newPage(), errors = [];
    page.setDefaultTimeout(60000); page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${url}?g=GIFT1234&sent=1`, { timeout: 90000 });
    await page.waitForFunction(() => window.__ctx?.fireworks);
    await page.evaluate(() => { window.__ctx.config.loop.maxDt = 2; });
    await page.locator('.gift-card:not(.gift-watching) .gift-report').click();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Make one for someone else', exact: true }).waitFor({ state: 'visible' });
    assert.equal(await page.getByText('✓ Paid. Your SkyGreeting is ready to send', { exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => window.dataLayer?.some((args) => args[0] === 'event' && args[1] === 'purchase') || false), false);
    await page.getByRole('button', { name: 'Make one for someone else', exact: true }).click();
    await page.getByLabel('Message', { exact: true }).fill('NEW GREETING');
    await page.waitForTimeout(2500);
    assert.equal(await page.getByLabel('Message', { exact: true }).inputValue(), 'NEW GREETING');
    assert.equal(await page.evaluate(() => window.__ctx.config.look.text), 'NEW GREETING');
    assert.equal(new URL(page.url()).search, '');
    console.log('gift: sender/recipient navigation passed');
    await page.goto(`${url}?g=PAID1234`, { timeout: 90000 });
    await page.getByRole('button', { name: 'Open without sound', exact: true }).waitFor();
    await page.evaluate(() => { window.__ctx.config.sound.enabled = true; window.__ctx.config.sound.volume = 0.8; });
    await page.getByRole('button', { name: 'Open without sound', exact: true }).click();
    assert.equal(await page.evaluate(() => window.__ctx.config.sound.enabled), false, 'Quiet opening must override an existing sound preference');
    let takedownRequest;
    await page.route('**/api/taken-down?**', (route) => { takedownRequest = route; });
    await page.goto(`${url}?o=birthday&msg=OLD%20GIFT%20WORDS`, { timeout: 90000 });
    await page.waitForFunction(() => window.__ctx?.director);
    await page.evaluate(() => { window.__ctx.config.loop.maxDt = 2; });
    await page.waitForFunction(() => window.__ctx.director.active);
    assert(takedownRequest, 'The long greeting must check takedown status');
    await takedownRequest.fulfill({ status: 200, contentType: 'application/json', body: '{"hidden":true}' });
    await page.getByText('This SkyGreeting has been taken down.', { exact: true }).waitFor();
    const frames = await page.locator('canvas').first().evaluate((canvas) => canvas.sgRenderedFrames);
    await page.waitForFunction((before) => document.querySelector('canvas').sgRenderedFrames > before + 2, frames);
    assert.deepEqual(await page.evaluate(() => ({ text: window.__ctx.config.look.text, weight: window.__ctx.config.look.mix.text, playing: window.__ctx.director.active })), { text: '', weight: 0, playing: false });
    await page.goto(`${url}?g=GIFT1234`, { timeout: 90000 });
    await page.waitForFunction(() => window.__ctx?.fireworks);
    await page.evaluate(() => { window.__ctx.config.loop.maxDt = 2; });
    await page.locator('.gift-card:not(.gift-watching)').getByRole('button', { name: 'Play with the show', exact: true }).click();
    assert.equal(new URL(page.url()).search, '');
    assert.deepEqual(errors, []);
    await page.screenshot({ path: join(out, 'ui-gift-return.png') });
    await context.close();
    console.log('PASS gift: Free sent=1 cannot imply payment, report Escape returns, new greeting clears old words, leaving clears private URL, quiet opening, late takedown');
  }
  if (process.argv.includes('--waterfall-only')) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await context.route(/googletagmanager\.com|google-analytics\.com/, (route) => route.fulfill({ status: 204, body: '' }));
    const page = await context.newPage();
    await page.goto(url, { timeout: 90000 });
    await page.waitForFunction(() => window.__ctx?.fountains);
    const start = await page.evaluate(() => {
      const ctx = window.__ctx;
      ctx.config.show.autoLaunch = false; ctx.config.fountains.sideBarges = false;
      ctx.config.fountains.style = 'waterfall'; ctx.config.fountains.duration = 20;
      ctx.fountains.play('waterfall');
      return ctx.fireworks.pool.mesh.material.uniforms.uTime.value;
    });
    await page.waitForFunction((start) => window.__ctx.fireworks.pool.mesh.material.uniforms.uTime.value >= start + 2, start, { timeout: 90000 });
    await page.evaluate(() => { window.__ctx.config.loop.timeScale = 0; });
    await page.screenshot({ path: join(out, 'ui-waterfall-grounded.png') });
    await context.close();
    console.log('Waterfall grounded visual saved: .check/ui-waterfall-grounded.png');
  }
} finally { await browser.close(); await new Promise((done) => server.close(done)); }
