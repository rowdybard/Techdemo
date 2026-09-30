# Beach Fireworks: Handoff

Handoff from a Claude chat session to Claude Code · Wednesday, September 30, 2026

## Status

- **Steps 1 to 11 of the build order are built** (September 30, 2026), with the parts of step 11 that can be done without real devices. Step 12 is ready except for the public link, which Daniel has to switch on (see below). three.js is pinned to 0.186.1 and lil-gui to 0.21.0.
- **Files beyond the original layout:** `src/glsl.js` (noise and the sky gradient that water and sand reflect), `src/ocean.glsl.js`, `src/particles.js` (the pool), `src/shells.js` (a whole shell written at launch), `src/bursts.js` and `src/shapes.js` (burst types), `src/burstlights.js` (firework light), `src/presets.js`, `src/hero.js`. Every file is under 300 lines.
- **Sky** is a custom twilight shader instead of three's `Sky.js`, whose physical model goes almost black once the sun is below the horizon. It draws an afterglow toward the sunset (over the water, 18° right of straight ahead, as on a west-facing Lake Michigan beach), a blue-hour gradient, cloud wisps and twinkling stars.
- **World layout** (in `src/config.js`): +Y is up, the sea lies toward −Z, and the resting waterline wanders a few metres either side of z = 0. The camera stands about 1.7 m above the sand, 16 m up the beach; the barge sits 380 m offshore so bursts land in the upper half of the frame.
- **Shore:** the swash (`swashLevel` in `terrain.glsl.js`) runs up the sand and drains on a cycle that drifts along the beach. The ocean fades to zero alpha as the water thins, the beach darkens where the surge has been, and freshly soaked sand mirrors the sky and the bursts.
- **Fireworks:** one pool of 60,000 particles (20,000 on phones), one draw call. Launching writes the whole shell at once (the rocket, the sparks it sheds, the burst, and later events such as crossette splits, crackle pops and second breaks) with later birth times, placed with the same closed-form motion the shader uses. Three shells are already climbing at load, so the first burst lands within about a second. Types: peony, chrysanthemum, willow, palm, ring, crossette, strobe, crackle, multi-break, heart, star and text.
- **Firework light:** the eight brightest live bursts go to the ocean and beach as uniform arrays. On the water they make long glittering streaks; on the sand, a soft flash, lit glints, and reflections in the wet band.
- **Post and quality:** RenderPass → UnrealBloomPass (threshold 1) → OutputPass with ACES tone mapping. Tiers set the pixel-ratio cap, MSAA and bloom resolution; auto quality steps down after two seconds of frames slower than 20 ms. Sparks brighten over their first 0.4 s, so a fresh burst doesn't bloom into a white blot.
- **Panel and hero mode:** every control in the spec, six presets, JSON copy and paste (only known keys with matching types are accepted), and the last setup remembered in localStorage. Hero mode shows a sample header for an invented marina; `#hero` on the link opens in it, `#debug` shows the stats overlay, which is hidden by default.
- **Sound:** synthesised booms delayed by distance over the speed of sound, and crackle. It starts after the first tap. One AudioContext serves the page across rebuilds and closes on pagehide. This departs from no-leak rule 7 on purpose: the heap diff showed Chromium keeps closed AudioContexts alive, so closing and recreating one per rebuild leaked.
- **Drag** orbits a point over the water within each camera preset's limits (sand, drone, water level). Zoom and pan are off.
- **Checks:** `npm run check` reports console problems and overlay counts, saves desktop and phone screenshots to `.check/`, and runs 20 Shift+R rebuilds after 5 warm-ups. `--soak 600` adds 10 minutes of the Finale preset. Latest result: clean console; 22 draw calls, 8 geometries, 13 textures, 14 programs with bloom; canvases, listeners, DOM nodes and every overlay count back at their startup values after the rebuilds. Heap snapshot diffs over 50 rebuilds show no app objects growing, only V8 compiled code and Chromium's capped performance buffers.
- **Not yet measured:** frame rates on a real laptop and phone. The checks here use software WebGL. Expensive shader work is already skipped where it can't show (foam noise only where foam can form, ripples only up close), and auto quality steps down on slow devices.
- **Not built:** drifting smoke lit by later bursts, and logo bursts from an image (text bursts work).
- **Preview:** a private claude.ai artifact at https://claude.ai/artifact/8ZMbARoMcnBrAmYGb5tQ1j. The artifact host adds its own `<html>`, `<head>` and `<body>`, so publish a copy of `index.html` without them, plus every file in `src/`.
- **Lake Michigan preset** (`src/landmarks.js`): a pier out to a red lighthouse with a blinking lamp and a sweeping beam, dune grass framing the foreground, and calmer waves. The lamp takes the dimmest firework-light slot, so it throws its own streak across the water. Pier and grass are panel toggles, shown by flipping visibility.
- **Cloudflare:** `wrangler.jsonc` and `npm run deploy` are ready (a static-assets Worker, `beach-fireworks`). The account connector here is read-only, so deploying needs `CLOUDFLARE_API_TOKEN` (Workers Scripts: Edit) and `CLOUDFLARE_ACCOUNT_ID` in the environment; a dry run passes.
- **To go public (Daniel):** add the Cloudflare token and run `npm run deploy`, or share the artifact publicly from its Share menu, or enable GitHub Pages (steps in `README.md`). The outreach emails carry the artifact link with `#hero`; swap in the Cloudflare URL once it's live.

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
