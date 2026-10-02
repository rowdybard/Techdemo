// Fireworks messages. "Send fireworks" opens a small composer: type a message (a name,
// HAPPY BDAY SAM, MARRY ME?) and who it's from, preview it in the sky, and share a link.
// Whoever opens that link (?msg=…&from=…, read in link.js) sees the message spelled in
// fireworks every few seconds, with a card saying who sent it and a button to send
// their own, so every message brings the next person in.
//
// Message text only ever reaches the page as textContent and the sky as canvas text.
import { MESSAGE_LIMIT, cleanText, giftLink } from './link.js';

const FIRST_SPELL = 1.2; // seconds after opening
const SPELL_EVERY = 13;

export function create(ctx) {
  const { config, container, signal } = ctx;
  const gift = ctx.link.gift;
  let nextSpell = gift ? FIRST_SPELL : Infinity;

  // The button that opens the composer.
  const open = element('button', 'send-open', 'Send someone fireworks');
  open.type = 'button';

  // The composer.
  const composer = element('form', 'send-box');
  composer.hidden = true;
  composer.noValidate = true;
  const title = element('p', 'send-title', 'Spell a message in fireworks');
  const message = field('Message', 'HAPPY BIRTHDAY SAM');
  const from = field('From (optional)', 'Your name');
  const row = element('div', 'send-row');
  const preview = element('button', 'send-secondary', 'Preview');
  preview.type = 'button';
  const share = element('button', 'send-primary', 'Get the link');
  share.type = 'submit';
  row.append(preview, share);
  const linkBox = element('input', 'send-link');
  linkBox.readOnly = true;
  linkBox.hidden = true;
  linkBox.setAttribute('aria-label', 'Link to send');
  const status = element('p', 'send-status');
  status.setAttribute('role', 'status');
  const close = element('button', 'send-close', 'Close');
  close.type = 'button';
  composer.append(title, message.label, from.label, row, linkBox, status, close);

  // The card someone sees when they open a message.
  const card = element('div', 'gift-card');
  card.hidden = !gift;
  if (gift) {
    const who = gift.from ? `${gift.from} sent you fireworks` : 'Someone sent you fireworks';
    const again = element('button', 'send-secondary', 'Again');
    again.type = 'button';
    const yours = element('button', 'send-primary', 'Send your own');
    yours.type = 'button';
    const buttons = element('div', 'send-row');
    buttons.append(again, yours);
    const explore = element('button', 'send-close', 'Play with the show');
    explore.type = 'button';
    card.append(element('p', 'gift-from', who), buttons, explore);
    again.addEventListener('click', () => spell(gift.message), { signal });
    // Back to the full sandbox: the panel, the send button and the hints.
    explore.addEventListener('click', () => {
      container.classList.remove('gift-mode');
      card.remove();
      nextSpell = Infinity;
    }, { signal });
    yours.addEventListener('click', () => showComposer(true), { signal });
    container.classList.add('gift-mode');
  }
  container.append(open, composer, card);

  function spell(text) {
    const words = cleanText(text, MESSAGE_LIMIT).toUpperCase();
    if (!words || !ctx.fireworks) return;
    config.look.text = words;
    // Longer messages get a wider line so the letters stay readable.
    config.look.textWidth = Math.min(250, Math.max(150, 60 + words.length * 10));
    ctx.fireworks.launch('text');
  }

  function showComposer(on) {
    composer.hidden = !on;
    open.hidden = on;
    card.hidden = on || !gift;
    if (on) {
      status.textContent = '';
      message.input.focus();
    }
  }

  open.addEventListener('click', () => showComposer(true), { signal });
  close.addEventListener('click', () => showComposer(false), { signal });
  composer.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') showComposer(false);
  }, { signal });
  preview.addEventListener('click', () => {
    if (!message.input.value.trim()) {
      status.textContent = 'Type a message first.';
      return;
    }
    spell(message.input.value);
    status.textContent = 'Look up.';
  }, { signal });
  composer.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = message.input.value.trim();
    if (!text) {
      status.textContent = 'Type a message first.';
      return;
    }
    spell(text);
    const url = giftLink(text.toUpperCase(), from.input.value);
    linkBox.value = url;
    linkBox.hidden = false;
    linkBox.select();
    const sender = cleanText(from.input.value, MESSAGE_LIMIT);
    // Phones get the share sheet (texts, DMs); elsewhere it's copied.
    if (navigator.share) {
      navigator.share({ title: 'Fireworks for you', text: sender ? `${sender} sent you fireworks` : 'Fireworks for you', url })
        .then(() => { status.textContent = 'Sent.'; }, () => copy(url));
    } else {
      copy(url);
    }
  }, { signal });

  function copy(url) {
    status.textContent = 'The link is in the box. Copy it and send it.';
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => { status.textContent = 'Link copied. Paste it in a text or DM.'; }, () => {});
    }
  }

  function field(name, placeholder) {
    const label = element('label', 'send-field');
    const input = element('input');
    input.maxLength = MESSAGE_LIMIT;
    input.placeholder = placeholder;
    input.autocomplete = 'off';
    input.spellcheck = false;
    label.append(element('span', '', name), input);
    return { label, input };
  }

  return {
    update(dt, time) {
      if (time < nextSpell) return;
      spell(gift.message);
      nextSpell = time + SPELL_EVERY;
    },

    dispose() {
      open.remove();
      composer.remove();
      card.remove();
      container.classList.remove('gift-mode');
    },
  };
}

function element(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}
