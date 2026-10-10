# SkyGreeting: master handoff

## Current takeover update — October 9, 2026

This update takes precedence over the older baseline below. The audited source and production
Worker matched `8f791222119297b226b32df3d8b4b09e048f4c64` on the live/default branch
`ccr-09268299-owgtnw` (there is no `main`). Implementation is on `codex/engine-takeover`.
**Merged and live since 2026-10-10T03:57:00Z** (with a cache fix and a frozen-lake island move on top, see
"State at handoff" below). Only update the live branch when the owner says **merge**.
The implementation ledger and release procedure are in [TAKEOVER-IMPLEMENTATION.md](TAKEOVER-IMPLEMENTATION.md).

- First-time visitors start on **Galaxy, night beach**. Existing valid saved settings and explicit
  greeting designs take precedence. Classic retains its original appearance.
- Full Looks are free to preview. Sending requires an explicit Free or Deluxe choice; comparison
  previews never choose a payment tier. Every current Look discloses its Deluxe contents before selection.
- Side-barge fountains are prominent and **Deluxe for newly authored greetings on both places**.
  Existing published legacy greetings retain their historical appearance. Free uses the center barge.
- Frozen Lake shows Snowfall and Ice & water; beach-only controls are absent. Each place remembers
  its own scene edits. The waterfall now originates at the barge deck instead of an invisible elevated line.
- `catalog.js` owns shared entitlements; `design.js` owns the bounded v2 design envelope. New share,
  checkout, restore, and replay use the same snapshot, including custom colours and lake settings.
  Legacy compact links remain readable. `navigation.js` owns the panel stack, Back/Escape, focus, and scroll.
- `worker/pricing.js` owns the regular **$4.99** and launch **$1.99** offer. The launch clock is exactly
  30 days from a single configured `DELUXE_LAUNCH_START_UTC`; it is deliberately inactive until approved
  release configuration. Checkout must match `expectedPriceCents`; a changed quote requires another click.
- SQLite Durable Objects (`GUARDS`) own atomic rate/report decisions and moderation tombstones.
  KV still stores greeting content. Deploying this branch introduces the `greeting-guards-v1` migration.
  Tombstones must be written before content deletion so Stripe recovery cannot resurrect it.
- Purchase analytics requires a confirmed paid record, actual amount, and the opaque transaction matching
  the current tab's checkout. Free returns and repeat visits cannot fabricate purchases.
- Video completion follows the actual scene/cue/particle tail, including New Year's longer show.
  Cancel works immediately and discards the recording; Done returns to the originating panel.
- `npm run check` now includes design, UI-state, engine, audio, video, Worker, desktop/phone flow,
  and resource-rebuild checks. Use Node 24; on Windows set `PYTHON` to a working Python executable
  if the `python3` Store alias is unavailable. Run the full command alone before committing.
- The integrated check passed October 9, including desktop/phone/recipient flows, 27 focused
  engine/audio/video regressions, 18 Worker tests, 20 beach rebuilds, six lake rebuilds and three
  place round trips. Local Wrangler dry-run passed. Real payments, email delivery and physical-device
  audio/video/GPU behavior still need release verification; see the implementation ledger.

The owner explicitly excluded livestream/YouTube/TikTok work from this takeover.

The one document to read before changing anything, for any coding agent (Codex, Sol, Astra, Claude or a person). Written October 10, 2026 at the end of a long Claude Code session. It covers what the product is, how the code is built, how to change it safely, how to ship, what's live and what isn't, recipes for the usual changes, the owner's verdicts so far, and what's still open.

The older documents are still useful for detail: **`SESSION-HANDOFF.md`** (a dated log of every feature and gotcha, newest decisions included) and **`HANDOFF.md`** (the original spec, the no-leak rules and a long per-feature Status section, parts of it stale). Where they disagree with this file, this file wins.

---

## 1. The product

