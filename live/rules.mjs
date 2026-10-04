// The rules of the stream: turns viewer events (chat, gifts, likes, follows) into show
// actions for the stream page. Pure logic with an injectable clock, so it's tested
// without TikTok (rules.test.mjs). The server broadcasts whatever handle() returns.
//
// Events in (from sources/*.mjs):
//   { kind: 'chat', userId, name, text }
//   { kind: 'gift', userId, name, gift, diamonds, count }   diamonds per gift; count in the streak
//   { kind: 'like', userId, name, count, total }            total may be missing
//   { kind: 'follow' | 'share', userId, name }
// Actions out (to src/live.js):
//   { do: 'shell', shape, color, by }    { do: 'chaos', by }
//   { do: 'gift', effect, count, by, gift }
//   { do: 'dedication', id, occasion, to, by }
//   { do: 'callout', text }   { do: 'finale', reason }
//   { do: 'leaders', top }    { do: 'likes', total, goal, step }
import { COLORS, NAME_LIMIT, OCCASION_WORDS, SHAPES } from '../src/live-catalog.js';
import { isBlocked } from '../src/moderate.js';

export function createRules(settings, now = Date.now) {
  const lastShell = new Map(); // userId → ms of their last chat launch
  const lastAsk = new Map(); // userId → ms of their last dedication request
  const recent = []; // ms of chat launches in the last second, for the global cap
  const fans = new Map(); // userId → { name, diamonds }
  const pending = []; // dedications waiting for approval
  let likes = 0;
  let goal = settings.likeGoal;
  let nextId = 1;

  function cleanName(name, userId) {
    const plain = String(name || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 24);
    if (plain && !isBlocked(plain)) return plain;
    const id = String(userId || '').slice(0, 24);
    return id && !isBlocked(id) ? id : 'someone';
  }

  function leaders() {
    const top = [...fans.values()].sort((a, b) => b.diamonds - a.diamonds).slice(0, 3);
    return { do: 'leaders', top: top.map(({ name, diamonds }) => ({ name, diamonds })) };
  }

  function priority(userId) {
    return fans.get(userId)?.diamonds || 0;
  }

  function chat(event, by) {
    const text = String(event.text || '').trim();
    if (!text.startsWith('!')) return [];
    const words = text.slice(1).toLowerCase().split(/\s+/).filter(Boolean);
    const command = words[0] || '';
    const t = now();

    const occasion = OCCASION_WORDS[command];
    if (occasion) return ask(event, by, occasion, text.slice(1).trim().split(/\s+/).slice(1).join(' '), t);

    if (command === 'help') {
      if (t - (lastShell.get('help') || -Infinity) < 20000) return [];
      lastShell.set('help', t);
      return [{ do: 'callout', text: 'Type !heart !purple !star !chaos · !birthday NAME' }];
    }

    let shape = null;
    let color = null;
    for (const word of words) {
      if (!shape && (SHAPES[word] || word === 'chaos')) shape = word;
      if (!color && COLORS[word]) color = word;
    }
    if (!shape && !color) return [];
    if (t - (lastShell.get(event.userId) || -Infinity) < settings.cooldownSeconds * 1000) return [];
    while (recent.length && t - recent[0] > 1000) recent.shift();
    if (recent.length >= settings.maxShellsPerSecond) return [];
    recent.push(t);
    lastShell.set(event.userId, t);
    if (shape === 'chaos') return [{ do: 'chaos', by }];
    return [{ do: 'shell', shape: SHAPES[shape] || 'peony', color, by }];
  }

  function ask(event, by, occasion, rawName, t) {
    const to = rawName.replace(/[^\p{L}\p{N} '.-]/gu, '').trim().slice(0, NAME_LIMIT).toUpperCase();
    if (!to) return [{ do: 'callout', text: `${by}: try !${occasion} NAME` }];
    if (isBlocked(to)) return [];
    if (t - (lastAsk.get(event.userId) || -Infinity) < settings.dedicationCooldownSeconds * 1000) return [];
    if (pending.length >= settings.maxPending) return [{ do: 'callout', text: 'The dedication queue is full. Try again soon!' }];
    lastAsk.set(event.userId, t);
    const request = { id: nextId++, occasion, to, by, userId: event.userId, at: t };
    if (settings.dedications === 'auto') return [dedication(request), { do: 'callout', text: `${by} is lighting up the sky for ${to}` }];
    pending.push(request);
    return [{ do: 'callout', text: `${by}'s dedication for ${to} is in the queue` }];
  }

  function dedication({ id, occasion, to, by }) {
    return { do: 'dedication', id, occasion, to, by };
  }

  function gift(event, by) {
    const count = Math.max(1, Math.min(999, Number(event.count) || 1));
    const each = Math.max(0, Number(event.diamonds) || 0);
    const fan = fans.get(event.userId) || { name: by, diamonds: 0 };
    fan.name = by;
    fan.diamonds += each * count;
    fans.set(event.userId, fan);
    const named = settings.gifts.byName[String(event.gift || '').toLowerCase()];
    let effect = named;
    if (!effect) for (const [min, tier] of settings.gifts.tiers) if (each >= min) effect = tier;
    return [{ do: 'gift', effect: effect || 'sparkle', count, by, gift: String(event.gift || 'gift').slice(0, 30) }, leaders()];
  }

  function like(event) {
    const before = likes;
    likes = Number.isFinite(event.total) && event.total > likes ? event.total : likes + Math.max(1, Number(event.count) || 1);
    const out = [];
    if (before < goal && likes >= goal) {
      out.push({ do: 'finale', reason: `${goal.toLocaleString('en-US')} likes!` });
      while (goal <= likes) goal += settings.likeGoal;
    }
    out.push({ do: 'likes', total: likes, goal, step: settings.likeGoal });
    return out;
  }

  return {
    /** Returns the actions for one viewer event. */
    handle(event) {
      const by = cleanName(event.name, event.userId);
      switch (event.kind) {
        case 'chat': return chat(event, by);
        case 'gift': return gift(event, by);
        case 'like': return like(event);
        case 'follow': return [{ do: 'gift', effect: 'follow', count: 1, by, gift: 'follow' }];
        case 'share': return [{ do: 'callout', text: `${by} shared the stream 🙌` }];
        default: return [];
      }
    },

    /** Approves a pending dedication: highest gifters first, then oldest. */
    approve(id) {
      const index = pending.findIndex((request) => request.id === id);
      if (index < 0) return [];
      const [request] = pending.splice(index, 1);
      return [dedication(request)];
    },

    reject(id) {
      const index = pending.findIndex((request) => request.id === id);
      if (index >= 0) pending.splice(index, 1);
    },

    /** Pending dedications in the order to play them, and the running totals. */
    state() {
      const queue = pending.slice().sort((a, b) => priority(b.userId) - priority(a.userId) || a.at - b.at)
        .map((request) => ({ ...request, gifted: priority(request.userId) }));
      return { pending: queue, likes, goal, leaders: leaders().top };
    },

    /** What a newly opened stream page needs to draw the overlay. */
    snapshot() {
      return [leaders(), { do: 'likes', total: likes, goal, step: settings.likeGoal }];
    },
  };
}
