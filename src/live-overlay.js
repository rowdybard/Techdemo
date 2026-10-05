// The live overlay: plain DOM over the scene. In the 9:16 frame it spans the water and sand
// below the ground show; in the 16:9 frame it sits in the bottom-left corner. Either way
// the sky stays clear. It shows the chat
// commands always on screen, the streamer's plug line, a feed of who
// launched what, the top gifters, a like goal bar, the queue, and a banner for
// countdowns and big moments.
// Every text goes in with textContent: viewers' names are untrusted.

const FEED = 2; // lines in the feed
const FEED_SECONDS = 9;
const EFFECT_WORDS = { fountain: 'ground show', name: 'your name', barrage: 'barrage', finale: 'finale' };
const dollars = (cents) => `$${cents % 100 ? (cents / 100).toFixed(2) : cents / 100}`;

export function createOverlay(container, signal, plug = '', tall = false) {
  const style = document.createElement('link');
  style.rel = 'stylesheet';
  style.href = new URL('./live.css', import.meta.url).href;
  document.head.append(style);

  const root = el('div', 'live-overlay');
  root.innerHTML = `
    <div class="live-top">
    <div class="live-row">
    <ol class="live-feed"></ol>
    <aside class="live-side">
      <section class="live-leaders" hidden><h2>Top fans</h2><ol></ol></section>
      <section class="live-likes"><div class="live-likes-text"></div><div class="live-bar"><i></i></div></section>
      <section class="live-queue" hidden></section>
    </aside>
    </div>
    <dl class="live-commands">
      <dt>FREE</dt><dd><code>!heart</code> <code>!star</code> <code>!boom</code> <code>!chaos</code> <code>!ghost</code></dd>
      <dt>+ colour</dt><dd><code>!pink heart</code> · <code>!blue ring</code></dd>
      <dt class="live-sky-price">💲 $2</dt><dd><code>!birthday NAME</code> · <code>!sky WORDS</code></dd>
      <dt>SUPER CHAT</dt><dd class="live-tiers">$1 ground show · $2 your name · $5 barrage · $20 finale</dd>
    </dl>
    <span class="live-plug"></span>
    </div>
    <div class="live-banner" hidden><b></b><span></span></div>
    <div class="live-offline" hidden>Waiting for the live bridge…</div>`;
  container.append(root);
  const $ = (selector) => root.querySelector(selector);
  const plugLine = $('.live-plug');
  plugLine.textContent = plug;
  plugLine.hidden = !plug;
  const feedList = $('.live-feed');
  const leadersBox = $('.live-leaders');
  const likesText = $('.live-likes-text');
  const likesBar = $('.live-bar i');
  const queueBox = $('.live-queue');
  const banner = $('.live-banner');
  const offlineBox = $('.live-offline');

  // Sizes are in --u, a hundredth of a 9:16 frame's width (of the same height when wide),
  // so the overlay scales with the frame and reads the same in either shape.
  const unit = () => (tall ? root.clientWidth : Math.min(root.clientWidth, (root.clientHeight * 9) / 16)) / 100;
  const resize = new ResizeObserver(() => root.style.setProperty('--u', `${unit()}px`));
  resize.observe(root);

  let bannerTimer = 0;
  let countTimer = 0;
  signal.addEventListener('abort', () => {
    clearTimeout(bannerTimer);
    clearInterval(countTimer);
  });

  function showBanner(title, line, seconds) {
    clearTimeout(bannerTimer);
    clearInterval(countTimer);
    banner.querySelector('b').textContent = title;
    banner.querySelector('span').textContent = line;
    banner.hidden = false;
    bannerTimer = setTimeout(() => { banner.hidden = true; }, seconds * 1000);
  }

  return {
    feed(text, special = false) {
      const item = el('li', special ? 'live-special' : '');
      item.textContent = text;
      item.style.animationDuration = `${FEED_SECONDS}s`;
      feedList.prepend(item);
      while (feedList.children.length > FEED) feedList.lastElementChild.remove();
      item.addEventListener('animationend', () => item.remove(), { once: true });
    },

    leaders(top) {
      const list = leadersBox.querySelector('ol');
      list.replaceChildren(...top.map(({ name, diamonds }, k) => {
        const item = el('li');
        item.textContent = `${['🥇', '🥈', '🥉'][k]} ${name} · ${dollars(diamonds)}`;
        return item;
      }));
      leadersBox.hidden = top.length === 0;
    },

    likes(total, goal, step) {
      likesText.textContent = `❤️ ${total.toLocaleString('en-US')} / ${goal.toLocaleString('en-US')} → finale`;
      // The bar fills over the current step toward the goal.
      likesBar.style.width = `${Math.min(100, Math.max(0, ((total - (goal - step)) / step) * 100))}%`;
    },

    // What words in the sky cost, and what each Super Chat amount does (from settings.mjs).
    prices(sky, tiers) {
      $('.live-sky-price').textContent = sky > 0 ? `💲 ${dollars(sky)}` : 'ALSO FREE';
      const line = tiers.filter(([min, effect]) => min > 0 && EFFECT_WORDS[effect]).map(([min, effect]) => `${dollars(min)} ${EFFECT_WORDS[effect]}`).join(' · ');
      if (line) $('.live-tiers').textContent = line;
    },

    queue(count) {
      queueBox.hidden = count === 0;
      queueBox.textContent = `✨ ${count} in the sky queue`;
    },

    banner(text, seconds) {
      showBanner(text, '', seconds);
    },

    countdown(title, line, seconds) {
      let left = seconds;
      showBanner(title, `${line} · ${left}`, seconds + 0.5);
      countTimer = setInterval(() => {
        left -= 1;
        banner.querySelector('span').textContent = left > 0 ? `${line} · ${left}` : line;
        if (left <= 0) clearInterval(countTimer);
      }, 1000);
    },

    offline(down) {
      offlineBox.hidden = !down;
    },

    dispose() {
      resize.disconnect();
      root.remove();
      style.remove();
    },
  };
}

function el(tag, className = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}
