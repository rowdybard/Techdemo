// Operator tool: defaults to a read-only dry run; never prints tokens or greeting ids.
// See worker/MAINTENANCE.md. Mutations require the owner's approved release/maintenance action.
const args = process.argv.slice(2);
const action = args[0];
if (!['legacy-tallies', 'retire'].includes(action)) throw new Error('Usage: node tools/worker-maintenance.mjs legacy-tallies|retire [greeting-id] [--origin URL] [--apply]');
const token = process.env.SKYGREETING_MAINTENANCE_TOKEN;
if (!token) throw new Error('The operator token must be available in SKYGREETING_MAINTENANCE_TOKEN. Do not pass it as a command-line argument.');
const originIndex = args.indexOf('--origin');
const origin = new URL(originIndex >= 0 ? args[originIndex + 1] : 'https://skygreeting.com');
if (origin.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(origin.hostname)) throw new Error('An HTTPS origin is required.');
const apply = args.includes('--apply');
const id = action === 'retire' ? args[1] : undefined;
if (action === 'retire' && !/^[A-Za-z0-9]{8}$/.test(id || '')) throw new Error('Retire requires a valid greeting id.');
let cursor;
let processed = 0;
let hidden = 0;
let ignored = 0;
for (;;) {
  const response = await fetch(new URL('/api/maintenance', origin), { method: 'POST', signal: AbortSignal.timeout(30000),
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ action, apply, id, cursor }) });
  if (!response.ok) throw new Error(`Maintenance request failed (${response.status}).`);
  const result = await response.json();
  if (action === 'retire') { console.log(`${apply ? 'Retired' : 'Would retire'} one greeting.`); break; }
  processed += result.processed || 0; hidden += result.hidden || 0; ignored += result.ignored || 0;
  if (!result.cursor) break;
  if (result.cursor === cursor) throw new Error('Maintenance pagination did not advance.');
  cursor = result.cursor;
}
if (action === 'legacy-tallies') console.log(`${apply ? 'Imported' : 'Would import'} ${processed} legacy tallies; ${hidden} reach the hidden threshold; ${ignored} unrecognized keys.`);
