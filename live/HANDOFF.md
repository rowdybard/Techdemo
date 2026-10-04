# TikTok LIVE: handoff

For whoever picks this up next (a person or a new Claude session). Written October 4, 2026.

## What this is

Daniel wants the SkyGreeting fireworks engine streaming on TikTok LIVE, ideally 24/7, with viewers controlling it from chat, gifts paying for bigger moments, and a simple Windows package he can run from his PC. It must stay **separate from skygreeting.com**: it lives on the branch `claude/project-thread-z80id2`, and PR #1 is a draft marked *Do not merge*. Never merge it into `ccr-09268299-owgtnw`, the branch the site deploys from.

## Where things are

| Path | What |
|---|---|
| `live/server.mjs` | the bridge: serves the site, the SSE feed (`/live/events`), the control panel and its API (`/live/api/*`), and manages the event source |
| `live/sources/tiktok.mjs` | TikTok-Live-Connector 2.5.0 adapter: waits until live, reconnects with backoff, normalizes chat, gift, like, follow and share events, and counts gift streaks once at the end |
| `live/sources/tiktok-fields.mjs` | reads the connector's event data. Connector 2.5 emits raw v3 protobuf fields (`content`, `count`/`total`, `gift.name`, `user.displayId`), not the names in its README; this reads both, tested in `tiktok-fields.test.mjs` |
| `live/sources/sim.mjs` | the pretend audience |
| `live/rules.mjs` | all game logic, pure and tested: commands, cooldowns, gift tiers, likes goals, leaderboard, the paid sky queue, moderation |
| `live/settings.mjs` | the numbers, and gift name → effect |
| `live/admin.html` | the control panel (plain HTML; polls `/live/api/state` every second) |
| `live/rules.test.mjs` | `npm test` in `live/` |
| `live/windows/` | the `.bat` launcher and `READ ME FIRST.txt` for the zip |
| `tools/package-live.sh` | builds `dist/SkyGreeting-LIVE.zip` with Node v22.23.3 for Windows (checksum-verified) |
| `src/live.js` | the stream page (`?live=1`): turns actions into shells, text, ground shows and director endings from a fixed cue ring |
| `src/live-overlay.js`, `src/live.css` | the overlay: title, plug line, commands always on screen, feed, top fans, likes bar, queue count, banner |
| `src/live-catalog.js` | the vocabulary both sides share (colours, shapes, occasion words, `!sky` words) |

## Engine changes (small, on this branch only)

- `fireworks.launchAt(type, x, h, palette)` takes an optional palette.
- `link.js` treats `live=1` as an embed with sound.
- `audio.js` resumes a context that was created before any gesture.
- `main.js` adds `live` to `MODULES`, and `index.html` preloads the live modules and skips Analytics on `live=1`.

## Decisions Daniel made

- Use TikTok-Live-Connector. He has Live Studio access and it has worked for him before.
- Keep it all off the .com.
- Chat commands are free. **Words in the sky (dedications and `!sky` messages) cost a 99💎+ gift** within 10 minutes. He said "yes" to that.
- "Yes to social plugs, jokes, personality, and some edge. Keep the engine, use the queue for context, and moderate harmful behavior, not whether someone's message is tasteful." So: `!sky` exists, the feed has some personality, the queue shows what each viewer typed, and only the harm filter applies.
- Show the chat commands on screen at all times.
 - Paid words must launch completely alone with a clear sky (ground shows allowed), so they can be read. `src/live.js` holds aerial shells and the random show while words are queued or up (`hold()` / `release()` and `stepWords()`). It no longer uses `director.js` for dedications: it launches the occasion's message and name itself, then plays the occasion's shells afterwards.
- No "SkyGreeting LIVE" title. The overlay sits on the water and sand below the ground show, and the "For X from Y" banner sits at the top, off the ground show.
- He wants a "zip for dummies" with a GUI to start, stop and moderate, run from his PC. That's the zip plus the control panel.

## Defaults I picked

- Dedications wait for **Play** (`manual`); the panel switches them to auto.
- The stream drops the side barges and uses lighter smoke (0.05). A gift ground show plays at most every 12 s.
- The like goal is 1,000; the per-viewer cooldown is 6 s; the chat cap is 4 shells a second.
- The control panel binds to 127.0.0.1 only and has no login.

## Status

- **Done and tested in simulation:** everything above. The commits are on the branch. The zip is in the project files (`tiktok-live/SkyGreeting-LIVE.zip`) and is rebuilt by `tools/package-live.sh`.
- **Not verified:** a real TikTok connection (the sandbox can't reach TikTok: "Failed to retrieve Room ID", which the server retries), the `.bat` on real Windows, LIVE Studio or OBS capture, and real-GPU look and frame rate.
- **Fixed October 4:** the first real connection failed with Euler Stream's "This endpoint requires a Business plan". The adapter had `enableExtendedGiftInfo: true`, whose signed gift-list request is paid-only; it's off now, so connecting uses only the free tier. Separately, Daniel's 25 likes didn't count, and the cause was wider: the adapter read the connector's README field names, which 2.5 no longer sends, so likes, chat text, gift names and streaks, and viewer handles were all misread on a real stream. Likes now also show in the panel's log, and keep counting while chat is paused. Daniel then saw no like events at all on a real stream, so the adapter also polls room info every 15 s for the room's like counter (`roomLikes` in tiktok-fields.mjs; the exact room-info field is a guess, and it logs the keys once if none matches). `LIVE_DEBUG=1` logs a tally of message types every 30 s.
- **Cloudflare:** the `Workers Builds: techdemo` check fails on this branch's preview builds. The log isn't visible from GitHub, and the same build passes locally with `wrangler deploy --dry-run`. It doesn't affect the site. Daniel can turn off non-production branch builds in Cloudflare.

## Ideas not built yet

From the original idea list: team battles (`!orange` vs `!purple` sides), and a Halloween boss that chat shoots fireworks at. A night-sky default for the stream might also make the fireworks pop more on phones.

## How to check your work

- `cd live && npm test`
- `npm run check` from the root (the site's leak test)
- `node live/server.mjs --sim`, then open `http://localhost:8787/?live=1` and `/live/admin`.
- Headless Chromium runs the scene about 10× slower than real time, so wait long enough before judging screenshots.
