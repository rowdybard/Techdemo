# Agent instructions

Read **`MASTER-HANDOFF.md`** first: it's the complete guide to this project (product, architecture, deploying, testing, recipes, gotchas, the owner's preferences and open work). `SESSION-HANDOFF.md` and `HANDOFF.md` hold more detail.

The rules that matter most:

- No build step: ES modules and an import map; libraries are vendored in `vendor/<name>-<version>/` (never `@` in a path). Everything procedural.
- Every scene module exports `create(ctx)` returning `{ update(dt, time), dispose() }`; nothing allocates in the render loop; files stay under about 400 lines; every new `src/*.js` needs a `modulepreload` link in `index.html`.
- Run `npm run check` (alone, nothing else rendering) before every commit; it must print PASS.
- `ccr-09268299-owgtnw` is the live branch: pushing to it deploys skygreeting.com in about 30 s. Work on your own branch and only fast-forward the live branch when the owner says "merge". Don't open pull requests unless asked.
- Never put Stripe secret keys (`sk_`, `whsec_`) in files, commits or chat; never ask the owner for secrets.
- The owner isn't a developer: answer in plain, short language and say plainly what you couldn't verify.
