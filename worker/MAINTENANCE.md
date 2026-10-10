# Release and greeting maintenance

No production mutation has been run for this change. The SQLite migration in `wrangler.jsonc`
is a local deployment definition, applied only at the owner's approved release.

The single price authority is `pricing.js`. Set `DELUXE_LAUNCH_START_UTC` once at that approved
release, using an explicit UTC ISO timestamp such as `YYYY-MM-DDTHH:mm:ssZ`. Leave it absent
before release. The launch lasts exactly 30 × 24 hours, including the start and excluding the
end; the start must not be reset by later deployments. A checkout quote already created at
$1.99 remains valid after the promotion ends. Stripe's native `amount_received`/`currency`
fields are the authoritative paid backup; its metadata retains the quoted amount and opaque
analytics transaction id. A confirmed KV record stores both quoted and actual paid amounts.

New rate counters and reporter hashes are in SQLite Durable Objects. Rates use 256 sharded
objects and reports use one object per target. Alarms remove expired rates and reporter
hashes; reporter hashes last 90 days. Moderation status is durable and monotonic.

Existing `n:` KV tallies contain reporter hashes without an expiry. Opening a target imports
its existing hidden/deleted status and removes that old tally after the durable import.
To clean unvisited targets, run the bounded sweep below at the approved release. Each request
reads at most 100 keys and the tool follows the KV cursor. It imports existing `h:` flags,
record hidden/deleted flags, and the three-distinct-reporter threshold before removing `n:`.
Records and their original free greeting TTLs are never rewritten by this sweep.
Legacy tallies contain no reporter timestamps. One or two old hashes are discarded because
their ages cannot be established; existing takedowns and tallies of three or more remain hidden.

The maintenance API is disabled unless a dashboard secret named `MAINTENANCE_TOKEN` of at
least 32 characters is configured. Keep that secret out of files, command-line arguments,
logs and chat. The operator tool reads it from the process environment variable
`SKYGREETING_MAINTENANCE_TOKEN`. It defaults to a dry run and prints counts only:

```text
node tools/worker-maintenance.mjs legacy-tallies
node tools/worker-maintenance.mjs legacy-tallies --apply
```

Run the dry run first and review its counts. `--apply` requires an approved maintenance
action. Re-running is safe; imported hidden/deleted status cannot be cleared. Unexpected
key formats are counted and retained for manual inspection. Disable the maintenance secret
after a one-time release sweep unless a continuing operator path is needed.

Deleting only a `g:` KV record is not retirement: a paid Stripe backup can restore it. Use the
retire action, which commits a permanent central deletion tombstone before deleting KV.
Paid restoration writes and retirement share the same target object's concurrency gate,
including the KV operation, so an in-flight restore cannot recreate KV after cleanup:

```text
node tools/worker-maintenance.mjs retire GREETING --origin https://skygreeting.com
node tools/worker-maintenance.mjs retire GREETING --origin https://skygreeting.com --apply
```

Replace `GREETING` with the private eight-character id. Never post that command to a public
log. Retirement covers showcase, KV, and Stripe restore paths, and also removes identifying
greeting metadata from its link preview. A failed KV deletion leaves the tombstone in force;
re-running completes cleanup. Local tests can use `--origin http://127.0.0.1:PORT` with fixture
credentials and data. No maintenance action is invoked by the public application.
