import { endingLength } from './director.js';
import { el } from './studio-kit.js';

// Cards commit a send choice. Preview tabs compare versions without choosing payment.
export function createPlans(pick, signal) {
  const cards = group('builder-plans', 'Choose a version to send');
  const bar = group('builder-versions', 'Compare free previews');
  const options = [];
  for (const deluxe of [false, true]) {
    const card = button(deluxe ? 'builder-plan is-deluxe' : 'builder-plan', () => pick(deluxe, false));
    const name = el('strong', 'builder-plan-name'), lines = el('ul', 'builder-plan-lines');
    card.append(name, lines); cards.append(card);
    const tab = button(deluxe ? 'builder-version is-deluxe' : 'builder-version', () => pick(deluxe, true));
    bar.append(tab); options.push({ deluxe, card, name, lines, tab });
  }
  function button(className, click) {
    const node = el('button', className); node.type = 'button'; node.setAttribute('role', 'radio');
    node.addEventListener('click', click, { signal });
    node.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const other = [...node.parentElement.children].find((item) => item !== node);
      other?.focus(); other?.click();
    }, { signal });
    return node;
  }
  return {
    cards, bar,
    show(occasion, tier, price, previewTier = tier || 'deluxe') {
      for (const item of options) {
        const value = item.deluxe ? 'deluxe' : 'free';
        const seconds = Math.round(endingLength(occasion, item.deluxe));
        item.name.textContent = item.deluxe ? `Full Deluxe show · ${price}` : 'Free version · $0';
        const lines = item.deluxe
          ? [`${seconds}-second show and grand finale`, 'All effects and side-barge fountains', 'Gift-wrapped, with your signature', 'Clean video; private link never expires']
          : [`${seconds}-second show`, 'Your colours, words and their name', 'Free effects; center-barge show', 'Video with a small mark'];
        item.lines.replaceChildren(...lines.map((line) => el('li', '', line)));
        item.tab.textContent = `${item.deluxe ? 'Deluxe' : 'Free'} preview · ${seconds} s`;
        item.card.setAttribute('aria-checked', String(tier === value));
        item.tab.setAttribute('aria-checked', String(previewTier === value));
        item.card.tabIndex = tier === value || tier === null && !item.deluxe ? 0 : -1;
        item.tab.tabIndex = previewTier === value ? 0 : -1;
      }
    },
    glow() {},
  };
}
function group(className, label) { const node = el('div', className); node.setAttribute('role', 'radiogroup'); node.setAttribute('aria-label', label); return node; }
