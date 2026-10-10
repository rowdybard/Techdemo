// Procedural recipes, injected with the audio engine's bounded voice helpers.
import { swarm, whirr } from './sfx.js';

const SHAPES = new Set(['heart', 'star', 'helmet', 'text', 'initials', 'pumpkin', 'skull', 'bat', 'ghost', 'web']);
const HISSERS = new Set(['willow', 'palm', 'wisp', 'chrysanthemum', 'kamuro', 'fish', 'leaves']);

export function createRecipes({ getAudio, getPage, voice, noise, tone, holdGround }) {
  function boom(when, loud, air, pan, size = 1) {
    tone(when, { from: 72 * (1.1 - 0.2 * size), to: 36, peak: 0.85 * loud, decay: 0.9, pan });
    noise(getPage().brown, when, { peak: 0.75 * loud, attack: 0.008, decay: 2.2, from: 200 + 1400 * air, to: 80, pan });
    noise(getPage().white, when, { peak: 0.32 * loud * air, decay: 0.09, type: 'highpass', from: 1800, pan });
  }

  function burstSound(b, when, loud, air, pan) {
    const type = b.type;
    if (type === 'eyes') return;
    boom(when, loud * (SHAPES.has(type) ? 0.6 : 1), air, pan, Math.min(1.4, b.size / 60));
    if (b.crackle > 0) crackles(when + b.crackle, 0.45, loud * 0.8, air, pan); // a chrysanthemum's crackling tips
    if (type === 'crackle' || type === 'brew') {
      crackles(when + 0.5, 1.5, loud, air, pan); // its pops come 0.5 to 1.9 s after the break (bursts.js)
    } else if (type === 'strobe') {
      noise(getPage().crackle, when + 0.2, { peak: 0.25 * loud, attack: 0.05, decay: 2.2, type: 'bandpass', from: 1800, q: 1.2, pan, rate: 0.45 });
    } else if (HISSERS.has(type)) {
      noise(getPage().white, when + 0.15, { peak: 0.06 * loud, attack: 0.4, decay: 2.6, type: 'bandpass', from: 5200 * air + 800, q: 0.6, pan });
    } else if (type === 'whirl') {
      // Whirlwinds whirr as they spin: two soft fizzes, panned apart.
      for (const side of [-0.2, 0.2]) {
        const at = when + 0.1 + Math.random() * 0.1;
        const length = 1.8 + Math.random() * 0.5;
        voice(at, length, pan + side, (add) => whirr(getAudio(), add, getPage(), at, { peak: 0.08 * loud, length, air }));
      }
    } else if (type === 'multibreak') {
      boom(when + 0.9, loud * 0.7, air, pan, 0.8);
    } else if (type === 'crossette') {
      for (let k = 0; k < 4; k++) noise(getPage().white, when + 0.75 + k * 0.05, { peak: 0.22 * loud, decay: 0.07, type: 'bandpass', from: 1400, q: 1, pan: pan + (k - 1.5) * 0.08 });
    }
  }

  // A swarm of crackling pops, in two voices panned apart so it's wide, as a crackle shell is.
  function crackles(when, length, loud, air, pan) {
    for (const side of [-0.28, 0.28]) {
      voice(when + Math.random() * 0.06, length, Math.max(-0.9, Math.min(0.9, pan + side)), (add) => swarm(getAudio(), add, getPage(), when, { peak: 0.5 * loud, length, air }));
    }
  }

  // The countdown clock: a wooden tick each second, higher as zero nears (with a low thump on
  // the last three), then at zero a boom, and a bell struck under it.
  function tick(when, second) {
    const near = 1 - second / 10;
    tone(when, { from: 900 + 900 * near, to: 500 + 400 * near, peak: 0.2 + 0.2 * near, attack: 0.002, decay: 0.09, type: 'triangle' });
    noise(getPage().white, when, { peak: 0.08, decay: 0.03, type: 'highpass', from: 3500 });
    if (second <= 3) tone(when, { from: 150, to: 60, peak: 0.45, decay: 0.3 });
  }

  function midnight(when) {
    boom(when, 1, 1, 0, 1.5);
    for (const [ratio, peak, decay] of [[1, 0.3, 3.4], [2, 0.2, 2.6], [2.76, 0.16, 2], [5.4, 0.09, 1.2], [8.9, 0.05, 0.7]]) {
      tone(when, { from: 196 * ratio, to: 195 * ratio, peak, attack: 0.003, decay });
    }
    noise(getPage().white, when + 0.02, { peak: 0.3, attack: 0.1, decay: 1.6, type: 'bandpass', from: 1500, to: 6000, q: 0.5 });
  }

  function launchSound(b, loud, air, pan, when) {
    tone(when, { from: 120, to: 55, peak: 0.35 * loud, decay: 0.35, pan });
    noise(getPage().white, when, { peak: 0.18 * loud * air, decay: 0.22, from: 900, to: 300, pan });
  }

  function groundSound(g, when, loud, air, pan) {
    const hold = Math.max(0.3, g.hold);
    switch (g.sound) {
      case 'hiss':
        if (!holdGround(when, hold)) return;
        noise(getPage().white, when, { peak: 0.09 * loud, attack: 0.5, decay: hold, type: 'bandpass', from: 3400 * air + 700, q: 0.5, pan });
        noise(getPage().brown, when, { peak: 0.12 * loud, attack: 0.5, decay: hold, from: 300, pan });
        break;
      case 'whoosh':
        for (let t = 0; t < hold; t += 0.45) {
          noise(getPage().white, when + t, { peak: 0.06 * loud, attack: 0.08, decay: 0.32, type: 'bandpass', from: 700, to: 2600 * air + 400, q: 1.1, pan });
        }
        break;
      case 'pops':
        for (let t = 0; t < hold; t += 0.55) {
          tone(when + t, { from: 140, to: 70, peak: 0.22 * loud, decay: 0.18, pan });
          noise(getPage().white, when + t, { peak: 0.1 * loud * air, decay: 0.05, type: 'highpass', from: 1500, pan });
        }
        break;
      case 'boom':
        boom(when, loud * 0.55, air, pan, 0.7);
        break;
      case 'bubble':
        noise(getPage().brown, when, { peak: 0.14 * loud, attack: 0.6, decay: hold, from: 420, q: 4, pan });
        noise(getPage().crackle, when + 0.3, { peak: 0.2 * loud, attack: 0.3, decay: hold, type: 'lowpass', from: 900, pan, rate: 0.35 });
        break;
      case 'thunder':
        noise(getPage().white, when, { peak: 0.6 * loud, decay: 0.14, type: 'highpass', from: 1100, pan });
        noise(getPage().brown, when + 0.05, { peak: 1.1 * loud, attack: 0.12, decay: 3.6, from: 380, to: 90, pan });
        break;
      default:
        break;
    }
  }

  return { burstSound, launchSound, groundSound, tick, midnight };
}
