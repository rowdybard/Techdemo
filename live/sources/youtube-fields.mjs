// Reads YouTube live chat (as youtubei.js parses it) into the plain events rules.mjs takes.
// Money is counted in US cents: a $5.00 Super Chat is worth 500, so settings.mjs prices
// everything in cents. Other currencies go through a rough rate table; close is enough.

// Approximate US dollars per unit, by the symbol or code YouTube shows before the amount.
const RATES = {
  $: 1, US$: 1, USD: 1, CA$: 0.73, CAD: 0.73, A$: 0.66, AUD: 0.66, NZ$: 0.6, NZD: 0.6, HK$: 0.13, NT$: 0.031,
  MX$: 0.054, R$: 0.18, '£': 1.27, GBP: 1.27, '€': 1.08, EUR: 1.08, '¥': 0.0068, JPY: 0.0068, 'CN¥': 0.14,
  '₩': 0.00073, KRW: 0.00073, '₹': 0.012, INR: 0.012, '₱': 0.017, PHP: 0.017, CHF: 1.12, SEK: 0.095,
  NOK: 0.093, DKK: 0.145, PLN: 0.25, CZK: 0.043, HUF: 0.0027, RUB: 0.011, TRY: 0.029, ZAR: 0.055,
  SGD: 0.75, MYR: 0.22, IDR: 0.000063, THB: 0.029, ILS: 0.27, '₪': 0.27, ARS: 0.001, CLP: 0.0011, COP: 0.00025,
};

/** "$5.00", "CA$10.00", "€2,00", "¥500", "1.000 IDR" → US cents (0 if unreadable). */
export function cents(amount) {
  const text = String(amount || '').replace(/ /g, ' ').trim();
  const match = text.match(/^([^\d\s.,]*)\s*([\d.,\s]+?)\s*([A-Z]{3})?$/);
  if (!match) return 0;
  const code = (match[1] || match[3] || '$').trim();
  let digits = match[2].replace(/\s/g, '');
  // "1.234,56" and "2,00" use a decimal comma; "1,234.56" a decimal point.
  if (/,\d{1,2}$/.test(digits)) digits = digits.replace(/\./g, '').replace(',', '.');
  else digits = digits.replace(/,/g, '');
  const value = Number(digits);
  const rate = RATES[code] ?? RATES[code.replace(/[^A-Z$£€¥₩₹₱₪]/g, '')] ?? 1;
  return Number.isFinite(value) ? Math.round(value * rate * 100) : 0;
}

/** "1.2K" / "12,345" / "3" → a number, or undefined. */
export function count(text) {
  const match = String(text || '').replace(/,/g, '').match(/([\d.]+)(?:\s*([KMB])\b)?/i);
  if (!match) return undefined;
  const n = Number(match[1]) * ({ k: 1e3, m: 1e6, b: 1e9 }[(match[2] || '').toLowerCase()] || 1);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
}

/** An 11-character video ID from an ID or a watch, youtu.be, /live/ or /shorts/ link; else null. */
export function videoId(target) {
  const text = String(target || '').trim();
  if (/^[\w-]{11}$/.test(text) && !text.startsWith('@')) return text;
  const match = text.match(/(?:[?&]v=|youtu\.be\/|\/live\/|\/shorts\/)([\w-]{11})/);
  return match ? match[1] : null;
}

/** The channel's /live page for "@handle", a channel link or a UC… channel ID; else null. */
export function livePage(target) {
  const text = String(target || '').trim().replace(/\/+$/, '');
  if (/^@[\w.-]+$/.test(text)) return `https://www.youtube.com/${text}/live`;
  if (/^UC[\w-]{22}$/.test(text)) return `https://www.youtube.com/channel/${text}/live`;
  const match = text.match(/youtube\.com\/(@[\w.-]+|channel\/UC[\w-]{22}|c\/[\w.-]+|user\/[\w.-]+)/);
  if (match) return `https://www.youtube.com/${match[1]}/live`;
  if (/^[\w.-]{3,30}$/.test(text)) return `https://www.youtube.com/@${text}/live`; // a bare handle
  return null;
}

/** From a channel's /live page: the video it points at, and whether it's live now. */
export function liveFromPage(html) {
  const id = String(html).match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})"/)?.[1];
  return { id: id || null, live: Boolean(id) && /"isLiveNow":true|"isLive":true/.test(html) };
}

const person = (author) => {
  const name = String(author?.name || '').replace(/^@/, '').trim();
  return { userId: String(author?.id || name), name };
};
const text = (value) => (value === undefined || value === null ? '' : String(value)).trim();

/** One chat item → the events it makes (a Super Chat with words makes a gift and a chat). */
export function events(item, prices) {
  switch (item?.type) {
    case 'LiveChatTextMessage':
      return [{ kind: 'chat', ...person(item.author), text: text(item.message) }];
    case 'LiveChatPaidMessage':
    case 'LiveChatPaidSticker': {
      const who = person(item.author);
      const said = text(item.message);
      // The gift goes first, so a Super Chat that says "!sky hello" pays for itself.
      const out = [{ kind: 'gift', ...who, gift: item.type === 'LiveChatPaidSticker' ? 'Super Sticker' : 'Super Chat', diamonds: cents(item.purchase_amount), count: 1, said }];
      if (said) out.push({ kind: 'chat', ...who, text: said });
      return out;
    }
    case 'LiveChatMembershipItem': {
      const milestone = Boolean(text(item.header_primary_text));
      const out = [{ kind: 'gift', ...person(item.author), gift: milestone ? 'Member milestone' : 'New member', diamonds: prices.membership, count: 1 }];
      const said = text(item.message);
      if (said) out.push({ kind: 'chat', ...person(item.author), text: said });
      return out;
    }
    case 'LiveChatSponsorshipsGiftPurchaseAnnouncement': {
      const name = text(item.header?.author_name).replace(/^@/, '');
      const gifted = count(text(item.header?.primary_text)) || 1;
      return [{ kind: 'gift', userId: String(item.author_external_channel_id || name), name, gift: 'Gifted memberships', diamonds: prices.membership, count: gifted }];
    }
    default:
      return [];
  }
}
