// Hero mode: hides the panel and debug overlay and lays a headline and button over the
// scene, so the page reads like a real website header. The text comes from config.hero,
// which client links and the panel's Client mockup folder set (the default business is
// invented). It's always set as plain text, never HTML, because links can carry it. A
// small Customize button brings the panel back, which matters on phones with no keyboard.

const LIMITS = { business: 48, headline: 90, copy: 160, button: 32 };

export function createHero({ container, signal, config }, onExit) {
  const layer = document.createElement('div');
  layer.className = 'hero';
  const kicker = document.createElement('p');
  kicker.className = 'hero-kicker';
  const title = document.createElement('h1');
  title.className = 'hero-title';
  const copy = document.createElement('p');
  copy.className = 'hero-copy';
  const button = document.createElement('a');
  button.className = 'hero-button';
  button.href = '#reserve';
  layer.append(kicker, title, copy, button);

  const exit = document.createElement('button');
  exit.type = 'button';
  exit.className = 'hero-exit';
  exit.textContent = 'Customize';
  container.append(layer, exit);

  // The sample button goes nowhere.
  button.addEventListener('click', (event) => event.preventDefault(), { signal });
  exit.addEventListener('click', onExit, { signal });

  function refresh() {
    const text = config.hero;
    kicker.textContent = String(text.business).slice(0, LIMITS.business);
    title.textContent = String(text.headline).slice(0, LIMITS.headline);
    copy.textContent = String(text.copy).slice(0, LIMITS.copy);
    button.textContent = String(text.button).slice(0, LIMITS.button);
  }
  refresh();

  return {
    refresh,
    set(on) {
      container.classList.toggle('hero-mode', on);
    },
    dispose() {
      container.classList.remove('hero-mode');
      layer.remove();
      exit.remove();
    },
  };
}
