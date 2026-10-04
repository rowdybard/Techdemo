// TikTok LIVE source: TikTok-Live-Connector behind a thin adapter. It waits for the
// account to go live, connects, turns the connector's events into the plain events
// rules.mjs reads, and reconnects with backoff when the connection drops. Swapping in
// another event source means writing another file with the same createSource shape.
import { ControlEvent, TikTokLiveConnection, UserOfflineError, WebcastEvent } from 'tiktok-live-connector';
import * as read from './tiktok-fields.mjs';

const RETRY_MIN_MS = 5000;
const RETRY_MAX_MS = 60000;
const OFFLINE_POLL_MS = 30000;

export function createSource({ username, signApiKey, debug, log }, emit, status) {
  let connection = null;
  let stopped = false;
  let retry = RETRY_MIN_MS;
  let timer = null;
  const raw = { chat: 2, gift: 3, like: 3 }; // with LIVE_DEBUG, the first few raw events of each are printed

  function debugRaw(kind, data) {
    if (debug && raw[kind]-- > 0) log(`raw ${kind}: ${JSON.stringify(data, (k, v) => (k === 'common' || /image|icon/i.test(k) ? undefined : v)).slice(0, 1500)}`);
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
    });
    connection.on(ControlEvent.DISCONNECTED, ({ code, reason } = {}) => {
      status({ state: 'reconnecting', message: `disconnected ${code ?? ''} ${reason ?? ''}`.trim() });
      log(`disconnected (${code ?? '?'} ${reason ?? ''}); retrying in ${retry / 1000}s`);
      later(retry);
      retry = Math.min(retry * 2, RETRY_MAX_MS);
    });
    connection.on(ControlEvent.ERROR, (error) => log(`connector error: ${error?.info || error?.message || error}`));
    connection.on(WebcastEvent.STREAM_END, () => {
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
      if (connection) await connection.disconnect().catch(() => {});
    },
  };
}
