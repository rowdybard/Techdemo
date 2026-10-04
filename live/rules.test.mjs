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
  const { rules, tick } = setup({ dedications: 'manual' });
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
  const { rules } = setup({ dedications: 'auto' });
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
