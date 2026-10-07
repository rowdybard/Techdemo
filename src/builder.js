// The greeting builder ("Send a fireworks show"). Two ways in, one send screen: start
// here (pick an occasion, write the words, design the show in Customize), or play and
// customize the show first and then tap Send: the builder opens with that show, exactly as
// it is, and only adds the words and the ending. (If the show hasn't been touched, the
// occasion's own look is applied, as before.) Preview the ending, then send exactly that. Deluxe effects are marked ✦; using any, or ticking Deluxe,
// makes it a paid send, and the send button always says which. Nothing asks for money
// while you're making it.
//
// A Deluxe send goes to Stripe Checkout through the site's server (worker/index.js),
// which keeps the greeting until payment and returns the buyer to a private ?g= link.
// The price shown comes from the server. Words only ever reach the page as textContent.
import { track, rememberPrice } from './track.js';
import { MESSAGE_LIMIT, NAME_LIMIT, cleanText, giftLink } from './link.js';
import { DEFAULT_OCCASION, LABELS, OCCASIONS, PRICE, applyOccasion, paidItems } from './occasions.js';
import { addDeluxe, deluxeInUse, keepFree, lookOf } from './look.js';
import { applyPreset } from './presets.js';
import { BLOCKED_NOTE, greetingBlocked, isBlocked } from './moderate.js';

const TEXT_WEIGHT = 0.7; // how often the live show spells the message while building

