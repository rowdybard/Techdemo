// Simulator source: a pretend audience, so the whole show can be tested without going
// live. Viewers chat commands, send gifts, like, follow and ask for dedications at
// random. The admin page can also inject any event by hand, in either mode.

const NAMES = ['maya', 'sk8rboi', 'Nathan', 'luna.moth', 'TacoTuesday', 'grandma_jo', 'Pixel', 'zoe💜', 'BeachBum', 'ari'];
const CHAT = ['!heart', '!purple', '!chaos', '!star gold', '!pink heart', '!ring blue', '!willow', '!boom', '!pumpkin', '!ghost',
  'so pretty', 'hi from ohio', '!green', '!crackle', 'wow', '!help'];
const GIFTS = [['Rose', 1], ['Rose', 1], ['Finger Heart', 5], ['Doughnut', 30], ['Hand Hearts', 100], ['Confetti', 100], ['Money Gun', 500], ['Galaxy', 1000]];
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
      total += 15;
      emit({ kind: 'like', ...viewer(), count: 15, total });
    } else if (roll < 0.86) {
      const [gift, diamonds] = pick(GIFTS);
      emit({ kind: 'gift', ...viewer(), gift, diamonds, count: gift === 'Rose' ? 1 + ((Math.random() * 5) | 0) : 1 });
    } else if (roll < 0.92) emit({ kind: 'follow', ...viewer() });
    else if (roll < 0.95) emit({ kind: 'chat', ...viewer(), text: pick(DEDICATIONS) });
    else emit({ kind: 'share', ...viewer() });
  }, 1500 / rate);

  return {
    name: 'simulator',
    async stop() {
      clearInterval(timer);
    },
  };
}