**SkyGreeting** (https://skygreeting.com) is a real-time, browser-rendered fireworks show (three.js) over a beach at dusk or a frozen mountain lake at midnight. People design a show, put words in the sky, and send it as a link. It plays live in the recipient's browser on a phone, laptop or TV.

- **Free:** make, preview and send a greeting with the free effects. Its ending runs about 17 s.
- **Deluxe, $4.99 once per greeting (Stripe Checkout):** a grand finale (about 48 s in all, New Year 67 s) with a camera move, every effect including the Showpieces, a gift-wrapped opening for the recipient, the sender's name signed in the sky, both initials in a heart, a private link that never expires and a video without the watermark. No accounts, no subscription.
- **Occasions:** Halloween, Birthday, Love you, Congrats, New Year (on the frozen lake with a countdown clock), Thank you.
- **Other surfaces:** `/autoshow` (an endless self-designing show for a TV), ten SEO "ideas" pages (`/ideas` and nine others), About/pricing, Terms, Privacy, `/find` (re-send lost Deluxe links by email), a client "hero header" demo mode (`#hero`) and embeds.

The owner is not a developer. They test on an Android phone, on the live site.

---

## 2. Repository, branches and deploying

- GitHub repo: **`rowdybard/Techdemo`**.
- **Live branch: `ccr-09268299-owgtnw`.** Cloudflare's Git build deploys it about 30 seconds after a push (the `techdemo` Worker, which serves skygreeting.com). There is no other environment.
- **Work branch:** the last session worked on `claude/adoring-mccarthy-x0gdmh` and fast-forwarded the live branch to it when the owner said "merge". A new agent should work on its own branch (or the branch it's given) and only update the live branch when the owner asks.
- **Don't open pull requests** unless the owner asks. Merging is a fast-forward push:
  ```sh
  git fetch origin ccr-09268299-owgtnw
  git merge-base --is-ancestor origin/ccr-09268299-owgtnw HEAD && git push origin HEAD:ccr-09268299-owgtnw
  ```
  Then confirm it's live by fetching a changed file from the site, e.g. `curl -s "https://skygreeting.com/src/studio.js?v=$RANDOM" | grep <something new>`. Pages and `src/` files are revalidated on every visit (Cloudflare's default; `_headers` has no `src/*` rule on purpose), so a reload shows the new version. Files cached under the old five-minute rule can linger up to 5 minutes once.
- **What deploys:** `wrangler.jsonc`'s build command (`node tools/deploy-stage.mjs`) copies every top-level `*.html`, `robots.txt`, `sitemap.xml`, the favicons, `site.webmanifest`, `icons/`, `_headers`, `src/` and `vendor/` into `.deploy/`, which becomes the static assets. **A new top-level file that isn't a page, or a new top-level folder, must be added to that command** or it won't go live. `worker/index.js` runs first for `/api/*`, `/`, `/autoshow` and the pages (it fills in the current price).
- **Secrets** live only in the Cloudflare dashboard (Workers → techdemo → Settings → Variables and Secrets): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY` (not set yet: `/api/config` reports `"email": false`). **Never** put `sk_` or `whsec_` keys in chat, files or commits, and never ask the owner to paste a secret. Prices live in `worker/pricing.js` ($4.99; the launch offer $1.99). The launch offer runs 30 days from `DELUXE_LAUNCH_START_UTC` in `wrangler.jsonc` (`2026-10-10T03:57:00Z`, so it ends `2026-11-09T03:57:00Z` by itself); never change or reset that start.
- **Storage:** Cloudflare KV `GREETINGS` (paid greetings `g:<id>`, free short links, reports `r:`, take-downs `h:`). Each paid greeting is also copied into its Stripe PaymentIntent metadata, and `/api/greeting` rebuilds a missing record from Stripe. Marketing "showcase" greetings are Deluxe records in code (`worker/showcase.js`). Rate limits, report votes and take-down status live in SQLite Durable Objects (`GUARDS`, class `GreetingGuard` in `worker/guard.js`), which are free on Cloudflare's Workers Free plan (100,000 requests and 100,000 row writes a day).

### State at handoff (October 10, 2026)

- **Merged on October 10 at 2026-10-10T03:57:00Z:** Astra/Codex's `codex/engine-takeover` (see the update at the top), plus two fixes on top: `_headers` no longer caches `src/` for five minutes (a phone paired the new page's round icons with the old "Lock view" text and no sound button), and the frozen lake's near right island moved from 64, -158 to 84, -104 because its pines hid the right side barge. The $1.99 launch offer started at the merge.
- **Before that** (`2a781a7`): everything, including the Deluxe upgrades, the Showpieces and waterfall, free strobes/double breaks/mines/fans, the new crackle, the glow fixes, **no more whistles** (launches thump, whirlwinds whirr), the **interface rework** (Looks-first Customize with 18 looks and eight new palettes, More options folded away, sound and lock icons on screen, the builder's "+ Add a second line"), **Save video's 5-second minimum** with "Record again", and this document plus `AGENTS.md`.
- **Merged and live later on October 10** (the owner's second "merge" that day): the preview bar's buttons on one line, with a gold "Use Deluxe" that lights up ("✓ Deluxe chosen") and stays lit above checkout, and previewing the already-chosen version no longer greys checkout out; **Save video only on the Free preview** (a Deluxe preview recording was the paid show for free); the lake's **village windows filtered** so they stop flashing under bloom as the view turns, and its **reeds removed** (they read as dune grass); a **performance pass** (the spark pool packs live sparks low and draws only up to the last one, which halved a quiet phone frame; the ice's big cracks are baked once into a distance-field texture); **smoke from every burst along its own stars** (see §7); **Looks shown as free to send**, with "✦ best with Deluxe" only on looks that are half or more paid shells; Words in the sky first in Customize and the price said once above the grid, and a Free version that swaps each paid shell for its nearest free one (`FREE_STAND_IN` in `catalog.js`); and the check's startup baseline now waits for counts to settle.
- See §10 for what was and wasn't verified.
- **Not done at release:** the optional legacy-tally sweep in `worker/MAINTENANCE.md` (it needs a `MAINTENANCE_TOKEN` secret the owner would set in the dashboard; old report tallies are imported anyway whenever a greeting is opened).

---

## 3. Architecture

- **No build step.** Plain ES modules and an import map in `index.html`. three.js 0.186.1 and lil-gui 0.21.0 are copied into `vendor/three-0.186.1/` and `vendor/lil-gui-0.21.0/` (**hyphen, never `@`**: Cloudflare rewrites `@` in paths and once broke the import map). Upgrading a library means copying the new version's files in and changing the paths. The owner chose this; don't add a bundler.
- **Everything is procedural.** No textures, models, fonts or audio files are downloaded. Sounds are synthesised, scenery is shaders and generated meshes, words are sampled from a canvas.
- **Module contract.** Every scene module in `src/` exports `create(ctx)` returning `{ update(dt, time), dispose() }`. The update order is `MODULES` in `src/main.js`:
  `wind, sky, burstlights, countdown, environment, fireworks, fountains, smoke, snow, audio, post, debug, ui, director, crane, video, builder, studio, viewlock, soundbutton, gift, autoshow`.
  Helper files (`presets.js`, `look.js`, `occasions.js`, `shells.js`, `bursts.js`, `premium.js`, `studio-kit.js`, …) export plain functions/data.
- **`ctx`** is the shared object: `renderer, scene, camera, controls, config, container, signal (AbortSignal of this build), phone, stats, link`, plus what modules publish (`ctx.fireworks`, `ctx.fountains`, `ctx.director`, `ctx.builder`, `ctx.studio`, `ctx.video`, `ctx.countdown`, `ctx.burstLights`, `ctx.sky`, `ctx.mirror`, `ctx.place`, `ctx.beam`, `ctx.render`, `ctx.setCameraPreset`, …). Event listeners take `{ signal }` so a rebuild removes them.
- **No allocation in the render loop**, no leaks across rebuilds (Shift+R destroys and rebuilds the whole app; `npm run check` does it 20 times and compares counts). Panel toggles change uniforms, not shader defines. The one sanctioned exception: `audio.js` makes a few nodes per sound (capped voices), and the AudioContext is created once per page and never closed.
- **Files stay under about 400 lines.** Split before they grow. Currently over: `builder.js` (~456) and `audio.js` (~455); candidates to split next (§9).
- **`config.js`** holds every tunable in one plain object (units: metres, seconds, degrees). Customize and the panel change it live; modules read it every frame.

### File map (src/)

| Area | Files |
|---|---|
| Boot, loop, camera | `main.js` (module list, render loop, resize, Shift+R), `walk.js` (WASD walking), `viewlock.js` (🔓/🔒 icon), `crane.js` (Deluxe camera move) |
| Settings | `config.js`, `presets.js` (presets, remembered settings, `applyPreset`, `takeScene/putScene`), `looks.js` (the 18 Looks shown in Customize), `places.js` (beach / lake data) |
| Scenery: beach | `environment.js` (hosts the current place's pieces, swaps them live), `beach.js`, `ocean.js` + `ocean.glsl.js` + `surf.glsl.js`, `landmarks.js` (pier, grass), `lighthouse.js` + `.glsl.js`, `terrain.glsl.js` |
| Scenery: lake | `lake.glsl.js` (shape + JS `landHeight`), `land.js`, `pines.js`, `village.js`, `reeds.js`, `lake.js` + `ice.glsl.js` (ice and open water, baked masks), `mirror.js` (cube-map reflections) |
| Sky, light, weather | `sky.js`, `burstlights.js` (fireworks light the scene), `wind.js`, `smoke.js` + `.glsl.js`, `snow.js`, `glsl.js` (shared noise) |
| Fireworks | `fireworks.js` (scheduler, barges, tap to launch, `sample()`), `particles.js` (the GPU pool: claim/cut runs), `fireworks.glsl.js` (all spark motion and looks, `KIND`s), `shells.js` (plan and fire a shell), `bursts.js` (classic bursts), `shapes.js` (heart, star, text, initials), `halloween.js`, `premium.js` (Showpieces) |
| Ground shows | `fountains.js` (scheduling, one show per barge, side barges), `ground.js` (shooters, candles, mines, fans, waterfall), `haunt.js` (Halloween ground effects) |
| Endings, occasions | `occasions.js` (occasions, cues, `grandFinale()`, paid/free sets), `director.js` (plays cues, `endingLength()`), `countdown.js` + `clock.glsl.js` (New Year clock) |
| Greetings | `builder.js` (the send sheet), `plans.js` (Free/Deluxe cards and preview switch), `gift.js` (recipient view, gift wrap), `link.js` (reading links), `look.js` (design ⇄ link, `keepFree`), `moderate.js` (word filter, ROT13 lists) |
| UI | `studio.js` (Customize), `studio-more.js` (More options), `studio-kit.js` (controls), `studio.css`, `ui.js` (lil-gui "Advanced settings"), `debug.js` (overlay, backquote key), `soundbutton.js`, `hero.js` |
| Sound | `audio.js` (engine, booms, ground sounds, clock, sea), `sfx.js` (crackle swarm, whirr), `noise.js` (noise buffers made in idle time) |
| Other | `video.js` (Save as video), `autoshow.js`, `post.js` (bloom, quality tiers, auto quality), `track.js` (GA4 events), `pages.css` (ideas pages), `og/` (link-preview pictures) |

Server: `worker/index.js` (routes: `/api/config`, `/api/checkout`, `/api/share`, `/api/stripe-webhook`, `/api/greeting`, `/api/report`, `/api/taken-down`, `/api/resend`, and `/` with `?g=`/`?msg=` for link previews), `worker/resend.js` (emails), `worker/showcase.js`.

---

## 4. How things work (the parts people change most)

### Fireworks
- One instanced particle pool (60,000 sparks, 20,000 on phones), one draw call. Launching a shell writes its whole life at once (rocket, shed sparks, burst, later events) with future birth times; the vertex shader computes every position in closed form. Nothing is simulated on the CPU.
- **Spark kinds** (`KIND` in `fireworks.glsl.js`): `spark 0, glitter 1, strobe 2, comet 3 (the rising shell only), pop 4 (crackle), swim 5 (fish wriggle), whirl 6 (circles its path), flutter 7 (leaf sway and glint)`. Kinds ≥ 5 add a closed-form wobble in `positionAt()`. The fragment shader branches by kind with explicit ranges; **a new kind needs its own branch** in both.
- Brightness lessons: ACES tone mapping whitens bright colours. Colours are deepened before the brightness multiply; bursts ramp in over 0.45 s; long trails hold at 40% until they leave the break point; ground-show sparks are capped (`uGroundBrightness`, flag in `aColor.w`). Near-white sparks bloom into halos: keep silver/white dim (premium.js uses `[0.6, 0.6, 0.66]`).
- **Shell types (26 that people can pick):** classic `peony chrysanthemum willow palm ring crossette strobe crackle multibreak`; shapes `heart star text`; Halloween `pumpkin skull bat ghost web brew eyes wisp`; Showpieces `kamuro (gold crown) dahlia (colour-changing) saturn fish whirl leaves`. Plus `initials` (Deluxe keepsake heart, never random).
- **Ground effects (10):** `fountains shooters candles mines fans waterfall` and Halloween `cauldron wisps lightning lanterns`. One show per barge at a time (`pool.cut`); side barges follow the main barge's style except the waterfall (they play fountains beside it).

### Free vs Deluxe (`paidItems` in `occasions.js`)
- An effect is **free** if any occasion lists it in `free`; **paid** if it's in some occasion's `deluxe` and no occasion's `free`; an occasion's own `deluxe` list also makes an item paid in that occasion. **A new effect must go in at least one occasion's `deluxe` list or it counts as free everywhere.**
- Free now: peony, ring, star, heart, willow, crossette, palm, strobe, double break (multibreak), fountains, shooters, candles, mines, fans, pumpkin, ghost, lanterns (Birthday keeps crossettes paid, Love rings, Thank you candles). Paid: the six Showpieces, waterfall, chrysanthemum, crackle, the other Halloween shells and ground effects.
- A free send (or a free link opening) is stripped of paid effects by `keepFree()` in `look.js`. The default home-page show deliberately plays a few paid effects (to show them off); `builder.js` (`baseUse`) doesn't count those against a free send unless the person switched them on.

### Endings (`occasions.js`, played by `director.js`)
Cue forms: `{ at, shell, x, h }` launch at `at` s; `{ zero, … }` burst exactly `zero` s after the countdown's zero (with no clock, after the ending's start; shells go up `LEAD` = 6.3 s early); `{ at, ground, layer? }` (a ground effect stops the previous one unless `layer: true`); `{ at, text: 'message'|'message2'|'to'|'year'|'from', palette? }`; `{ at, countdown: 10 }`; `{ at, crane: seconds }`; `{ at, keepsake: true, h }`; `deluxe: true` on any cue plays it only in Deluxe; paid items in free cues are swapped via the occasion's `fallback`. `grandFinale(from, shells, ground, last, lastPalette)` builds each Deluxe finale. `endingLength(occasion, deluxe)` gives the lengths the builder shows.

### Customize (after the rework)
Looks (cards from `looks.js` → `PRESETS` in `presets.js`), Place (Beach / Frozen lake: a place's own sky and snow come with it), Colours (palettes in `config.palettes`, listed in `studio.js` `PALETTES`), Feel (Pace, Size, Sparkle), Words in the sky, then folded More options (`studio-more.js`: fireworks chips with ✦ for paid, ground show, sky/wind/smoke/snow, side barges/pier/grass, lighthouse, camera views, Start over, Advanced settings). Picking a look fires a quick sample (`fireworks.sample()`) and starts its ground show so the change is visible at once. On the lake a look keeps the lake's sky. Settings are remembered per visitor (`remember()` in `presets.js`); `UPGRADES` migrates old remembered defaults.

### The send flow
"Send a show" opens the builder: occasion chips, message (+ optional second line), their name, from, Customize, Free/Deluxe cards, Preview (with a Free · 17 s | ✦ Deluxe · 48 s switch on the preview bar), Send. Free sends get a short `?g=` link (or a long `?o=&msg=…` link offline). Deluxe goes to Stripe Checkout; the buyer returns to `?g=<8 chars>&sent=1` and gets their link. A Deluxe link opens on a gold gift-wrap ("Tap to open", sound on). Recipients get "Watch again", "Make one for someone else", Save as video (watermarked unless Deluxe), Report.

### Sound (`audio.js`, `sfx.js`, `noise.js`)
Booms (thump + rumble + crack, delayed by distance at 343 m/s, panned, duller with distance), a shared procedural echo off the water, crackle as a wide swarm of sharp pops, hisses for willows/kamuro/fish/leaves, a toneless whirr for whirlwinds, ground-effect sounds, the countdown's ticks, midnight boom and bell, the sea (a faint wind on the lake). Sound starts only after a tap (browser rule); it's off by default (volume 0) until the 🔊 button or a gift's "Tap to open". **Owner's verdicts:** booms and echo good; crackle OK; **rising whistles: removed after two failed attempts. Don't bring a pitched whistle back without a recorded sample to judge it by.**

---

## 5. Testing and verifying

- **`npm install` once, then `npm run check` before every commit**, and run it **alone** (another headless browser at the same time slows the scene to 0 fps and breaks timing). It runs: the word-filter test, the ideas-pages test, then a headless Chromium scene check: desktop and phone sizes, fails on any console warning/error, prints `renderer.info` counts (beach about 26 calls / 12 geometries / 16 programs; lake 30 / 16 / 20), 20 Shift+R rebuilds (leak check), the lake with 6 rebuilds, and Beach ↔ Frozen lake switched three times through Customize. About 8–25 minutes depending on the machine. It also fails if a module isn't `modulepreload`ed in `index.html`: **add a `<link rel="modulepreload">` for every new `src/*.js`.**
- **Software WebGL only** in the cloud container: real frame rates can't be measured, and scene time runs at about a fifth of real time. For visual checks, drive the page with Playwright: inject `window.__ctx` by rewriting `src/main.js` on the fly (`page.route('**/src/main.js', …)`, replace `resize();\n  resizeObserver.observe(container);` with `window.__ctx = ctx;` + the same), read scene time from `ctx.fireworks.pool.mesh.material.uniforms.uTime.value`, raise `config.loop.maxDt` to go faster, and freeze a frame with `config.loop.timeScale = 0` before screenshotting. Launch a specific shell with `ctx.fireworks.launchAt(type, x, height, burstAt)`, a ground effect with `ctx.fountains.play(style)`, an ending with `ctx.director.play(OCCASIONS[name], words, deluxe)`.
- **Sound can't be heard in the container.** The last session rendered clips offline: in the page, build an `OfflineAudioContext`, recreate the buffers from `noise.js` (`noiseNow()`), call the `sfx.js` recipes, encode WAV, and inspect a spectrogram (numpy is available) or send the WAV to the owner to listen.
- Recorded video can't be decoded headlessly (reads black): Save as video is only proven to produce a file.
- **Always check the live site after a merge** (a path or infrastructure change once worked locally and 404'd live).
- **Claude-only preview:** `python3 tools/make-preview.py` writes `.preview/index.html` for the claude.ai artifact https://claude.ai/artifact/8ZMbARoMcnBrAmYGb5tQ1j (version 60 at handoff). Other agents can ignore it.
- Pages: `python3 tools/make-ideas.py` regenerates the ideas pages from `tools/ideas/*.html` (edit those, not the root copies); `node tools/make-og.mjs` renders link-preview pictures.

---

## 6. Recipes

**Add a sky shell type** (example: `comet`)
1. Write the burst function (in `premium.js` for a showpiece, or a new file if it's a family) and add it to that file's export map, which `bursts.js` spreads into `BURST_TYPES`.
2. If it needs new motion, add a `KIND` and its branches in `fireworks.glsl.js` (vertex wobble + fragment look).
3. Register it everywhere a type is named: `config.look.mix` (weight, 0 to hide by default), `TYPES` in `presets.js`, `LABELS` in `occasions.js`, `SHELLS` in `studio-more.js`, `TYPE_LABELS` in `ui.js`, `CLASSIC` in `autoshow.js`, `audio.js` sets (`SHAPES`/`HISSERS` or its own sound), `STARS` (and `HANGING`) in `smoke.js`.
4. Decide free or paid: put it in at least one occasion's `free` or `deluxe` list (see §4), and in the Deluxe finales if it's a showpiece.
5. Update the idea pages' "Free, or Deluxe" sentences in `tools/ideas/` if they list effects, regenerate, run the check, and render it on both the beach and the lake.

**Add a ground effect:** export it from `ground.js` (or `haunt.js`) with the signature `(pool, config, phone, start, tubes, y, z, palette, lights)`, lighting each tube's record with `light()`; add it to `EFFECTS` (and `STYLES` if it belongs in "A bit of everything") in `fountains.js`, `MIXES.mixed` in `look.js`, `GROUND` and `LABELS` in `occasions.js`, `GROUND` in `studio-more.js`, the panel's list in `ui.js`, `GROUND` in `autoshow.js`, and an occasion's lists. Keep its lights as dim as a fountain's (a whole barge of them lights the shore).

**Add a Look:** add the preset to `PRESETS` in `presets.js` (start from defaults; set `look`, `show`, `fountains`, `sky`, `smoke`, `physics`, `bloom` as needed; use `mixOf`), then an entry in `looks.js` (`preset`, `icon`, `label`, `line`). Make it a different *show*, not a recolour, and keep some free shells in it so a free send still looks like it.

**Add a palette:** `config.palettes` (linear RGB, keep near-whites ≤ 0.95), `PALETTES` in `studio.js`, the panel's palette list in `ui.js`, `PALETTES` in `autoshow.js`.

**Add an occasion:** an entry in `OCCASIONS` (`occasions.js`): `label, preset, message, free, deluxe, fallback, ending` (free cues plus a `grandFinale(...)`, a `{ text: 'from' }` signature and a `{ keepsake: true }`). The builder's chips list it automatically. Add an ideas page (`tools/ideas/<slug>.html`, `ORDER` in `make-ideas.py`, `sitemap.xml`) and a picture `src/og/<occasion>.jpg` (the worker uses it for link previews). Seasonal pages need to go up two to three months early to rank (Valentine's by December, July 4th by March).

**Add a place:** data in `places.js` (views, camera presets, moon, an optional `look` preset for its sky and snow), pieces built by `environment.js` (each piece is a module-shaped `create(ctx)`), and make the check's place switch cover it.

**Change the price:** `DELUXE_PRICE_CENTS` in `wrangler.jsonc` (the builder reads `/api/config`), plus every page that states $4.99 (`tools/pages-test.mjs` checks pages quote the product's price).

---

## 7. Gotchas (the expensive ones)

- **Privacy:** Google Analytics must never see greeting words, names or private ids. The worker rewrites a greeting's `<title>`; `index.html` overrides GA's `page_title` for greetings. Anything that puts words in a title, URL or event needs the same care.
- **Moderation lists are ROT13'd** in `src/moderate.js` (the worker imports the same file). Don't paste slurs into chat, tests or commits; decode at runtime and print counts only.
- **Never `@` in a served path** (see §3). Check the live site after path changes.
- **The first tap starts audio and must stay cheap** (Cloudflare INP): buffers are made in idle time after `scene-ready`; the tap only creates/resumes the AudioContext. Creating it before a tap logs a console warning, which fails the check.
- **Sharing consumes the tap:** a download after a failed `navigator.share` is silently dropped by phone browsers.
- **Remembered settings linger:** Customize saves each visitor's design; an old default can survive on a device (Start over resets; `UPGRADES` migrates known ones).
- **Anything driven by total running time (`uTime`) in fragment maths breaks on some phone GPUs after a long session.** Use a spark's own age. Keep randomised settings inside the panel's ranges (glitter > 1 flashed black).
- **High things reflect at the camera's feet** on the lake: the open water is a bay in front of the viewer for that reason.
- **GLSL:** no `fwidth` in vertex shaders; `patch` is reserved. `glsl.js` splits vertex-safe noise from fragment-only foam.
- **Stripe:** a publishable key in the secret slot gives "publishable API key" errors; the owner's BetBlocker VPN once blocked checkout.stripe.com. **Don't suggest turning BetBlocker off.**
- **Headless counts include the lake's cube capture** the frame it happens; the check waits for counts (and real frames) to settle. Auto quality also steps down in the first seconds and the texture count dips mid-switch, so the rebuild baseline is read only once the counts (textures included) hold still.
- **The spark pool draws only `instanceCount = high`** (one past the highest slot alive or waiting to be born): claims take the lowest free run, `set()` raises `high`, and `pool.trim(time)` (called by fireworks.js each frame) lowers it. Every slot costs vertex work even when empty, so don't go back to drawing the whole pool.
- **Smoke reads a burst's stars back from the pool:** `fireShell` calls `pool.noteSpans(record)` around `burst()`, so each burst record's `spans`/`spanCount` say where its runs went, and `smoke.js` follows a sample of those stars (`starSmoke`). A burst record without spans (tests, odd callers) falls back to the old synthetic rays. When the smoke ring is full, the most faded puff gives way, so every burst smokes.
- **Adding a shell type** means adding it to every list: `catalog.js` (FREE_SHELLS or DELUXE_SHELLS, and `FREE_STAND_IN` if paid), `presets.js` TYPES, `config.js` default mix, `bursts.js` BURST_TYPES (via its module's export), `occasions.js` LABELS, `ui.js` names, `studio-more.js` chips, `audio-recipes.js` SHAPES for drawings, `autoshow.js`, and a `modulepreload` for a new file. `emblems.js` (the Spartan helmet) is the newest example.
- **Sky words have two lines** (`look.text`, `look.text2`). Only the show's random text shells alternate; anything that sets `look.text` for a greeting must clear `look.text2` (link.js, gift.js, autoshow.js do).
- **Shell weights run 0..5** everywhere (the server rejects more); `freeDesign`'s stand-ins add weights and cap at 5.

---

## 8. The owner, and how to work with them

- Not a developer. Wants **plain language, short answers**: what's done, what they need to do, and plainly what couldn't be verified. No jargon walls.
- Wants work to **flow without stopping for approval** between steps, and visuals that are **pretty and realistic**. Judges everything on their Android phone on the live site; sends screenshots.
- Says **"merge"** (or "merge when done") to put work live. Don't merge without it.
- Is open that the site is built with AI tools (About has a "How it's made" line). Don't hide it, don't headline it, don't call the work hand-coded.
- Never ask them to paste secrets. Use their email only to identify them. Don't suggest turning off BetBlocker.
- Decisions and verdicts so far (October 2026):
  - Fireworks: liked the palm's spark trail and the crossette's sparks; disliked white blow-outs, glowing blobs, "glowy fireballs", overlapping ground shows, glow everywhere (all fixed).
  - Lake performance on their phone had to improve (terrain moved off the GPU).
  - Deluxe had to feel special (grand finale, preview switch, gift wrap, signature, initials heart, cooler showpieces); lesser paid effects were made free.
  - Sound: booms and echo good, crackle OK, whistles removed.
  - UI: "too many options", wanted more and more different presets → the Looks-first rework.
  - Save video must not offer a download for a clip too short to save.

---

## 9. Open items and ideas (rough priority)

1. **Get the owner's verdict** on the new Customize, the sound button, the Looks and the whirr, on their phone (all live since October 10).
2. **Real-phone checks nobody here could do:** frame rate on the frozen lake and with the Showpieces and waterfall; the gift-wrap flow and sound on iOS and Android; Save as video on iOS.
3. **Split the two files over 400 lines:** `builder.js` (move the share/checkout half out) and `audio.js` (move the ground and clock recipes into `sfx.js`).
4. **Looks and free sends:** some looks lean on paid showpieces (Under the sea's fish, Galaxy's Saturns), so a free send of them is plainer. Consider a small "✦ uses Deluxe effects" note on those cards, or lean them more on free shells.
5. Customize always shows the "✦ marks Deluxe effects…" note; it could hide until a paid effect is involved.
6. Seasonal: Christmas occasion; Valentine's and July 4th ideas pages (publish months ahead).
7. `RESEND_API_KEY` isn't set, so `/find` can't email lost links (owner: sign up at Resend, verify the domain, add the key in Cloudflare).
8. A native speaker should review the French and Spanish moderation lists before those languages are promoted.
9. Refunds are manual in Stripe and don't switch a greeting off; no KV backup export (Stripe holds a copy of each paid greeting).
10. Maybe: Lock view on by default for phones; a gentler first-visit hint; tidy the stale parts of `HANDOFF.md`'s Status section.

---

## 10. What the last session verified, and what it didn't

- Verified headlessly: every new shell, the waterfall and the Looks render as intended on both places; free sends drop paid effects for all six occasions; the Free/Deluxe switch and cards, gift wrap, signature and initials heart work end to end with a stubbed server; the new Customize, sound button and builder link work on a phone-sized screen; `npm run check` passed for every merged batch.
- Not verified: anything on a real device, anything audible (sound was checked by spectrogram only), Stripe's checkout page showing the new product description, and recorded video content.
