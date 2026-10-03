// Moderation for the words in a greeting (message, recipient's name, sender's name).
// Blocks slurs, hate symbols, sexual terms, and "kill yourself" style threats; mild
// swearing is allowed (an affectionate "f*** you" greeting is a fine greeting). Used by
// the builder (before preview and send), the page opening a greeting, and the server
// (before a paid checkout), so a hand-made link or request can't get around it.
//
// Text is normalised first: accents stripped, look-alike digits and symbols mapped to
// letters (n1gg@ → nigga), then checked two ways: each word against a list of whole
// words (so names and ordinary words that merely contain the letters pass), and the
// text with spaces and punctuation squeezed out against a few long, distinctive stems
// (so spaced-out or dotted phrases don't slip through). The lists are stored
// ROT13'd, to keep the repository from being full of slurs in plain text.

const rot13 = (text) => text.replace(/[a-z]/g, (c) => String.fromCharCode(((c.charCodeAt(0) - 97 + 13) % 26) + 97));

const WORDS = new Set(rot13(`avttre avttref avttn avttnf avtthu pbba pbbaf wvtnobb cbepuzbaxrl fcvp fcvpf fcvpx jrgonpx
  jrgonpxf ornare ornaref puvax puvaxf tbbx tbbxf xvxr xvxrf enturnq enturnqf gbjryurnq gbjryurnqf fnaqavttre cnxv cnxvf
  tlcb tlccb mvccreurnq snt sntf snttbg snttbgf sntbg qlxr qlxrf genaal genaavrf furznyr ergneq ergneqf ergneqrq phag
  phagf pbpx pbpxf phzfubg wvmm oybjwbo unaqwbo qvyqb cbea cbeab nany encr encrq encvfg encrf crqb crqbcuvyr cnrqb zbyrfg
  zbyrfgre anmv anmvf uvgyre urvy xxx fjnfgvxn juvgrcbjre xlf`).split(/\s+/));

const STEMS = rot13(`avttre avttn avtth snttbg fnaqavttre cbepuzbaxrl xvyylbhefrys xvyyhefrys arpxlbhefrys
  unatlbhefrys ubcrlbhqvr tbnaqqvr lbhfubhyqqvr juvgrcbjre fvrturvy urvyuvgyre`).split(/\s+/).concat(['1488']);

const LOOKALIKE = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's', '!': 'i', '|': 'i', '+': 't' };

function normalise(text) {
  return String(text || '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '') // accents
    .toLowerCase();
}

function letters(text) {
  return text.replace(/[0-9@$!|+]/g, (c) => LOOKALIKE[c] || c);
}

/** True if the text has words a greeting can't carry. */
export function isBlocked(text) {
  const plain = normalise(text);
  if (!plain) return false;
  // Whole words, with look-alikes read as letters, and repeated letters squeezed to two
  // ("niiigga") as well as kept.
  for (const raw of plain.split(/[^a-z0-9@$!|+]+/)) {
    if (!raw) continue;
    // Symbols at either end are punctuation ("SAM!"), not look-alike letters.
    for (const form of [raw, raw.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '')]) {
      const word = letters(form).replace(/[^a-z]/g, '');
      if (WORDS.has(word) || WORDS.has(word.replace(/(.)\1+/g, '$1$1')) || WORDS.has(word.replace(/(.)\1+/g, '$1'))) return true;
    }
  }
  // Distinctive stems anywhere, with spaces and punctuation squeezed out.
  const squeezed = letters(plain).replace(/[^a-z]/g, '');
  const digits = plain.replace(/[^0-9]/g, '');
  for (const stem of STEMS) {
    if (/^[0-9]+$/.test(stem) ? digits.includes(stem) : squeezed.includes(stem) || squeezed.replace(/(.)\1+/g, '$1$1').includes(stem)) return true;
  }
  return false;
}

/** True if any of a greeting's words are blocked. */
export function greetingBlocked({ message, to, from }) {
  return isBlocked(message) || isBlocked(to) || isBlocked(from);
}

export const BLOCKED_NOTE = 'That can’t go in the sky. Please keep it kind.';
