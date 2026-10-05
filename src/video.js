// Save as video: records a greeting's ending, live, to a video file people can post
// (TikTok, Reels, Stories can't take a link). The browser records the canvas itself with
// MediaRecorder, so nothing is uploaded anywhere. Each frame, right after it's drawn, the
// scene is copied onto a small 2D canvas that is what gets recorded, with a SkyGreeting
// watermark on free greetings (paid ones record clean). Overlays (cards, buttons) are page
// elements, not the canvas, so they never appear in the video.
//
// MP4 (H.264) where the browser can make it (Safari, recent Chrome), WebM otherwise. When it's
// done, a card plays the video back and offers a real download link (a direct tap on a
// link is the one download no browser blocks) plus, on phones, the share sheet (Save
// Video, TikTok, Instagram). Sharing waits for a tap, because browsers only allow it from
// one. The card says where the file went, since "Downloads" means a different place on
// every device, and says so plainly when this page can't download at all (in an iframe).

// Plain 'video/mp4' comes last: Chromium without H.264 puts VP9 in an MP4, which many
// players and apps won't open, so WebM is the better file there.
const TYPES = ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
const FPS = 30;
const LONGEST_SIDE = 1280;
const MAX_SECONDS = 45;

export function create(ctx) {
  const { renderer, container, signal } = ctx;
  const source = renderer.domElement;
  const type = typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function'
    ? TYPES.find((t) => MediaRecorder.isTypeSupported(t)) || null
    : null;
  const device = whichDevice();
  const framed = inFrame();
  let job = null;
  let file = null;
  let blobUrl = '';

  // While recording: a pill with the time and a filling bar (not in the video).
  const pill = el('button', 'video-pill');
  pill.type = 'button';
  pill.hidden = true;
  const pillText = el('span', 'video-pill-text');
  const pillBar = el('span', 'video-pill-bar');
  pill.append(pillText, pillBar);

  // After: the video itself, what it is, and how to keep it.
  const ready = el('div', 'send-box video-ready');
  ready.hidden = true;
  ready.setAttribute('role', 'dialog');
  ready.setAttribute('aria-label', 'Your video is ready');
  const readyTitle = el('p', 'send-title', '🎬 Your video is ready');
  const preview = el('video', 'video-preview');
  preview.muted = true;
  preview.loop = true;
  preview.playsInline = true;
  preview.setAttribute('playsinline', '');
  const info = el('p', 'video-info');
  const download = el('a', 'send-primary video-download', 'Download video');
  const share = el('button', 'send-primary', 'Save or share');
  share.type = 'button';
  const done = el('button', 'send-secondary', 'Done');
  done.type = 'button';
  const row = el('div', 'send-row');
  row.append(done, share, download);
  const readyNote = el('p', 'send-status video-note');
  readyNote.setAttribute('aria-live', 'polite');
  ready.append(readyTitle, preview, info, row, readyNote);
  container.append(pill, ready);

  pill.addEventListener('click', () => stop(), { signal });
  done.addEventListener('click', () => finish(), { signal });
  download.addEventListener('click', () => {
    readyNote.textContent = framed
      ? 'This page is inside another site, which blocks downloads. Open skygreeting.com in its own tab to save the video.'
      : WHERE[device](file.name);
  }, { signal });
  share.addEventListener('click', () => {
    if (!file) return;
    navigator.share({ files: [file], title: 'SkyGreeting' }).then(() => {
      readyNote.textContent = 'Shared. If you picked Save Video, it’s in your Photos.';
    }, (error) => {
      // Closing the sheet isn't a failure: leave both buttons for another try.
      readyNote.textContent = error && error.name === 'AbortError'
        ? 'Not saved yet. Tap Save or share and pick Save Video, or use Download.'
        : 'Sharing didn’t work here. Use Download instead.';
      download.hidden = false;
    });
  }, { signal });

  /**
   * Plays an ending and records it. `play()` starts it and returns its length in
   * seconds; recording stops a moment after. Returns false if this browser can't record.
   */
  function capture({ play, watermark, name }) {
    if (!type || job) return false;
    finish();
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
      const seconds = Math.round((performance.now() - job.started) / 1000);
      job = null;
      pill.hidden = true;
      container.classList.remove('recording');
      const kind = (recorder.mimeType || type).split(';')[0];
      file = new File(chunks, `${name}.${kind === 'video/mp4' ? 'mp4' : 'webm'}`, { type: kind });
      showReady(watermark, seconds);
    };
    const mark = Math.round(canvas.height * 0.032);
    job = {
      canvas, g, recorder, stream, watermark, mark,
      font: `600 ${mark}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`,
      started: performance.now(), length: 0, second: -1, labels: null,
    };
    container.classList.add('recording');
    recorder.start(1000);
    job.length = Math.min(MAX_SECONDS, (play() || 20) + 0.5);
    // Every label the pill will show, made now so the render loop never builds a string.
    const total = Math.ceil(job.length);
    job.labels = Array.from({ length: total + 1 }, (_, s) => `● Recording ${clock(s)} / ${clock(total)} · tap to stop`);
    pillText.textContent = job.labels[0];
    pillBar.style.animationDuration = `${job.length}s`;
    pill.hidden = false;
    pill.classList.remove('running');
    void pill.offsetWidth; // restart the bar's fill
    pill.classList.add('running');
    ctx.afterRender = draw;
    return true;
  }

  function showReady(watermark, seconds) {
    readyNote.textContent = '';
    if (!file.size) {
      readyTitle.textContent = 'The video didn’t record';
      info.textContent = 'This browser gave back an empty file. Try again, or try another browser.';
      preview.hidden = true;
      share.hidden = true;
      download.hidden = true;
      ready.hidden = false;
      return;
    }
    blobUrl = URL.createObjectURL(file);
    readyTitle.textContent = '🎬 Your video is ready';
    preview.hidden = false;
    preview.src = blobUrl;
    preview.play().catch(() => {});
    info.textContent = `${file.name} · ${megabytes(file.size)} · ${seconds} s${watermark ? ' · free greetings carry a small SkyGreeting mark' : ''}`;
    download.href = blobUrl;
    download.download = file.name;
    // Phones get the share sheet first (it's how a video reaches Photos or an app), with
    // Download kept for the file itself; computers just download.
    const canShare = device !== 'computer' && !framed && navigator.canShare && navigator.canShare({ files: [file] });
    share.hidden = !canShare;
    download.hidden = false;
    download.className = canShare ? 'send-secondary video-download' : 'send-primary video-download';
    if (framed) readyNote.textContent = 'Downloads are blocked in this preview. Open skygreeting.com in its own tab to save videos.';
    ready.hidden = false;
    (canShare ? share : download).focus({ preventScroll: true });
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
    const elapsed = (performance.now() - j.started) / 1000;
    const second = Math.min(j.labels.length - 1, Math.floor(elapsed));
    if (second !== j.second) {
      j.second = second;
      pillText.textContent = j.labels[second];
    }
    if (elapsed >= j.length) stop();
  }

  function stop() {
    if (!job) return;
    ctx.afterRender = null;
    pillText.textContent = 'Finishing your video…';
    if (job.recorder.state !== 'inactive') job.recorder.stop();
  }

  function finish() {
    ready.hidden = true;
    file = null;
    preview.pause();
    preview.removeAttribute('src');
    preview.load();
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    blobUrl = '';
    download.removeAttribute('href');
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
      finish();
      pill.remove();
      ready.remove();
      ctx.video = null;
    },
  };
}

// Where a downloaded file lands, in the words each device uses.
const WHERE = {
  computer: (name) => `Downloading ${name}. It’s in your Downloads folder; press Ctrl+J (⌘⌥L on a Mac) to see it in the browser.`,
  iphone: (name) => `Downloading ${name} to the Files app, under Downloads. To put it in Photos, use Save or share and pick Save Video.`,
  android: (name) => `Downloading ${name}. It’s in the Files app under Downloads, and your pull-down notifications.`,
};

function whichDevice() {
  const agent = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(agent) || (/Macintosh/.test(agent) && navigator.maxTouchPoints > 1)) return 'iphone';
  if (/Android/.test(agent)) return 'android';
  return 'computer';
}

// Inside an iframe (such as a preview), downloads are usually sandboxed away.
function inFrame() {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

function clock(seconds) {
  return `0:${String(seconds).padStart(2, '0')}`;
}

function megabytes(bytes) {
  if (bytes < 1048576) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1048576).toFixed(bytes < 10485760 ? 1 : 0)} MB`;
}

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}
