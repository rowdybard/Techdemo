// Disabled unless an operator token is configured. Never used by the public client.
import { HttpError, json, readJSON, sha256, validId } from './common.js';
import { importLegacyStatus, targetGuard } from './policy.js';

async function authorized(request, env) {
  const token = env.MAINTENANCE_TOKEN;
  if (typeof token !== 'string' || token.length < 32) return false;
  const supplied = request.headers.get('authorization')?.replace(/^Bearer /, '') || '';
  const [expected, actual] = await Promise.all([sha256(token), sha256(supplied)]);
  let difference = 0;
  for (let index = 0; index < expected.length; index++) difference |= expected.charCodeAt(index) ^ actual.charCodeAt(index);
  return difference === 0;
}

export async function maintenance(request, env) {
  if (!(await authorized(request, env))) return json({ error: 'Not found' }, 404);
  const body = await readJSON(request);
  if (body.action === 'retire') {
    if (!validId(body.id)) throw new HttpError(400, 'A valid greeting id is required.');
    if (body.apply !== true) return json({ action: 'retire', apply: false, wouldDelete: 1 });
    // The durable tombstone is committed first. A KV failure can never revive this link.
    await targetGuard(env, `g:${body.id}`).retireGreeting(body.id);
    return json({ action: 'retire', apply: true, deleted: 1 });
  }
  if (body.action !== 'legacy-tallies') throw new HttpError(400, 'Unknown maintenance action.');
  const cursor = typeof body.cursor === 'string' && body.cursor.length <= 2048 ? body.cursor : undefined;
  const page = await env.GREETINGS.list({ prefix: 'n:', limit: 100, ...(cursor ? { cursor } : {}) });
  let processed = 0;
  let hidden = 0;
  let ignored = 0;
  for (const key of page.keys) {
    const target = key.name.slice(2);
    if (!/^g:[A-Za-z0-9]{8}$|^t:[a-f0-9]{24}$/.test(target)) { ignored++; continue; }
    const raw = await env.GREETINGS.get(key.name);
    let tally;
    try { tally = raw ? JSON.parse(raw) : null; } catch { tally = null; }
    if (tally?.by?.length >= 3) hidden++;
    if (body.apply === true) await importLegacyStatus(env, target);
    processed++;
  }
  return json({ action: 'legacy-tallies', apply: body.apply === true, processed, hidden, ignored,
    cursor: page.list_complete ? null : page.cursor });
}
