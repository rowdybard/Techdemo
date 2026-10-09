// Free or Deluxe, as the builder offers them: two cards in its sheet (what each one gives and how
// long its show runs) and a switch on the bar while a preview plays. Both pick the version that
// will be sent; the switch also plays it, so the difference is seen before paying, and its Deluxe
// side glows once a free preview is over, in case they haven't looked.
import { endingLength } from './director.js';

/** `pick(deluxe, fromPreview)` is called when either one is tapped. */
export function createPlans(pick, signal) {
  const cards = group('builder-plans', 'Free or Deluxe');
  const freeCard = card(false);
  const deluxeCard = card(true);
  cards.append(freeCard.node, deluxeCard.node);

  const bar = group('builder-versions', 'Which show');
  const freeSide = side(false);
  const deluxeSide = side(true);
  bar.append(freeSide, deluxeSide);
  let glowing = false;

  function card(deluxe) {
    const node = button(deluxe ? 'builder-plan is-deluxe' : 'builder-plan', () => pick(deluxe, false));
    const name = el('strong', 'builder-plan-name');
    const lines = el('ul', 'builder-plan-lines');
    node.append(name, lines);
    return { node, name, lines, said: '' };
  }

  function side(deluxe) {
    return button(deluxe ? 'builder-version is-deluxe' : 'builder-version', () => pick(deluxe, true));
  }

  function button(className, onClick) {
    const node = el('button', className);
    node.type = 'button';
    node.setAttribute('role', 'radio');
    node.addEventListener('click', onClick, { signal });
    return node;
  }

  // Fills a card, only when its text changes (the builder refreshes on every keystroke).
  function describe(target, name, lines) {
    const said = name + lines.join('|');
    if (said === target.said) return;
    target.said = said;
    target.name.textContent = name;
    target.lines.replaceChildren(...lines.map((line) => el('li', '', line)));
  }

  return {
    cards,
    bar,
    /** Shows `occasion`'s two versions, `deluxe` the one picked, at `price`. */
    show(occasion, deluxe, price) {
      const free = Math.round(endingLength(occasion, false));
      const paid = Math.round(endingLength(occasion, true));
      describe(freeCard, 'Free', [`${free}-second show`, 'Your words and their name', 'Video with a small mark']);
      describe(deluxeCard, `✦ Deluxe · ${price}`, [`${paid}-second show with a grand finale`, 'Opens gift-wrapped', 'Signed in the sky, your initials in a heart', 'Clean video, link never expires']);
      freeSide.textContent = `Free · ${free} s`;
      deluxeSide.textContent = `✦ Deluxe · ${paid} s`;
      for (const [node, on] of [[freeCard.node, !deluxe], [deluxeCard.node, deluxe], [freeSide, !deluxe], [deluxeSide, deluxe]]) {
        node.setAttribute('aria-checked', String(on));
      }
    },
    /** The Deluxe side of the switch glows (a free preview has ended) or not. */
    glow(on) {
      if (on === glowing) return;
      glowing = on;
      deluxeSide.classList.toggle('is-nudging', on);
    },
  };
}

function group(className, label) {
  const node = el('div', className);
  node.setAttribute('role', 'radiogroup');
  node.setAttribute('aria-label', label);
  return node;
}

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}
