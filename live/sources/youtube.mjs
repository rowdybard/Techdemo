// YouTube Live source: reads the stream's live chat with youtubei.js (no API key, no quota)
// behind a thin adapter. Give it a channel (@handle, a channel link or ID) or a live video
// link. For a channel it waits until the channel is live, joins that stream's chat, and
// after the stream ends waits for the next one. Super Chats, Super Stickers and
// memberships become gifts worth their price in US cents (see youtube-fields.mjs); the
// like button's count and the "watching now" number come from the stream's metadata.
import { Innertube } from 'youtubei.js';
import * as read from './youtube-fields.mjs';

const RETRY_MIN_MS = 5000;
const RETRY_MAX_MS = 60000;
const OFFLINE_POLL_MS = 30000;

export function createSource({ target, prices, debug, log }, emit, status) {
  let stopped = false;
  let retry = RETRY_MIN_MS;
  let timer = null;
  let chat = null;
  let youtube = null;
  let rawLeft = 5; // with LIVE_DEBUG, the first few chat items are printed whole

  function later(ms) {
    clearTimeout(timer);
    if (!stopped) timer = setTimeout(connect, ms);
  }

  function fail(message) {
    status({ state: 'reconnecting', message: String(message).slice(0, 200) });
    log(`${message}; retrying in ${retry / 1000}s`);
    later(retry);
    retry = Math.min(retry * 2, RETRY_MAX_MS);
  }

  function waiting(message) {
    status({ state: 'waiting', message });
    log(`${message}; checking again in ${OFFLINE_POLL_MS / 1000}s`);
    later(OFFLINE_POLL_MS);
  }

  // A channel's /live page points at its current stream when there is one.
  async function findLive() {
    const id = read.videoId(target);
    if (id) return { id, live: true };
    const page = read.livePage(target);
    if (!page) throw new Error(`"${target}" isn't a YouTube channel or video link`);
    const response = await fetch(page, { headers: { 'accept-language': 'en-US,en', cookie: 'SOCS=CAI; CONSENT=YES+1' } });
    if (response.status === 404) throw new Error(`no YouTube channel at ${page.replace(/\/live$/, '')}`);
    if (!response.ok) throw new Error(`YouTube answered ${response.status} for ${page}`);
    return read.liveFromPage(await response.text());
  }

  function stopChat() {
    if (!chat) return;
    chat.removeAllListeners?.();
    chat.stop();
    chat = null;
  }

  async function connect() {
    if (stopped) return;
    stopChat();
    status({ state: 'connecting', message: '' });
    try {
      const found = await findLive();
      if (!found.live || !found.id) return waiting(`${target} isn't live yet`);
      youtube ||= await Innertube.create({ retrieve_player: false, lang: 'en', location: 'US' });
      const info = await youtube.getInfo(found.id);
      const basic = info.basic_info;
      if (!basic.is_live) return waiting(basic.is_upcoming ? `"${basic.title}" hasn't started yet` : `${found.id} isn't live`);
      if (stopped) return;
      listen(info, found.id, basic);
    } catch (error) {
      fail(`couldn't join the chat: ${error?.message || error}`);
    }
  }

  function listen(info, id, basic) {
    chat = info.getLiveChat();
    chat.on('start', () => {
      retry = RETRY_MIN_MS;
      status({ state: 'connected', room: id, message: basic.title || '' });
      log(`connected to "${basic.title}" (youtube.com/watch?v=${id})`);
      if (basic.like_count > 0) emit({ kind: 'like', userId: '', name: '', count: 0, total: basic.like_count, room: true });
    });
    chat.on('chat-update', (action) => {
      if (action.type !== 'AddChatItemAction' || !action.item) return;
      if (debug && rawLeft-- > 0) log(`raw ${action.item.type}: ${JSON.stringify(action.item, (k, v) => (/thumbnail|photo|image|endpoint|menu|color|accessibility|badges|button/i.test(k) ? undefined : v)).slice(0, 1200)}`);
      for (const event of read.events(action.item, prices)) emit(event);
    });
    chat.on('metadata-update', (meta) => {
      const total = read.count(meta.likes?.default_text);
      if (total) emit({ kind: 'like', userId: '', name: '', count: 0, total, room: true });
      const watching = meta.views?.view_count_node?.original_view_count;
      if (Number.isFinite(watching)) status({ viewers: watching });
    });
    chat.on('error', (error) => log(`chat error: ${error?.message || error}`));
    chat.on('end', () => {
      stopChat();
      if (stopped) return;
      status({ state: 'waiting', message: 'stream ended' });
      log('the stream ended (or the chat closed); looking for the next one');
      later(RETRY_MIN_MS);
    });
    chat.start();
  }

  connect();
  return {
    name: `youtube ${target}`,
    async stop() {
      stopped = true;
      clearTimeout(timer);
      stopChat();
    },
  };
}
