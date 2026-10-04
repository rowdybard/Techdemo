// TikTok LIVE mode (?live=1): the show takes orders from the stream's viewers. The local
// bridge (live/server.mjs) listens to TikTok, applies the rules (cooldowns, gift tiers,
// the dedication queue) and sends show actions here as Server-Sent Events; this module
// turns them into shells, ground shows, names in the sky and occasion endings, and keeps
// the overlay (live-overlay.js) up to date. The page frames itself 9:16 for the stream.
//
// Link options: preset=Halloween (any preset name), volume=0..1 (default 0.7), sound=0,
// bridge=<events URL> (default /live/events on this server).
import { COLORS, NAME_LIMIT } from './live-catalog.js';
import { OCCASIONS } from './occasions.js';
import { applyPreset } from './presets.js';
import { createOverlay } from './live-overlay.js';

const CUES = 256; // scheduled launches, a fixed ring
const SPREAD = 85; // metres either side of the barge's middle that stay in a 9:16 frame
const RANDOM_TYPES = ['peony', 'chrysanthemum', 'willow', 'palm', 'ring', 'crossette', 'strobe', 'crackle', 'multibreak', 'heart', 'star'];
const SHELL = 0;
const TEXT = 1;
const GROUND = 2;
const FINALE = 3;
const BRAND = 'SKYGREETING'; // what random text shells spell between viewers' names
const COUNTDOWN = 3; // seconds of "3, 2, 1" before a dedication
const NAMES = { multibreak: 'double break', chrysanthemum: 'mum', heart: 'heart 💖', star: 'star ⭐', pumpkin: 'pumpkin 🎃', ghost: 'ghost 👻', bat: 'bat 🦇', skull: 'skull 💀' };

// One-colour palettes for chat colours, made once.
const PALETTES = {};
for (const name in COLORS) PALETTES[name] = [COLORS[name]];

