// Simulator source: a pretend audience, so the whole show can be tested without going
// live. Viewers chat commands, send Super Chats, join as members, like and ask for
// dedications at random. The admin page can also inject any event by hand, in either mode.

const NAMES = ['maya', 'sk8rboi', 'Nathan', 'luna.moth', 'TacoTuesday', 'grandma_jo', 'Pixel', 'zoe💜', 'BeachBum', 'ari'];
const CHAT = ['!heart', '!purple', '!chaos', '!star gold', '!pink heart', '!ring blue', '!willow', '!boom', '!pumpkin', '!ghost',
  'so pretty', 'hi from ohio', '!green', '!crackle', 'wow', '!help'];
const GIFTS = [['Super Chat', 100], ['Super Chat', 100], ['Super Sticker', 200], ['Super Chat', 200], ['Super Chat', 500], ['Super Chat', 1000], ['Super Chat', 2000], ['New member', 200]];
const PAID_WORDS = ['!sky hi from texas', '!birthday Lily', '!sky subscribe lol', ''];
const DEDICATIONS = ['!birthday Maya', '!love Sam', '!congrats Jordan', '!halloween Ash', '!thanks Mom'];

export function createSource({ rate = 1 }, emit, status) {
  let total = 0;
  const pick = (list) => list[(Math.random() * list.length) | 0];
  const viewer = () => {
    const name = pick(NAMES);
    return { userId: name.toLowerCase().replace(/[^a-z0-9_.]/g, ''), name };
  };

  status({ state: 'connected', room: 'simulator', viewers: 42 });
  const timer = setInterval(() => {
    const roll = Math.random();
    if (roll < 0.55) emit({ kind: 'chat', ...viewer(), text: pick(CHAT) });
    else if (roll < 0.75) {
      // YouTube only gives the like button's running count.
      total += 1 + ((Math.random() * 6) | 0);
      emit({ kind: 'like', userId: '', name: '', count: 0, total, room: true });
    } else if (roll < 0.86) {
      const [gift, diamonds] = pick(GIFTS);
      const who = viewer();
      // Like YouTube: a Super Chat's words come right after it, as chat.
      const said = gift === 'Super Chat' && diamonds >= 200 ? pick(PAID_WORDS) : '';
      emit({ kind: 'gift', ...who, gift, diamonds, count: 1, said });
      if (said) emit({ kind: 'chat', ...who, text: said });
    } else if (roll < 0.92) emit({ kind: 'chat', ...viewer(), text: pick(CHAT) });
    else if (roll < 0.95) emit({ kind: 'chat', ...viewer(), text: pick(DEDICATIONS) });
    else emit({ kind: 'chat', ...viewer(), text: pick(CHAT) });
  }, 1500 / rate);

  return {
    name: 'simulator',
    async stop() {
      clearInterval(timer);
    },
  };
}
