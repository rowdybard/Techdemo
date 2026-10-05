#!/usr/bin/env node
// The YouTube Live bridge. One local server that:
//   - serves the site, so the stream page is http://localhost:8787/?live=1
//   - reads the stream's YouTube live chat (or the simulator) and runs it through rules.mjs
//   - sends the resulting show actions to every open stream page (Server-Sent Events)
//   - serves the control panel at /live/admin: connect, pause, moderate, settings, quit
//
//   node live/server.mjs                               control panel decides (saved channel)
//   YOUTUBE_CHANNEL=@yourname node live/server.mjs     join that channel's live chat at once
//   node live/server.mjs --sim                        a pretend audience
//
// What the control panel changes is saved in live/config.json (not in git).
// Listens on 127.0.0.1 only unless HOST is set: the control panel has no login.
import { createServer } from 'node:http';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRules, dollars } from './rules.mjs';
import { settings } from './settings.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ADMIN = fileURLToPath(new URL('./admin.html', import.meta.url));
const SAVED = fileURLToPath(new URL('./config.json', import.meta.url));
const PORT = Number(process.env.PORT) || 8787;
const HOST = process.env.HOST || '127.0.0.1';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain',
};

// The control panel's choices. Settings it can change are copied onto `settings`.
const TUNABLE = ['dedications', 'skyMinDiamonds', 'cooldownSeconds', 'likeGoal'];
const config = { channel: '', autoConnect: true, banned: [], preset: '', plug: '', shape: 'wide', director: true, ...pick(settings, TUNABLE) };
try {
  Object.assign(config, JSON.parse(await readFile(SAVED, 'utf8')));
} catch {
  // first run: nothing saved yet
}
Object.assign(settings, pick(config, TUNABLE));
if (process.env.DEDICATIONS === 'auto' || process.env.DEDICATIONS === 'manual') settings.dedications = process.env.DEDICATIONS;

const rules = createRules(settings);
const pages = new Set(); // open stream pages (SSE responses)
const log = [];
const viewers = []; // recent viewer events, for moderating from the control panel
let status = { source: 'none', state: 'stopped', room: '', viewers: 0, message: '' };
let source = null;
let paused = false;

function pick(from, keys) {
  return Object.fromEntries(keys.filter((key) => key in from).map((key) => [key, from[key]]));
}

async function save() {
  await writeFile(SAVED, JSON.stringify(config, null, 2)).catch((error) => note(`couldn't save settings: ${error.message}`));
}

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
    if (!['likes', 'leaders', 'prices'].includes(action.do)) note(`→ ${describe(action)}`);
  }
}

function describe(action) {
  const { do: kind, ...rest } = action;
  return `${kind} ${Object.entries(rest).map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' ')}`;
}

let roomLikes = 0; // the room's like counter last logged, so the log only notes changes

function onEvent(event) {
  if (event.kind !== 'like' && event.userId) {
    const what = event.kind === 'chat' ? event.text : event.kind === 'gift' ? `💲 ${event.gift} ${dollars(event.diamonds * (event.count || 1))}${event.said ? ` “${event.said}”` : ""}` : event.kind;
    viewers.push({ userId: event.userId, name: event.name, what: String(what).slice(0, 120), at: Date.now() });
    if (viewers.length > 40) viewers.shift();
  }
  if (event.kind === 'gift') note(`${event.gift} from ${event.name}${event.count > 1 ? ` ×${event.count}` : ''}: ${dollars(event.diamonds)}${event.count > 1 ? ' each' : ''}${event.said ? ` “${event.said}”` : ''}`);
  if (event.kind === 'like' && !event.room) note(`❤️ ${event.name || 'someone'} +${event.count} like${event.count === 1 ? '' : 's'}${event.total ? ` (room total ${event.total})` : ''}`);
  if (event.kind === 'like' && event.room && event.total > roomLikes) note(`❤️ ${(roomLikes = event.total)} likes on the stream`);
  // Gifts and likes always count; chat and the rest wait while paused, and banned viewers only count gifts.
  if (event.kind !== 'gift' && event.kind !== 'like' && paused) return;
  if (event.kind !== 'gift' && config.banned.includes(event.userId)) return;
  try {
    broadcast(rules.handle(event));
  } catch (error) {
    note(`rules error: ${error.message}`);
  }
}

function onStatus(change) {
  Object.assign(status, change);
}

async function stopSource() {
  if (source) await source.stop();
  source = null;
  status = { source: 'none', state: 'stopped', room: '', viewers: 0, message: '' };
}

async function startSource(kind, channel = '') {
  await stopSource();
  if (kind === 'sim') {
    source = (await import('./sources/sim.mjs')).createSource({ rate: Number(process.env.SIM_RATE) || 1 }, onEvent, onStatus);
  } else {
    source = (await import('./sources/youtube.mjs')).createSource(
      { target: channel, prices: { membership: settings.membershipCents }, debug: Boolean(process.env.LIVE_DEBUG), log: note },
      onEvent, onStatus);
  }
  status.source = source.name;
  note(`source: ${source.name}`);
}

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

