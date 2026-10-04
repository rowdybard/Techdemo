#!/usr/bin/env node
// The TikTok LIVE bridge. One local server that:
//   - serves the site, so the stream page is http://localhost:8787/?live=1
//   - listens to TikTok LIVE (or the simulator) and runs the events through rules.mjs
//   - sends the resulting show actions to every open stream page (Server-Sent Events)
//   - serves the admin page at /live/admin: approve dedications, fire test events
//
//   TIKTOK_USERNAME=yourname node live/server.mjs     real chat, gifts and likes
//   node live/server.mjs --sim                        a pretend audience
//
// Listens on 127.0.0.1 only unless HOST is set: the admin routes have no login.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRules } from './rules.mjs';
import { settings } from './settings.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ADMIN = fileURLToPath(new URL('./admin.html', import.meta.url));
const PORT = Number(process.env.PORT) || 8787;
const HOST = process.env.HOST || '127.0.0.1';
const username = (process.env.TIKTOK_USERNAME || '').replace(/^@/, '').trim();
const simulate = process.argv.includes('--sim') || !username;
if (process.env.DEDICATIONS === 'auto' || process.env.DEDICATIONS === 'manual') settings.dedications = process.env.DEDICATIONS;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain',
};

const rules = createRules(settings);
const pages = new Set(); // open stream pages (SSE responses)
const log = [];
const status = { source: '', state: 'starting', room: '', viewers: 0, message: '' };

function note(line) {
  const stamped = `${new Date().toLocaleTimeString()}  ${line}`;
  console.log(stamped);
  log.push(stamped);
  if (log.length > 80) log.shift();
}

function broadcast(actions) {
  for (const action of actions) {
    const frame = `data: ${JSON.stringify(action)}\n\n`;
    for (const page of pages) page.write(frame);
    if (action.do !== 'likes' && action.do !== 'leaders') note(`→ ${describe(action)}`);
  }
}

function describe(action) {
  const { do: kind, ...rest } = action;
  return `${kind} ${Object.entries(rest).map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' ')}`;
}

function onEvent(event) {
  if (event.kind === 'chat' && process.env.LIVE_DEBUG) note(`chat ${event.name}: ${event.text}`);
  if (event.kind === 'gift') note(`gift ${event.name}: ${event.gift} ×${event.count} (${event.diamonds}💎 each)`);
  try {
    broadcast(rules.handle(event));
  } catch (error) {
    note(`rules error: ${error.message}`);
  }
}

function onStatus(change) {
  Object.assign(status, change);
}

const source = simulate
  ? (await import('./sources/sim.mjs')).createSource({ rate: Number(process.env.SIM_RATE) || 1 }, onEvent, onStatus)
  : (await import('./sources/tiktok.mjs')).createSource(
    { username, signApiKey: process.env.EULER_API_KEY || undefined, debug: Boolean(process.env.LIVE_DEBUG), log: note },
    onEvent, onStatus);
status.source = source.name;

async function body(request) {
  let text = '';
  for await (const chunk of request) {
    text += chunk;
    if (text.length > 4096) throw new Error('too large');
  }
  return text ? JSON.parse(text) : {};
}

function json(response, code, data) {
  response.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(data));
}

const server = createServer(async (request, response) => {
  const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  try {
    if (path === '/live/events') {
      response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      response.write('retry: 2000\n\n');
      for (const action of rules.snapshot()) response.write(`data: ${JSON.stringify(action)}\n\n`);
      pages.add(response);
      request.on('close', () => pages.delete(response));
      return;
    }
    if (path === '/live/admin') {
      return void response.writeHead(200, { 'content-type': TYPES['.html'], 'cache-control': 'no-store' }).end(await readFile(ADMIN));
    }
    if (path === '/live/api/state') {
      return json(response, 200, { status, pages: pages.size, dedications: settings.dedications, ...rules.state(), log: log.slice(-40) });
    }
    if (request.method === 'POST' && path.startsWith('/live/api/')) {
      const data = await body(request);
      const id = Number(data.id);
      if (path === '/live/api/approve') broadcast(rules.approve(id));
      else if (path === '/live/api/reject') rules.reject(id);
      else if (path === '/live/api/event') onEvent({ userId: 'admin', name: 'admin', ...data });
      else if (path === '/live/api/finale') broadcast([{ do: 'finale', reason: 'Grand finale!' }]);
      else if (path === '/live/api/mode') settings.dedications = data.mode === 'auto' ? 'auto' : 'manual';
      else return json(response, 404, { error: 'no such action' });
      return json(response, 200, { ok: true });
    }
    // The one server route the page calls on load (worker/index.js answers it on the site).
    if (path === '/api/config') return json(response, 200, { priceCents: 499 });

    const file = resolve(ROOT, `.${path.endsWith('/') ? `${path}index.html` : path}`);
    // The site only: nothing outside the repo, no dot-files (.git, .env) and no node_modules.
    if (!file.startsWith(ROOT) || /(^|\/)(\.|node_modules)/.test(file.slice(ROOT.length))) {
      return void response.writeHead(403).end();
    }
    const content = await readFile(file);
    response.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' }).end(content);
  } catch (error) {
    if (!response.headersSent) response.writeHead(error.code === 'ENOENT' || error.code === 'EISDIR' ? 404 : 400).end();
  }
});

// A comment every 15 s keeps idle connections open through proxies and sleep.
setInterval(() => {
  for (const page of pages) page.write(': ping\n\n');
}, 15000).unref();

server.listen(PORT, HOST, () => {
  note(`source: ${source.name}${simulate && !username ? ' (set TIKTOK_USERNAME to use your LIVE)' : ''}`);
  note(`stream page: http://localhost:${PORT}/?live=1`);
  note(`admin page:  http://localhost:${PORT}/live/admin`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await source.stop();
    process.exit(0);
  });
}
