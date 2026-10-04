import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as read from './youtube-fields.mjs';

const prices = { membership: 200 };
const author = { id: 'UCabc', name: '@maya' };

test('Super Chat amounts become US cents', () => {
  assert.equal(read.cents('$5.00'), 500);
  assert.equal(read.cents('$1,000.00'), 100000);
  assert.equal(read.cents('CA$10.00'), 730);
  assert.equal(read.cents('€2,00'), 216);
  assert.equal(read.cents('£1.00'), 127);
  assert.equal(read.cents('¥500'), 340);
  assert.equal(read.cents('₹100.00'), 120);
  assert.equal(read.cents(''), 0);
});

test('chat, Super Chats, stickers and memberships', () => {
  assert.deepEqual(read.events({ type: 'LiveChatTextMessage', author, message: '!pink heart' }, prices), [{ kind: 'chat', userId: 'UCabc', name: 'maya', text: '!pink heart' }]);
  const superChat = read.events({ type: 'LiveChatPaidMessage', author, purchase_amount: '$2.00', message: '!sky hi mom' }, prices);
  assert.deepEqual(superChat.map((e) => e.kind), ['gift', 'chat'], 'the gift goes first so it pays for the words');
  assert.equal(superChat[0].diamonds, 200);
  assert.equal(superChat[0].said, '!sky hi mom', 'so the rules know it asks for words');
  assert.equal(read.events({ type: 'LiveChatPaidSticker', author, purchase_amount: '$10.00' }, prices)[0].gift, 'Super Sticker');
  assert.equal(read.events({ type: 'LiveChatMembershipItem', author, header_subtext: 'Welcome!' }, prices)[0].gift, 'New member');
  const gifted = read.events({ type: 'LiveChatSponsorshipsGiftPurchaseAnnouncement', author_external_channel_id: 'UCx', header: { author_name: '@kim', primary_text: 'Gifted 5 memberships' } }, prices)[0];
  assert.deepEqual([gifted.name, gifted.count, gifted.diamonds], ['kim', 5, 200]);
  assert.deepEqual(read.events({ type: 'LiveChatViewerEngagementMessage' }, prices), []);
});

test('finding the stream', () => {
  assert.equal(read.videoId('https://www.youtube.com/watch?v=jfKfPfyJRdk&t=1'), 'jfKfPfyJRdk');
  assert.equal(read.videoId('https://youtube.com/live/jfKfPfyJRdk?si=x'), 'jfKfPfyJRdk');
  assert.equal(read.videoId('jfKfPfyJRdk'), 'jfKfPfyJRdk');
  assert.equal(read.videoId('@skygreeting'), null);
  assert.equal(read.livePage('@skygreeting'), 'https://www.youtube.com/@skygreeting/live');
  assert.equal(read.livePage('https://www.youtube.com/@skygreeting/'), 'https://www.youtube.com/@skygreeting/live');
  assert.equal(read.livePage('skygreeting'), 'https://www.youtube.com/@skygreeting/live');
  const page = '<link rel="canonical" href="https://www.youtube.com/watch?v=jfKfPfyJRdk">..."isLiveNow":true...';
  assert.deepEqual(read.liveFromPage(page), { id: 'jfKfPfyJRdk', live: true });
  assert.deepEqual(read.liveFromPage('<link rel="canonical" href="https://www.youtube.com/@x">'), { id: null, live: false });
  assert.equal(read.count('1.2K'), 1200);
  assert.equal(read.count('12,345'), 12345);
  assert.equal(read.count(''), undefined);
});
