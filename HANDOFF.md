# Beach Fireworks: Handoff

Handoff from a Claude chat session to Claude Code · Wednesday, September 30, 2026

## Status

- **Steps 1 to 11 of the build order are built** (September 30, 2026), with the parts of step 11 that can be done without real devices. Step 12 is ready except for the public link, which Daniel has to switch on (see below). three.js is pinned to 0.186.1 and lil-gui to 0.21.0.
- **Files beyond the original layout:** `src/glsl.js` (noise and the sky gradient that water and sand reflect), `src/ocean.glsl.js`, `src/particles.js` (the pool), `src/shells.js` (a whole shell written at launch), `src/bursts.js` and `src/shapes.js` (burst types), `src/burstlights.js` (firework light), `src/presets.js`, `src/hero.js`. Every file is under 300 lines.
- **Sky** is a custom twilight shader instead of three's `Sky.js`, whose physical model goes almost black once the sun is below the horizon. It draws an afterglow toward the sunset (over the water, 18° right of straight ahead, as on a west-facing Lake Michigan beach), a blue-hour gradient, cloud wisps and twinkling stars.
- **World layout** (in `src/config.js`): +Y is up, the sea lies toward −Z, and the resting waterline wanders a few metres either side of z = 0. The camera stands about 1.7 m above the sand, 16 m up the beach; the barge sits 380 m offshore so bursts land in the upper half of the frame.
- **Shore** (`src/surf.glsl.js`, shared by ocean and beach): three wave trains with different periods, each wave with its own height and run-up. A wave rolls in, grows as it shoals, breaks where the depth is about its height, collapses into a whitewater bore, runs up the sand as swash and drains back; each train arrives a little earlier or later along the beach, so waves break in sections. Foam is cell-noise froth with bubble holes that opens into lace and scraps as it thins. Each wave leaves foam on the sand, mostly along the line where it stopped, fading over a few seconds, and freshly uncovered sand shines. The water fades to zero alpha as it thins, so there's no hard waterline.
- **Shore edges** (after Parla's water): the swash running up the sand is drawn by the beach shader per pixel (a film of water mirroring the sky, with its foam), not by the ocean mesh, so it has no geometric edge to leave seams or stair-steps. Its edge is soft over at least 25 cm or a couple of pixels. `surfWobble` pushes every surf front up and down the beach in lobes that drift with time, so no front runs dead straight. Once a wave breaks, the bore's front carries the swash edge, so the edge never jumps. The ocean's foam fades with the water's depth, and there is no lip line where the sea meets the sand. `foamPattern` uses soft patches, lace and bubble holes with no cell walls, and detail below a few pixels settles to its average.
- **Walking** (`src/walk.js`): WASD or the arrow keys walk the beach at eye height, following the sand and wading a little into the surf; drag to look, Shift to run, Escape or a camera preset to go back. The orbit controls stand aside while walking.
- **Fireworks:** one pool of 60,000 particles (20,000 on phones), one draw call. Launching writes the whole shell at once (the rocket, the sparks it sheds, the burst, and later events such as crossette splits, crackle pops and second breaks) with later birth times, placed with the same closed-form motion the shader uses. Three shells are already climbing at load, so the first burst lands within about a second. Types: peony, chrysanthemum, willow, palm, ring, crossette, strobe, crackle, multi-break, heart, star and text.
- **Ground show** (`src/fountains.js`): a row of gold or silver fountains along the 130 m barge, playing every 28 s in turn together, as a sweep either way, or at alternating heights. Each fountain writes its whole spray into the particle pool at once, and each is a steady light that the water reflects. Panel folder: Ground show.
- **Firework light:** the eight brightest live bursts go to the ocean and beach as uniform arrays. On the water they make long glittering streaks; on the sand, a soft flash, lit glints, and reflections in the wet band.
- **Post and quality:** RenderPass → UnrealBloomPass (threshold 1) → OutputPass with ACES tone mapping. Tiers set the pixel-ratio cap, MSAA and bloom resolution; auto quality steps down after two seconds of frames slower than 20 ms. Sparks brighten over their first 0.4 s, so a fresh burst doesn't bloom into a white blot.
- **Customize** (`src/studio.js`, `src/studio.css`): the friendly drawer most people use (a bottom sheet on phones, a card on the right on wide screens). Preset cards, palette swatches, shell and ground-show chips, and six plain sliders that each map to one or two settings (Pace sets shells per minute and most in the air). It writes the same config and remembers it. The lil-gui panel below is now "Advanced settings", hidden unless opened from Customize or with `#advanced`.
- **Panel and hero mode:** every control in the spec, six presets, JSON copy and paste (only known keys with matching types are accepted), and the last setup remembered in localStorage. Hero mode shows a sample header for an invented marina; `#hero` on the link opens in it, `#debug` shows the stats overlay, which is hidden by default.
- **Sound:** synthesised booms delayed by distance over the speed of sound, and crackle. It starts after the first tap. One AudioContext serves the page across rebuilds and closes on pagehide. This departs from no-leak rule 7 on purpose: the heap diff showed Chromium keeps closed AudioContexts alive, so closing and recreating one per rebuild leaked.
- **Drag** orbits a point over the water within each camera preset's limits (sand, drone, water level). Zoom and pan are off.
- **Checks:** `npm run check` reports console problems and overlay counts, saves desktop and phone screenshots to `.check/`, and runs 20 Shift+R rebuilds after 5 warm-ups. `--soak 600` adds 10 minutes of the Finale preset. Latest result: clean console; 22 draw calls, 8 geometries, 13 textures, 14 programs with bloom; canvases, listeners, DOM nodes and every overlay count back at their startup values after the rebuilds. Heap snapshot diffs over 50 rebuilds show no app objects growing, only V8 compiled code and Chromium's capped performance buffers. The 10-minute Finale soak passed: geometry, texture, program and listener counts never changed, and the heap went from 5.71 to 5.96 MB and levelled off.
- **Not yet measured:** frame rates on a real laptop and phone. The checks here use software WebGL. Expensive shader work is already skipped where it can't show (foam noise only where foam can form, ripples only up close), and auto quality steps down on slow devices.
- **Smoke** (`src/smoke.js`, shaders in `src/smoke.glsl.js`): each burst leaves 7 puffs (4 on phones, half on the low tier) laid along where its sparks went: a thicker core and a ragged shell that sags at the bottom, hanging curtains under willows and palms, a wide band under text. Each puff is stretched and tilted its own way and filled with domain-warped noise cut against a soft edge, so outlines differ; as it ages it billows and tears into wisps, and the ground show leaves low haze over the barge. Puffs drift with the wind, rise, spread and fade over about 30 s, and the burst lights light them, so new bursts glow through old smoke in their own colour. One instanced draw from a fixed ring of 128 puffs (48 on phones); a puff is only replaced once mostly faded, which caps the haze and the overdraw in a finale. Lit smoke is capped well under the bloom threshold. Panel: Scene → Smoke, Smoke amount, Smoke lingers. Calm has less, Finale more.
- **Wind** (`src/wind.js`, first in the update order): the panel's speed and direction are the average; smooth noise adds gusts and lulls (roughly half to one and a half times the set speed) and a direction that wanders about 25° either way. Gustiness 0 holds it steady. It writes `physics.windX/Z` each frame and keeps a running total of how far the air has moved, which smoke uses so long-lived puffs follow the wind they met. Dune grass leans and flutters with it.
- **SkyGreeting** (skygreeting.com): `src/builder.js` (Make a SkyGreeting: occasion, words, the ✦ Deluxe preview with the price on the send button, preview, send), `src/occasions.js` (content packs as data: preset, message, free and Deluxe effects, stand-ins, ending cues), `src/director.js` (plays an ending; the random show and the scheduled ground show hold off while it plays), `src/gift.js` (a recipient's view: the occasion's scene, the ending, and a card with Watch again, Make one for someone else, and Play with the show). Links are `?o=&msg=&to=&from=`. Free sends use only free effects, and Deluxe effects in an ending become stand-ins. Deluxe sends are paid through Stripe Checkout by `worker/index.js` on the `techdemo` Worker (skygreeting.com). Its routes are `/api/config` (price), `/api/checkout`, `/api/stripe-webhook` (signature checked with WebCrypto) and `/api/greeting?id=`. Greetings are kept in KV `GREETINGS`: pending ones expire after two days, and paid ones are kept. The page loads paid links as `?g=<8 chars>`, so Deluxe can only be unlocked by a paid record on the server. The price is `DELUXE_PRICE_CENTS` in `wrangler.jsonc` (100 while testing). Tapping the sky launches a shell in every mode except embeds.
- **Designed greetings** (`src/look.js`): Customize's settings (palette, shells, ground show, pace, size, sparkle, sky, wind, smoke, pier and its light, grass, camera) travel with the greeting, packed into the free link (`l=`, base64url JSON) or stored with the paid greeting. They are checked value by value when applied. A free greeting has the occasion's Deluxe effects stripped out (`keepFree`). The builder marks Deluxe effects ✦ in Customize, and the price on the send button follows the design. The message is the sky text while building and after an ending.
- **Halloween** (preset; `src/halloween.js` shells, `src/haunt.js` ground effects): 8 shells (jack-o'-lantern, skull, bat, ghost, spider web drawn as strokes sampled once into points, with a colour per stroke; witch's brew boiling into bubbles; eyes that open, blink and go out; a ghost-green willow that turns violet) and 4 ground effects (bubbling cauldrons; will-o'-the-wisps and floating lanterns drawn as a moving head of short-lived sparks laid along a path; lightning bolts with a re-strike and a fork). Ground style 'halloween' rotates the four. Palette 'halloween'.
- **Moderation** (`src/moderate.js`): greeting words (message, their name, sender) are checked in the builder (live sky text, preview, send), when a link opens (a blocked free link shows "This SkyGreeting can't be shown"), and on the server before checkout. It blocks slurs, hate symbols, sexual terms and self-harm threats; mild swearing is allowed. Text is normalised (accents, look-alike digits and symbols, repeated letters) and checked as whole words, plus a few long stems with spaces squeezed out. The lists are ROT13'd in the source. Tested against every stored entry in four disguises and 25 ordinary greetings that must pass (SUMMA CUM LAUDE, COCKTAIL HOUR, PAKISTAN, SCUNTHORPE).
- **Reports** (`src/gift.js`, `/api/report` and `/api/taken-down` in `worker/index.js`): the recipient's card has a Report link with a reason (hateful, threatening, sexual, spam, something else) and an optional note. Reports are kept 90 days as `r:<time>:<id>` keys in the `skygreeting-greetings` KV namespace; review them in the Cloudflare dashboard (Storage & Databases → KV). Three reports from different people take a greeting down: a paid one gets `hidden` on its record, a free one an `h:t:<hash of its words>` key. Its link then shows "This SkyGreeting has been taken down". To take one down by hand, add that key or set `hidden: true`. Reporters are told apart by a salted SHA-256 of their IP; no IP is stored. There are at most 10 reports per person an hour.
- **Link previews** (`preview()` in `worker/index.js`): the worker answers `/` when it has `?g=` or `?msg=`, and rewrites the page's title and Open Graph/Twitter tags with HTMLRewriter: "Max made you a SkyGreeting 🎃", a fixed description, and the occasion's picture `src/og/<occasion>.jpg` (1200×630, frames rendered from the scene). It never includes the message. Blocked sender names fall back to the generic title.
- **Terms and privacy** (`terms.html` at `/terms`, `privacy.html` at `/privacy`, copied by the build command): linked from the builder and from Stripe's checkout text. The contact is hello@skygreeting.com (set up Cloudflare Email Routing to forward it). These are drafts and should be read before relying on them.
- **Save as video** (`src/video.js`): records an ending with MediaRecorder from a 2D canvas that copies each frame right after it's drawn (`ctx.afterRender` in main.js), so overlays never appear. Free greetings carry a "✦ skygreeting.com" mark; paid ones are clean. It makes MP4 where supported and WebM otherwise. A tap on "Save video" opens the share sheet (or downloads), because sharing needs a user gesture. Offered from the recipient's card and the builder's preview bar (🎬).
- **Price:** `DELUXE_PRICE_CENTS` is 499. The $1 live test passed on October 3, 2026 (checkout, webhook, private link, receipt).
- **Ground smoke** (`groundSmoke` in `src/smoke.js`): while a tube burns it puffs every 0.9 s (1.8 s on phones). Each puff starts small at the deck and rises as a buoyant plume (`aExtra.x`). It's lit strongly by the effect's own light (`aExtra.y` glow 40; its colour cap rises from 0.4 to 0.9 for glowing smoke, still under the bloom threshold). Tubes smoke unevenly. Afterwards it hangs low as a grey bank and drifts off. Each ground effect's light says how much smoke it makes (`smoke`) and what it sounds like (`sound`); lightning, wisps and lanterns make none.
- **Words in front** (`TEXT_FORWARD` in `src/shells.js`): text shells fly 110 m toward the beach and burst nearer, scaled down and lowered by the distance ratio so they look the same size and in the same place. While words are up, random shells are aimed out to the sides (`wordsUp` in `fireworks.js`).
- **Audio** (`src/audio.js`, rewritten): every sound is synthesised from noise buffers and oscillators made once. Bursts are a thump, a rumble and a crack, duller with distance and panned by position. Each shell type has its own extra (crackle, hiss, a second boom, split pops); shapes are softer and eyes silent. Launches get a mortar thump and sometimes a whistle (`record.launch`). Ground effects hiss, whoosh, pop, boom, bubble or thunder. A looping sea sits underneath, and everything runs through a procedural echo. Up to 32 voices; each disconnects itself.
- **Load time:** index.html preloads every module (`<link rel="modulepreload">`, 54 entries) so they arrive in one parallel wave instead of a five-deep import chain. `tools/check.mjs` fails if an imported module isn't preloaded or a preloaded file is gone. three.js loads minified: the import map also points jsDelivr's `three.core.js` (which `three.module.min.js` imports) at `three.core.min.js`, cutting about 400 KB to about 195 KB. jsDelivr is preconnected. `_headers` caches `/src/*` for 5 minutes and the preview pictures for a day. `main.js` marks `first-frame` for measuring. With 150 ms simulated latency over HTTP/1.1, the first frame went from 2.19 s to 1.86 s; HTTP/2 on Cloudflare parallelises further.
- **Defaults:** stars off (a Revvl tablet drew them as streaks, most likely low float precision in the star hash; the sky skips the star code when they're off) and sound volume 0. Both are in the panel.
- **Not built:** logo bursts from an image (text bursts work).
- **Preview:** a private claude.ai artifact at https://claude.ai/artifact/8ZMbARoMcnBrAmYGb5tQ1j. The artifact host adds its own `<html>`, `<head>` and `<body>`, so publish a copy of `index.html` without them, plus every file in `src/`.
- **Lake Michigan preset** (`src/landmarks.js`, `src/lighthouse.js`): a concrete pier out to a red steel lighthouse (crib, door and portholes, black gallery with railing, eight-sided lantern, dome), dune grass framing the foreground, and calmer waves. The pier and tower are lit like the sand (sky fill, afterglow, firework light) by one shared `Structure` shader. The lens throws two opposite beams that sweep the haze: each pixel of a bounding cone adds the light its view ray scatters out of the beam, worked out exactly (the beam is a Gaussian spread of angles from its apex, so the sum is a pair of error functions), with forward scattering, so a beam is a soft shaft side-on and a glow when it swings toward you, when the lamp also flares. The beams light a band across any smoke they cross (`beamGLSL`, shared with `smoke.glsl.js`). The lamp takes the dimmest firework-light slot, so it throws its own streak across the water, brighter on each flash. `config.landmarks.light`, `sweep` (turns a minute) and `lightColor` (warm, white, red, green) only move uniforms; Customize shows them in a Lighthouse section while the pier is on, and a design's link carries them. Pier and grass are toggles, shown by flipping visibility.
- **Cloudflare:** Daniel connected the repo to a Cloudflare Worker build, which runs `npx wrangler deploy` on every push. `wrangler.jsonc` runs a build command that copies `index.html` and `src/` into `.deploy/` (gitignored) and uploads only that folder. The first build failed because `.deploy/` didn't exist in a fresh clone; the build command fixes that.
- **Live:** https://techdemo.maxpug17.workers.dev/. The outreach emails link there with `#hero`.
- **Client links and embeds** (`src/link.js`): the panel's Client mockup folder sets the header text (`config.hero`), spells the business name in fireworks, and copies a client link (`?s=` base64url settings JSON plus `hero=1`) or an `<iframe>` embed (`embed=1`). Link text goes through length caps and `textContent`; settings go through `loadSettings`. Embeds hide every overlay, disable orbit and walking, let touch scroll the host page, start muted unless `sound=1`, and ignore localStorage. An IntersectionObserver stops the render loop while the scene is off screen. Presets keep the header text.

## Why this exists

Daniel builds real-time Three.js visuals: Gerstner-wave oceans, buoyancy physics, lighting rigs, a theme-park lazy river. The plan is to sell custom animated hero sections to waterfront businesses (marinas, boat dealers, pool builders, waterparks, beach rentals, waterfront restaurants). This scene is the demo link that goes in the outreach emails (`outreach-emails.md`). It has to land in the first five seconds, on a phone, with no instructions.

## What Daniel asked for

1. Real-time Three.js visuals that "hit kinda hard." The visual bar is high.
2. Set on a clean sandy beach: ocean, shoreline, sand.
3. A firework display that is completely customizable.
4. Everything cleans up after use. No memory leaks.

Carried over from the first plan: Gerstner-wave ocean, sky with sun and stars, bloom, mood presets, drag to look around, works on phones. Rain and lightning were in the first plan and are now optional.

## The scene

Eye level on dry sand at late dusk. Gentle surf runs up a wide, clean beach and leaves a dark wet band that shines when shells burst. Shells launch from a barge offshore, burst over the water, and reflect as long streaks in the waves. A panel lets anyone design the show. Hero mode hides the panel so the scene reads like a website header.

Default to late dusk: dark enough for the fireworks to pop, light enough that the beach still reads in a thumbnail. The first burst should go off within about a second of load.

## Stack

- **three.js `WebGLRenderer`** with GLSL `ShaderMaterial`s. Widest phone support, and the `EffectComposer` bloom path is WebGL-only.
- **ES modules through an importmap**, no build step. Pin one exact version of each:
  ```html
  <script type="importmap">
  { "imports": {
      "three": "https://cdn.jsdelivr.net/npm/three@<version>/build/three.module.js",
      "three/addons/": "https://cdn.jsdelivr.net/npm/three@<version>/examples/jsm/",
      "lil-gui": "https://cdn.jsdelivr.net/npm/lil-gui@<version>/dist/lil-gui.esm.min.js"
  } }
  </script>
  ```
- **lil-gui** for the panel.
- **Everything procedural.** No textures, models, or fonts fetched at runtime, so it hosts anywhere, including as a claude.ai artifact (which only allows scripts from a few CDNs, jsdelivr included, and blocks other external loads).
- Serve locally with `npx serve .` or `python3 -m http.server`. Modules don't load from `file://`.

## File layout

```
index.html            canvas, importmap, panel container, hero-mode overlay
src/main.js           renderer, camera, controls, loop, resize, visibility pause, destroy()
src/config.js         every tunable in one plain object, plus presets
src/terrain.glsl.js   sand height function in GLSL and JS, shared by ocean and beach
src/sky.js            dusk sky and night dome with stars
src/ocean.js          Gerstner ShaderMaterial, shoreline foam, firework reflections
src/beach.js          sand mesh, wet band, glints
src/fireworks.js      particle pool, shell scheduler, burst types
src/post.js           EffectComposer, bloom, OutputPass, quality tiers
src/ui.js             lil-gui panel, presets, JSON copy/paste, hero mode
src/audio.js          optional: synthesized booms and crackle with Web Audio
src/debug.js          overlay: FPS, renderer.info, pool usage, heap
```

Every module exports `create(ctx)` and returns `{ update(dt, time), dispose() }`. `main.js` keeps them in an array, updates them in order, and disposes them in reverse.

## Fireworks

### Engine

The goal is zero per-frame CPU work per particle and zero allocation after startup.

- **One pool, one draw call.** A single `Mesh` on an `InstancedBufferGeometry`: a 4-vertex quad, instanced once per particle. Size the pool once at startup, about 60k on desktop and 20k on phones.
- **Positions come from a formula, not a simulation.** Each instance stores spawn time, origin `p0`, initial velocity `v0`, drag `k`, lifetime, color, size, trail length, and flags. With gravity `g`, wind `w`, and terminal velocity `vT = g/k + w`:
  - `v(t) = vT + (v0 − vT)·e^(−k·t)`
  - `p(t) = p0 + vT·t + (v0 − vT)·(1 − e^(−k·t))/k`

  Keep `k` above about 0.01 to avoid dividing by zero.
- **Heads and trails are the same quad.** The vertex shader evaluates `p(t)` and `p(t − trail)` and stretches the camera-facing quad between them. Trail length 0 gives a round spark.
- **Spawning writes one slice.** A ring-buffer cursor claims a contiguous run of instances. Write only that run and upload only that run with `attribute.addUpdateRange(start * itemSize, count * itemSize)` plus `needsUpdate = true` (ranges are in array elements, and a run that wraps needs two ranges). Dead instances collapse to zero size in the shader. Nothing is ever freed or allocated.
- **Material:** `transparent: true`, `blending: AdditiveBlending`, `depthWrite: false`. No sorting needed.
- **Set `frustumCulled = false`** on the mesh. Positions live in the shader, so the bounding sphere is wrong and three.js would cull the whole show.
- **HDR color.** Output values above 1.0 for sparks. The composer renders in half-float, so bloom with a threshold near 1 catches the fireworks and leaves the sand alone.
- **Glitter and strobe** come from `hash(id, floor(time * rate))` in the fragment shader.
- **Shell scheduler on the CPU:** a preallocated array of shell records (launch, fuse, burst, optional second break). No objects per shell.
- **Time:** `uTime` is seconds since start. Float32 stays precise enough for many hours; rebase spawn times if it ever runs as a kiosk for days.
- **Phones are fill-rate bound.** Overdraw, not vertex count, is the limit. On the low tier keep sparks small and trails thin.

### Burst types

Peony, chrysanthemum (peony with trails), willow (gold, slow, long droop), palm (a few thick comets), ring (random tilt), crossette (comets that split in four), strobe/glitter, crackle (tiny delayed pops), multi-break.

Stretch: shape bursts (heart, star, and text or a logo sampled from a canvas). This is the money feature for business demos: the client's name in fireworks over the beach.

### Controls (all live, no reload)

- **Show:** auto-launch on/off, shells per minute, max shells in the air, finale button, slow motion, launch site (barge, along the shore, or tap the sky to aim).
- **Shell mix:** a weight per burst type.
- **Look:** color palette (presets plus custom pickers, two-color shells, color change mid-flight), burst size, particle count per shell, lifetime, trail length, glitter amount, spark size, brightness.
- **Physics:** gravity, drag, wind speed and direction, launch height range, launch spread, angle variance.
- **Scene:** time of day (dusk to night), wave height, choppiness, camera preset (on the sand, drone, water level), bloom strength, radius and threshold, quality (auto, low, medium, high), sound on/off and volume.
- **Presets:** Fourth of July, Gold Willows, Neon, Calm, Finale. Save and load as JSON through a copy/paste text box. Downloads are blocked inside claude.ai artifacts; `localStorage` works for a remembered preset but can throw, so wrap it in try/catch.
- **Hero mode:** hides the panel and debug overlay, keeps auto-launch running, and overlays a sample headline and button so it reads like a real site header.

## Ocean, beach, sky

- **Shared sand height.** One height function (gentle slope plus low dunes from fbm) exists in both GLSL and JS, in `src/terrain.glsl.js`. The beach mesh uses it for its shape; the ocean uses it to know its depth at every point.
- **Ocean:** 4 to 8 Gerstner waves with analytic normals. Amplitude fades with depth so waves shoal and run up the slope. Foam on crests and in a band near zero depth. The ocean draws as transparent over the sand and fades to zero alpha at the waterline, which gives a soft edge with no z-fighting.
- **Beach:** fine noise for grain, and a darker, shinier wet band that follows the swash. Sparse glints that flicker with view angle.
- **Firework light on water and sand.** Pass the 8 brightest live bursts as a fixed-size uniform array (position, color, intensity). The ocean shader adds a stretched reflection streak per burst; the sand shader adds a soft flash and lights up the glints. Use custom uniforms, not three.js lights: changing the number of lights recompiles every shader and causes hitches.
- **Sky:** `three/addons/objects/Sky.js` for dusk, blended toward a night dome with procedural twinkling stars and an optional moon.
- **Post:** `RenderPass` → `UnrealBloomPass` → `OutputPass`. `OutputPass` applies the renderer's tone mapping (ACES or AgX) and the sRGB conversion. Bloom at half resolution on the low tier.
- **Camera:** `OrbitControls` with limits so the camera stays above the sand and faces the water.

## No-leak rules

Daniel asked for this explicitly. Treat these as acceptance criteria.

1. **Allocate once.** The particle pool, shell records, and scratch `Vector3` and `Color` objects are created at startup. Nothing in the render loop calls `new`, builds an array, or creates a closure. No `.map` or `.filter` in hot paths.
2. **Dispose before rebuild.** A setting that needs a rebuild (pool size, ocean resolution, quality tier, bloom resolution) disposes the old geometry, material, textures, and render targets before making new ones.
3. **Uniforms, not defines.** Panel toggles flip uniforms. New `defines` or a new light count compile new shader programs.
4. **One `AbortController`** passes its `signal` to every `addEventListener`; `destroy()` calls `abort()`. Call `disconnect()` on any `ResizeObserver`.
5. **Pause and resume.** Pause when `document.hidden`. Clamp `dt` on resume (for example to 0.1 s) and skip missed launches, so a long pause doesn't fire a backlog of shells.
6. **Canvas helpers.** A canvas used to sample text or a logo is dropped after reading its `ImageData`, and no texture is made from it. Any `CanvasTexture` that is made gets disposed.
7. **Audio.** Start only after a tap. Cap concurrent voices, `disconnect()` nodes in `onended`, and `close()` the `AudioContext` on destroy.
8. **Teardown order in `destroy()`:** `renderer.setAnimationLoop(null)` → `abort()` listeners → `gui.destroy()` → `controls.dispose()` → module `dispose()`s in reverse → each pass's `dispose()` and `composer.dispose()` → `renderer.dispose()` → `renderer.forceContextLoss()` → remove the canvas. Browsers cap how many WebGL contexts can be alive at once, so the recreate test below fails without `forceContextLoss()`.

### How to prove it

- The debug overlay shows FPS, `renderer.info.memory.geometries`, `renderer.info.memory.textures`, `renderer.info.programs.length`, draw calls, pool usage, and, in Chrome, `performance.memory.usedJSHeapSize`.
- Run the Finale preset for 10 minutes. Geometry, texture, and program counts stay flat after warm-up. The JS heap saws up and down but doesn't trend upward. DevTools heap snapshots at minute 1 and minute 10 show no growing object counts.
- A dev shortcut (for example Shift+R) destroys and recreates the app. After 20 cycles, every count is back to its startup value.

## Performance targets

- 60 fps on a recent laptop, 30 or better on a mid-range phone.
- Device pixel ratio capped at 1.5 on phones and 2 on desktop.
- Auto quality: measure frame time over the first 2 seconds and drop a tier if it averages over about 20 ms.

## Build order

One step per Claude Code turn. Small steps are deliberate: the one-shot attempt is what failed.

1. Skeleton: `index.html`, importmap, renderer, camera, controls, loop, resize, visibility pause, `destroy()`, debug overlay.
2. Sky (dusk and night) and tone mapping.
3. Ocean: Gerstner shader, shoaling, foam.
4. Beach: shared height function, sand, wet band, glints.
5. Fireworks engine: pool, analytic shader, peony only, auto-launch.
6. Trails and the remaining burst types.
7. Bloom and quality tiers.
8. Panel: every control, presets, JSON copy/paste, hero mode.
9. Firework light on the water and sand.
10. Optional: sound, shape and logo bursts, drifting smoke lit by later bursts.
11. Leak test and performance pass on a laptop and a real phone.
12. Host it (GitHub Pages, Cloudflare Pages, or a claude.ai artifact) and put the link in `outreach-emails.md`.

## Done means

- Loads in under 3 seconds and looks good with no clicks; first burst within about a second.
- Every control works live.
- The leak test passes.
- The performance targets hold.
- Hero mode looks like a real website header.

## Open decisions for Daniel

Defaults were chosen so the build could go ahead; each is one setting to change.

- **Ocean or Great Lakes?** Both: the default is a sunset-facing ocean beach, and the Lake Michigan preset adds the pier, lighthouse, dune grass and calmer water.
- **Launch site default:** the offshore barge. Along the shore and tap-to-aim are in the panel.
- **Sound:** on after the first tap (`config.sound.enabled`).
- **Hosting:** the artifact now; GitHub Pages is the stable home once this branch is merged.

## Kickoff prompt for Claude Code

> Read HANDOFF.md and CLAUDE.md. Build step 1 of the build order only. Start a local server, give me the URL, and stop so I can check it in the browser.

After that: "Do step 2," and so on.
