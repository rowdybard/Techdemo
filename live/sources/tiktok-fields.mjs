// Reads TikTok-Live-Connector's event data into the plain events rules.mjs takes.
// Connector 2.5 emits the raw v3 protobuf messages (chat `content`, like `count` and
// `total`, gift `gift.name`, user `displayId`), while its README still shows the older
// names (`comment`, `likeCount`, `giftDetails`, `uniqueId`). Each reader takes either.

const num = (...values) => {
  for (const value of values) {
    const n = Number(value);
    if (value !== undefined && value !== null && value !== '' && Number.isFinite(n)) return n;
  }
  return undefined;
};
// Proto fields default to 0, so a missing value reads as 0; take the first real one.
const positive = (...values) => num(...values.filter((value) => Number(value) > 0));

export function user(data) {
  const u = data?.user || {};
  const handle = u.uniqueId || u.displayId || '';
  return { userId: handle || String(u.userId || u.id || ''), name: u.nickname || handle };
}

export function chat(data) {
  return { kind: 'chat', ...user(data), text: String(data?.comment ?? data?.content ?? '') };
}

export function like(data) {
  return { kind: 'like', ...user(data), count: positive(data?.likeCount, data?.count) || 1, total: positive(data?.totalLikeCount, data?.total) };
}

// A streakable gift fires on every repeat, then once more with repeatEnd; this returns
// null until the streak ends, so each streak is counted once.
export function gift(data) {
  const details = data?.giftDetails || {};
  const info = data?.gift || {};
  const extended = data?.extendedGiftInfo || {};
  const streak = details.giftType === 1 || info.type === 1 || info.combo === true;
  if (streak && !data.repeatEnd) return null;
  return {
    kind: 'gift',
    ...user(data),
    gift: details.giftName || info.name || extended.name || data.giftName || `gift ${data.giftId}`,
    diamonds: positive(details.diamondCount, info.diamondCount, extended.diamond_count, data.diamondCount) ?? 0,
    count: num(data.repeatCount) || 1,
  };
}

export function viewers(data) {
  return positive(data?.viewerCount, data?.total) || 0;
}

// The room's like total from room info (TikTok's own counter), a backstop for like events
// TikTok doesn't send. The shape varies, so look in the usual places.
export function roomLikes(info) {
  const d = info?.data ?? info;
  return positive(d?.like_count, d?.stats?.like_count, d?.room?.like_count, d?.stats?.likeCount, d?.likeCount);
}
