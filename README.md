# Beach Fireworks

A real-time Three.js beach at dusk with a firework show anyone can design: Gerstner waves that shoal and run up the sand, a wet band that mirrors each burst, twelve shell types (including hearts, stars and text), drifting smoke lit by later bursts, bloom, sound, and a panel for every setting. It's a sales demo for animated website headers for waterfront businesses. `HANDOFF.md` has the full spec and status.

## See it

- **Live:** https://techdemo.maxpug17.workers.dev/ (Cloudflare). Private preview: https://claude.ai/artifact/8ZMbARoMcnBrAmYGb5tQ1j
- Add `#hero` to a link to open as a website header with a sample headline, or `#debug` to show frame rate and memory counts.

## SkyGreeting: make and send a greeting

**Make a SkyGreeting** (bottom left) opens the builder. The message goes up in the live show as you type, and **🎨 Customize the show** designs the greeting itself: what you set there is what gets sent (`src/look.js` packs it into the free link's `l=` or the paid greeting on the server). Effects marked ✦ are Deluxe for that occasion; using any of them makes it a paid send automatically.
1. Pick an occasion (Halloween, Birthday, Love you, Congrats, Thank you).
2. Write the message (24 characters), their name and yours.
3. Optionally tick **✦ Deluxe**, which previews the paid effects and grand finale. The send button always shows the price: `Send · Free` or `Send · $4.99 ✦`.
4. Press **Preview the show**, then send. Phones open the share sheet, and other devices copy the link.

Occasions are data in `src/occasions.js`: a preset, a suggested message, free and Deluxe effects, stand-ins for Deluxe effects in a free send, and an ending (a timed list of cues that `src/director.js` plays). A new season is a new entry there.

Opening a link (`?o=halloween&msg=HAPPY%20HALLOWEEN&to=SAM&from=Max`) sets the scene for the occasion and plays the ending with the words. A card shows who made it, with **Watch again**, **Make one for someone else** and **Play with the show**. Older `?msg=` links play as a birthday greeting. **Paid Deluxe sends** go through Stripe Checkout, using `worker/index.js`, the only server code. The server saves the greeting as pending in the `GREETINGS` KV namespace and opens a Stripe checkout. It marks the greeting paid when Stripe's webhook arrives, or when the buyer returns, by asking Stripe directly. The buyer lands on `?g=<id>&sent=1` with their private link to share. Recipients of `?g=<id>` get the full Deluxe show, and the words come from the server, so they aren't in the link.

- Stripe Checkout collects the buyer's email. The greeting's private link is the payment description, so it appears on Stripe's receipt email (turn on Stripe → Settings → Customer emails → Successful payments). The email is stored with the paid greeting so a lost link can be resent; it is never returned by `/api/greeting`.
- The price is `DELUXE_PRICE_CENTS` in `wrangler.jsonc`. It's 100 ($1) for testing with real cards; set it to 499 to sell.
- Secrets go in Cloudflare (Worker → Settings → Variables and Secrets, type Secret): `STRIPE_SECRET_KEY`, and `STRIPE_WEBHOOK_SECRET` from a Stripe webhook pointing at `https://skygreeting.com/api/stripe-webhook` for `checkout.session.completed`. Without the webhook, payments still confirm when the buyer returns from checkout.

Anyone can tap or click the sky to launch a shell, except on an embedded header.

## Client mockups and embeds

In the panel's **Client mockup** folder, type a prospect's business name, headline, tagline and button text. **Copy client link** gives a link that opens straight into their header with the whole current look; **Copy embed code** gives the snippet for their site:

```html
<iframe src="https://techdemo.maxpug17.workers.dev/?s=…&embed=1" title="Their Business"
  style="display:block;width:100%;height:80vh;border:0" loading="lazy"></iframe>
```

Link parameters: `s` (the settings JSON, base64url), `business`, `headline`, `copy`, `button` (plain text, length-capped), `hero=1` (open as a header), `embed=1` (scene only: no panel, text, hints or keys, drag scrolls the host page, sound off unless `sound=1`, and remembered settings are ignored). The scene stops rendering while it's scrolled off screen or the tab is hidden.
- The **Lake Michigan** preset adds a pier and lighthouse (two beams sweeping the haze and lighting the smoke, a lamp that flares as a beam passes you and shines on the water), dune grass, and calmer freshwater waves. The light's brightness, speed and colour are adjustable.
- **Customize** (bottom right) is the everyday settings drawer: style presets, colour swatches, which fireworks and ground show, sliders for pace, size, sparkle, sky, wind and smoke, sound, the pier and grass, the lighthouse's light, and the camera. **Advanced settings** at its foot (or `#advanced` on the link) opens the full developer panel, which has the Client mockup folder and Save & load.
- Keys: `WASD` or arrows to walk the beach (drag to look, `Shift` to run, `Esc` to go back), `H` hero mode, `` ` `` stats overlay, `Shift+R` rebuild (the leak test).
- **Lock view** (the small pill above Customize) holds the camera still, so a tap only launches a firework; while locked a press can wander a little and still count as a tap. Remembered per visitor; not shown in embeds or the autoshow.

## Run it locally

No build step. Serve the folder and open it:

```
python3 -m http.server 8000     # or: npx serve .
```

Then open http://localhost:8000. Modules don't load from `file://`.

## Check it

```
npm install
npx playwright install chromium   # once, if Chromium is missing
npm run check                     # console, counts, screenshots, 20 rebuilds
npm run check -- --soak 600       # plus 10 minutes of the Finale preset
```

The check uses software WebGL, so its frame rate means nothing. Judge speed on real hardware.

## Host it

The page is static files and serves its own pinned copies of three.js and lil-gui (in `vendor/`), so any static host works.

- **Cloudflare (set up):** `wrangler.jsonc` deploys the site as a static-assets Worker named `beach-fireworks`. Connected to this repo in Cloudflare (Workers → Import a repository), every push deploys; the default `npx wrangler deploy` command is all it needs. `wrangler.jsonc` has Wrangler copy `index.html` and `src/` into `.deploy/` first and upload only that. To deploy from a terminal instead, run `npm run deploy` with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` set. The site is at `https://beach-fireworks.<your-subdomain>.workers.dev`.

- **GitHub Pages:** merge this branch into the default branch, then in the repo's Settings → Pages choose "Deploy from a branch", the default branch, and `/ (root)`. The demo is then at `https://rowdybard.github.io/Techdemo/`.
- **claude.ai artifact:** already published at the preview link. Use its Share menu to make it public before sending it to anyone.

For outreach emails, send the link with `#hero` on the end.
