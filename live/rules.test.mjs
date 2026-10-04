// Tests for the stream rules: node --test rules.test.mjs (or npm test in live/).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRules } from './rules.mjs';
import { settings } from './settings.mjs';

function setup(overrides = {}) {
  let clock = 1_000_000;
  const rules = createRules({ ...settings, ...overrides }, () => clock);
  return { rules, tick: (ms) => { clock += ms; } };
}
const chat = (text, userId = 'u1', name = 'Maya') => ({ kind: 'chat', userId, name, text });

test('chat commands launch shapes and colours, in either order', () => {
  const { rules, tick } = setup();
  assert.deepEqual(rules.handle(chat('!pink heart')), [{ do: 'shell', shape: 'heart', color: 'pink', by: 'Maya' }]);
  tick(10000);
  assert.deepEqual(rules.handle(chat('!purple')), [{ do: 'shell', shape: 'peony', color: 'purple', by: 'Maya' }]);
  tick(10000);
  assert.deepEqual(rules.handle(chat('!boom')), [{ do: 'shell', shape: 'multibreak', color: null, by: 'Maya' }]);
  tick(10000);
  assert.deepEqual(rules.handle(chat('!chaos')), [{ do: 'chaos', by: 'Maya' }]);
});

test('plain chat and unknown commands do nothing', () => {
  const { rules } = setup();
  assert.deepEqual(rules.handle(chat('hello heart')), []);
  assert.deepEqual(rules.handle(chat('!dance')), []);
});

test('each viewer has a cooldown, and chat as a whole is capped per second', () => {
  const { rules, tick } = setup({ cooldownSeconds: 6, maxShellsPerSecond: 2 });
  assert.equal(rules.handle(chat('!heart')).length, 1);
  assert.equal(rules.handle(chat('!heart')).length, 0, 'same viewer, too soon');
  assert.equal(rules.handle(chat('!star', 'u2', 'B')).length, 1);
  assert.equal(rules.handle(chat('!star', 'u3', 'C')).length, 0, 'over the per-second cap');
  tick(6001);
  assert.equal(rules.handle(chat('!heart')).length, 1);
});

test('gifts map by name, then by diamond tier, and build the leaderboard', () => {
  const { rules } = setup();
  const [rose, board] = rules.handle({ kind: 'gift', userId: 'g1', name: 'Gina', gift: 'Rose', diamonds: 1, count: 5 });
  assert.deepEqual(rose, { do: 'gift', effect: 'rose', count: 5, by: 'Gina', gift: 'Rose' });
  assert.deepEqual(board.top, [{ name: 'Gina', diamonds: 5 }]);
  assert.equal(rules.handle({ kind: 'gift', userId: 'g2', name: 'Hal', gift: 'Mystery', diamonds: 299, count: 1 })[0].effect, 'barrage');
  assert.equal(rules.handle({ kind: 'gift', userId: 'g2', name: 'Hal', gift: 'Unknown', diamonds: 5000, count: 1 })[0].effect, 'finale');
  assert.equal(rules.handle({ kind: 'gift', userId: 'g3', name: 'Ivy', gift: 'Cheap', diamonds: 1, count: 1 })[0].effect, 'sparkle');
  assert.deepEqual(rules.state().leaders.map((fan) => fan.name), ['Hal', 'Gina', 'Ivy']);
});

test('likes play the finale each time a goal is crossed', () => {
  const { rules } = setup({ likeGoal: 100 });
  assert.equal(rules.handle({ kind: 'like', userId: 'a', count: 60, total: 60 }).length, 1);
  const crossed = rules.handle({ kind: 'like', userId: 'a', count: 60, total: 120 });
  assert.equal(crossed[0].do, 'finale');
  assert.deepEqual(crossed[1], { do: 'likes', total: 120, goal: 200, step: 100 });
  assert.equal(rules.handle({ kind: 'like', userId: 'a', count: 10 }).length, 1, 'no total: counts up');
});

