// TikTok LIVE source: TikTok-Live-Connector behind a thin adapter. It waits for the
// account to go live, connects, turns the connector's events into the plain events
// rules.mjs reads, and reconnects with backoff when the connection drops. Swapping in
// another event source means writing another file with the same createSource shape.
import { ControlEvent, TikTokLiveConnection, UserOfflineError, WebcastEvent } from 'tiktok-live-connector';
import * as read from './tiktok-fields.mjs';

const RETRY_MIN_MS = 5000;
const RETRY_MAX_MS = 60000;
const OFFLINE_POLL_MS = 30000;
const ROOM_POLL_MS = 15000; // how often the room's like total is read, as a backstop for like events
const TALLY_MS = 30000;

export function createSource({ username, signApiKey, debug, log }, emit, status) {
  let connection = null;
  let stopped = false;
  let retry = RETRY_MIN_MS;
  let timer = null;
  let roomTimer = null;
  let tallyTimer = null;
  let tally = {};
  let roomInfoNoted = false;
  const raw = { chat: 2, gift: 3, like: 3 }; // with LIVE_DEBUG, the first few raw events of each are printed

  function debugRaw(kind, data) {
    if (debug && raw[kind]-- > 0) log(`raw ${kind}: ${JSON.stringify(data, (k, v) => (k === 'common' || /image|icon/i.test(k) ? undefined : v)).slice(0, 1500)}`);
  }

  // TikTok doesn't send a like event for every tap, so the room's own like counter is read
  // every few seconds too; rules.mjs keeps whichever total is higher.
  async function pollRoom(roomId) {
    try {
      const info = await connection.fetchRoomInfo(roomId);
      const total = read.roomLikes(info);
      if (total) emit({ kind: 'like', userId: '', name: '', count: 0, total, room: true });
      else if (!roomInfoNoted) log(`room info has no like count (keys: ${Object.keys(info?.data ?? info ?? {}).slice(0, 30).join(', ')})`);
      roomInfoNoted = true;
    } catch (error) {
      if (!roomInfoNoted) log(`couldn't read the room's like count: ${error?.message || error}`);
      roomInfoNoted = true;
    }
  }

  function stopTimers() {
    clearInterval(roomTimer);
    clearInterval(tallyTimer);
    roomTimer = tallyTimer = null;
  }

  function later(ms) {
    clearTimeout(timer);
    if (!stopped) timer = setTimeout(connect, ms);
  }

  function build() {
    // enableExtendedGiftInfo stays off: its gift list needs a paid Euler Stream plan and fails the
    // whole connect on the free tier. Gift events carry their own name and price anyway.
    connection = new TikTokLiveConnection(username, { signApiKey, processInitialData: false, enableExtendedGiftInfo: false });
    connection.on(ControlEvent.CONNECTED, (state) => {
      retry = RETRY_MIN_MS;
      status({ state: 'connected', room: state.roomId });
      log(`connected to @${username}'s LIVE (room ${state.roomId})`);
      stopTimers();
      pollRoom(state.roomId);
      roomTimer = setInterval(() => pollRoom(state.roomId), ROOM_POLL_MS);
      // With LIVE_DEBUG, say which kinds of message TikTok is sending, to see whether likes arrive at all.
      if (debug) tallyTimer = setInterval(() => {
        log(`TikTok sent in the last ${TALLY_MS / 1000}s: ${Object.entries(tally).map(([k, n]) => `${k.replace('Webcast', '')}×${n}`).join(', ') || 'nothing'}`);
        tally = {};
      }, TALLY_MS);
    });
    connection.on(ControlEvent.DECODED_DATA, (type) => {
      if (debug) tally[type] = (tally[type] || 0) + 1;
    });
    connection.on(ControlEvent.DISCONNECTED, ({ code, reason } = {}) => {
      stopTimers();
      status({ state: 'reconnecting', message: `disconnected ${code ?? ''} ${reason ?? ''}`.trim() });
      log(`disconnected (${code ?? '?'} ${reason ?? ''}); retrying in ${retry / 1000}s`);
      later(retry);
      retry = Math.min(retry * 2, RETRY_MAX_MS);
    });
    connection.on(ControlEvent.ERROR, (error) => log(`connector error: ${error?.info || error?.message || error}`));
    connection.on(WebcastEvent.STREAM_END, () => {
      stopTimers();
      status({ state: 'waiting', message: 'stream ended' });
      log('stream ended; waiting for the next one');
      later(OFFLINE_POLL_MS);
    });

    connection.on(WebcastEvent.CHAT, (data) => {
      debugRaw('chat', data);
      emit(read.chat(data));
    });
    connection.on(WebcastEvent.GIFT, (data) => {
      debugRaw('gift', data);
      const event = read.gift(data);
      if (event) emit(event);
    });
    connection.on(WebcastEvent.LIKE, (data) => {
      debugRaw('like', data);
      emit(read.like(data));
    });
    connection.on(WebcastEvent.FOLLOW, (data) => emit({ kind: 'follow', ...read.user(data) }));
    connection.on(WebcastEvent.SHARE, (data) => emit({ kind: 'share', ...read.user(data) }));
    connection.on(WebcastEvent.ROOM_USER, (data) => status({ viewers: read.viewers(data) }));
  }

  async function connect() {
    if (stopped) return;
    if (!connection) build();
    status({ state: 'connecting' });
    try {
      await connection.connect();
    } catch (error) {
      const offline = error instanceof UserOfflineError || /offline|isn't online|not live/i.test(`${error?.name} ${error?.message}`);
      if (offline) {
        status({ state: 'waiting', message: `@${username} isn't live yet` });
        log(`@${username} isn't live; checking again in ${OFFLINE_POLL_MS / 1000}s`);
        later(OFFLINE_POLL_MS);
      } else {
        status({ state: 'reconnecting', message: String(error?.message || error).slice(0, 200) });
        log(`couldn't connect: ${error?.message || error}; retrying in ${retry / 1000}s`);
        later(retry);
        retry = Math.min(retry * 2, RETRY_MAX_MS);
      }
    }
  }

  connect();
  return {
    name: `tiktok @${username}`,
    async stop() {
      stopped = true;
      clearTimeout(timer);
      stopTimers();
      if (connection) await connection.disconnect().catch(() => {});
    },
  };
}
