# SkyGreeting takeover implementation

Base: `8f791222119297b226b32df3d8b4b09e048f4c64`, verified against production during the audit.
Working branch: `codex/engine-takeover`. Production branch: `ccr-09268299-owgtnw`.
This ledger describes local implementation, not a deployed release.

## Product decisions

New visitors see Galaxy on the night beach. Valid remembered settings and explicit greeting designs
win over the landing default. Classic is unchanged. Customize labels Deluxe in plain language,
including every current full Look and the prominent side-barge control. People can preview either
version before explicitly choosing what to send. A Free choice preserves the complete authored draft
so a comparison or canceled upgrade does not erase work.

Frozen Lake exposes Snowfall and Ice & water and hides beach-only controls in both Customize and
Advanced. Each place retains its own sky, weather, water, and landmark edits. The waterfall pours from
the front deck edge rather than appearing in midair.

The launch offer is $1.99 per Deluxe greeting for exactly 30 × 24 hours, then $4.99 automatically.
It is not active in this checkout. No subscription, and full previews remain free.

## Re-audit fixes

| Area | Fix and verification target |
| --- | --- |
| Design fidelity | v2 whitelist preserves palette, lake, trails, lifetime, lighting, physics and ground settings through link/payment/recovery. Settings imports validate before mutation and preserve control references. |
| Entitlements | Shared Free/Deluxe catalog governs UI and new server writes, including forged legacy payloads. Existing legacy reads keep historical eligibility and side barges. |
| Navigation | Shared parent stack, Escape/browser Back, scroll/focus restoration, checkout cancellation draft, immediate video cancellation and recipient-to-builder cleanup. |
| Particle ownership | Search beyond 48 blockers; per-slot ownership survives partial overwrite; shell end follows the actual last particle death. |
| Ground and smoke | Disabling a barge cancels its future sparks, smoke, lights and queued audio; smoke seeks available slots. |
| Audio and quality | Idle audio does not build a delayed queue; automatic quality keeps monitoring and re-arms for new settings/scenes. |
| Lake and camera | Context restoration regenerates procedural GPU data/reflections; walking and rebuilds preserve a valid beach camera baseline. |
| Video | Scene-clock completion includes long shows, particle tails and camera settling; discarded/failed jobs release resources and cannot reopen stale UI. |
| Pricing | One server offer updates config, HTML and JSON-LD; stale/missing checkout quotes return 409 before Stripe. The actual paid amount survives recovery. |
| Moderation | Atomic SQLite votes/rates, expiring reporter hashes and durable hidden/deleted status, including showcases and recovery paths. Greeting TTLs are not overwritten by moderation. |
| Lost links | Paginated Stripe search, paid-session metadata recovery, honest provider failure responses, and suppression of hidden/deleted links. |
| Analytics | Confirmed checkout transaction and paid amount only; deduplicate purchase; completion/share events reflect actual actions; remove private query/hash from referrers. |
| Test/deploy tooling | Windows-safe asset staging; LF generation and CRLF-tolerant page checks; actual rendered frames and mandatory nonempty measurements in resource checks. |

## Analytics baseline from the audit

The seven-day window ending October 9 at 09:52 ET reported 786 non-bot page views, 723 visits and
62% mobile traffic. Four successful checkout-session creations are **not** four purchases. Five
checkout 502/503 responses were all on October 3. There were no uncaught Worker exceptions among
8,366 invocations; 4,241 scanner 404s were observed. These counts do not establish a conversion rate.

## Validation

The integrated `npm run check` completed with **PASS** on October 9, 2026:

- Word filtering and all ten generated pages, 271 links and 48 example messages passed.
- Design/analytics contracts and all 18 Looks passed draft, Free/Deluxe, navigation and scene-memory checks.
- All 27 focused engine/audio/video regressions and 18 real workerd/SQLite Worker tests passed.
- Desktop, phone and recipient flows passed, including checkout cancellation, quote changes,
  quiet opening, reporting, fresh-greeting cleanup and delayed takedown.
- Twenty beach rebuilds and six lake rebuilds kept canvas, DOM, listener and GPU resource counts
  stable. Three beach/lake round trips also passed; listeners stayed at 1,151 and post-GC heap
  changed from 7.61 to 7.90 MB. The browser console was clean.
- Local Wrangler deployment dry-run passed; no production migration or deployment was performed.
- The waterfall screenshot confirms its emission line is attached to the barge at the waterline.
- After validation, process inspection found no remaining task test servers, automated browsers,
  or Worker runtimes; the final local test port was closed. The computer-use session was reset.

The local full log and screenshots are in `.check/` (ignored by Git). Local provider fixtures intercept
Stripe and email calls; test runs never send real greetings, emails, analytics events or payments.
The UI/resource checks use software WebGL, so their FPS is not a device-performance measurement.

Real payment settlement, email delivery, Android/iOS audio/recording, and physical-device GPU
performance still require release verification. A local recording state test cannot establish that a
phone's gallery imports a downloaded video correctly.

## Approved-release procedure

1. Review the branch and obtain the owner's **merge** instruction before updating the live branch.
2. Re-fetch the live branch, reconcile any new changes, and run `npm run check` alone.
3. Deploy the new Durable Object binding/migration with the code. Do not split those changes.
4. Set `DELUXE_LAUNCH_START_UTC` once to the approved release instant, as a strict UTC ISO timestamp.
   Preserve that value on subsequent deployments. Omission/invalid values leave $4.99 active.
5. Verify `/api/config`, the homepage, About, ideas pages, JSON-LD, and Stripe Checkout all show the
   same offer. Verify a stale $1.99 quote returns 409 at expiry and needs a new deliberate click.
6. Follow [worker/MAINTENANCE.md](worker/MAINTENANCE.md) to migrate old report tallies and to
   tombstone any deleted greeting before removing its KV content. Never delete paid KV alone.
7. Confirm production assets, receipt/recovery behavior, real mobile menu/recording/audio behavior,
   and the first actual paid transaction. The final release report should distinguish each check.

Provider reference checked during implementation: [Stripe checkout-session filters and pagination](https://docs.stripe.com/api/checkout/sessions/list).
