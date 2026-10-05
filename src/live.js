// Live mode (?live=1): the show takes orders from a YouTube live stream's chat. The local
// bridge (live/server.mjs) reads the chat, applies the rules (cooldowns, Super Chat tiers,
// the dedication queue) and sends show actions here as Server-Sent Events; this module
// turns them into shells, ground shows, names in the sky and occasion endings, and keeps
// the overlay (live-overlay.js) up to date. The page frames itself 16:9 for the stream, or
// 9:16 with tall=1 (vertical live).
//
// Words in the sky (dedications, !sky messages, gifters' names) are paid for, so each
// gets the sky to itself: the random show stops, viewers' shells wait, and the words
// launch only once every shell already up has faded. Ground shows may play under them.
// When the words have faded, the waiting shells go up and the show carries on.
//
// Link options: preset=Halloween (any preset name), plug=Subscribe! (a plug line),
// tall=1 (9:16), volume=0..1 (default 0.7), sound=0, bridge=<events URL> (default /live/events),
// director=0 (no auto-director: look changes, clock shows, chat prompts; see live-director.js).
import { COLORS, MESSAGE_LIMIT, NAME_LIMIT } from './live-catalog.js';
import { OCCASIONS } from './occasions.js';
import { applyPreset } from './presets.js';
import { createOverlay } from './live-overlay.js';
import { createDirector } from './live-director.js';

const CUES = 256; // scheduled launches, a fixed ring
const RANDOM_TYPES = ['peony', 'chrysanthemum', 'willow', 'palm', 'ring', 'crossette', 'strobe', 'crackle', 'multibreak', 'heart', 'star'];
const SHELL = 0;
const TEXT = 1;
const GROUND = 2;
const FINALE = 3;
const BRAND = 'SKYGREETING'; // what random text shells spell between viewers' names
const COUNTDOWN = 3; // seconds of "3, 2, 1" before words go up
const MAX_CLEARING = 15; // seconds to wait for the sky to clear, at most
const MAX_HELD = 24; // viewers' shells kept while words are up; later ones are dropped
// A few ways to say each thing, so the feed doesn't read like a log.
const SAY = {
  shell: ['{by} lit a {thing}', '{by} launched a {thing}', 'a {thing}, courtesy of {by}', '{by} sent up a {thing}'],
  chaos: ['{by} unleashed CHAOS 💥', '{by} chose violence 💥', '{by} pressed every button 💥'],
  follow: ['{by} followed. Excellent taste 💛', '{by} joined the crew 💛', 'welcome aboard, {by} 💛'],
};
const clamp = (value, min, max) => (Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min);
const say = (kind, by, thing = '') => SAY[kind][(Math.random() * SAY[kind].length) | 0].replace('{by}', by).replace('{thing}', thing);
const NAMES = { multibreak: 'double break', chrysanthemum: 'mum', heart: 'heart 💖', star: 'star ⭐', pumpkin: 'pumpkin 🎃', ghost: 'ghost 👻', bat: 'bat 🦇', skull: 'skull 💀' };

// One-colour palettes for chat colours, made once.
const PALETTES = {};
for (const name in COLORS) PALETTES[name] = [COLORS[name]];

