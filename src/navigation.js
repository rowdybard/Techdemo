// A small panel stack. History contains panel tokens only; greeting data stays in memory.
export function create(ctx) {
  if (ctx.navigation) return { update() {}, dispose() {} };
  const panels = new Map();
  const snapshots = new Map();
  const session = Math.random().toString(36).slice(2);
  let frames = [], token = 0, pendingBack = false, backTarget = null, queuedOpen = null;
  const { container, signal } = ctx;
  const current = () => frames.at(-1)?.id || null;
  const usable = (frame) => panels.has(frame.id) && panels.get(frame.id).canEnter?.() !== false;
  function rememberFrame() {
    const frame = frames.at(-1), panel = panels.get(frame?.id);
    if (frame && panel?.element) frame.scroll = panel.element.scrollTop;
  }
  function paint(previous, focus = true) {
    const active = current();
    for (const [id, panel] of panels) {
      if (panel.element) panel.element.hidden = id !== active;
      if (id === active) panel.show?.();
      else panel.hide?.();
    }
    container.dataset.panel = active || 'main';
    container.classList.toggle('customizing', active === 'studio');
    container.classList.toggle('building', frames.some((frame) => frame.id.startsWith('builder')));
    const frame = frames.at(-1), panel = panels.get(active);
    if (panel?.element) panel.element.scrollTop = frame.scroll || 0;
    if (focus) {
      const opener = previous?.opener;
      const target = opener?.isConnected && !opener.closest('[hidden]') ? opener
        : panel?.initialFocus?.() || panel?.element?.querySelector('button, input, select, textarea, [tabindex]');
      target?.focus({ preventScroll: true });
    }
    container.dispatchEvent(new Event('panel-change'));
  }
  function write(replace = false) {
    token++;
    snapshots.set(token, frames.map((frame) => ({ ...frame })));
    const state = { ...history.state, skygreetingPanel: { session, token } };
    history[replace ? 'replaceState' : 'pushState'](state, '', location.href);
  }
  write(true);
  const api = {
    register(id, panel) { panels.set(id, panel); if (panel.element) panel.element.hidden = current() !== id; return () => panels.delete(id); },
    open(id, { parent = current(), opener = document.activeElement } = {}) {
      if (pendingBack) { queuedOpen = () => api.open(id, { parent, opener }); return; }
      if (!usable({ id }) || current() === id) return;
      rememberFrame();
      if (parent === null) frames = [];
      else if (parent !== current()) {
        const index = frames.findIndex((frame) => frame.id === parent);
        frames = index >= 0 ? frames.slice(0, index + 1) : [{ id: parent, opener: null, scroll: 0 }];
      }
      frames.push({ id, opener, scroll: 0 });
      write(); paint();
    },
    replace(id) {
      rememberFrame();
      const previous = frames.pop();
      if (id && current() !== id) frames.push({ id, opener: previous?.opener, scroll: 0 });
      write(true); paint();
    },
    back(reason = 'back') {
      if (!frames.length || pendingBack || panels.get(current())?.beforeBack?.(reason) === false) return;
      const previous = frames.pop();
      paint(previous);
      if (history.state?.skygreetingPanel?.session === session) {
        pendingBack = true;
        backTarget = frames.map((frame) => frame.id).join('|');
        history.back();
      } else write(true);
    },
    close() { const previous = frames[0]; frames = []; write(true); paint(previous); },
    get current() { return current(); },
    get parent() { return frames.at(-2)?.id || null; },
  };
  addEventListener('popstate', (event) => {
    const previous = frames.at(-1);
    if (!pendingBack) panels.get(current())?.beforeBack?.('browser');
    const saved = event.state?.skygreetingPanel;
    const next = saved?.session === session ? (snapshots.get(saved.token) || []).filter(usable).map((frame) => ({ ...frame })) : [];
    if (pendingBack && saved?.session === session && next.map((frame) => frame.id).join('|') !== backTarget) {
      history.back(); return;
    }
    pendingBack = false; backTarget = null; frames = next;
    paint(previous);
    const waiting = queuedOpen; queuedOpen = null; waiting?.();
  }, { signal });
  addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && current() && !event.defaultPrevented) { event.preventDefault(); api.back('escape'); }
  }, { signal });
  ctx.navigation = api;
  return { update() {}, dispose() { panels.clear(); snapshots.clear(); container.classList.remove('customizing', 'building'); delete container.dataset.panel; ctx.navigation = null; } };
}
