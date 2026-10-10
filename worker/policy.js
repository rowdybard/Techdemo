import { HttpError, sha256 } from './common.js';

function guard(env, name) {
  if (!env.GUARDS) throw new HttpError(503, 'Greeting protection is temporarily unavailable. Please try again.');
  return env.GUARDS.getByName(name);
}

export async function takeRate(env, scope, identity, limit, periodMs, now = Date.now()) {
  const hash = await sha256(`skygreeting:${scope}:${identity}`);
  const bucket = Math.floor(now / periodMs);
  return guard(env, `rate:${hash.slice(0, 2)}`).takeRate(`${scope}:${hash}:${bucket}`, limit, (bucket + 1) * periodMs, now);
}

export const targetGuard = (env, target) => guard(env, `target:${target}`);

// Old hidden flags/tallies are imported lazily without rewriting the greeting or its TTL.
export async function targetStatus(env, target) {
  const stub = targetGuard(env, target);
  const status = await stub.status();
  if (status.imported || status.hidden || status.deleted) return status;
  return importLegacyStatus(env, target);
}

export async function importLegacyStatus(env, target) {
  const stub = targetGuard(env, target);
  const [flag, tally, raw] = await Promise.all([
    env.GREETINGS.get(`h:${target}`), env.GREETINGS.get(`n:${target}`),
    target.startsWith('g:') ? env.GREETINGS.get(target) : Promise.resolve(null),
  ]);
  let hidden = Boolean(flag);
  let deleted = false;
  try {
    const record = raw ? JSON.parse(raw) : null;
    hidden ||= Boolean(record?.hidden);
    deleted = Boolean(record?.deleted);
  } catch { /* Invalid old record. */ }
  try { hidden ||= Boolean(tally && JSON.parse(tally).by?.length >= 3); } catch { /* Invalid old tally. */ }
  const imported = await stub.importLegacy({ hidden, deleted });
  // Old reporter hashes have no expiry. Remove them only after their status is durable.
  if (tally) await env.GREETINGS.delete(`n:${target}`);
  return imported;
}

export async function textKey({ occasion, message, message2, to, from }) {
  const parts = [occasion, message, to, from];
  if (message2) parts.push(message2);
  return (await sha256(parts.join('\u0001'))).slice(0, 24);
}

export async function hiddenText(env, words) {
  const status = await targetStatus(env, `t:${await textKey(words)}`);
  return Boolean(status.hidden || status.deleted);
}
