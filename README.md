# Beach Fireworks

A real-time Three.js beach at dusk with a firework show anyone can design: Gerstner waves that shoal and run up the sand, a wet band that mirrors each burst, twelve shell types (including hearts, stars and text), bloom, sound, and a panel for every setting. It's a sales demo for animated website headers for waterfront businesses. `HANDOFF.md` has the full spec and status.

## See it

- **Preview:** https://claude.ai/artifact/8ZMbARoMcnBrAmYGb5tQ1j (private until you share it)
- Add `#hero` to a link to open as a website header with a sample headline, or `#debug` to show frame rate and memory counts.
- The **Lake Michigan** preset adds a pier and lighthouse (with a sweeping beam and a lamp reflected in the water), dune grass, and calmer freshwater waves.
- Keys: `H` hero mode, `` ` `` stats overlay, `Shift+R` rebuild (the leak test).

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
