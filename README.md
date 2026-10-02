# Beach Fireworks

A real-time Three.js beach at dusk with a firework show anyone can design: Gerstner waves that shoal and run up the sand, a wet band that mirrors each burst, twelve shell types (including hearts, stars and text), drifting smoke lit by later bursts, bloom, sound, and a panel for every setting. It's a sales demo for animated website headers for waterfront businesses. `HANDOFF.md` has the full spec and status.

## See it

- **Live:** https://techdemo.maxpug17.workers.dev/ (Cloudflare). Private preview: https://claude.ai/artifact/8ZMbARoMcnBrAmYGb5tQ1j
- Add `#hero` to a link to open as a website header with a sample headline, or `#debug` to show frame rate and memory counts.

## Send someone fireworks

The **Send someone fireworks** button (bottom left) lets anyone type a message of up to 24 characters and who it's from, preview it in the sky, and get a link. Phones open the share sheet, and other devices copy the link. Opening `?msg=HAPPY%20BDAY%20SAM&from=Max` spells the message every 13 seconds over a calmer show. A card says who sent it, with buttons for **Again**, **Send your own** and **Play with the show**. Anyone can also tap or click the sky to launch a shell, except on an embedded header.

## Client mockups and embeds

In the panel's **Client mockup** folder, type a prospect's business name, headline, tagline and button text. **Copy client link** gives a link that opens straight into their header with the whole current look; **Copy embed code** gives the snippet for their site:

```html
<iframe src="https://techdemo.maxpug17.workers.dev/?s=…&embed=1" title="Their Business"
  style="display:block;width:100%;height:80vh;border:0" loading="lazy"></iframe>
```

Link parameters: `s` (the settings JSON, base64url), `business`, `headline`, `copy`, `button` (plain text, length-capped), `hero=1` (open as a header), `embed=1` (scene only: no panel, text, hints or keys, drag scrolls the host page, sound off unless `sound=1`, and remembered settings are ignored). The scene stops rendering while it's scrolled off screen or the tab is hidden.
- The **Lake Michigan** preset adds a pier and lighthouse (with a sweeping beam and a lamp reflected in the water), dune grass, and calmer freshwater waves.
- Keys: `WASD` or arrows to walk the beach (drag to look, `Shift` to run, `Esc` to go back), `H` hero mode, `` ` `` stats overlay, `Shift+R` rebuild (the leak test).

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

The page is static files and loads three.js and lil-gui from jsDelivr, so any static host works.

- **Cloudflare (set up):** `wrangler.jsonc` deploys the site as a static-assets Worker named `beach-fireworks`. Connected to this repo in Cloudflare (Workers → Import a repository), every push deploys; the default `npx wrangler deploy` command is all it needs. `wrangler.jsonc` has Wrangler copy `index.html` and `src/` into `.deploy/` first and upload only that. To deploy from a terminal instead, run `npm run deploy` with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` set. The site is at `https://beach-fireworks.<your-subdomain>.workers.dev`.

- **GitHub Pages:** merge this branch into the default branch, then in the repo's Settings → Pages choose "Deploy from a branch", the default branch, and `/ (root)`. The demo is then at `https://rowdybard.github.io/Techdemo/`.
- **claude.ai artifact:** already published at the preview link. Use its Share menu to make it public before sending it to anyone.

For outreach emails, send the link with `#hero` on the end.
