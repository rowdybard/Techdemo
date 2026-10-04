import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as read from './tiktok-fields.mjs';

// What connector 2.5 actually emits (raw v3 protobuf fields, int64 as strings).
const v3User = { id: '7012', nickname: 'Daniel R', displayId: 'rowdybard' };

test('v3 likes: batch count and the room total', () => {
  assert.deepEqual(read.like({ user: v3User, count: 15, total: '25' }), { kind: 'like', userId: 'rowdybard', name: 'Daniel R', count: 15, total: 25 });
  assert.equal(read.like({ user: v3User, count: 3, total: '0' }).total, undefined, 'a zero total means TikTok left it out');
});

test('v3 chat, gifts and viewers', () => {
  assert.equal(read.chat({ user: v3User, content: '!pink heart' }).text, '!pink heart');
  const streak = { user: v3User, giftId: '5655', repeatCount: 5, gift: { name: 'Rose', diamondCount: 1, type: 1 } };
  assert.equal(read.gift({ ...streak, repeatEnd: 0 }), null, 'mid-streak repeats wait');
  assert.deepEqual(read.gift({ ...streak, repeatEnd: 1 }), { kind: 'gift', userId: 'rowdybard', name: 'Daniel R', gift: 'Rose', diamonds: 1, count: 5 });
  const galaxy = read.gift({ user: v3User, giftId: '11046', repeatCount: 1, repeatEnd: 0, gift: { name: '', diamondCount: 0, type: 2 }, extendedGiftInfo: { name: 'Galaxy', diamond_count: 1000 } });
  assert.equal(galaxy.gift, 'Galaxy');
  assert.equal(galaxy.diamonds, 1000);
  assert.equal(read.viewers({ total: '42' }), 42);
});

test('the older field names still read', () => {
  const user = { uniqueId: 'maya', nickname: 'Maya' };
  assert.deepEqual(read.like({ user, likeCount: 10, totalLikeCount: 40 }), { kind: 'like', userId: 'maya', name: 'Maya', count: 10, total: 40 });
  assert.equal(read.chat({ user, comment: '!heart' }).text, '!heart');
  assert.equal(read.gift({ user, giftDetails: { giftType: 1, giftName: 'Rose', diamondCount: 1 }, repeatCount: 2, repeatEnd: false }), null);
  assert.equal(read.gift({ user, giftDetails: { giftType: 1, giftName: 'Rose', diamondCount: 1 }, repeatCount: 2, repeatEnd: true }).count, 2);
  assert.equal(read.viewers({ viewerCount: 7 }), 7);
});

test('the room info like counter', () => {
  assert.equal(read.roomLikes({ data: { like_count: 25 } }), 25);
  assert.equal(read.roomLikes({ stats: { like_count: '40' } }), 40);
  assert.equal(read.roomLikes({ data: { title: 'x' } }), undefined);
});
