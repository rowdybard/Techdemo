// Opening a SkyGreeting (read in link.js): the scene is set for its occasion, the ending
// plays with the sender's words, and a card says who made it, with "Watch again" and
// "Make one for someone else", so every recipient can become the next sender.
//
// Two kinds of link: a free one carries its words (?o=&msg=&to=&from=); a paid Deluxe one
// is private (?g=id) and its words come from the server once Stripe has confirmed the
// payment. A buyer coming back from checkout (&sent=1) gets their link to share.
// Older links with only a message play as a birthday-style greeting.
//
// The words only ever reach the page as textContent and the sky as canvas text.
import { OCCASIONS, applyOccasion } from './occasions.js';
import { paidLink } from './link.js';
import { applyLook, keepFree } from './look.js';
import { greetingBlocked } from './moderate.js';

const FIRST_PLAY = 1.2; // seconds after the greeting is ready
const POLL_MS = 2000; // waiting for the payment to be confirmed
const POLL_TRIES = 30;

export function create(ctx) {
  const { config, container, signal } = ctx;
  const gift = ctx.link.gift;
  if (!gift) return { update() {}, dispose() {} };

  let occasion = null;
  let words = null;
  let deluxe = false;
  let pending = false; // the ending is due to play
  let playAt = 0;
  let now = 0;

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
  card.append(title, note, buttons, explore);
  container.append(card);
  container.classList.add('gift-mode');

  again.addEventListener('click', () => {
    pending = true;
    playAt = now;
  }, { signal });
  yours.addEventListener('click', () => leave(true), { signal });
  explore.addEventListener('click', () => leave(false), { signal });

  function ready(data, isDeluxe) {
    // Words that can't go in the sky (link.js already caught them in a free link).
    if (data.blocked || greetingBlocked(data)) {
      title.textContent = 'This SkyGreeting can’t be shown.';
      note.textContent = 'Its words broke SkyGreeting’s rules. You can make a kind one of your own.';
      again.hidden = true;
      return;
    }
    const name = OCCASIONS[data.occasion] ? data.occasion : 'birthday';
    deluxe = isDeluxe;
    occasion = applyOccasion(config, name, deluxe);
    // The sender's design, then (for a free greeting) only free effects.
    applyLook(config, data.look);
    if (!deluxe) keepFree(config, occasion);
    if (ctx.setCameraPreset) ctx.setCameraPreset(config.camera.preset);
    words = { message: data.message, to: data.to };
    // After the ending, the show keeps spelling the message now and then.
    config.look.text = data.message;
    config.look.mix.text = 0.5;
    title.textContent = `✨ ${data.from ? `${data.from} made you a SkyGreeting` : 'Someone made you a SkyGreeting'}`;
    pending = true;
    playAt = now + FIRST_PLAY;
  }

  if (gift.id) {
    title.textContent = gift.sent ? 'Confirming your payment…' : 'Opening your SkyGreeting…';
    buttons.hidden = true;
    loadPaid(0);
  } else {
    ready(gift, false);
  }

  // A paid greeting: ask the server until Stripe has confirmed it (usually at once).
  async function loadPaid(tries) {
    let data = null;
    try {
      const response = await fetch(`/api/greeting?id=${encodeURIComponent(gift.id)}`, { signal });
      data = await response.json();
      if (!response.ok) data = null;
    } catch {
      if (signal.aborted) return;
    }
    if (data && data.status === 'pending' && tries < POLL_TRIES) {
      setTimeout(() => { if (!signal.aborted) loadPaid(tries + 1); }, POLL_MS);
      return;
    }
    if (!data || data.status !== 'paid') {
      title.textContent = data ? 'This payment hasn’t gone through yet.' : 'This SkyGreeting couldn’t be found.';
      note.textContent = data ? 'If you just paid, wait a minute and reload this page.' : 'Check the link, or make a new one.';
      buttons.hidden = false;
      again.hidden = true;
      return;
    }
    buttons.hidden = false;
    ready(data, Boolean(data.deluxe));
    if (gift.sent) showShare();
  }

  // The buyer, back from checkout: their private link, ready to send.
  function showShare() {
    const url = paidLink(gift.id);
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
        navigator.share({ title: 'A SkyGreeting for you', text: 'I made you a SkyGreeting', url }).catch(() => {});
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(() => { note.textContent = 'Link copied. Paste it in a text or DM.'; }, () => {});
      }
    }, { signal });
    yours.hidden = true;
    buttons.prepend(share);
    card.insertBefore(box, buttons);
    // Their own visit keeps the link clean if they copy it from the address bar.
    history.replaceState(null, '', `?g=${gift.id}`);
  }

  // Back to the full site: the builder, the panel and the hints.
  function leave(build) {
    container.classList.remove('gift-mode');
    card.remove();
    if (ctx.director) ctx.director.stop();
    if (build && ctx.builder) ctx.builder.open();
  }

  return {
    update(dt, time) {
      now = time;
      if (!pending || !occasion || time < playAt) return;
      pending = false;
      if (ctx.director) ctx.director.play(occasion, words, deluxe);
    },

    dispose() {
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
