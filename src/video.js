// Record the canvas locally. Completion follows scene time and the director's actual
// particle tail, so a slow phone or the longer New Year show still records every cue.
import { track } from './track.js';

const TYPES = ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
const FPS = 30;
const LONGEST_SIDE = 1280;
const MIN_SECONDS = 5; // Stop and save; Cancel always works immediately.

export function create(ctx) {
  const { renderer, container, signal } = ctx;
  const source = renderer.domElement;
  const type = typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function'
    ? TYPES.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || null : null;
  let job = null, last = null, file = null, blobUrl = '', session = null;
  let now = 0, shownSecond = -1, disposed = false;
  const nav = ctx.navigation;
  const flow = el('div', 'video-flow');
  flow.hidden = true;
  const pill = el('button', 'video-pill');
  const cancel = el('button', 'video-pill video-cancel', 'Cancel recording');
  const ready = el('div', 'send-box video-ready');
  const title = el('p', 'send-title', 'Your video is ready');
  const preview = el('video', 'video-preview');
  preview.controls = true; preview.loop = true; preview.muted = true; preview.playsInline = true;
  const note = el('p', 'send-status'); note.setAttribute('role', 'status');
  const share = el('button', 'send-primary', 'Share video');
  const save = el('button', 'send-secondary', 'Download');
  const again = el('button', 'send-primary', 'Record again');
  const done = el('button', 'send-close', 'Done');
  for (const button of [pill, cancel, share, save, again, done]) button.type = 'button';
  const row = el('div', 'send-row'); row.append(save, share, again);
  ready.append(title, preview, note, row, done);
  flow.append(pill, cancel, ready); container.append(flow);
  pill.hidden = cancel.hidden = ready.hidden = true;

  const unregister = nav?.register('video', {
    element: flow,
    canEnter: () => Boolean(session),
    initialFocus: () => job ? cancel : done,
    beforeBack() { leave(); },
  });
  pill.addEventListener('click', () => stop(true), { signal });
  cancel.addEventListener('click', close, { signal });
  done.addEventListener('click', close, { signal });
  again.addEventListener('click', () => { if (last) start(last); }, { signal });
  save.addEventListener('click', download, { signal });
  share.addEventListener('click', async () => {
    if (!file) return;
    const sharedFile = file;
    try {
      await navigator.share({ files: [sharedFile], title: 'SkyGreeting' });
      if (file === sharedFile && !disposed) note.textContent = 'Shared.';
      track('share_success', { content_type: 'video', method: 'native' });
    } catch (error) {
      if (file === sharedFile && error?.name !== 'AbortError') note.textContent = 'Sharing didn’t work. Tap Download instead.';
    }
  }, { signal });

  function clearResult() {
    preview.pause(); preview.removeAttribute('src'); preview.load();
    file = null;
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    blobUrl = '';
    ready.hidden = true;
  }
  function release(j) {
    if (j.released) return;
    j.released = true;
    for (const mediaTrack of j.stream?.getTracks() || []) mediaTrack.stop();
    j.canvas.width = j.canvas.height = 0;
  }
  function discard() {
    const j = job;
    job = null;
    ctx.afterRender = null;
    ctx.recordingTail = false;
    if (j) {
      j.cancelled = true;
      j.recorder.onstop = j.recorder.ondataavailable = j.recorder.onerror = null;
      if (j.recorder.state !== 'inactive') { try { j.recorder.stop(); } catch { /* recorder already failed */ } }
      release(j);
    }
    ctx.director?.stop();
    pill.hidden = cancel.hidden = true;
  }
  function leave() {
    discard(); clearResult();
    flow.hidden = true;
    container.classList.remove('recording');
    const returning = session;
    session = null; last = null;
    if (returning && !returning.returned) {
      returning.returned = true;
      queueMicrotask(() => { if (!disposed) returning.returnTo?.(); });
    }
  }
  function close() {
    if (nav?.current === 'video') nav.back();
    else leave();
  }
  function failure(message) {
    discard(); clearResult();
    title.textContent = 'The video couldn’t be recorded'; note.textContent = message;
    preview.hidden = save.hidden = share.hidden = true;
    again.hidden = false; ready.hidden = false;
    track('video_failed', { reason: 'recording' });
  }

  /** Starts the ending. Done/Cancel returns once to its originating screen. */
  function capture(options) {
    if (!type || job || session || disposed) return false;
    session = { returnTo: options.returnTo, returned: false };
    last = options;
    container.classList.add('recording');
    if (nav) nav.open('video');
    else flow.hidden = false;
    return start(options);
  }
  function start(options) {
    track('video_attempt', { tier: options.watermark ? 'free' : 'deluxe' });
    clearResult();
    const { play, watermark, name = 'skygreeting' } = options;
    const canvas = document.createElement('canvas');
    let stream;
    try {
      const scale = Math.min(1, LONGEST_SIDE / Math.max(2, source.width, source.height));
      canvas.width = Math.max(2, Math.round(source.width * scale / 2) * 2);
      canvas.height = Math.max(2, Math.round(source.height * scale / 2) * 2);
      const g = canvas.getContext('2d');
      if (!g) throw new Error('No recording canvas');
      stream = canvas.captureStream(FPS);
      const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8000000 });
      const mark = Math.round(canvas.height * 0.032);
      const j = { canvas, g, stream, recorder, chunks: [], watermark, name, mark,
        font: `600 ${mark}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`,
        started: performance.now(), sceneStart: now, sceneEnd: Infinity, tailUntil: null,
        directed: false, stopping: false, cancelled: false, released: false, frames: 0 };
      job = j;
      recorder.ondataavailable = (event) => { if (!j.cancelled && event.data.size) j.chunks.push(event.data); };
      recorder.onstop = () => completed(j);
      recorder.onerror = () => { if (job === j && !disposed) failure('Try again, or open the greeting in another browser.'); };
      shownSecond = -1;
      pill.hidden = cancel.hidden = false;
      pill.textContent = `Recording… Stop and save from ${MIN_SECONDS}s`;
      pill.setAttribute('aria-disabled', 'true');
      pill.style.setProperty('--p', '0%');
      ctx.recordingTail = false;
      recorder.start(1000);
      const length = play();
      j.directed = Boolean(ctx.director?.active);
      j.sceneEnd = now + (Number.isFinite(length) && length > 0 ? length : 20) + 0.5;
      ctx.afterRender = draw;
      cancel.focus({ preventScroll: true });
      return true;
    } catch {
      for (const mediaTrack of stream?.getTracks() || []) mediaTrack.stop();
      canvas.width = canvas.height = 0;
      failure('This browser couldn’t start recording. Try again or use another browser.');
      return false;
    }
  }

  function completed(j) {
    release(j);
    if (j.cancelled || disposed || job !== j) return;
    job = null; ctx.afterRender = null; ctx.recordingTail = false;
    pill.hidden = cancel.hidden = true;
    const seconds = (performance.now() - j.started) / 1000;
    const kind = type.split(';')[0];
    file = new File(j.chunks, `${j.name}.${kind === 'video/mp4' ? 'mp4' : 'webm'}`, { type: kind });
    if (file.size < 2000 || seconds < MIN_SECONDS - 0.5 || j.frames < 2) {
      file = null;
      title.textContent = 'That recording was too short to save';
      note.textContent = 'Record it again and let it play for at least five seconds.';
      preview.hidden = save.hidden = share.hidden = true;
      again.hidden = false;
    } else {
      title.textContent = 'Your video is ready';
      preview.hidden = save.hidden = false; again.hidden = true;
      note.textContent = `${Math.max(0.1, Math.round(file.size / 104857.6) / 10)} MB · ${kind === 'video/mp4' ? 'MP4' : 'WebM'}${j.watermark ? ' · SkyGreeting watermark' : ''}`;
      share.hidden = !(navigator.canShare && navigator.canShare({ files: [file] }));
      save.className = share.hidden ? 'send-primary' : 'send-secondary';
      blobUrl = URL.createObjectURL(file); preview.src = blobUrl;
      preview.play().catch(() => {});
      track('video_completed', { tier: j.watermark ? 'free' : 'deluxe', duration_seconds: Math.round(seconds) });
    }
    ready.hidden = false; done.focus({ preventScroll: true });
  }
  function draw() {
    const j = job;
    if (!j || j.stopping) return;
    try {
      j.g.drawImage(source, 0, 0, j.canvas.width, j.canvas.height);
      j.frames++;
      if (j.watermark) {
        j.g.font = j.font; j.g.textAlign = 'right'; j.g.textBaseline = 'bottom';
        j.g.shadowColor = 'rgba(0, 0, 0, 0.6)'; j.g.shadowBlur = j.mark * 0.4;
        j.g.fillStyle = 'rgba(255, 236, 214, 0.85)';
        j.g.fillText('skygreeting.com', j.canvas.width - j.mark * 0.9, j.canvas.height - j.mark * 0.8);
        j.g.shadowBlur = 0;
      }
    } catch { failure('The video stopped recording. Try again with this tab kept open.'); return; }
    const seconds = (performance.now() - j.started) / 1000;
    const whole = Math.floor(seconds);
    if (whole !== shownSecond) {
      shownSecond = whole;
      const remaining = j.tailUntil === null ? (j.directed ? ctx.director.remaining : j.sceneEnd - now) : j.tailUntil - now;
      const duration = Math.max(1, now - j.sceneStart + Math.max(0, remaining || 0));
      pill.textContent = seconds < MIN_SECONDS ? `Recording… ${whole}s · Save from ${MIN_SECONDS}s` : `Recording… ${whole}s · Stop and save`;
      pill.setAttribute('aria-disabled', String(seconds < MIN_SECONDS));
      pill.style.setProperty('--p', `${Math.min(100, Math.round((now - j.sceneStart) / duration * 100))}%`);
    }
    if (j.tailUntil !== null && now >= j.tailUntil) stop();
  }
  function stop(early = false) {
    const j = job;
    if (!j || j.stopping || (early && performance.now() - j.started < MIN_SECONDS * 1000)) return;
    j.stopping = true; ctx.afterRender = null; ctx.recordingTail = false;
    ctx.director?.stop();
    pill.textContent = 'Finishing video…';
    try { if (j.recorder.state !== 'inactive') j.recorder.stop(); }
    catch { failure('The video couldn’t finish. Try recording it again.'); }
  }
  function download() {
    if (!file || !blobUrl) return;
    const link = document.createElement('a');
    link.href = blobUrl; link.download = file.name; link.style.display = 'none';
    document.body.append(link); link.click(); link.remove();
    note.textContent = 'Download started. Check Files or Downloads on your device.';
    track('video_download', { format: file.type }); // a download request, not proof of a saved file
  }

  ctx.video = { supported: Boolean(type), capture, cancel: close };
  return {
    update(dt, time) {
      now = time;
      const j = job;
      if (!j || j.stopping || j.tailUntil !== null) return;
      if (j.directed ? ctx.director?.active : now < j.sceneEnd) return;
      // Snapshot once, and hold background schedulers while this existing tail fades.
      // Continuous side barges must not move the deadline on every subsequent frame.
      ctx.recordingTail = true;
      j.tailUntil = Math.max(now + (ctx.crane?.remaining || 0), ctx.fireworks?.pool.latestDeath() || now) + 0.5;
    },
    dispose() {
      disposed = true; leave(); unregister?.(); flow.remove(); ctx.video = null;
    },
  };
}

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  node.className = className; node.textContent = text;
  return node;
}