const handlers = {
  approve: (data) => broadcast(rules.approve(Number(data.id))),
  reject: (data) => rules.reject(Number(data.id)),
  // Test events from the control panel skip the gift needed for words in the sky.
  event: (data) => onEvent({ userId: 'tester', name: 'tester', ...data, admin: data.kind === 'chat' }),
  finale: () => broadcast([{ do: 'finale', reason: 'Grand finale!' }]),
  connect: async (data) => {
    config.channel = String(data.channel || '').trim().slice(0, 200);
    if (!config.channel) throw new Error('channel needed');
    await save();
    await startSource('youtube', config.channel);
  },
  simulate: () => startSource('sim'),
  disconnect: () => stopSource(),
  pause: (data) => {
    paused = Boolean(data.paused);
    note(paused ? 'paused: chat no longer launches anything (gifts still do)' : 'resumed');
  },
  ban: async (data) => {
    const id = String(data.userId || '');
    if (id && !config.banned.includes(id)) config.banned.push(id);
    note(`banned ${id}`);
    await save();
  },
  unban: async (data) => {
    config.banned = config.banned.filter((id) => id !== String(data.userId));
    await save();
  },
  settings: async (data) => {
    if (data.dedications === 'auto' || data.dedications === 'manual') config.dedications = data.dedications;
    for (const key of ['skyMinDiamonds', 'cooldownSeconds', 'likeGoal']) {
      const value = Number(data[key]);
      if (key in data && Number.isFinite(value) && value >= 0) config[key] = Math.round(value);
    }
    if (typeof data.preset === 'string') config.preset = data.preset.slice(0, 30);
    if (typeof data.plug === 'string') config.plug = data.plug.slice(0, 40);
    if (data.shape === 'wide' || data.shape === 'tall') config.shape = data.shape;
    if (typeof data.director === 'boolean') config.director = data.director;
    if (typeof data.autoConnect === 'boolean') config.autoConnect = data.autoConnect;
    Object.assign(settings, pick(config, TUNABLE));
    broadcast(rules.snapshot().filter((action) => action.do === 'prices'));
    await save();
  },
  quit: () => {
    note('shutting down');
    setTimeout(shutdown, 200);
  },
};

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
    if (path === '/' && !request.url.includes('?')) return void response.writeHead(302, { location: '/live/admin' }).end();
    if (path === '/live/admin') {
      return void response.writeHead(200, { 'content-type': TYPES['.html'], 'cache-control': 'no-store' }).end(await readFile(ADMIN));
    }
    if (path === '/live/api/state') {
      return json(response, 200, {
        status, paused, pages: pages.size, config, ...rules.state(), viewers: viewers.slice(-20).reverse(), log: log.slice(-40),
      });
    }
    if (request.method === 'POST' && path.startsWith('/live/api/')) {
      const handler = handlers[path.slice('/live/api/'.length)];
      if (!handler) return json(response, 404, { error: 'no such action' });
      try {
        await handler(await body(request));
      } catch (error) {
        return json(response, 400, { error: error.message });
      }
      return json(response, 200, { ok: true });
    }
    // The one server route the page calls on load (worker/index.js answers it on the site).
    if (path === '/api/config') return json(response, 200, { priceCents: 499 });

    const file = resolve(ROOT, `.${path.endsWith('/') ? `${path}index.html` : path}`);
    // The site only: nothing outside the folder, no dot-files (.git, .env), node_modules or config.
    const inside = file.slice(ROOT.length).split(sep);
    if (!file.startsWith(ROOT) || inside.some((part) => part.startsWith('.') || part === 'node_modules' || part === 'node') || file === SAVED) {
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

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') console.log(`Port ${PORT} is busy: SkyGreeting LIVE is probably already running. Open http://localhost:${PORT}/live/admin`);
  else console.log(error.message);
  process.exit(1);
});

server.listen(PORT, HOST, async () => {
  note(`control panel: http://localhost:${PORT}/live/admin`);
  note(`stream page:   http://localhost:${PORT}/?live=1`);
  const channel = (process.env.YOUTUBE_CHANNEL || '').trim();
  if (process.argv.includes('--sim')) await startSource('sim');
  else if (channel) await startSource('youtube', channel);
  else if (config.channel && config.autoConnect) await startSource('youtube', config.channel);
  else note('not connected: enter your YouTube channel on the control panel');
});

async function shutdown() {
  await stopSource();
  for (const page of pages) page.end();
  process.exit(0);
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, shutdown);

// An error nobody caught would close this window and end the stream. Log it to
// live/crash.log (with the time) and the panel's log, and keep running.
const CRASH_LOG = fileURLToPath(new URL('./crash.log', import.meta.url));
for (const event of ['uncaughtException', 'unhandledRejection']) {
  process.on(event, (error) => {
    const text = error?.stack || String(error);
    note(`${event}: ${String(error?.message || error).slice(0, 160)} (details in live/crash.log)`);
    appendFile(CRASH_LOG, `${new Date().toISOString()} ${event} ${text}\n\n`).catch(() => {});
  });
}