export function create(ctx) {
  const { config, container, signal } = ctx;
  const state = { occasion: DEFAULT_OCCASION, deluxe: false, typed: false, paying: false, guessed: false, baseline: '' };
  // The show as the app itself leaves it (the defaults, or the last occasion look applied):
  // anything different was set by the person, by playing with Customize or the panel, or
  // saved from their last visit, and is theirs to send. Worked out before anything changes.
  const lookJson = () => JSON.stringify(lookOf(config));
  const fresh = structuredClone(config);
  applyPreset(fresh, 'Default');
  state.baseline = JSON.stringify(lookOf(fresh));
  const designIsMine = () => lookJson() !== state.baseline;
  let price = PRICE;
  let priceCents = Math.round(Number(String(PRICE).replace(/[^0-9.]/g, '')) * 100) || 499;
  // The real price, from the server (a test price while trying out checkout).
  if (/^https?:$/.test(location.protocol)) {
    fetch('/api/config', { signal }).then((response) => (response.ok ? response.json() : null)).then((data) => {
      if (data && data.priceCents >= 50) {
        price = `$${(data.priceCents / 100).toFixed(2)}`;
        priceCents = data.priceCents;
        refresh();
      }
    }, () => {});
  }

  // "Send a fireworks show" where it fits; "Send a show" on a narrow phone, beside Customize.
  const open = el('button', 'send-open');
  open.append('🎆 Send a ', el('span', 'send-open-wide', 'fireworks '), 'show');
  open.type = 'button';

  // The sheet.
  const sheet = el('form', 'send-box builder');
  sheet.hidden = true;
  sheet.noValidate = true;
  const close = el('button', 'send-close', 'Close');
  close.type = 'button';
  const head = el('div', 'builder-head');
  head.append(el('p', 'send-title', 'Send a fireworks show'), close);
  const chips = el('div', 'builder-chips');
  chips.setAttribute('role', 'radiogroup');
  chips.setAttribute('aria-label', 'Occasion');
  const chipFor = {};
  for (const name in OCCASIONS) {
    const chip = el('button', 'builder-chip', OCCASIONS[name].label);
    chip.type = 'button';
    chip.setAttribute('role', 'radio');
    chip.addEventListener('click', () => choose(name), { signal });
    chipFor[name] = chip;
    chips.append(chip);
  }
  // Shown when the show being sent is the one the person set up themselves.
  const own = el('p', 'builder-own');
  const ownText = el('span', '', '✓ Your show is included: the colours, fireworks and sky you set up.');
  const ownReset = el('button', 'builder-own-reset');
  ownReset.type = 'button';
  own.append(ownText, ownReset);
  ownReset.addEventListener('click', () => choose(state.occasion, true), { signal });
  const message = field('Message', MESSAGE_LIMIT, 'builder-loud');
  const to = field('Their name (optional)', NAME_LIMIT, 'builder-loud');
  const from = field('From (optional)', MESSAGE_LIMIT, '');
  // The words go up in the live show: the sky text follows the message, and a moment
  // after typing stops it's spelled once so you see it right away.
  let spellTimer = 0;
  message.input.addEventListener('input', () => {
    state.typed = true;
    clearTimeout(spellTimer);
    // Words that can't go in the sky never reach it, even in the live preview.
    if (isBlocked(words().message)) {
      status.textContent = BLOCKED_NOTE;
      return;
    }
    if (status.textContent === BLOCKED_NOTE) status.textContent = '';
    config.look.text = words().message;
    spellTimer = setTimeout(() => { if (ctx.fireworks && !sheet.hidden) ctx.fireworks.launch('text'); }, 1200);
  }, { signal });

  const included = el('p', 'builder-included');
  const deluxeBox = el('label', 'builder-deluxe');
  const deluxeInput = el('input');
  deluxeInput.type = 'checkbox';
  const deluxeText = el('span');
  const deluxeTitle = el('strong');
  const deluxeList = el('span', 'builder-deluxe-list');
  deluxeText.append(deluxeTitle, deluxeList);
  deluxeBox.append(deluxeInput, deluxeText);
  deluxeInput.addEventListener('change', () => {
    const occasion = OCCASIONS[state.occasion];
    if (deluxeInput.checked) addDeluxe(config, occasion);
    else keepFree(config, occasion);
    refresh();
  }, { signal });
  const customize = el('button', 'send-secondary builder-customize', '🎨 Customize the show');
  customize.type = 'button';
  customize.addEventListener('click', () => {
    show('studio');
    if (ctx.studio) ctx.studio.open(() => { show('sheet'); refresh(); });
  }, { signal });

  const row = el('div', 'send-row');
  const preview = el('button', 'send-secondary', 'Preview the show');
  preview.type = 'button';
  const send = el('button', 'send-primary');
  send.type = 'submit';
  row.append(preview, send);
  const status = el('p', 'send-status');
  status.setAttribute('role', 'status');
  const linkBox = el('input', 'send-link');
  linkBox.readOnly = true;
  linkBox.hidden = true;
  linkBox.setAttribute('aria-label', 'Link to send');
  const terms = el('p', 'builder-terms');
  const termsLink = el('a', '', 'Terms');
  termsLink.href = '/terms';
  termsLink.target = '_blank';
  termsLink.rel = 'noopener';
  const privacyLink = el('a', '', 'Privacy');
  privacyLink.href = '/privacy';
  privacyLink.target = '_blank';
  privacyLink.rel = 'noopener';
  terms.append('By sending, you agree to SkyGreeting’s ', termsLink, '. ', privacyLink, '.');
  sheet.append(head, chips, own, message.label, to.label, from.label, customize, included, deluxeBox, row, linkBox, status, terms);

  // While a preview plays: a slim bar instead of the sheet.
  const bar = el('div', 'builder-bar');
  bar.hidden = true;
  const edit = el('button', 'send-secondary', 'Edit');
  edit.type = 'button';
  const barSend = el('button', 'send-primary');
  barSend.type = 'button';
  // Record the preview as a video to post (watermarked: it isn't a paid greeting yet).
  const film = el('button', 'send-secondary builder-film', '🎬 Save video');
  film.type = 'button';
  film.title = 'Save as video';
  film.setAttribute('aria-label', 'Save as video');
  film.hidden = !(ctx.video && ctx.video.supported);
  film.addEventListener('click', () => {
    if (!wordsOk() || !ctx.video || !ctx.director) return;
    show('closed');
    track('save_video', { content_type: state.occasion, method: 'builder' });
    ctx.video.capture({
      watermark: true,
      name: `skygreeting-${state.occasion}`,
      play: () => ctx.director.play(OCCASIONS[state.occasion], words(), state.deluxe),
    });
  }, { signal });
  bar.append(edit, film, barSend);

  // When checkout can't start: say why, and offer the free version.
  const soon = el('div', 'send-box');
  soon.hidden = true;
  const soonFree = el('button', 'send-primary', 'Send the free version');
  soonFree.type = 'button';
  const soonBack = el('button', 'send-secondary', 'Back');
  soonBack.type = 'button';
  const soonRow = el('div', 'send-row');
  soonRow.append(soonBack, soonFree);
  const soonText = el('p', 'send-status');
  soon.append(el('p', 'send-title', 'Checkout couldn’t start'), soonText, soonRow);

  container.append(open, sheet, bar, soon);

  // `fresh`: use the occasion's own look even over a show the person set up.
  function choose(name, fresh = false) {
    state.occasion = name;
    if (!state.typed || !message.input.value.trim()) {
      message.input.value = OCCASIONS[name].message;
      state.typed = false;
    }
    // A show the person set up is kept as it is; the occasion then gives only the words
    // and the ending. Otherwise the occasion's look (scene, fireworks, ground show) is applied.
    if (fresh || !designIsMine()) {
      applyOccasion(config, name, deluxeInput.checked);
      state.baseline = lookJson();
    }
    config.look.text = words().message;
    config.look.mix.text = TEXT_WEIGHT;
    refresh();
  }

  function refresh() {
    const occasion = OCCASIONS[state.occasion];
    // Paid if Deluxe is ticked or the design uses any Deluxe effect.
    const used = deluxeInUse(config, occasion);
    if (used.length && !deluxeInput.checked) deluxeInput.checked = true;
    state.deluxe = deluxeInput.checked;
    for (const name in chipFor) chipFor[name].setAttribute('aria-checked', String(name === state.occasion));
    own.hidden = !designIsMine();
    ownReset.textContent = `Use the ${occasion.label} look instead`;
    included.textContent = `Free: ${occasion.free.map((item) => LABELS[item]).join(', ')}`;
    deluxeList.textContent = `Adds ${occasion.deluxe.map((item) => LABELS[item]).join(', ')}`;
    deluxeTitle.textContent = `✦ Deluxe · ${price} to send`;
    const label = state.deluxe ? `Send · ${price} ✦` : 'Send · Free';
    send.textContent = label;
    barSend.textContent = label;
  }

  function show(which) {
    sheet.hidden = which !== 'sheet';
    bar.hidden = which !== 'bar';
    soon.hidden = which !== 'soon';
    open.hidden = which !== 'closed';
    state.view = which;
    container.classList.toggle('building', which !== 'closed');
    if (which !== 'bar' && ctx.director) ctx.director.stop();
  }

  function words() {
    return {
      message: cleanText(message.input.value, MESSAGE_LIMIT).toUpperCase() || OCCASIONS[state.occasion].message,
      to: cleanText(to.input.value, NAME_LIMIT).toUpperCase(),
    };
  }

  // The message, their name and the sender's name, checked before anything is shown or sent.
  function wordsOk() {
    if (!greetingBlocked({ ...words(), from: from.input.value })) return true;
    show('sheet');
    status.textContent = BLOCKED_NOTE;
    return false;
  }

  function startPreview() {
    if (!wordsOk()) return;
    show('bar');
    if (ctx.director) ctx.director.play(OCCASIONS[state.occasion], words(), state.deluxe);
  }

  function sendIt() {
    if (!wordsOk()) return;
    if (state.deluxe) {
      payForDeluxe();
      return;
    }
    show('sheet');
    const url = giftLink({ occasion: state.occasion, ...words(), from: from.input.value, look: lookOf(config) });
    track('share', { method: 'free_link', content_type: state.occasion });
    linkBox.value = url;
    linkBox.hidden = false;
    linkBox.select();
    const sender = cleanText(from.input.value, MESSAGE_LIMIT);
    const note = sender ? `${sender} made you a SkyGreeting` : 'Someone made you a SkyGreeting';
    if (navigator.share) {
      navigator.share({ title: 'A SkyGreeting for you', text: note, url }).then(() => { status.textContent = 'Sent.'; }, () => copy(url));
    } else {
      copy(url);
    }
  }

  // Saves the greeting on the server and goes to Stripe's checkout page.
  async function payForDeluxe() {
    if (state.paying) return;
    state.paying = true;
    show('sheet');
    status.textContent = 'Opening secure checkout…';
    track('begin_checkout', { currency: 'USD', value: priceCents / 100, items: [{ item_name: 'SkyGreeting Deluxe', item_category: state.occasion }] });
    rememberPrice(priceCents);
    let error = 'Checkout isn’t available right now.';
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ occasion: state.occasion, ...words(), from: from.input.value, look: lookOf(config) }),
      });
      const data = await response.json();
      if (response.ok && data.url) {
        location.assign(data.url);
        return;
      }
      if (data.error) error = data.error;
    } catch {
      // Offline, or not on the real site (the preview has no server).
    } finally {
      state.paying = false;
    }
    soonText.textContent = `${error} You can send the free version now.`;
    status.textContent = '';
    show('soon');
  }

  function copy(url) {
    status.textContent = 'The link is in the box. Copy it and send it.';
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => { status.textContent = 'Link copied. Paste it in a text or DM.'; }, () => {});
    }
  }

  // The occasion a show set up by the person most likely is for: Halloween's fireworks or
  // palette mean Halloween; otherwise the palette hints (red, white and blue: congrats;
  // pastels: love; gold: thank you), and anything else is a birthday.
  function guessOccasion() {
    if (state.guessed) return;
    state.guessed = true;
    if (state.typed || !designIsMine()) return;
    const mix = config.look.mix;
    const spooky = ['pumpkin', 'skull', 'bat', 'ghost', 'web', 'brew', 'eyes', 'wisp'].some((type) => mix[type] > 0);
    const byPalette = { halloween: 'halloween', usa: 'congrats', pastel: 'love', gold: 'thanks' };
    state.occasion = spooky ? 'halloween' : byPalette[config.look.palette] || 'birthday';
  }

  open.addEventListener('click', () => {
    guessOccasion();
    choose(state.occasion);
    status.textContent = '';
    linkBox.hidden = true;
    show('sheet');
  }, { signal });
  close.addEventListener('click', () => show('closed'), { signal });
  sheet.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') show('closed');
  }, { signal });
  preview.addEventListener('click', startPreview, { signal });
  edit.addEventListener('click', () => show('sheet'), { signal });
  sheet.addEventListener('submit', (event) => {
    event.preventDefault();
    sendIt();
  }, { signal });
  barSend.addEventListener('click', sendIt, { signal });
  soonBack.addEventListener('click', () => show('sheet'), { signal });
  soonFree.addEventListener('click', () => {
    deluxeInput.checked = false;
    keepFree(config, OCCASIONS[state.occasion]);
    refresh();
    sendIt();
  }, { signal });

  ctx.builder = {
    open: () => open.click(),
    refresh: () => refresh(),
    /** Forget the show as it is now: the next open applies an occasion's own look. */
    startFresh() {
      state.baseline = lookJson();
      state.guessed = false;
    },
    /** The Deluxe effects, for Customize's ✦ marks: always, so playing with the show first shows what's paid too. */
    get deluxe() { return [...paidItems(OCCASIONS[state.occasion])]; },
    get price() { return price; },
    get summary() { return state.view && state.view !== 'closed' ? `${OCCASIONS[state.occasion].label} greeting · ${send.textContent}` : ''; },
  };
  refresh();

  return {
    update() {},
    dispose() {
      clearTimeout(spellTimer);
      open.remove();
      sheet.remove();
      bar.remove();
      soon.remove();
      container.classList.remove('building');
      ctx.builder = null;
    },
  };

  function field(name, limit, className) {
    const label = el('label', `send-field ${className}`.trim());
    const input = el('input');
    input.maxLength = limit;
    input.autocomplete = 'off';
    input.spellcheck = false;
    label.append(el('span', '', name), input);
    return { label, input };
  }
}

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}
