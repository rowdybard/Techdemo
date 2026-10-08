# SkyGreeting: session handoff

Where things stand as of **October 5, 2026**, for whoever picks this up next (a person or another AI session). `HANDOFF.md` is the long spec and per-feature reference (read its Status section for how each part works); this file is the short version: what's live, how to work on it, what's still open, and what went wrong before.

## What it is

**SkyGreeting** (https://skygreeting.com) is a real-time three.js beach-at-dusk fireworks show that became a paid product. People design a show, write words that fireworks spell in the sky, and send it as a link. It plays live in the recipient's browser. The repository started as a sales demo ("Beach Fireworks") and was first built in Codex, then continued in Claude Code from `HANDOFF.md`.

- Free: make, preview and send with the free effects. Deluxe: **$4.99**, one time, unlocks every effect, a private non-expiring link and a video without the watermark. No accounts, no subscription.
- Repo: `rowdybard/Techdemo`. All work is on branch **`ccr-09268299-owgtnw`**. No pull request has been opened (don't open one unless asked). Pushes to this branch go live on skygreeting.com within about 30 seconds.

## How it's built

- **No build step.** Plain ES modules and an import map. three.js 0.186.1 and lil-gui 0.21.0 are copied into `vendor/` (folders named `three-0.186.1`, **hyphen not `@`**: see Gotchas) and served from the site.
- Every module in `src/` exports `create(ctx)` returning `{ update(dt, time), dispose() }`. Update order is `MODULES` in `src/main.js`. Nothing allocates in the render loop. Files stay under about 400 lines.
- Everything is procedural: no textures, models or fonts at runtime.
- **Server:** one Cloudflare Worker (`worker/index.js`, name `techdemo`), static files as assets. Routes: `/api/config`, `/api/checkout`, `/api/share` (free greetings get a short `?g=` link), `/api/stripe-webhook`, `/api/greeting`, `/api/report`, `/api/taken-down`, and `/` when it has `?g=` or `?msg=` (link previews; greeting pages are `noindex`).
- **Showcase greetings** for marketing are Deluxe records kept in code (`worker/showcase.js`), not KV.
- **Storage:** KV namespace `GREETINGS` (id in `wrangler.jsonc`). Paid greetings (`g:<id>`), reports (`r:`), take-downs (`h:`). Each paid greeting is also copied into its Stripe PaymentIntent metadata, and `/api/greeting` rebuilds a missing record from Stripe.
- **Payments:** Stripe Checkout through the REST API. Webhook signature checked with WebCrypto.
- **Config:** `wrangler.jsonc` (price `DELUXE_PRICE_CENTS` = 499, `keep_vars` true). The build command copies `index.html about.html terms.html privacy.html robots.txt sitemap.xml favicon.* site.webmanifest icons _headers src vendor` into `.deploy/`. **A new top-level file or folder that must go live has to be added to that command.**
- **Secrets** live only in the Cloudflare dashboard (Workers → techdemo → Settings → Variables and Secrets): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `RESEND_API_KEY` (emails lost links from /find; not set as of October 7, 2026). Never put `sk_` or `whsec_` keys in chat, files or commits. (A `pk_` publishable key is public.) `GET /api/config` reports whether each is present, never the value.
- **Analytics:** Google Analytics 4, tag `G-BTBT8MCNPJ` (inline in `index.html`). Events from `src/track.js`: `share`, `begin_checkout`, `purchase`, `save_video`. Never sends greeting words, names or the private id.

## Working here

- `npm run check` (needs `npm install` once for Playwright): loads the page headless on desktop and phone sizes, fails on any console warning or error, prints `renderer.info` counts, and runs 20 Shift+R rebuilds to catch leaks. Latest: clean, 26 draw calls, 12 geometries, 16 programs, no leaks. **Run it before every commit.** It also fails if a module isn't preloaded in `index.html` or a preloaded file is missing.
- Local server: `python3 -m http.server` (or `npx serve .`). `/api/*` won't exist locally; tests stub it.
- **Preview artifact** (claude.ai can't open localhost): `python3 tools/make-preview.py` writes `.preview/index.html` and prints the supporting-files map; publish both with the Artifact tool to https://claude.ai/artifact/8ZMbARoMcnBrAmYGb5tQ1j (currently Version 37). The preview loads three.js from jsDelivr and has no Analytics, by necessity.
- A change is done when: checked, committed, pushed, docs updated (`HANDOFF.md` Status), preview republished.
- Rendering is only verifiable here with software WebGL (slow, no real frame rates). Visual checks are screenshots from headless Chromium via Playwright.

## What was built (high level)

Beach scene (ocean with breaking surf, wet sand, twilight sky, wind), fireworks on a GPU particle pool, 12 classic shells plus 8 Halloween shells and 4 Halloween ground effects, a main barge and two side barges (ground shows, always in the main barge's style), smoke lit by firework light and by the lighthouse beam, Lake Michigan pier and lighthouse with adjustable light, synthesised audio, Customize drawer, greeting builder and occasion endings (birthday, love, congrats, thanks, Halloween), moderation of words, report button and take-downs, Save as video, link previews, terms, privacy and About pages, load screen, parallel shader compile, GA4 and search basics, icons.

**What's paid** (`paidItems` in `src/occasions.js`): one set for every occasion. Free: peony, ring, star, heart, willow, crossette, palm, fountains, shooters, candles (Thank you makes candles paid), and Halloween's pumpkin, ghost, lanterns. Paid: chrysanthemum, strobe, crackle, double breaks, mines, fans, and the other Halloween shells and ground shows. Free links are stripped to free effects when opened (`keepFree`); a paid link only exists as a paid record on the server.

## Open items

**Owner's list: all done (October 5, 2026).** Stripe verified with bank, receipts, descriptor and a test purchase; hello@ email routing; www redirect; Google Analytics settings; Search Console; checkout rate limit. Real-device checks: Save as video produces an MP4 on the owner's Android phone. Still worth watching: frame rate with the lighthouse beam and side barges on a phone and on the old Revvl tablet, and how Google Search Console reports indexing over the next weeks.

**Possible next work:**
- Fountain glow was toned down on October 7 (silver about a quarter, the ground cap `GROUND_BRIGHTNESS` from 2.23 to 2.0). If it's still blown out on a phone, thin the fountain sparks rather than dimming further.
- Burst white-out fixed on October 8 (owner: peonies, palms and willows washed out white at the break, fine later). In `src/fireworks.glsl.js`: every spark's colour is deepened before the brightness multiply and the peak eased to 82% (ACES whitens bright colours); a burst's sparks start at 3% and ramp up over 0.45 s (they're all born on one point); and long trails (willow, palm, wisp) hold at 40% until the spark is about a trail length old, because their tails stay on the break point until then. Ground shows get the same start ramp but no hold. Second pass the same day (owner: "the stringy one" was white, fountains glowed, the ends lost colour): palm fronds, crossette arms and the ground comets (shooters, mines, V-fans) draw as plain coloured sparks instead of `KIND.comet`, whose white-hot core is now only the rising shell's; fountains spray a third fewer sparks per nozzle (40/80 a second); and a star keeps full colour until 75% of its life, then goes out over the last quarter keeping its hue (it used to fade from 60% and drain to grey-orange). Ground shows keep the old 60% fade so the thinned plumes stay thin. Putting the 82% back to full brightness was tried and rejected: it brought back cream willows at 1.6 s and green bloom blobs on peonies. Not changed: glitter peonies (one in four) can still bloom into fuzzy blobs from their 2.2× flashes.
- The word filter also covers French and Spanish (a curated starter set of slurs, checked against the 50k commonest words in seven languages) and lets "en retard" and "¿qué pedo?" greetings through. `tools/filter-test.mjs` runs first in `npm run check`. A native speaker should review the French and Spanish lists before those languages are promoted.
- Refunds are manual in the Stripe dashboard and don't switch the greeting off. A KV export for backups isn't built (Stripe holds a copy of each paid greeting). Lost links: /find emails them once `RESEND_API_KEY` is set (owner: sign up at Resend, verify skygreeting.com there, add the key as a Cloudflare secret).
- Load time: first paint about 264 ms and about 1.9 s overall (Cloudflare, falling). Remaining cost is the three.js download and preparing the scene on phones. Bundling would break the no-build-step rule (the owner's call).
- Customize remembers each visitor's last settings, so old defaults can linger on a device (Start over resets).
- Christmas, New Year's and Valentine's are meant to be new entries in `src/occasions.js` plus any new shells; the pricing plan lists Business ($49/month), 5-packs and a Deluxe tier that don't exist.
- `HANDOFF.md`'s Status section is long and a few older lines are stale (for example the ground-smoke interval, ring sizes and "100 while testing"); the later bullets and this file are current.

## Gotchas learned the hard way

- **Analytics records the page title on its own.** The worker rewrites a greeting's `<title>` to "<sender> made you a SkyGreeting", so a sender's name reached Google Analytics (seen in the Realtime "Views by page title" card on October 8, 2026) even though the address was already stripped. The GA config in `index.html` now sets `page_title` explicitly for greetings. Anything else that puts a name or words in the title, the address or an event needs the same care; the privacy page promises Google never sees them. Names recorded before the fix stay in GA until they age out (14 months) or are deleted there.
- **Never use `@` in a served path.** Cloudflare redirects `/vendor/three@x/…` to `%40`, which moved a module's address so the import map no longer redirected `three.core.js` to the minified file; the live site 404'd for a few minutes. After any infrastructure or path change, load the **live** site, not just localhost.
- three.js `compileAsync` skips invisible objects, so the pier compiles when first shown, not at load. `KHR_parallel_shader_compile` is missing in the headless test browser, so that path is gated on the extension and was tested by forcing it.
- `<h1>` and the About text are in `index.html` as screen-reader-only text because the show is a canvas and Stripe and search engines read plain text. Keep terms, privacy, about and the contact email linked from the home page.
- A ground-show spark's brightness is capped in the fragment shader through a flag in the particle colour attribute's spare channel (`pool.groundShow`); `aColor.w` is therefore not free.
- The audio context is created once for the page and never closed (Chromium keeps closed ones alive, which leaked on rebuilds); this deliberately departs from no-leak rule 7.
- Moderation word lists are ROT13'd in `src/moderate.js` and `worker/` imports the same file. Don't paste slurs into chat or tests; decode at runtime and print counts only. A "!" at a word's end was once read as "i".
- Save as video: sharing consumes the tap, so a download started after a failed `navigator.share` is silently dropped by phone browsers (the likely reason an early version "saved" nothing); it now asks for a fresh tap. The download link is attached to the page before it's clicked, an empty recording says so, and the preview video's own ⋮ → Download is a second way out. Very short recordings can come out empty in the slow headless browser; a 12 s one is fine.
- Headless Chromium can't decode recorded video (reads black), so Save as video is only proven to record and produce a file, not to look right.
- **Testing a burst's look headlessly works, but only on the scene's own clock.** Software rendering runs a few frames a second and each step is capped by `config.loop.maxDt`, so scene time runs at about a fifth of real time, and a screenshot taken "3 s after launch" catches the three opening shells instead. Read the time from `ctx.fireworks.pool.mesh.material.uniforms.uTime`, freeze the show for each shot with `config.loop.timeScale = 0`, and seed `Math.random` while launching so runs compare the same shells. Colours in the headless captures are faithful. (The October 8 burst fix was checked this way: red, green and blue peonies, willows and palms side by side, at phone size.)
- Stripe: a publishable key pasted into the secret slot gives "publishable API key" errors; checkout failed once only because the owner's BetBlocker VPN blocked checkout.stripe.com.
- Anything that randomises or loads settings must stay inside the panel's ranges (the autoshow once set Glitter to 1.5 and twinkling sparks flashed black). Keep large numbers out of fragment-shader maths too: anything driven by total running time (`uTime`) breaks on some phone GPUs after a long session. Use a spark's or puff's own age.
- `/terms.html` redirects to `/terms`; always link the clean paths.

## How the owner likes to work

- They want steps to flow without stopping for approval, "pretty and realistic" visuals, plain-language explanations (they're not a developer), and short answers that say what's done and what they need to do.
- Test details go in the summary only if they matter. Tell them plainly when something couldn't be verified here.
- Don't suggest turning off their BetBlocker. Never ask them to paste secrets. Use their email only to identify them.
- They are open that the project is built with AI coding tools (October 8, 2026): `about.html` has a "How it's made" line saying so, and the outreach drafts say the same. They don't want it hidden and don't want it to be the headline. Keep new public copy consistent with that, and don't describe the work as hand-coded.
- Commit trailers follow the session's attribution instructions; push only to the branch the session names (`ccr-09268299-owgtnw` is the one that deploys; a session may be assigned its own branch, which needs merging into it to go live).
