export const OCCASIONS = new Set(['halloween', 'birthday', 'love', 'congrats', 'thanks', 'newyear']);
export const LIMITS = { message: 24, message2: 24, to: 16, from: 24 };
export const PENDING_SECONDS = 2 * 24 * 3600;
export const SHARE_SECONDS = 365 * 24 * 3600;
export const REPORT_SECONDS = 90 * 24 * 3600;
export const validId = (id) => typeof id === 'string' && /^[A-Za-z0-9]{8}$/.test(id);

export function clean(value, limit) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, limit);
}

export function wordsOf(body) {
  return { occasion: OCCASIONS.has(body.occasion) ? body.occasion : 'birthday',
    message: clean(body.message, LIMITS.message).toUpperCase(), message2: clean(body.message2, LIMITS.message2).toUpperCase(),
    to: clean(body.to, LIMITS.to).toUpperCase(), from: clean(body.from, LIMITS.from) };
}

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export async function boundedText(request, limit = 16384) {
  if (Number(request.headers.get('content-length')) > limit) throw new HttpError(413, 'Request is too large.');
  if (!request.body) return '';
  const reader = request.body.getReader();
  const parts = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) { await reader.cancel(); throw new HttpError(413, 'Request is too large.'); }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  const buffer = new Uint8Array(bytes);
  let offset = 0;
  for (const part of parts) { buffer.set(part, offset); offset += part.byteLength; }
  return new TextDecoder().decode(buffer);
}

export async function readJSON(request) {
  const text = await boundedText(request);
  let data;
  try { data = JSON.parse(text); } catch { throw new HttpError(400, 'Bad request'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new HttpError(400, 'Bad request');
  return data;
}

export async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function newId() {
  const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return [...crypto.getRandomValues(new Uint8Array(8))].map((b) => alphabet[b % alphabet.length]).join('');
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}
