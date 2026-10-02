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
export const MESSAGE_LIMIT = 24; // characters a fireworks message can hold

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
  // A fireworks message someone sent (see gift.js): their words go up in the sky.
  const message = cleanText(params.get('msg'), MESSAGE_LIMIT);
  const gift = !embed && message ? { message, from: cleanText(params.get('from'), MESSAGE_LIMIT) } : null;
  // Set before the first shells are planned, so every text shell spells the message.
  // A calmer show around it, so other bursts don't cover the words.
  if (gift) {
    config.look.text = message.toUpperCase();
    config.show.shellsPerMinute = Math.min(config.show.shellsPerMinute, 16);
  }
  return {
    embed,
    gift,
    hero: !gift && (embed || params.get('hero') === '1' || location.hash === '#hero'),
  };
}

/** A link that spells `message` in fireworks for whoever opens it. */
export function giftLink(message, from) {
  const params = new URLSearchParams();
  params.set('msg', cleanText(message, MESSAGE_LIMIT));
  const sender = cleanText(from, MESSAGE_LIMIT);
  if (sender) params.set('from', sender);
  return `${siteBase()}?${params}`;
}

/** Plain text for the sky: no control characters, trimmed and capped. */
export function cleanText(value, limit) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, limit);
}

/** A link that opens this exact look and header text, in hero mode or as an embed. */
export function clientLink(config, embed = false) {
  const base = siteBase();
  const params = new URLSearchParams();
  params.set('s', pack(settingsJSON(config)));
  params.set(embed ? 'embed' : 'hero', '1');
  return `${base}?${params}`;
}

// This page's address, or the public site when the page isn't on one.
function siteBase() {
  return /^https?:$/.test(location.protocol) && !/claude|usercontent/.test(location.hostname)
    ? location.origin + location.pathname
    : SITE;
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
