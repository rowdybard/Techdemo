# Beach Fireworks

Real-time Three.js beach scene with a fully customizable firework show, built as a sales demo. The full spec, architecture and build order are in `HANDOFF.md`. Read it before changing anything.

## Working rules

- Do one step of the HANDOFF build order per turn, then stop and say how to view it.
- Keep files small (under about 400 lines). Split a file before it gets big. Never try to write the whole scene in one go.
- No build step: ES modules and an importmap. Pin three.js and lil-gui to exact versions from cdn.jsdelivr.net/npm.
- Everything procedural. No textures, models or fonts fetched at runtime.
- Every module exports `create(ctx)` returning `{ update(dt, time), dispose() }`.
- Follow the No-leak rules in HANDOFF.md on every change. Nothing in the render loop allocates. Panel toggles change uniforms, not shader defines.
- After each step: serve locally (`npx serve .` or `python3 -m http.server`), confirm the console is clean, and report the debug overlay's `renderer.info` counts. `npm run check` does this headlessly and also runs the Shift+R rebuild test.
- In a cloud session the user can't open localhost. Republish the preview artifact named in HANDOFF.md's Status section instead.
