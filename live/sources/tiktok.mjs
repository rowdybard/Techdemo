// TikTok LIVE source: TikTok-Live-Connector behind a thin adapter. It waits for the
// account to go live, connects, turns the connector's events into the plain events
// rules.mjs reads, and reconnects with backoff when the connection drops. Swapping in
// another event source means writing another file with the same createSource shape.
import { ControlEvent, TikTokLiveConnection, UserOfflineError, WebcastEvent } from 'tiktok-live-connector';

const RETRY_MIN_MS = 5000;
const RETRY_MAX_MS = 60000;
const OFFLINE_POLL_MS = 30000;

export function createSource({ username, signApiKey, debug, log }, emit, status) {
  let connection = null;
  let stopped = false;
  let retry = RETRY_MIN_MS;
  let timer = null;
  let debugGifts = 3; // with LIVE_DEBUG, the first few raw gift events are printed whole

  const user = (data) => ({ userId: data.user?.uniqueId || data.user?.userId || '', name: data.user?.nickname || data.user?.uniqueId || '' });

  function later(ms) {
    clearTimeout(timer);
    if (!stopped) timer = setTimeout(connect, ms);
  }

  function build() {
    connection = new TikTokLiveConnection(username, { signApiKey, processInitialData: false, enableExtendedGiftInfo: true });
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

    connection.on(WebcastEvent.CHAT, (data) => emit({ kind: 'chat', ...user(data), text: data.comment || '' }));
    connection.on(WebcastEvent.GIFT, (data) => {
      if (debug && debugGifts-- > 0) log(`raw gift: ${JSON.stringify(data).slice(0, 1500)}`);
      const details = data.giftDetails || {};
      const extended = data.extendedGiftInfo || {};
      // A streakable gift (type 1) fires on every repeat; count it once, when the streak ends.
      if (details.giftType === 1 && !data.repeatEnd) return;
      emit({
        kind: 'gift',
        ...user(data),
        gift: details.giftName || extended.name || data.giftName || `gift ${data.giftId}`,
        diamonds: Number(details.diamondCount ?? extended.diamond_count ?? data.diamondCount ?? 0),
        count: Number(data.repeatCount) || 1,
      });
    });
    connection.on(WebcastEvent.LIKE, (data) => emit({ kind: 'like', ...user(data), count: Number(data.likeCount) || 1, total: Number(data.totalLikeCount) || undefined }));
    connection.on(WebcastEvent.FOLLOW, (data) => emit({ kind: 'follow', ...user(data) }));
    connection.on(WebcastEvent.SHARE, (data) => emit({ kind: 'share', ...user(data) }));
    connection.on(WebcastEvent.ROOM_USER, (data) => status({ viewers: Number(data.viewerCount) || 0 }));
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
