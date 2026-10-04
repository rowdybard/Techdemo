// Client links. A link can carry a whole look (the settings JSON, base64 in ?s=) plus the
// header text for a prospect (?business=, ?headline=, ?copy=, ?button=), and open straight
// into hero mode (?hero=1 or #hero) or as a bare embed for a client's site (?embed=1).
// Everything in a link is untrusted: settings go through loadSettings, which only accepts
// known keys with matching types, and text is length-capped and shown with textContent.
import { loadSettings, recall, settingsJSON } from './presets.js';
import { greetingBlocked } from './moderate.js';

// Where client links point when the page itself isn't on a public address (a local file
// or the claude.ai preview).
const SITE = 'https://skygreeting.com/';
const TEXT_LIMITS = { business: 48, headline: 90, copy: 160, button: 32 };
export const MESSAGE_LIMIT = 24; // characters a fireworks message can hold
export const NAME_LIMIT = 16; // the recipient's name, spelled on its own line

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
  // The TikTok LIVE page (live.js) is an embed with sound, an overlay and no greeting.
  const live = params.get('live') === '1';
  const embed = params.get('embed') === '1' || live;
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
  if (embed && !live && params.get('sound') !== '1') config.sound.enabled = false;
  if (live && params.get('sound') === '0') config.sound.enabled = false;
  // A SkyGreeting someone sent (see gift.js): an occasion, their words and their name.
  const message = cleanText(params.get('msg'), MESSAGE_LIMIT).toUpperCase();
  const gift = !embed && message ? {
    occasion: cleanText(params.get('o'), 20),
    message,
    to: cleanText(params.get('to'), NAME_LIMIT).toUpperCase(),
    from: cleanText(params.get('from'), MESSAGE_LIMIT),
    look: readLook(params.get('l')),
  } : null;
  // A hand-made link can't put blocked words in the sky: it opens as a refusal instead.
  if (gift && greetingBlocked(gift)) {
    gift.blocked = true;
    gift.message = gift.to = gift.from = '';
  }
  // Set before the first shells are planned, so any text shell spells the message.
  if (gift && !gift.blocked) config.look.text = message;
  // A paid greeting's private link (?g=…): its words come from the server (gift.js).
  // `sent` marks the buyer arriving back from checkout.
  const id = params.get('g');
  const paid = !embed && id && /^[A-Za-z0-9]{8}$/.test(id) ? { id, sent: params.get('sent') === '1' } : null;
  return {
    embed,
    live,
    gift: paid || gift,
    hero: !gift && !paid && (embed || params.get('hero') === '1' || location.hash === '#hero'),
  };
}

/** The private link of a paid greeting. */
export function paidLink(id) {
  return `${siteBase()}?g=${id}`;
}

/** A link that plays a SkyGreeting for whoever opens it. */
export function giftLink({ occasion, message, to, from, look }) {
  const params = new URLSearchParams();
  params.set('o', occasion);
  params.set('msg', cleanText(message, MESSAGE_LIMIT));
  const name = cleanText(to, NAME_LIMIT);
  if (name) params.set('to', name);
  const sender = cleanText(from, MESSAGE_LIMIT);
  if (sender) params.set('from', sender);
  if (look) params.set('l', pack(JSON.stringify(look)));
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

// A designed look from a link (look.js checks every value when it's applied).
function readLook(packed) {
  if (!packed || packed.length > 2000) return null;
  try {
    const look = JSON.parse(unpack(packed));
    return look && typeof look === 'object' && !Array.isArray(look) ? look : null;
  } catch {
    return null;
  }
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
