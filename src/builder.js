// The greeting builder: "Make a SkyGreeting". Pick an occasion, write the words, see
// what's free and what Deluxe adds (marked ✦, with the price always in view), preview
// the whole show, then send it. Nothing asks for money while you're making it; the
// send button says up front whether this one is free or $4.99.
//
// Paid sending isn't wired to a payment provider yet: a Deluxe send explains that and
// offers the free version. Words only ever reach the page as textContent.
import { MESSAGE_LIMIT, NAME_LIMIT, cleanText, giftLink } from './link.js';
import { DEFAULT_OCCASION, LABELS, OCCASIONS, PRICE, applyOccasion } from './occasions.js';

export function create(ctx) {
  const { config, container, signal } = ctx;
  const state = { occasion: DEFAULT_OCCASION, deluxe: false, typed: false };

  const open = el('button', 'send-open', 'Make a SkyGreeting');
  open.type = 'button';

  // The sheet.
  const sheet = el('form', 'send-box builder');
  sheet.hidden = true;
  sheet.noValidate = true;
  const close = el('button', 'send-close', 'Close');
  close.type = 'button';
  const head = el('div', 'builder-head');
  head.append(el('p', 'send-title', 'Make a SkyGreeting'), close);
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
  const message = field('Message', MESSAGE_LIMIT, 'builder-loud');
  const to = field('Their name (optional)', NAME_LIMIT, 'builder-loud');
  const from = field('From (optional)', MESSAGE_LIMIT, '');
  message.input.addEventListener('input', () => { state.typed = true; }, { signal });

  const included = el('p', 'builder-included');
  const deluxeBox = el('label', 'builder-deluxe');
  const deluxeInput = el('input');
  deluxeInput.type = 'checkbox';
  const deluxeText = el('span');
  const deluxeTitle = el('strong', '', `✦ Deluxe · ${PRICE} to send`);
  const deluxeList = el('span', 'builder-deluxe-list');
  deluxeText.append(deluxeTitle, deluxeList);
  deluxeBox.append(deluxeInput, deluxeText);
  deluxeInput.addEventListener('change', () => {
    state.deluxe = deluxeInput.checked;
    applyOccasion(config, state.occasion, state.deluxe);
    refresh();
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
  sheet.append(head, chips, message.label, to.label, from.label, included, deluxeBox, row, linkBox, status);

  // While a preview plays: a slim bar instead of the sheet.
  const bar = el('div', 'builder-bar');
  bar.hidden = true;
  const edit = el('button', 'send-secondary', 'Edit');
  edit.type = 'button';
  const barSend = el('button', 'send-primary');
  barSend.type = 'button';
  bar.append(edit, barSend);

  // A Deluxe send, until checkout exists.
  const soon = el('div', 'send-box');
  soon.hidden = true;
  const soonFree = el('button', 'send-primary', 'Send the free version');
  soonFree.type = 'button';
  const soonBack = el('button', 'send-secondary', 'Back');
  soonBack.type = 'button';
  const soonRow = el('div', 'send-row');
  soonRow.append(soonBack, soonFree);
  soon.append(el('p', 'send-title', '✦ Deluxe checkout opens in a few days'),
    el('p', 'send-status', 'Your Deluxe show is ready to go the moment it does. You can send the free version now.'), soonRow);

  container.append(open, sheet, bar, soon);

  function choose(name) {
    state.occasion = name;
    if (!state.typed || !message.input.value.trim()) {
      message.input.value = OCCASIONS[name].message;
      state.typed = false;
    }
    applyOccasion(config, name, state.deluxe);
    refresh();
  }

  function refresh() {
    const occasion = OCCASIONS[state.occasion];
    for (const name in chipFor) chipFor[name].setAttribute('aria-checked', String(name === state.occasion));
    included.textContent = `Free: ${occasion.free.map((item) => LABELS[item]).join(', ')}`;
    deluxeList.textContent = `Adds ${occasion.deluxe.map((item) => LABELS[item]).join(', ')}`;
    const label = state.deluxe ? `Send · ${PRICE} ✦` : 'Send · Free';
    send.textContent = label;
    barSend.textContent = label;
  }

  function show(which) {
    sheet.hidden = which !== 'sheet';
    bar.hidden = which !== 'bar';
    soon.hidden = which !== 'soon';
    open.hidden = which !== 'closed';
    container.classList.toggle('building', which !== 'closed');
    if (which !== 'bar' && ctx.director) ctx.director.stop();
  }

  function words() {
    return {
      message: cleanText(message.input.value, MESSAGE_LIMIT).toUpperCase() || OCCASIONS[state.occasion].message,
      to: cleanText(to.input.value, NAME_LIMIT).toUpperCase(),
    };
  }

  function startPreview() {
    show('bar');
    if (ctx.director) ctx.director.play(OCCASIONS[state.occasion], words(), state.deluxe);
  }

  function sendIt() {
    if (state.deluxe) {
      show('soon');
      return;
    }
    show('sheet');
    const url = giftLink({ occasion: state.occasion, ...words(), from: from.input.value });
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

  function copy(url) {
    status.textContent = 'The link is in the box. Copy it and send it.';
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => { status.textContent = 'Link copied. Paste it in a text or DM.'; }, () => {});
    }
  }

  open.addEventListener('click', () => {
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
    state.deluxe = false;
    deluxeInput.checked = false;
    applyOccasion(config, state.occasion, false);
    refresh();
    sendIt();
  }, { signal });

  ctx.builder = { open: () => open.click() };
  refresh();

  return {
    update() {},
    dispose() {
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
