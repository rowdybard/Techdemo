// Opening a SkyGreeting (read in link.js): the scene is set for its occasion, the ending
// plays with the sender's words, and a card says who made it, with "Watch again" and
// "Make one for someone else", so every recipient can become the next sender.
//
// Two kinds of link: a free one carries its words (?o=&msg=&msg2=&to=&from=); a paid Deluxe one
// is private (?g=id) and its words come from the server once Stripe has confirmed the
// payment. A buyer coming back from checkout (&sent=1) gets their link to share.
// Older links with only a message play as a birthday-style greeting.
//
// A small Report link lets the recipient flag it (worker/index.js keeps the report, and
// three reports from different people take a greeting down for everyone).
//
// The words only ever reach the page as textContent and the sky as canvas text.
import { track, trackPurchase } from './track.js';
import { OCCASIONS, applyOccasion } from './occasions.js';
import { paidLink } from './link.js';
import { applyLook, keepFree } from './look.js';
import { greetingBlocked } from './moderate.js';

const FIRST_PLAY = 1.2; // seconds after the greeting is ready
const POLL_MS = 2000; // waiting for the payment to be confirmed
const POLL_TRIES = 30;
const CARD_BACK = 2.5; // seconds after the ending before the card comes back (its last shells are still bursting)

export function create(ctx) {
  const { config, container, signal } = ctx;
  const gift = ctx.link.gift;
  if (!gift) return { update() {}, dispose() {} };

  let occasion = null;
  let words = null;
  let deluxe = false;
  let legacy = true;
  let active = true;
  let pollTimer = null;
  let wrapBox = null;
  let completed = false;
  let reporting = false;
  let pending = false; // the ending is due to play
  let playAt = 0;
  let now = 0;
  let watching = false; // the card steps aside while the ending plays
  let wrapped = false; // a Deluxe greeting waits, gift-wrapped, until it's opened
  let busyUntil = -Infinity; // and stays aside this long after, while the last shells burst

  const card = el('div', 'gift-card');
  const title = el('p', 'gift-from');
  const note = el('p', 'send-status');
  const again = el('button', 'send-secondary', 'Watch again');
  again.type = 'button';
  const yours = el('button', 'send-primary', 'Make one for someone else');
  yours.type = 'button';
  const buttons = el('div', 'send-row');
  buttons.append(again, yours);
  const explore = el('button', 'send-close', 'Play with the show');
  explore.type = 'button';
  const reportOpen = el('button', 'send-close gift-report', 'Report');
  reportOpen.type = 'button';
  // Save as video (video.js): the ending, recorded for posting. Clean for a paid greeting.
  const film = el('button', 'send-secondary gift-video');
  film.append('🎬 Save as video', document.createElement('small'));
  film.lastChild.textContent = 'a video to keep or share';
  film.type = 'button';
  film.hidden = true;
  const links = el('div', 'gift-links');
  links.append(reportOpen, explore);
  const reportBox = buildReport();
  card.append(title, note, buttons, film, links, reportBox.node);
  let occasionName = 'birthday';
  film.addEventListener('click', () => {
    if (!occasion || !ctx.video || !ctx.director) return;
    pending = false;
    ctx.video.capture({
      watermark: !deluxe,
      name: `skygreeting-${occasionName}`,
      play: () => ctx.director.play(occasion, words, deluxe, { legacy }),
      returnTo: () => { if (active) { busyUntil = -Infinity; card.classList.remove('gift-watching'); } },
    });
  }, { signal });
  container.append(card);
  container.classList.add('gift-mode');

  again.addEventListener('click', () => {
    pending = true;
    playAt = now;
  }, { signal });
  yours.addEventListener('click', () => leave(true), { signal });
  explore.addEventListener('click', () => leave(false), { signal });

  function ready(data, isDeluxe) {
    if (!active) return;
    // Words that can't go in the sky (link.js already caught them in a free link).
    if (data.blocked || greetingBlocked(data)) {
      title.textContent = 'This SkyGreeting can’t be shown.';
      note.textContent = 'Its words broke SkyGreeting’s rules. You can make a kind one of your own.';
      again.hidden = true;
      return;
    }
    const name = OCCASIONS[data.occasion] ? data.occasion : 'birthday';
    occasionName = name;
    film.hidden = !(ctx.video && ctx.video.supported);
    deluxe = isDeluxe;
    legacy = data.look?.ver !== 2;
    occasion = applyOccasion(config, name, deluxe, { legacy });
    // The sender's design, then (for a free greeting) only free effects.
    applyLook(config, data.look);
    if (!deluxe) keepFree(config, occasion, { legacy });
    if (ctx.setCameraPreset) ctx.setCameraPreset(config.camera.preset);
    words = { message: data.message, message2: data.message2 || '', to: data.to, from: data.from || '' };
    config.look.text = data.message;
    config.look.text2 = '';
    const kind = deluxe ? 'a Deluxe SkyGreeting' : 'a SkyGreeting';
    title.textContent = `${deluxe ? '✦' : '✨'} ${data.from ? `${data.from} made you ${kind}` : `Someone made you ${kind}`}`;
    card.classList.toggle('gift-deluxe', deluxe);
    // The buyer back from checkout sees their link at once; a recipient unwraps theirs.
    if (deluxe && !gift.sent) {
      wrap(data.from);
      return;
    }
    pending = true;
    playAt = now + FIRST_PLAY;
  }

  // A Deluxe greeting arrives gift-wrapped: a gold seal over the dimmed sky, and nothing plays
  // until it's opened. The tap is the gesture browsers want before sound, so it opens with the
  // sound on (or quietly, if they'd rather).
  function wrap(from) {
    wrapped = true;
    const box = el('div', 'gift-wrap');
    wrapBox = box;
    const seal = el('div', 'gift-seal', '✦');
    seal.setAttribute('aria-hidden', 'true');
    const who = el('p', 'gift-wrap-from', from ? `${from} sent you` : 'Someone sent you');
    const what = el('p', 'gift-wrap-what', 'a Deluxe SkyGreeting');
    const open = el('button', 'gift-wrap-open', 'Tap to open');
    open.type = 'button';
    const quiet = el('button', 'gift-wrap-quiet', 'Open without sound');
    quiet.type = 'button';
    box.append(seal, who, what, open, quiet);
    container.append(box);
    const unwrap = (sound) => {
      if (!active || !wrapped) return;
      wrapped = false;
      if (sound) {
        config.sound.enabled = true;
        config.sound.volume = Math.max(config.sound.volume, 0.6);
      } else config.sound.enabled = false;
      track('open_gift', { content_type: occasionName, method: sound ? 'sound' : 'quiet' });
      box.classList.add('is-open');
      setTimeout(() => box.remove(), 1000);
      pending = true;
      playAt = now + 0.6;
    };
    open.addEventListener('click', () => unwrap(true), { signal });
    quiet.addEventListener('click', () => unwrap(false), { signal });
    signal.addEventListener('abort', () => box.remove());
    open.focus({ preventScroll: true });
  }

  function takenDown() {
    wrapBox?.remove();
    wrapped = false;
    ctx.director?.stop();
    words = occasion = null;
    watching = false;
    busyUntil = -Infinity;
    config.look.text = '';
    config.look.text2 = '';
    config.look.mix.text = 0;
    card.classList.remove('gift-watching');
    title.textContent = 'This SkyGreeting has been taken down.';
    note.textContent = 'People reported it. You can make a kind one of your own.';
    buttons.hidden = false;
    again.hidden = true;
    reportOpen.hidden = true;
    film.hidden = true;
    pending = false;
  }

  if (gift.id) {
    title.textContent = gift.sent ? 'Confirming your payment…' : 'Opening your SkyGreeting…';
    buttons.hidden = true;
    loadPaid(0);
  } else {
    ready(gift, false);
    // A free greeting carries its words, so ask whether it has been taken down (if the
    // server can't be reached, it plays).
    if (!gift.blocked && /^https?:$/.test(location.protocol)) {
      const query = new URLSearchParams({ o: gift.occasion || '', msg: gift.message, msg2: gift.message2 || '', to: gift.to || '', from: gift.from || '' });
      fetch(`/api/taken-down?${query}`, { signal }).then((response) => (response.ok ? response.json() : null)).then((data) => {
        if (active && data && data.hidden) {
          if (ctx.director) ctx.director.stop();
          takenDown();
        }
      }, () => {});
    }
  }

  // A paid greeting: ask the server until Stripe has confirmed it (usually at once).
  async function loadPaid(tries) {
    if (!active) return;
    let data = null;
    try {
      const response = await fetch(`/api/greeting?id=${encodeURIComponent(gift.id)}`, { signal });
      data = await response.json();
      if (!response.ok) data = null;
    } catch {
      if (signal.aborted || !active) return;
    }
    if (!active) return;
    if (data && data.status === 'pending' && tries < POLL_TRIES) {
      pollTimer = setTimeout(() => { if (active && !signal.aborted) loadPaid(tries + 1); }, POLL_MS);
      return;
    }
    if (data && data.status === 'hidden') {
      takenDown();
      return;
    }
    if (!data || (data.status !== 'paid' && data.status !== 'free')) {
      title.textContent = data ? 'This payment hasn’t gone through yet.' : 'This SkyGreeting couldn’t be found.';
      note.textContent = data ? 'If you just paid, wait a minute and reload this page.' : 'Check the link, or make a new one.';
      buttons.hidden = false;
      again.hidden = true;
      return;
    }
    buttons.hidden = false;
    ready(data, data.status === 'paid' && data.deluxe === true);
    if (gift.sent && data.status === 'paid' && data.deluxe === true) showShare(data);
  }

  // The buyer, back from checkout: their private link, ready to send.
  function showShare(data) {
    const url = paidLink(gift.id);
    trackPurchase(data, occasionName);
    title.textContent = '✓ Paid. Your SkyGreeting is ready to send';
    note.textContent = 'Anyone with this link sees the full Deluxe show.';
    const box = el('input', 'send-link');
    box.readOnly = true;
    box.value = url;
    box.setAttribute('aria-label', 'Your SkyGreeting link');
    const share = el('button', 'send-primary', navigator.share ? 'Send it' : 'Copy link');
    share.type = 'button';
    share.addEventListener('click', () => {
      box.select();
      if (navigator.share) {
        navigator.share({ title: 'A SkyGreeting for you', text: 'I made you a SkyGreeting', url }).then(() => track('share_success', { method: 'share', content_type: 'paid_greeting' }), () => {});
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(() => { note.textContent = 'Link copied. Paste it in a text or DM.'; track('share_success', { method: 'copy', content_type: 'paid_greeting' }); }, () => {});
      }
    }, { signal });
    yours.hidden = true;
    buttons.prepend(share);
    card.insertBefore(box, buttons);
    // Their own visit keeps the link clean if they copy it from the address bar.
    history.replaceState(history.state, '', `?g=${gift.id}`);
  }

  // Report: a reason, an optional note, and off it goes.
  function buildReport() {
    const node = el('div', 'gift-report-box');
    node.hidden = true;
    const reasons = [['hateful', 'Hateful'], ['threatening', 'Threatening'], ['sexual', 'Sexual'], ['spam', 'Spam'], ['other', 'Something else']];
    let reason = '';
    const chips = el('div', 'builder-chips');
    const chipButtons = [];
    for (const [value, label] of reasons) {
      const chip = el('button', 'builder-chip', label);
      chip.type = 'button';
      chip.setAttribute('aria-pressed', 'false');
      chip.addEventListener('click', () => {
        reason = value;
        for (const other of chipButtons) other.setAttribute('aria-pressed', String(other === chip));
      }, { signal });
      chipButtons.push(chip);
      chips.append(chip);
    }
    const detail = el('input', 'send-link');
    detail.maxLength = 200;
    detail.placeholder = 'Anything else? (optional)';
    detail.setAttribute('aria-label', 'Details');
    const status = el('p', 'send-status');
    status.setAttribute('role', 'status');
    const row = el('div', 'send-row');
    const cancel = el('button', 'send-secondary', 'Cancel');
    cancel.type = 'button';
    const send = el('button', 'send-primary', 'Send report');
    send.type = 'button';
    row.append(cancel, send);
    node.append(el('p', 'gift-from', 'What’s wrong with it?'), chips, detail, row, status);

    cancel.addEventListener('click', () => ctx.navigation ? ctx.navigation.back() : show(false), { signal });
    send.addEventListener('click', async () => {
      if (!reason) {
        status.textContent = 'Pick a reason first.';
        return;
      }
      send.disabled = true;
      status.textContent = 'Sending…';
      const body = gift.id ? { id: gift.id } : { occasion: gift.occasion || '', message: gift.message, message2: gift.message2 || '', to: gift.to || '', from: gift.from || '' };
      try {
        const response = await fetch('/api/report', {
          method: 'POST',
          signal,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...body, reason, note: detail.value }),
        });
        const data = await response.json();
        if (!active) return;
        if (!response.ok) throw new Error(data.error || 'failed');
        note.textContent = 'Thanks. We’ll look at your report.';
        if (ctx.navigation?.current === 'gift-report') ctx.navigation.back();
        else show(false);
        reportOpen.hidden = true;
      } catch (error) {
        if (!active || signal.aborted) return;
        status.textContent = error.message && error.message !== 'failed' ? error.message : 'That didn’t send. Try again in a moment.';
        send.disabled = false;
      }
    }, { signal });

    function show(on) {
      if (reporting === on) return;
      reporting = on;
      if (on) { pending = false; completed = true; busyUntil = -Infinity; ctx.director?.stop(); card.classList.remove('gift-watching'); }
      node.hidden = !on;
      buttons.hidden = on;
      links.hidden = on;
    }
    const unregister = ctx.navigation?.register('gift-report', { element: node, canEnter: () => active, show: () => show(true), hide: () => show(false) });
    reportOpen.addEventListener('click', () => ctx.navigation ? ctx.navigation.open('gift-report') : show(true), { signal });
    return { node, unregister };
  }

  // Back to the full site: the builder, the panel and the hints.
  function leave(build) {
    active = false;
    pending = false;
    wrapped = false;
    clearTimeout(pollTimer);
    wrapBox?.remove();
    reportBox.unregister?.();
    container.classList.remove('gift-mode');
    card.remove();
    if (ctx.director) ctx.director.stop();
    ctx.navigation?.close();
    ctx.link.gift = null;
    config.look.text = '';
    config.look.text2 = '';
    config.look.mix.text = 0;
    history.replaceState(history.state, '', location.pathname);
    ctx.builder?.startFresh();
    if (build && ctx.builder) {
      ctx.builder.open();
    }
  }

  return {
    update(dt, time) {
      if (!active) return;
      now = time;
      // Out of the way while the show plays (on a phone it covers half the screen), and
      // back with its buttons once it's over.
      if (occasion && (pending || (ctx.director && ctx.director.active))) busyUntil = time + CARD_BACK;
      const playing = !reporting && (wrapped || time < busyUntil);
      if (playing !== watching) {
        watching = playing;
        card.classList.toggle('gift-watching', playing);
        // After the ending, the show keeps spelling the message now and then (but not
        // during a replay, where it would spoil the reveal).
        config.look.mix.text = playing ? 0 : 0.5;
        if (!playing && words) config.look.text = words.message;
        if (!playing && words && !completed) { completed = true; track('recipient_play_complete', { content_type: occasionName, method: deluxe ? 'deluxe' : 'free' }); }
      }
      if (!pending || !occasion || time < playAt) return;
      pending = false;
      completed = false;
      if (ctx.director) ctx.director.play(occasion, words, deluxe, { legacy });
    },

    dispose() {
      active = false;
      clearTimeout(pollTimer);
      wrapBox?.remove();
      reportBox.unregister?.();
      card.remove();
      container.classList.remove('gift-mode');
    },
  };
}

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}