export function create(ctx) {
  if (!ctx.link.live) return { update() {}, dispose() {} };
  const { config, container, signal } = ctx;
  const params = new URLSearchParams(location.search);
  if (params.get('preset')) applyPreset(config, params.get('preset'));
  // Viewers add ground shows with gifts, so the stream starts calmer than the site: no
  // side barges (they play almost nonstop) and lighter smoke, which the fountains light up.
  // ?sides=1 and ?smoke=0.12 put the site's look back. A preset resets all of this, so
  // it's applied again after every look change.
  function restyle() {
    config.sound.volume = clamp(Number(params.get('volume') ?? 0.7), 0, 1);
    config.look.text = BRAND;
    config.look.textWidth = 230;
    config.fountains.sideBarges = params.get('sides') === '1';
    config.smoke.amount = clamp(Number(params.get('smoke') ?? 0.05), 0, 1);
  }
  restyle();
  const tall = params.get('tall') === '1';
  const SPREAD = tall ? 85 : 150; // metres either side of the barge's middle that stay in frame
  // The wide frame shows less sky above the barge, so everything bursts lower there.
  const LIFT = tall ? 1 : 0.72;
  const TEXT_LIFT = tall ? 1 : 0.85;
  container.classList.add('live-mode');
  container.classList.toggle('live-wide', !tall);
  // Sound starts by itself where autoplay is allowed (OBS, a kiosk browser); elsewhere at
  // the first click on the page (audio.js resumes it).
  dispatchEvent(new Event('pointerdown'));
  const overlay = createOverlay(container, signal, String(params.get('plug') || '').slice(0, 40), tall);
  const director = createDirector({
    params, config, overlay,
    look: (preset) => { applyPreset(config, preset); restyle(); },
    show: (kind) => {
      if (kind === 'finale') act({ do: 'finale', reason: 'Top-of-the-hour grand finale!' });
      else {
        gift('barrage', 1, '');
        gift('fountain', 1, '');
        overlay.banner('🎆 Mini show!', 5);
      }
    },
    busy: () => phase !== 'idle' || words.length > 0,
  });

  const cues = [];
  for (let i = 0; i < CUES; i++) cues.push({ at: Infinity, kind: SHELL, type: '', x: 0, h: 0, palette: null, text: '' });
  let slot = 0;
  let now = 0;
  let groundFreeAt = 0; // gifts start a ground show at most this often
  const words = []; // dedications, messages and gifters' names, in order
  let phase = 'idle'; // 'clearing' the sky, 'countdown', 'words' up, or 'idle'
  let phaseUntil = 0;
  let holding = false; // while true, aerial shells wait and the random show is off
  let autoLaunch = true; // the random show's setting before the hold

  function schedule(delay, kind, type, x = 0, h = 0, palette = null, text = '') {
    const cue = cues[slot];
    slot = (slot + 1) % CUES;
    cue.at = now + delay;
    cue.kind = kind;
    cue.type = type;
    cue.x = x;
    cue.h = h;
    cue.palette = palette;
    cue.text = text;
  }

  function fire(cue) {
    const fireworks = ctx.fireworks;
    if (!fireworks) return;
    const middle = config.show.bargePosition[0];
    if (cue.kind === SHELL) fireworks.launchAt(cue.type, middle + cue.x, cue.h * LIFT, cue.palette);
    else if (cue.kind === TEXT) {
      config.look.text = cue.text;
      config.look.textWidth = Math.min(250, Math.max(100, 60 + cue.text.length * 10));
      fireworks.launchAt('text', middle, (cue.h || 120) * TEXT_LIFT);
    } else if (cue.kind === GROUND) {
      if (ctx.fountains) ctx.fountains.play(cue.type);
    } else if (cue.kind === FINALE) fireworks.finale();
  }

  const x = () => (Math.random() * 2 - 1) * SPREAD;
  const h = () => 120 + Math.random() * 80; // high, to fill the sky above the overlay
  const pick = (list) => list[(Math.random() * list.length) | 0];
  const name = (text) => String(text).replace(/[^\p{L}\p{N} ._-]/gu, '').trim().slice(0, NAME_LIMIT).toUpperCase();
  const aerial = (cue) => cue.kind === SHELL || cue.kind === FINALE;

  function gift(effect, count, by) {
    const n = Math.min(count, 12);
    switch (effect) {
      case 'rose':
        for (let i = 0; i < n; i++) schedule(i * 0.35, SHELL, i % 2 ? 'chrysanthemum' : 'peony', x(), h(), PALETTES.red);
        break;
      case 'heart':
        for (let i = 0; i < n; i++) schedule(i * 0.4, SHELL, 'heart', x(), h(), PALETTES.pink);
        break;
      case 'fountain':
        // One ground show at a time: stacked fountains wash the frame out.
        if (now > groundFreeAt) {
          schedule(0, GROUND, 'fountains');
          groundFreeAt = now + 12;
        }
        for (let k = 0; k < 3; k++) schedule(0.8 + k * 0.5, SHELL, 'willow', x(), h(), PALETTES.gold);
        break;
      case 'name':
      case 'finale':
        if (!name(by)) return gift('barrage', 1, by);
        words.push({ do: 'name', by, finale: effect === 'finale' });
        overlay.queue(words.length);
        break;
      case 'barrage':
        for (let k = 0; k < 12; k++) schedule(k * 0.18, SHELL, k % 3 ? 'peony' : 'crackle', -SPREAD + (k * 2 * SPREAD) / 11, 125 + (k % 4) * 22);
        break;
      case 'follow':
        schedule(0, SHELL, 'willow', x(), h(), PALETTES.gold);
        break;
      default: // sparkle
        for (let i = 0; i < n; i++) schedule(i * 0.3, SHELL, pick(RANDOM_TYPES), x(), h(), PALETTES.gold);
    }
  }

  function act(action) {
    if (action.do !== 'likes' && action.do !== 'leaders' && action.do !== 'prices') director.viewer();
    switch (action.do) {
      case 'shell':
        schedule(0, SHELL, action.shape, x(), h(), PALETTES[action.color] || null);
        overlay.feed(say('shell', action.by, `${action.color ? `${action.color} ` : ''}${NAMES[action.shape] || action.shape}`));
        break;
      case 'chaos':
        for (let i = 0; i < 6; i++) schedule(i * 0.15, SHELL, pick(RANDOM_TYPES), x(), h(), pick(Object.values(PALETTES)));
        overlay.feed(say('chaos', action.by));
        break;
      case 'gift':
        gift(action.effect, action.count, action.by);
        overlay.feed(action.effect === 'follow' ? say('follow', action.by) : `${action.by} sent ${action.gift}${action.count > 1 ? ` ×${action.count}` : ''} 🎁`, true);
        break;
      case 'dedication':
      case 'message':
        if (action.do === 'message' || OCCASIONS[action.occasion]) words.push(action);
        overlay.queue(words.length);
        break;
      case 'callout':
        overlay.feed(action.text);
        break;
      case 'finale':
        schedule(0, FINALE, '');
        schedule(0, GROUND, 'mines');
        overlay.banner(`🎆 ${action.reason}`, 6);
        break;
      case 'leaders':
        overlay.leaders(action.top);
        break;
      case 'likes':
        overlay.likes(action.total, action.goal, action.step || action.goal);
        break;
      case 'prices':
        overlay.prices(action.sky, action.tiers || []);
        break;
    }
  }

  // Every shell up (or climbing) has faded. Words linger longer than their record says.
  function skyClear(textOnly) {
    if (!ctx.fireworks) return true;
    const linger = config.look.lifetime * 1.9;
    for (const burst of ctx.fireworks.bursts) {
      if (burst.type === 'text' ? burst.time + linger > now : !textOnly && burst.end > now) return false;
    }
    for (const cue of cues) if (cue.kind === TEXT && cue.at !== Infinity) return false;
    return true;
  }

  function hold() {
    holding = true;
    autoLaunch = config.show.autoLaunch;
    config.show.autoLaunch = false;
  }

  // The waiting shells go up a few at a time, not all at once.
  function release() {
    holding = false;
    config.show.autoLaunch = autoLaunch;
    let k = 0;
    for (const cue of cues) {
      if (cue.at === Infinity || !aerial(cue) || cue.at > now) continue;
      cue.at = k < MAX_HELD ? now + 0.6 + k * 0.3 : Infinity;
      k++;
    }
    config.look.text = BRAND;
    config.look.textWidth = 230;
  }

  function title(item) {
    if (item.do === 'message') return `“${item.text}”`;
    if (item.do === 'name') return item.finale ? `👑 ${name(item.by)}` : `🫶 ${name(item.by)}`;
    return `${OCCASIONS[item.occasion].message} ${item.to}`;
  }

  // Their words, alone: a ground show may play underneath, nothing else in the sky.
  function launchWords(item) {
    if (item.do === 'dedication') {
      const { ending, message } = OCCASIONS[item.occasion];
      const ground = ending.find((cue) => cue.ground);
      schedule(0, GROUND, ground ? ground.ground : 'fountains');
      schedule(0.2, TEXT, 'text', 0, 132, null, message);
      schedule(2.6, TEXT, 'text', 0, 76, null, item.to);
      overlay.banner(`🎆 For ${item.to} · from ${item.by}`, 14);
    } else if (item.do === 'message') {
      schedule(0, GROUND, 'candles');
      schedule(0.2, TEXT, 'text', 0, 120, null, String(item.text).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MESSAGE_LIMIT));
      overlay.banner(`✍️ from ${item.by}`, 12);
    } else {
      schedule(0, GROUND, item.finale ? 'mines' : 'fountains');
      schedule(0.2, TEXT, 'text', 0, 120, null, name(item.by));
      overlay.banner(item.finale ? `👑 ${item.by} sent the grand finale` : `🫶 Thank you, ${item.by}`, 10);
    }
  }

  // Once the words have faded: the celebration that goes with them.
  function afterWords(item) {
    if (item.do === 'dedication') {
      let k = 0;
      for (const cue of OCCASIONS[item.occasion].ending) {
        if (cue.shell && k < 12) schedule(0.3 + 0.3 * k++, SHELL, cue.shell, cue.x * 0.85, cue.h + 30);
      }
    } else if (item.do === 'name' && item.finale) {
      schedule(0.2, FINALE, '');
    } else {
      schedule(0.2, SHELL, 'ring', -SPREAD, 190);
      schedule(0.5, SHELL, 'ring', SPREAD, 190);
      for (let k = 0; k < 4; k++) schedule(0.9 + k * 0.35, SHELL, 'willow', (k % 2 ? 1 : -1) * (40 + k * 12), 175, PALETTES.gold);
    }
  }

  function stepWords() {
    const item = words[0];
    if (phase === 'idle') {
      if (!item) return;
      hold();
      phase = 'clearing';
      phaseUntil = now + MAX_CLEARING;
    } else if (phase === 'clearing') {
      if (!skyClear(false) && now < phaseUntil) return;
      phase = 'countdown';
      phaseUntil = now + COUNTDOWN;
      overlay.countdown(title(item), item.do === 'name' ? 'thank you!' : `from ${item.by}`, COUNTDOWN);
    } else if (phase === 'countdown') {
      if (now < phaseUntil) return;
      launchWords(item);
      phase = 'words';
      phaseUntil = now + 4; // the text cues have launched by then
    } else if (phase === 'words') {
      if (now < phaseUntil || !skyClear(true)) return;
      words.shift();
      overlay.queue(words.length);
      release();
      afterWords(item);
      phase = 'idle';
    }
  }

  const events = new EventSource(params.get('bridge') || '/live/events');
  events.onmessage = (message) => {
    let action;
    try {
      action = JSON.parse(message.data);
    } catch {
      return;
    }
    if (action && typeof action === 'object') act(action);
  };
  events.onerror = () => overlay.offline(events.readyState !== EventSource.OPEN);
  events.onopen = () => overlay.offline(false);

  return {
    update(dt, time) {
      now = time;
      for (let i = 0; i < CUES; i++) {
        const cue = cues[i];
        if (cue.at > time || (holding && aerial(cue))) continue; // held shells wait for release()
        cue.at = Infinity;
        fire(cue);
      }
      stepWords();
      director.update(dt);
    },

    dispose() {
      if (holding) config.show.autoLaunch = autoLaunch;
      events.close();
      overlay.dispose();
      container.classList.remove('live-mode', 'live-wide');
    },
  };
}
