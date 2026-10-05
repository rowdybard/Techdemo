// Save as video: records a greeting's ending, live, to a video file people can post
// (TikTok, Reels, Stories can't take a link). The browser records the canvas itself with
// MediaRecorder, so nothing is uploaded anywhere. Each frame, right after it's drawn, the
// scene is copied onto a small 2D canvas that is what gets recorded, with a SkyGreeting
// watermark on free greetings (paid ones record clean). Overlays (cards, buttons) are page
// elements, not the canvas, so they never appear in the video.
//
// MP4 where the browser can make it (Safari, recent Chrome), WebM otherwise. Saving opens
// the share sheet on phones (Save Video, TikTok, Instagram) or downloads elsewhere; it
// waits for a tap, because browsers only allow sharing from one.

const TYPES = ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
const FPS = 30;
const LONGEST_SIDE = 1280;
const MAX_SECONDS = 45;

export function create(ctx) {
  const { renderer, container, signal } = ctx;
  const source = renderer.domElement;
  const type = typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function'
    ? TYPES.find((t) => MediaRecorder.isTypeSupported(t)) || null
    : null;
  let job = null;
  let blobUrl = '';
  let shownSecond = -1;

  // While recording: a small pill (not in the video). After: a card to save it.
  const pill = el('button', 'video-pill');
  pill.type = 'button';
  pill.hidden = true;
  const ready = el('div', 'send-box video-ready');
  ready.hidden = true;
  const readyTitle = el('p', 'send-title', '🎬 Your video is ready');
  // Watch it here first: you see what you're saving, and it proves it recorded.
  const preview = el('video', 'video-preview');
  preview.controls = true;
  preview.loop = true;
  preview.muted = true;
  preview.playsInline = true;
  const readyNote = el('p', 'send-status');
  readyNote.setAttribute('role', 'status');
  const share = el('button', 'send-primary', 'Share video');
  share.type = 'button';
  const save = el('button', 'send-secondary', 'Download');
  save.type = 'button';
  const done = el('button', 'send-close', 'Done');
  done.type = 'button';
  const row = el('div', 'send-row');
  row.append(save, share);
  ready.append(readyTitle, preview, readyNote, row, done);
  container.append(pill, ready);

  let file = null;
  pill.addEventListener('click', () => stop(), { signal });
  done.addEventListener('click', () => finish(), { signal });
  save.addEventListener('click', () => download(), { signal });
  share.addEventListener('click', async () => {
    if (!file) return;
    try {
      await navigator.share({ files: [file], title: 'SkyGreeting' });
      readyNote.textContent = 'Shared.';
    } catch (error) {
      // Closing the share sheet isn't a failure; anything else falls back to a download.
      if (!error || error.name !== 'AbortError') download();
    }
  }, { signal });

  function download() {
    if (!file) return;
    if (!blobUrl) blobUrl = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = file.name;
    link.click();
    const odd = file.type === 'video/webm' ? ' Some gallery apps don’t list .webm files, so open it from Files, or use Share to send it straight to TikTok or Instagram.' : '';
    readyNote.textContent = `Saved as ${file.name}. Find it in your Downloads folder: on a phone, open the Files app, then Downloads.${odd}`;
  }

  /**
   * Plays an ending and records it. `play()` starts it and returns its length in
   * seconds; recording stops a moment after. Returns false if this browser can't record.
   */
  function capture({ play, watermark, name }) {
    if (!type || job) return false;
    const scale = Math.min(1, LONGEST_SIDE / Math.max(source.width, source.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(2, Math.round((source.width * scale) / 2) * 2);
    canvas.height = Math.max(2, Math.round((source.height * scale) / 2) * 2);
    const g = canvas.getContext('2d');
    const stream = canvas.captureStream(FPS);
    const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8000000 });
    const chunks = [];
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = () => {
      for (const track of stream.getTracks()) track.stop();
      canvas.width = 0;
      canvas.height = 0;
      const kind = type.split(';')[0];
      file = new File(chunks, `${name}.${kind === 'video/mp4' ? 'mp4' : 'webm'}`, { type: kind });
      job = null;
      pill.hidden = true;
      readyNote.textContent = `${Math.max(1, Math.round(file.size / 1048576 * 10) / 10)} MB · ${kind === 'video/mp4' ? 'MP4' : 'WebM'}${watermark ? ' · free greetings carry a small SkyGreeting mark' : ''}`;
      share.hidden = !(navigator.canShare && navigator.canShare({ files: [file] }));
      save.className = share.hidden ? 'send-primary' : 'send-secondary';
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      blobUrl = URL.createObjectURL(file);
      preview.src = blobUrl;
      preview.play().catch(() => {});
      ready.hidden = false;
    };
    const mark = Math.round(canvas.height * 0.032);
    job = { canvas, g, recorder, stream, watermark, mark, font: `600 ${mark}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`, started: performance.now(), length: 0 };
    container.classList.add('recording');
    pill.hidden = false;
    pill.textContent = '● Recording… tap to stop';
    pill.style.setProperty('--p', '0%');
    shownSecond = -1;
    recorder.start(1000);
    job.length = Math.min(MAX_SECONDS, (play() || 20) + 0.5);
    ctx.afterRender = draw;
    return true;
  }

  // Called by main.js right after each frame is drawn, while the canvas still holds it.
  function draw() {
    const j = job;
    if (!j) return;
    j.g.drawImage(source, 0, 0, j.canvas.width, j.canvas.height);
    if (j.watermark) {
      j.g.font = j.font;
      j.g.textAlign = 'right';
      j.g.textBaseline = 'bottom';
      j.g.shadowColor = 'rgba(0, 0, 0, 0.6)';
      j.g.shadowBlur = j.mark * 0.4;
      j.g.fillStyle = 'rgba(255, 236, 214, 0.85)';
      j.g.fillText('✦ skygreeting.com', j.canvas.width - j.mark * 0.9, j.canvas.height - j.mark * 0.8);
      j.g.shadowBlur = 0;
    }
    const seconds = (performance.now() - j.started) / 1000;
    const whole = Math.floor(seconds);
    if (whole !== shownSecond) {
      shownSecond = whole;
      pill.textContent = `● Recording… ${whole}s of ${Math.round(j.length)}s · tap to stop`;
      pill.style.setProperty('--p', `${Math.min(100, Math.round((seconds / j.length) * 100))}%`);
    }
    if (seconds >= j.length) stop();
  }

  function stop() {
    if (!job) return;
    ctx.afterRender = null;
    if (job.recorder.state !== 'inactive') job.recorder.stop();
  }

  function finish() {
    ready.hidden = true;
    preview.removeAttribute('src');
    preview.load();
    file = null;
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    blobUrl = '';
    container.classList.remove('recording');
  }

  ctx.video = { supported: Boolean(type), capture };

  return {
    update() {},
    dispose() {
      if (job) {
        ctx.afterRender = null;
        job.recorder.onstop = null;
        if (job.recorder.state !== 'inactive') job.recorder.stop();
        for (const track of job.stream.getTracks()) track.stop();
        job = null;
      }
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      pill.remove();
      ready.remove();
      container.classList.remove('recording');
      ctx.video = null;
    },
  };
}

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}