test('dedications queue for approval, gifters first, and play when approved', () => {
  const { rules, tick } = setup({ dedications: 'manual', skyMinDiamonds: 0 });
  const [note] = rules.handle(chat('!birthday maya rose', 'u1', 'Sam'));
  assert.equal(note.do, 'callout');
  tick(1000);
  rules.handle({ kind: 'gift', userId: 'u2', name: 'Kim', gift: 'Rose', diamonds: 1, count: 1 });
  rules.handle(chat('!love Alex', 'u2', 'Kim'));
  const queue = rules.state().pending;
  assert.deepEqual(queue.map((request) => request.to), ['ALEX', 'MAYA ROSE']);
  assert.deepEqual(rules.approve(queue[1].id), [{ do: 'dedication', id: queue[1].id, occasion: 'birthday', to: 'MAYA ROSE', by: 'Sam' }]);
  assert.equal(rules.state().pending.length, 1);
  rules.reject(queue[0].id);
  assert.equal(rules.state().pending.length, 0);
});

test('auto dedications play at once; blocked words and repeat asks are dropped', () => {
  const { rules } = setup({ dedications: 'auto', skyMinDiamonds: 0 });
  assert.equal(rules.handle(chat('!bday Jo'))[0].do, 'dedication');
  assert.deepEqual(rules.handle(chat('!bday Jo')), [], 'cooldown');
  assert.deepEqual(rules.handle(chat('!love nazi', 'u9')), []);
  assert.equal(rules.handle(chat('!love', 'u8'))[0].do, 'callout', 'asks for a name');
});

test('blocked display names fall back to the user id, then "someone"', () => {
  const { rules } = setup();
  assert.equal(rules.handle(chat('!heart', 'cool_id', 'nazi'))[0].by, 'cool_id');
  assert.equal(rules.handle(chat('!heart', 'nazi', 'nazi'))[0].by, 'someone');
});

test('!sky messages keep jokes, plugs and mild swearing, drop harm, and share the queue', () => {
  const { rules, tick } = setup({ dedications: 'manual', skyMinDiamonds: 0 });
  rules.handle(chat('!sky follow @maya.makes', 'u1', 'Maya'));
  rules.handle(chat('!say damn this is cool', 'u2', 'Bo'));
  assert.deepEqual(rules.handle(chat('!sky kill yourself', 'u3', 'Troll')), []);
  assert.equal(rules.handle(chat('!sky', 'u4', 'Cy'))[0].do, 'callout', 'asks for words');
  const queue = rules.state().pending;
  assert.deepEqual(queue.map((request) => request.text), ['follow @maya.makes', 'damn this is cool']);
  assert.equal(queue[0].said, '!sky follow @maya.makes', 'the original line, for context');
  assert.deepEqual(rules.approve(queue[0].id), [{ do: 'message', id: queue[0].id, text: 'follow @maya.makes', by: 'Maya' }]);
  tick(1000);
  assert.deepEqual(rules.handle(chat('!sky again', 'u1', 'Maya')), [], 'one ask per cooldown');
});

test('words in the sky cost a 99💎 gift, before or after asking, once per gift', () => {
  const { rules, tick } = setup({ dedications: 'manual', skyMinDiamonds: 99, skyWindowMinutes: 10 });
  const [ask] = rules.handle(chat('!birthday Maya', 'u1', 'Sam'));
  assert.match(ask.text, /Hand Hearts/);
  assert.equal(rules.state().pending.length, 0);
  tick(60000);
  const out = rules.handle({ kind: 'gift', userId: 'u1', name: 'Sam', gift: 'Hand Hearts', diamonds: 99, count: 1 });
  assert.equal(out[2].do, 'callout', 'the waiting request goes in');
  assert.deepEqual(rules.state().pending.map((r) => r.to), ['MAYA']);
  assert.match(rules.handle(chat('!sky hi', 'u1', 'Sam'))[0].text, /Hand Hearts/, 'that gift is spent');
  rules.handle({ kind: 'gift', userId: 'u2', name: 'Kim', gift: 'Rose', diamonds: 1, count: 200 });
  rules.handle(chat('!sky follow @kim', 'u2', 'Kim'));
  assert.equal(rules.state().pending.length, 2, 'gifts add up');
  rules.handle({ kind: 'gift', userId: 'u3', name: 'Old', gift: 'Hand Hearts', diamonds: 99, count: 1 });
  tick(11 * 60000);
  assert.match(rules.handle(chat('!sky late', 'u3', 'Old'))[0].text, /Hand Hearts/, 'expired');
  assert.equal(rules.handle({ kind: 'chat', userId: 'admin', name: 'tester', text: '!sky test', admin: true })[0].do, 'callout');
  assert.equal(rules.state().pending.length, 3, 'control-page tests are free');
});