export function create(ctx) {
  if (!ctx.link.live) return { update() {}, dispose() {} };
  const { config, container, signal } = ctx;
  const params = new URLSearchParams(location.search);
  if (params.get('preset')) applyPreset(config, params.get('preset'));
  const volume = Number(params.get('volume') ?? 0.7);
  config.sound.volume = Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 0.7;
  config.look.text = BRAND;
  config.look.textWidth = 230;
  container.classList.add('live-mode');
  // Sound starts by itself where autoplay is allowed (OBS, a kiosk browser); elsewhere at
  // the first click on the page (audio.js resumes it).
  dispatchEvent(new Event('pointerdown'));
  const overlay = createOverlay(container, signal);

  const cues = [];
  for (let i = 0; i < CUES; i++) cues.push({ at: Infinity, kind: SHELL, type: '', x: 0, h: 0, palette: null, text: '' });
  let slot = 0;
  let now = 0;
  let textFreeAt = 0; // a name waits until the last one has faded
  const dedications = [];
  let playingUntil = -Infinity;
  let countdownEnds = -1; // while a dedication's countdown is on screen

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
    if (cue.kind === SHELL) fireworks.launchAt(cue.type, middle + cue.x, cue.h, cue.palette);
    else if (cue.kind === TEXT) {
      config.look.text = cue.text;
      config.look.textWidth = Math.min(250, Math.max(100, 60 + cue.text.length * 10));
      fireworks.launchAt('text', middle, 120);
    } else if (cue.kind === GROUND) {
      if (ctx.fountains) ctx.fountains.play(cue.type);
    } else if (cue.kind === FINALE) fireworks.finale();
  }

  const busy = () => now < playingUntil || now < textFreeAt || (ctx.director && ctx.director.active);
  // Across the frame, or out to the sides while words are in the sky.
  const x = () => (busy() ? (Math.random() < 0.5 ? -1 : 1) * (60 + Math.random() * 35) : (Math.random() * 2 - 1) * SPREAD);
  const h = () => 120 + Math.random() * 80; // high, to fill the tall frame's sky
  const pick = (list) => list[(Math.random() * list.length) | 0];

  function spell(name) {
    const text = String(name).replace(/[^\p{L}\p{N} ._-]/gu, '').trim().slice(0, NAME_LIMIT).toUpperCase();
    if (!text) return false;
    const at = Math.max(now, textFreeAt, playingUntil);
    schedule(at - now, TEXT, 'text', 0, 0, null, text);
    textFreeAt = at + 5;
    return true;
  }

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
        schedule(0, GROUND, 'fountains');
        for (let k = 0; k < 3; k++) schedule(0.8 + k * 0.5, SHELL, 'willow', x(), h(), PALETTES.gold);
        break;
      case 'name':
        if (!spell(by)) return gift('barrage', 1, by);
        schedule(0.6, SHELL, 'ring', -SPREAD, 190, null);
        schedule(0.9, SHELL, 'ring', SPREAD, 190, null);
        break;
      case 'barrage':
        for (let k = 0; k < 12; k++) schedule(k * 0.18, SHELL, k % 3 ? 'peony' : 'crackle', -SPREAD + (k * 2 * SPREAD) / 11, 125 + (k % 4) * 22);
        break;
      case 'finale':
        spell(by);
        schedule(3.5, FINALE, '');
        schedule(3.5, GROUND, 'mines');
        break;
      case 'follow':
        schedule(0, SHELL, 'willow', x(), h(), PALETTES.gold);
        break;
      default: // sparkle
        for (let i = 0; i < n; i++) schedule(i * 0.3, SHELL, pick(RANDOM_TYPES), x(), h(), PALETTES.gold);
    }
  }

  function act(action) {
    switch (action.do) {
      case 'shell':
        schedule(0, SHELL, action.shape, x(), h(), PALETTES[action.color] || null);
        overlay.feed(`${action.by} lit a ${action.color ? `${action.color} ` : ''}${NAMES[action.shape] || action.shape}`);
        break;
      case 'chaos':
        for (let i = 0; i < 6; i++) schedule(i * 0.15, SHELL, pick(RANDOM_TYPES), x(), h(), pick(Object.values(PALETTES)));
        overlay.feed(`${action.by} unleashed CHAOS 💥`);
        break;
      case 'gift':
        gift(action.effect, action.count, action.by);
        overlay.feed(action.effect === 'follow' ? `${action.by} followed 💛` : `${action.by} sent ${action.gift}${action.count > 1 ? ` ×${action.count}` : ''} 🎁`, true);
        break;
      case 'dedication':
        if (OCCASIONS[action.occasion]) dedications.push(action);
        overlay.queue(dedications.length);
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
    }
  }

  // The next dedication: a countdown on screen, then the occasion's ending with their name.
  function nextDedication() {
    if (!dedications.length || !ctx.director || now < playingUntil) return;
    const { occasion, to, by } = dedications[0];
    if (countdownEnds < 0) {
      if (ctx.director.active) return;
      countdownEnds = now + COUNTDOWN;
      overlay.countdown(`${OCCASIONS[occasion].message} ${to}`, `from ${by}`, COUNTDOWN);
      return;
    }
    if (now < countdownEnds) return;
    countdownEnds = -1;
    dedications.shift();
    overlay.queue(dedications.length);
    const length = ctx.director.play(OCCASIONS[occasion], { message: OCCASIONS[occasion].message, to }, true);
    playingUntil = now + length;
    overlay.banner(`🎆 For ${to} · from ${by}`, length);
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
        if (cue.at <= time) {
          cue.at = Infinity;
          fire(cue);
        }
      }
      // Between viewers' names, random text shells spell the site.
      if (time > textFreeAt && time > playingUntil && config.look.text !== BRAND && !(ctx.director && ctx.director.active)) {
        config.look.text = BRAND;
        config.look.textWidth = 230;
      }
      nextDedication();
    },

    dispose() {
      events.close();
      overlay.dispose();
      container.classList.remove('live-mode');
    },
  };
}
