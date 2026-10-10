import { clean, json, LIMITS, newId, readJSON, REPORT_SECONDS, sha256, validId } from './common.js';
import { hiddenText, takeRate, targetGuard, targetStatus, textKey } from './policy.js';
import { paidRecord } from './storage.js';

const REASONS = new Set(['hateful', 'threatening', 'sexual', 'spam', 'other']);
function reportedWords(body) {
  return { occasion: clean(body.occasion, 20), message: clean(body.message, LIMITS.message).toUpperCase(),
    message2: clean(body.message2, LIMITS.message2).toUpperCase(), to: clean(body.to, LIMITS.to).toUpperCase(), from: clean(body.from, LIMITS.from) };
}

export async function report(request, env) {
  const body = await readJSON(request);
  const id = validId(body.id) ? body.id : null;
  const words = reportedWords(body);
  if (!id && !words.message) return json({ error: 'Nothing to report.' }, 400);
  const identity = request.headers.get('cf-connecting-ip') || 'unknown';
  if (!(await takeRate(env, 'report', identity, 10, 3600000))) return json({ error: 'Too many reports. Try again later.' }, 429);
  const target = id ? `g:${id}` : `t:${await textKey(words)}`;
  const existing = await targetStatus(env, target);
  if (existing.hidden || existing.deleted) return json({ received: true });
  if (id && !(await paidRecord(env, id))) return json({ error: 'Greeting not found.' }, 404);
  const at = new Date().toISOString();
  await env.GREETINGS.put(`r:${at}:${newId()}`, JSON.stringify({ target, id, ...(id ? {} : words),
    reason: REASONS.has(body.reason) ? body.reason : 'other', note: clean(body.note, 200), at }), { expirationTtl: REPORT_SECONDS });
  const reporter = await sha256(`skygreeting:reporter:${identity}`);
  await targetGuard(env, target).vote(reporter);
  return json({ received: true });
}

export async function takenDown(env, params) {
  const words = reportedWords({ occasion: params.get('o'), message: params.get('msg'), message2: params.get('msg2'), to: params.get('to'), from: params.get('from') });
  if (!words.message) return json({ hidden: false });
  return json({ hidden: await hiddenText(env, words) });
}
