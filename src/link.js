// Client links. A link can carry a whole look (the settings JSON, base64 in ?s=) plus the
// header text for a prospect (?business=, ?headline=, ?copy=, ?button=), and open straight
// into hero mode (?hero=1 or #hero) or as a bare embed for a client's site (?embed=1).
// Everything in a link is untrusted: settings go through loadSettings, which only accepts
// known keys with matching types, and text is length-capped and shown with textContent.
import { loadSettings, recall, settingsJSON } from './presets.js';

// Where client links point when the page itself isn't on a public address (a local file
// or the claude.ai preview).
const SITE = 'https://techdemo.maxpug17.workers.dev/';
const TEXT_LIMITS = { business: 48, headline: 90, copy: 160, button: 32 };

/**
 * Applies remembered settings, then anything in the link. Returns how the page should open.
 * Embeds skip the remembered settings: a client's visitors get exactly what the link says.
 */
export function readLink(config) {
  let params;
  try {
    params = new URLSearchParams(location.search);
  } catch {
    params = new URLSearchParams();
  }
  const embed = params.get('embed') === '1';
  if (!embed) recall(config);

  const packed = params.get('s');
  if (packed) {
    const json = unpack(packed);
    if (json) loadSettings(config, json);
  }
  for (const key in TEXT_LIMITS) {
    const value = params.get(key);
    if (value) config.hero[key] = value.slice(0, TEXT_LIMITS[key]);
  }
  // Embedded headers stay quiet unless the link asks for sound.
  if (embed && params.get('sound') !== '1') config.sound.enabled = false;
  return {
    embed,
    hero: embed || params.get('hero') === '1' || location.hash === '#hero',
  };
}

/** A link that opens this exact look and header text, in hero mode or as an embed. */
export function clientLink(config, embed = false) {
  const base = /^https?:$/.test(location.protocol) && !/claude|usercontent/.test(location.hostname)
    ? location.origin + location.pathname
    : SITE;
  const params = new URLSearchParams();
  params.set('s', pack(settingsJSON(config)));
  params.set(embed ? 'embed' : 'hero', '1');
  return `${base}?${params}`;
}

/** The HTML a client pastes into their site to use the scene as a header. */
export function embedCode(config) {
  return `<iframe src="${clientLink(config, true)}" title="${escapeAttribute(config.hero.business)}" `
    + 'style="display:block;width:100%;height:80vh;border:0" loading="lazy"></iframe>';
}

function pack(text) {
  const bytes = new TextEncoder().encode(JSON.stringify(JSON.parse(text))); // minified
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unpack(text) {
  try {
    const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return '';
  }
}

function escapeAttribute(text) {
  return String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
