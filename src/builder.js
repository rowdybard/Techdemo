// Greeting words, an authored design and an explicit send choice survive every panel.
import { track, rememberCheckout } from './track.js';
import { MESSAGE_LIMIT, NAME_LIMIT, cleanText, shortLink } from './link.js';
import { DEFAULT_OCCASION, OCCASIONS, applyOccasion, borrowScene, returnScene, paidItems } from './occasions.js';
import { lookOf } from './look.js';
import { putDesign } from './design.js';
import { createPlans } from './plans.js';
import { createDraft } from './builder-draft.js';
import { createOffer } from './offer-ui.js';
import { BLOCKED_NOTE, greetingBlocked, isBlocked } from './moderate.js';
import { el } from './studio-kit.js';

const SESSION_KEY = 'skygreeting-checkout-draft-v2';
export function create(ctx) {
  const { config, container, signal, navigation: nav } = ctx;
  const draft = createDraft(config);
  const state = { occasion: DEFAULT_OCCASION, typed: false, paying: false, opened: false, view: 'closed', borrowed: null };
  let spellTimer = 0, playback = false, previewComplete = false, ready = false, ownWords = null;
  let carried = ''; // the Customize words last carried into the message
  const offer = createOffer(signal, () => { if (ready) { refresh(); ctx.studio?.refresh(); } });
  const button = (className, text, action) => {
    const node = el('button', className, text); node.type = 'button';
    if (action) node.addEventListener('click', action, { signal });
    return node;
  };
  const open = button('send-open', '🎆 Send a show', openBuilder);
  const sheet = el('form', 'send-box builder'); sheet.noValidate = true;
  const close = button('send-close', 'Back', () => nav.back());
  const head = el('div', 'builder-head'), heading = el('h2', 'send-title', 'Send a fireworks show'); heading.tabIndex = -1; head.append(heading, close);
  const chips = el('div', 'builder-chips'); chips.setAttribute('role', 'radiogroup'); chips.setAttribute('aria-label', 'Occasion');
  const chipFor = {};
  for (const name in OCCASIONS) {
    const chip = button('builder-chip', OCCASIONS[name].label, () => choose(name));
    chip.setAttribute('role', 'radio'); chipFor[name] = chip; chips.append(chip);
    chip.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault(); const names = Object.keys(OCCASIONS), delta = event.key === 'ArrowRight' ? 1 : -1;
      const next = names[(names.indexOf(name) + delta + names.length) % names.length]; chipFor[next].focus(); choose(next);
    }, { signal });
  }
  const own = el('p', 'builder-own');
  const ownReset = button('builder-own-reset', '', () => {
    draft.previewChange(() => applyOccasion(config, state.occasion, true));
    ctx.studio?.setStyle(OCCASIONS[state.occasion].preset); refresh();
  });
  own.append(el('span', '', 'Your chosen show is included. '), ownReset);
  const message = field('Message', MESSAGE_LIMIT), message2 = field('Second line (optional)', MESSAGE_LIMIT);
  const to = field('Their name (optional)', NAME_LIMIT), from = field('From (optional)', MESSAGE_LIMIT);
  const addLine = button('builder-add-line', '+ Add a second line', () => { message2.label.hidden = false; addLine.hidden = true; message2.input.focus(); });
  message2.label.hidden = true;
  message2.input.addEventListener('input', () => { if (!greetingBlocked(words())) skyWords(); }, { signal });
  message.input.addEventListener('input', () => {
    state.typed = true; clearTimeout(spellTimer);
    if (isBlocked(words().message)) { status.textContent = BLOCKED_NOTE; return; }
    if (status.textContent === BLOCKED_NOTE) status.textContent = '';
    skyWords();
    spellTimer = setTimeout(() => { if (!sheet.hidden) ctx.fireworks?.launch('text'); }, 1200);
  }, { signal });
  const customize = button('send-secondary builder-customize', '🎨 Customize the show', () => ctx.studio?.open());
  const plans = createPlans((deluxe, comparison) => {
    stopPlayback();
    // Previewing the version already chosen isn't a comparison: it keeps the choice, so checkout stays ready.
    if (comparison) { const value = deluxe ? 'deluxe' : 'free'; if (value === draft.tier) draft.cancel(); else draft.compare(value); startPreview(); }
    else { draft.commit(deluxe ? 'deluxe' : 'free'); refresh(); }
  }, signal);
  const choice = el('p', 'builder-choice'); choice.setAttribute('role', 'status');
  const priceNote = el('p', 'builder-terms');
  const preview = button('send-secondary', 'Preview the show', startPreview);
  const send = el('button', 'send-primary'); send.type = 'submit';
  const row = el('div', 'send-row'); row.append(preview, send);
  const status = el('p', 'send-status'); status.setAttribute('role', 'status');
  const linkBox = el('input', 'send-link'); linkBox.readOnly = true; linkBox.hidden = true; linkBox.setAttribute('aria-label', 'Link to send');
  const terms = el('p', 'builder-terms', 'By sending, you agree to SkyGreeting’s ');
  for (const [path, label] of [['terms', 'Terms'], ['privacy', 'Privacy']]) {
    const link = el('a', '', label); link.href = `/${path}`; link.target = '_blank'; link.rel = 'noopener'; terms.append(link, '. ');
  }
  sheet.append(head, chips, own, message.label, addLine, message2.label, to.label, from.label, customize, choice, plans.cards, priceNote, row, linkBox, status, terms);
  const bar = el('div', 'builder-bar');
  const edit = button('send-secondary builder-edit', 'Edit', () => nav.back());
  const barSend = button('send-primary', '', sendIt);
  // Picks the version on screen; stays lit (gold for Deluxe) once it's the chosen one, above checkout.
  const useVersion = button('send-secondary builder-use', 'Use this version', () => {
    if (!draft.pending && draft.tier === draft.previewTier) return;
    const tier = draft.previewTier; stopPlayback(); draft.commit(tier); refresh();
  });
  // Only the Free preview can be saved (with its mark): a recording of the Deluxe preview would be
  // the paid show for nothing. Deluxe buyers save a clean video from their greeting (gift.js).
  const film = button('send-secondary builder-film', '🎬 Save video', () => {
    if (draft.previewTier === 'deluxe' || !wordsOk() || !ctx.video || !ctx.director) return;
    stopPlayback();
    ctx.video.capture({ watermark: true, name: `skygreeting-${state.occasion}`, returnTo: resumePreview,
      play: () => { playback = true; previewComplete = false; return ctx.director.play(OCCASIONS[state.occasion], words(), draft.previewTier === 'deluxe'); } });
  });
  film.hidden = !ctx.video?.supported;
  bar.append(plans.bar, edit, film, useVersion, barSend);
  const soon = el('div', 'send-box');
  const soonText = el('p', 'send-status');
  const soonRow = el('div', 'send-row');
  soonRow.append(button('send-secondary', 'Back', () => nav.back()), button('send-primary', 'Send the free version', () => { draft.commit('free'); nav.replace('builder'); sendIt(); }));
  soon.append(el('p', 'send-title', 'Checkout couldn’t start'), soonText, soonRow);
  container.append(open, sheet, bar, soon);

  const unregister = [
    nav.register('builder', { element: sheet, initialFocus: () => heading, show() { state.view = 'sheet'; stopPlayback(); refresh(); }, beforeBack() { stopPlayback(); draft.cancel(); } }),
    nav.register('builder-preview', { element: bar, show() { state.view = 'bar'; refresh(); }, beforeBack() { stopPlayback(); draft.cancel(); } }),
    nav.register('builder-checkout-error', { element: soon, show() { state.view = 'soon'; } }),
  ];
  container.addEventListener('panel-change', () => {
    open.hidden = nav.current !== null;
    if (!nav.current || nav.current === 'studio' && nav.parent === null) {
      state.view = 'closed';
      if (ownWords) { [config.look.text, config.look.mix.text, config.look.text2] = ownWords; ownWords = null; }
    }
  }, { signal });
  sheet.addEventListener('submit', (event) => { event.preventDefault(); sendIt(); }, { signal });

  function choose(name) {
    state.occasion = name;
    const borrowed = borrowScene(config, name);
    if (borrowed && !state.borrowed) state.borrowed = borrowed;
    else if (!borrowed && state.borrowed) { returnScene(config, state.borrowed); state.borrowed = null; }
    draft.changed();
    if (!state.typed || !message.input.value.trim()) { message.input.value = OCCASIONS[name].message; state.typed = false; }
    skyWords(); refresh();
  }
  function openBuilder() {
    stopPlayback();
    if (!ownWords) ownWords = [config.look.text, config.look.mix.text, config.look.text2];
    // The words in the sky (Customize's, or a look's own) are the greeting's first two lines: the
    // newest carry over, and an edit made here stands until they change again.
    const sky = cleanText(ownWords[0] || '', MESSAGE_LIMIT).toUpperCase();
    const sky2 = cleanText(ownWords[2] || '', MESSAGE_LIMIT).toUpperCase();
    if (sky && `${sky}\n${sky2}` !== carried && !greetingBlocked({ message: sky, message2: sky2 })) {
      carried = `${sky}\n${sky2}`;
      message.input.value = sky;
      message2.input.value = sky2;
      state.typed = true;
    }
    if (!state.opened) {
      state.opened = true;
      if (!state.typed && !ctx.link.make) {
        const spooky = ['pumpkin', 'skull', 'bat', 'ghost', 'web', 'brew', 'eyes', 'wisp'].some((type) => config.look.mix[type] > 0);
        state.occasion = spooky ? 'halloween' : ({ usa: 'congrats', pastel: 'love', gold: 'thanks' }[config.look.palette] || 'birthday');
      }
      choose(state.occasion);
    }
    status.textContent = ''; linkBox.hidden = true;
    skyWords(); config.look.mix.text = 0.7;
    const hasLine = Boolean(message2.input.value.trim()); message2.label.hidden = !hasLine; addLine.hidden = hasLine;
    nav.open('builder'); offer.refresh(); track('builder_open', { content_type: state.occasion });
  }
  function refresh() {
    if (!ready) return;
    for (const name in chipFor) { const selected = name === state.occasion; chipFor[name].setAttribute('aria-checked', String(selected)); chipFor[name].tabIndex = selected ? 0 : -1; }
    ownReset.textContent = `Use the ${OCCASIONS[state.occasion].label} look`;
    plans.show(OCCASIONS[state.occasion], draft.pending ? null : draft.tier, offer.label, draft.previewTier);
    choice.textContent = draft.pending ? 'This is a comparison preview. Choose a version below before sending.' : draft.tier === null ? 'Free to preview. Choose the version you want to send.' : `You chose ${draft.tier === 'free' ? 'the Free version' : 'Deluxe'}.`;
    priceNote.textContent = offer.note;
    const label = !draft.canSend ? 'Choose a version to send' : draft.tier === 'deluxe' ? `Continue to checkout · ${offer.price}` : 'Send free greeting';
    for (const node of [send, barSend]) { node.textContent = label; node.disabled = state.paying || !draft.canSend || draft.tier === 'deluxe' && !offer.ready; }
    const deluxeShown = draft.previewTier === 'deluxe', chosen = !draft.pending && draft.tier === draft.previewTier;
    useVersion.classList.toggle('is-deluxe', deluxeShown);
    film.hidden = !ctx.video?.supported || deluxeShown;
    useVersion.setAttribute('aria-pressed', String(chosen));
    useVersion.textContent = `${chosen ? '✓ ' : 'Use '}${deluxeShown ? 'Deluxe' : 'Free'}${chosen ? ' chosen' : ''}`;
  }
  // While the greeting is made, its lines are the words in the sky (two take turns).
  function skyWords() {
    config.look.text = words().message;
    config.look.text2 = words().message2;
  }
  function words() { return { message: cleanText(message.input.value, MESSAGE_LIMIT).toUpperCase() || OCCASIONS[state.occasion].message,
    message2: cleanText(message2.input.value, MESSAGE_LIMIT).toUpperCase(), to: cleanText(to.input.value, NAME_LIMIT).toUpperCase(), from: cleanText(from.input.value, MESSAGE_LIMIT) }; }
  function wordsOk() {
    if (!greetingBlocked(words())) return true;
    nav.replace('builder'); status.textContent = BLOCKED_NOTE; return false;
  }
  function stopPlayback() {
    if (!playback) return;
    playback = false; ctx.director?.stop(); ctx.crane?.stop?.(); draft.restoreDisplay();
    skyWords();
    ctx.setCameraPreset?.(config.camera.preset);
  }
  function startPreview() {
    if (!wordsOk()) return;
    stopPlayback(); nav.open('builder-preview', { parent: 'builder' });
    playback = true; previewComplete = false;
    refresh();
    track('preview_start', { content_type: state.occasion, version: draft.previewTier });
    ctx.director?.play(OCCASIONS[state.occasion], words(), draft.previewTier === 'deluxe');
  }
  function resumePreview() { stopPlayback(); if (nav.current !== 'builder-preview') nav.open('builder-preview', { parent: 'builder' }); refresh(); }
  async function sendIt() {
    if (state.paying || !draft.canSend || !wordsOk()) return;
    stopPlayback(); putDesign(config, draft.sendDesign());
    if (draft.tier === 'deluxe') { await payForDeluxe(); return; }
    state.paying = true; nav.replace('builder'); status.textContent = 'Making your link…'; refresh();
    try {
      const url = await shortLink({ occasion: state.occasion, ...words(), look: lookOf(config) });
      linkBox.value = url; linkBox.hidden = false; linkBox.select();
      const note = words().from ? `${words().from} made you a SkyGreeting` : 'Someone made you a SkyGreeting';
      if (navigator.share) {
        try { await navigator.share({ title: 'A SkyGreeting for you', text: note, url }); status.textContent = 'Shared.'; track('share_success', { method: 'free_link', content_type: state.occasion }); }
        catch (error) { if (error.name !== 'AbortError') await copy(url); else status.textContent = 'Your link is ready whenever you want to share it.'; }
      } else await copy(url);
    } catch { status.textContent = 'Your link couldn’t be made. Please try again.'; }
    finally { state.paying = false; refresh(); }
  }
  async function payForDeluxe() {
    if (!offer.ready) return;
    const quoted = offer.quote.priceCents;
    state.paying = true; nav.replace('builder'); status.textContent = 'Opening secure checkout…'; refresh();
    saveDraft();
    try {
      const response = await fetch('/api/checkout', { method: 'POST', signal, headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ occasion: state.occasion, ...words(), look: lookOf(config), expectedPriceCents: quoted }) });
      const data = await response.json();
      if (response.status === 409 && data.error === 'price_changed') {
        await offer.refresh(); status.textContent = `The price changed. Review ${offer.price} and click Continue to checkout again.`;
        track('checkout_price_changed', { content_type: state.occasion }); return;
      }
      if (!response.ok || !data.url) throw new Error(data.error || 'Checkout isn’t available right now.');
      rememberCheckout(data.transactionId); track('begin_checkout', { currency: offer.quote?.currency || 'USD', value: quoted / 100 });
      location.assign(data.url);
    } catch (error) {
      soonText.textContent = `${error.message || 'Checkout isn’t available right now.'} Your greeting is saved here.`;
      nav.open('builder-checkout-error', { parent: 'builder' }); track('checkout_error', { content_type: state.occasion });
    } finally { state.paying = false; refresh(); }
  }
  async function copy(url) {
    status.textContent = 'Your link is ready. Copy it and send it.';
    if (!navigator.clipboard) return;
    try { await navigator.clipboard.writeText(url); status.textContent = 'Link copied. Paste it in a text or message.'; track('share_success', { method: 'copy', content_type: state.occasion }); } catch { /* The visible box remains selectable. */ }
  }
  function snapshotDraft() { return { version: 2, occasion: state.occasion, words: words(), secondLine: !message2.label.hidden, design: draft.snapshot() }; }
  function restoreDraft(saved) {
    if (saved?.version !== 2 || !OCCASIONS[saved.occasion] || !saved.design?.full) return false;
    state.occasion = saved.occasion; state.typed = true; state.opened = true;
    for (const [key, target] of Object.entries({ message, message2, to, from })) target.input.value = cleanText(saved.words?.[key] || '', key === 'to' ? NAME_LIMIT : MESSAGE_LIMIT);
    draft.restore(saved.design); message2.label.hidden = !saved.secondLine; addLine.hidden = Boolean(saved.secondLine); refresh(); return true;
  }
  function saveDraft() { try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(snapshotDraft())); } catch { /* Storage can be disabled; the current tab still holds the draft. */ } }
  ctx.builder = {
    open: openBuilder, close: () => { stopPlayback(); draft.cancel(); nav.close(); }, refresh, resumePreview, snapshotDraft, restoreDraft,
    startFresh() { this.reset(); },
    reset() { state.typed = false; state.opened = false; state.borrowed = null; state.occasion = DEFAULT_OCCASION; for (const item of [message, message2, to, from]) item.input.value = ''; draft.reset(); refresh(); },
    designChanged() { draft.changed(); refresh(); },
    previewChange(change) { stopPlayback(); draft.previewChange(change); refresh(); },
    resetDesign(change) { stopPlayback(); draft.resetDesign(change); refresh(); },
    chooseVersion(tier) { stopPlayback(); draft.commit(tier); refresh(); ctx.studio?.refresh(); },
    cancelCandidate() { draft.cancel(); refresh(); },
    picked() {},
    get pending() { return draft.pending; }, get tier() { return draft.tier; },
    get deluxe() { return [...paidItems(OCCASIONS[state.occasion]), 'sideBarges']; },
    get price() { return offer.price; }, get priceLabel() { return offer.label; },
    get summary() { return state.view !== 'closed' ? `${OCCASIONS[state.occasion].label} greeting · ${draft.tier === 'free' ? 'Free version' : `Deluxe preview · ${offer.label}`}` : ''; },
  };
  ready = true; refresh();
  const make = ctx.link.make;
  if (make && OCCASIONS[make.occasion]) { state.occasion = make.occasion; if (make.text) { message.input.value = make.text; state.typed = true; } }
  const canceled = new URL(location.href).searchParams.has('canceled');
  if (canceled) {
    try { restoreDraft(JSON.parse(sessionStorage.getItem(SESSION_KEY))); } catch { /* An unavailable or old draft cannot be restored. */ }
    const url = new URL(location.href); url.searchParams.delete('canceled'); history.replaceState(history.state, '', url);
  }
  container.addEventListener('scene-ready', () => {
    offer.refresh();
    if (make || canceled) { openBuilder(); if (canceled) status.textContent = 'Checkout canceled. Your greeting is ready to edit.'; }
  }, { once: true, signal });
  return {
    update() { if (playback && !previewComplete && ctx.director && !ctx.director.active) { previewComplete = true; track('preview_complete', { content_type: state.occasion, version: draft.previewTier }); } },
    dispose() { clearTimeout(spellTimer); for (const off of unregister) off(); for (const node of [open, sheet, bar, soon]) node.remove(); ctx.builder = null; },
  };
  function field(name, limit) { const label = el('label', 'send-field builder-loud'), input = el('input'); input.maxLength = limit; input.autocomplete = 'off'; input.spellcheck = false; label.append(el('span', '', name), input); return { label, input }; }
}
