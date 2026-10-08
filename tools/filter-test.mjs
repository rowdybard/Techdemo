// The word filter (src/moderate.js), guarded both ways: ordinary and affectionate
// greetings in English, French, Spanish and a few nearby languages must pass, the phrases
// it lets through mustn't open a door for the bare word, and the slurs it's meant to catch
// must still be caught. Prints counts only (blocked terms stay ROT13'd, never in plain
// text). Run by `npm run check`; on its own: node tools/filter-test.mjs
import { isBlocked } from '../src/moderate.js';

const rot13 = (text) => text.replace(/[a-z]/g, (c) => String.fromCharCode(((c.charCodeAt(0) - 97 + 13) % 26) + 97));

// Must NOT be blocked: real greetings people send, including affectionate swearing (as the
// English list allows), words that merely contain blocked letters, and the belated/"qué
// pedo" phrases the filter special-cases. "NEGRO" is Spanish for the colour and a common
// endearment; "CONCHA" is an ordinary word and a name; names carry accents, ñ and ç.
const PASS = [
  'HAPPY BIRTHDAY', 'I LOVE YOU', 'CONGRATULATIONS', 'THANK YOU', 'HAPPY HALLOWEEN', 'HAPPY BELATED BIRTHDAY',
  'FELIZ CUMPLEAÑOS', 'TE QUIERO', 'TE AMO', 'FELICIDADES', 'GRACIAS', 'FELIZ NAVIDAD', 'FELIZ AÑO NUEVO',
  'FELIZ DÍA MAMÁ', 'ENHORABUENA', 'MI AMOR', 'CARIÑO', 'MI VIDA', 'HERMANO', 'ABUELA', 'QUÉ GUAPA', 'NEGRO',
  'GATO NEGRO', 'MI NEGRO QUERIDO', 'CON CARIÑO', 'CON AMOR', '¿QUÉ PEDO, AMIGO?', 'NI PEDO', 'FELIZ CUMPLE, SIN PEDO',
  'FELIZ CUMPLEAÑOS CABRÓN',
  'JOYEUX ANNIVERSAIRE', 'JOYEUX ANNIVERSAIRE EN RETARD', 'DÉSOLÉ POUR LE RETARD', "JE T'AIME", 'BONNE ANNÉE',
  'MERCI', 'FÉLICITATIONS', 'JOYEUX NOËL', 'BONNE FÊTE', 'MON CŒUR', 'MA CHÉRIE', 'BISOUS', 'GROS BISOUS',
  'UN GROS BAISER', 'BONNE CHANCE', 'BRAVO', 'MAMAN', 'PAPA', 'MON CHOU', 'MA PUCE', 'AVEC MON RETARD HABITUEL',
  'PER MOLTS ANYS', 'MOLTES FELICITATS', 'FELIZ ANIVERSÁRIO', 'BUON COMPLEANNO', 'ALLES GUTE ZUM GEBURTSTAG',
  'JOSÉ', 'INÉS', 'NICOLÁS', 'FRANÇOIS', 'CHLOÉ', 'ÉLODIE', 'CONCHA', 'PACO', 'FANNY', 'PEDRO', 'MARTÍN',
];

// Must be blocked: a representative slur from each list (ROT13'd here as in moderate.js),
// plus look-alike and spaced-out evasions, so a future edit can't quietly gut the filter.
const BLOCK = rot13(`avttre snttbg ergneq`).split(/\s+/) // English: racial, homophobic, ableist
  .concat(rot13(`obhtabhyr tbhvar znevpba fhqnpn`).split(/\s+/)) // French + Spanish, from the curated set
  .concat(['n1gg3r', 'f a g g o t']); // a leetspeak and a spaced-out evasion

const passFails = PASS.filter((t) => isBlocked(t));
const blockFails = BLOCK.filter((t) => !isBlocked(t));

if (passFails.length) console.error(`FAIL: ${passFails.length} ordinary greeting(s) wrongly blocked: ${passFails.join(' | ')}`);
if (blockFails.length) console.error(`FAIL: ${blockFails.length} term(s) that should be blocked got through (ROT13): ${blockFails.map(rot13).join(' ')}`);

if (passFails.length || blockFails.length) process.exit(1);
console.log(`Filter OK: ${PASS.length} greetings pass, ${BLOCK.length} blocked terms caught.`);
