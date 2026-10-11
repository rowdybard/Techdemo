// Shared visit and greeting-page attribution. Never send query strings, fragments,
// greeting titles, names or words. Keep the existing regional consent defaults.
const PUBLIC_PAGES = new Set(['/', '/autoshow', '/about', '/ideas', '/birthday-fireworks',
  '/love-you-fireworks', '/congratulations-fireworks', '/thank-you-fireworks',
  '/halloween-fireworks-ecard', '/new-years-eve-virtual-fireworks', '/name-in-fireworks',
  '/silent-fireworks', '/gift-for-someone-who-has-everything']);
const OCCASIONS = new Set(['birthday', 'love', 'congrats', 'thanks', 'halloween', 'newyear']);

function setupAnalytics() {
  const query = new URLSearchParams(location.search);
  if (query.get('embed') === '1' || !['skygreeting.com', 'www.skygreeting.com'].includes(location.hostname)) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  const gtag = window.gtag;
  gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'granted' });
  gtag('consent', 'default', { analytics_storage: 'denied', region: ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO', 'GB', 'CH'] });
  const path = PUBLIC_PAGES.has(location.pathname) ? location.pathname : '/';
  const privateGreeting = query.has('g') || query.has('msg');
  const view = privateGreeting ? 'greeting' : query.get('hero') === '1' ? 'hero' : '';
  let referrer = '';
  try {
    const url = new URL(document.referrer);
    // Referrer queries can contain private greetings or search terms. Only public
    // local page paths are useful for this funnel; external origins identify sources.
    referrer = url.origin + (url.origin === location.origin && PUBLIC_PAGES.has(url.pathname) ? url.pathname : '/');
  } catch { /* An absent or invalid referrer is normal. */ }
  gtag('js', new Date());
  gtag('config', 'G-BTBT8MCNPJ', {
    page_referrer: referrer,
    page_location: location.origin + path + (view ? '?view=' + view : ''),
    page_title: privateGreeting ? 'SkyGreeting greeting' : document.title,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });

  document.addEventListener('click', (event) => {
    const link = event.target.closest?.('a[data-sg-make]');
    if (!link || path === '/' || !PUBLIC_PAGES.has(location.pathname)) return;
    const url = new URL(link.href, location.origin);
    const occasion = url.searchParams.get('make');
    if (url.origin !== location.origin || url.pathname !== '/' || !OCCASIONS.has(occasion)) return;
    gtag('event', 'landing_cta', { page_slug: path.slice(1), content_type: occasion });
  });

  let loaded = false;
  function load() {
    if (loaded) return;
    loaded = true;
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=G-BTBT8MCNPJ';
    document.head.appendChild(script);
  }
  if (document.getElementById('app')) {
    addEventListener('scene-ready', load, { once: true });
    setTimeout(load, 6000);
  } else if (document.readyState === 'complete') load();
  else addEventListener('load', load, { once: true });
}

setupAnalytics();
