// Hero mode: hides the panel and debug overlay and lays a sample headline and button over
// the scene, so the page reads like a real website header. The business is invented. A
// small Customize button brings the panel back, which matters on phones with no keyboard.

export function createHero({ container, signal }, onExit) {
  const layer = document.createElement('div');
  layer.className = 'hero';
  layer.innerHTML = `
    <p class="hero-kicker">Sunset Cove Marina · Sample header</p>
    <h1 class="hero-title">Nights on the water start here.</h1>
    <p class="hero-copy">Slips, rentals and the best seat on the beach for Friday fireworks.</p>
    <a class="hero-button" href="#reserve">Reserve a slip</a>
  `;
  const exit = document.createElement('button');
  exit.type = 'button';
  exit.className = 'hero-exit';
  exit.textContent = 'Customize';
  container.append(layer, exit);

  // The sample button goes nowhere.
  layer.querySelector('.hero-button').addEventListener('click', (event) => event.preventDefault(), { signal });
  exit.addEventListener('click', onExit, { signal });

  return {
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
