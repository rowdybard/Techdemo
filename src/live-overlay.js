// The TikTok LIVE overlay: plain DOM over the scene, sized for a 9:16 frame and kept in
// the top half, clear of TikTok's own chat and gift buttons at the bottom and right.
// A title with a rotating how-to line, a feed of who launched what, the top gifters, a
// like goal bar, the dedication queue, and a banner for countdowns and big moments.
// Every text goes in with textContent: viewers' names are untrusted.

const FEED = 4; // lines in the feed
const FEED_SECONDS = 9;
const TIPS = [
  'Type !heart  !purple  !star  !chaos',
  'Mix them: !pink heart  ·  !ring blue',
  '!birthday NAME puts their name in the sky',
  'Gifts launch bigger shows 🌹 🎁 🌌',
  'Halloween: !pumpkin  !ghost  !bat  !skull',
];

export function createOverlay(container, signal) {
  const style = document.createElement('link');
  style.rel = 'stylesheet';
  style.href = new URL('./live.css', import.meta.url).href;
  document.head.append(style);

  const root = el('div', 'live-overlay');
  root.innerHTML = `
    <header class="live-title"><b>🎆 SkyGreeting LIVE</b><span class="live-tip"></span></header>
    <ol class="live-feed"></ol>
    <aside class="live-side">
      <section class="live-leaders" hidden><h2>Top fans</h2><ol></ol></section>
      <section class="live-likes"><div class="live-likes-text"></div><div class="live-bar"><i></i></div></section>
      <section class="live-queue" hidden></section>
    </aside>
    <div class="live-banner" hidden><b></b><span></span></div>
    <div class="live-offline" hidden>Waiting for the live bridge…</div>`;
  container.append(root);
  const $ = (selector) => root.querySelector(selector);
  const tip = $('.live-tip');
  const feedList = $('.live-feed');
  const leadersBox = $('.live-leaders');
  const likesText = $('.live-likes-text');
  const likesBar = $('.live-bar i');
  const queueBox = $('.live-queue');
  const banner = $('.live-banner');
  const offlineBox = $('.live-offline');

  // Sizes are in --u, a hundredth of the frame's width, so the overlay scales with it.
  const resize = new ResizeObserver(() => root.style.setProperty('--u', `${root.clientWidth / 100}px`));
  resize.observe(root);

  let tipIndex = 0;
  tip.textContent = TIPS[0];
  const tips = setInterval(() => {
    tipIndex = (tipIndex + 1) % TIPS.length;
    tip.textContent = TIPS[tipIndex];
  }, 7000);
  let bannerTimer = 0;
  let countTimer = 0;
  signal.addEventListener('abort', () => {
    clearInterval(tips);
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
        item.textContent = `${['🥇', '🥈', '🥉'][k]} ${name} · ${diamonds}💎`;
        return item;
      }));
      leadersBox.hidden = top.length === 0;
    },

    likes(total, goal, step) {
      likesText.textContent = `❤️ ${total.toLocaleString('en-US')} / ${goal.toLocaleString('en-US')} likes → FINALE`;
      // The bar fills over the current step toward the goal.
      likesBar.style.width = `${Math.min(100, Math.max(0, ((total - (goal - step)) / step) * 100))}%`;
    },

    queue(count) {
      queueBox.hidden = count === 0;
      queueBox.textContent = `🎂 ${count} dedication${count === 1 ? '' : 's'} up next`;
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
