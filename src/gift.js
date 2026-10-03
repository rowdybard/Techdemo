// Opening a SkyGreeting (a link from the builder, read in link.js): the scene is set for
// its occasion, the ending plays with the sender's words, and a card says who made it,
// with "Watch again" and "Make one for someone else", so every recipient can become the
// next sender. Older links with only a message play as a birthday-style greeting.
//
// The words only ever reach the page as textContent and the sky as canvas text.
import { OCCASIONS, applyOccasion } from './occasions.js';

const FIRST_PLAY = 1.2; // seconds after opening

export function create(ctx) {
  const { config, container, signal } = ctx;
  const gift = ctx.link.gift;
  if (!gift) return { update() {}, dispose() {} };

  const name = OCCASIONS[gift.occasion] ? gift.occasion : 'birthday';
  const occasion = applyOccasion(config, name, false); // Deluxe greetings will come from checkout
  const words = { message: gift.message, to: gift.to };
  let pending = true; // the ending is due to play
  let playAt = FIRST_PLAY;

  const card = el('div', 'gift-card');
  const who = gift.from ? `${gift.from} made you a SkyGreeting` : 'Someone made you a SkyGreeting';
  const again = el('button', 'send-secondary', 'Watch again');
  again.type = 'button';
  const yours = el('button', 'send-primary', 'Make one for someone else');
  yours.type = 'button';
  const buttons = el('div', 'send-row');
  buttons.append(again, yours);
  const explore = el('button', 'send-close', 'Play with the show');
  explore.type = 'button';
  card.append(el('p', 'gift-from', `✨ ${who}`), buttons, explore);
  container.append(card);
  container.classList.add('gift-mode');

  again.addEventListener('click', () => {
    pending = true;
    playAt = 0;
  }, { signal });
  yours.addEventListener('click', () => leave(true), { signal });
  explore.addEventListener('click', () => leave(false), { signal });

  // Back to the full site: the builder, the panel and the hints.
  function leave(build) {
    container.classList.remove('gift-mode');
    card.remove();
    if (ctx.director) ctx.director.stop();
    if (build && ctx.builder) ctx.builder.open();
  }

  return {
    update(dt, time) {
      if (!pending || time < playAt) return;
      pending = false;
      if (ctx.director) ctx.director.play(occasion, words, false);
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
