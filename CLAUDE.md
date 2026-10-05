# Beach Fireworks

Real-time Three.js beach scene with a fully customizable firework show, built as a sales demo. The full spec, architecture and build order are in `HANDOFF.md`. Read it before changing anything. `SESSION-HANDOFF.md` is the short current-state summary (what's live, open items, gotchas): read that first.

## Working rules

- Build in the HANDOFF order, one step at a time: finish, check, commit and push each step before starting the next. The user asked for the steps to flow without stopping for approval between them.
- Keep files small (under about 400 lines). Split a file before it gets big. Never try to write the whole scene in one go.
- No build step: ES modules and an importmap. three.js and lil-gui are exact versions copied from cdn.jsdelivr.net/npm into `vendor/<name>-<version>/` and served from the site itself (one connection, a year's cache). Upgrading means copying the new version's files in and changing the paths.
- Everything procedural. No textures, models or fonts fetched at runtime.
- Every module exports `create(ctx)` returning `{ update(dt, time), dispose() }`.
- Follow the No-leak rules in HANDOFF.md on every change. Nothing in the render loop allocates. Panel toggles change uniforms, not shader defines.
- After each step: serve locally (`npx serve .` or `python3 -m http.server`), confirm the console is clean, and report the debug overlay's `renderer.info` counts. `npm run check` does this headlessly and also runs the Shift+R rebuild test.
- In a cloud session the user can't open localhost. Republish the preview artifact named in HANDOFF.md's Status section instead.
