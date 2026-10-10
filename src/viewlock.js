// View lock: a small button that holds the camera still, so a tap only ever launches a
// shell. Unlocked, a drag turns the view, and even a tap nudges it a few pixels' worth
// before the damping glides on, which made tapping to launch feel slippery on a phone.
// Locked, nothing moves the camera (orbiting, its glide, walking with the keys), and
// fireworks.js counts a sloppier press as a tap, since a drag no longer does anything
// else. Camera presets in Customize still switch the view. Remembered per visitor.
const KEY = 'skygreeting-view-locked';

export function create(ctx) {
  const { container, controls, signal } = ctx;
  ctx.viewLocked = false;
  // An embedded header already holds its view (main.js) and shows no controls; the
  // autoshow has no button either, so a lock remembered from the main page mustn't apply.
  if (ctx.link.embed || ctx.link.autoshow) return { update() {}, dispose() {} };

  let locked = read();
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'view-lock';
  button.addEventListener('click', () => {
    locked = !locked;
    try {
      localStorage.setItem(KEY, locked ? '1' : '0');
    } catch {
      // Storage blocked: the lock lasts for this visit.
    }
    apply();
  }, { signal });
  container.append(button);
  apply();

  function apply() {
    ctx.viewLocked = locked;
    if (locked && ctx.walk) ctx.walk.stop();
    controls.enabled = !locked && !(ctx.walk && ctx.walk.active);
    button.setAttribute('aria-pressed', String(locked));
    button.textContent = locked ? '🔒' : '🔓';
    button.setAttribute('aria-label', locked ? 'View locked' : 'Lock the view');
    button.title = locked ? 'Unlock the view, to drag and look around' : 'Hold the view still, so a tap only launches';
  }

  return {
    update() {},
    dispose() {
      button.remove();
      ctx.viewLocked = false;
    },
  };
}

function read() {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}
