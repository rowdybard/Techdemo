// Building blocks for Customize (studio.js, studio-more.js): elements, sections, swatches, and the
// three kinds of control (a button, a slider, a switch), each wired to the config and redrawn by
// the drawer's refreshers.

export function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

export function section(title, body, className = '') {
  const node = el('div', `studio-section ${className}`.trim());
  node.append(el('h3', '', title), body);
  return node;
}

// A palette's colours (linear RGB, shown as sRGB): round the circle of a swatch, or along a strip.
function css(colors) {
  return colors.map((c) => `rgb(${c.map((v) => Math.round(255 * Math.min(1, v) ** (1 / 2.2))).join(' ')})`);
}
export function gradient(colors) {
  const list = css(colors);
  return `conic-gradient(${list.concat(list[0]).join(', ')})`;
}
export function strip(colors) {
  return `linear-gradient(90deg, ${css(colors).join(', ')})`;
}

/**
 * The controls, bound to this drawer: `refreshers` redraws them from the config, `changed` is a
 * finished change (remembered), `sync` a change still being dragged.
 */
export function controls({ config, signal, refreshers, changed, sync, remember }) {
  function button(className, text, onClick) {
    const node = el('button', className, text);
    node.type = 'button';
    node.addEventListener('click', onClick, { signal });
    return node;
  }

  // def: { name, low, high, get(config) -> 0..1, set(config, 0..1) }
  function slider(def) {
    const row = el('label', 'studio-slider');
    const input = el('input');
    input.type = 'range';
    input.min = '0';
    input.max = '1';
    input.step = '0.01';
    const ends = el('span', 'studio-ends');
    ends.append(el('span', '', def.low), el('span', '', def.high));
    row.append(el('span', 'studio-slider-name', def.name), input, ends);
    input.addEventListener('input', () => { def.set(config, Number(input.value)); sync(); }, { signal });
    input.addEventListener('change', changed, { signal });
    refreshers.push(() => { input.value = String(Math.min(1, Math.max(0, def.get(config)))); });
    return row;
  }

  function toggle(label, get, set) {
    const row = el('label', 'studio-switch');
    const input = el('input');
    input.type = 'checkbox';
    input.setAttribute('role', 'switch');
    input.addEventListener('change', () => { set(input.checked); changed(); }, { signal });
    refreshers.push(() => { input.checked = get(); });
    row.append(el('span', '', label), input);
    return row;
  }

  return { button, slider, toggle };
}
