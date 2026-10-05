# YouTube Live: handoff

For whoever picks this up next (a person or a new Claude session). Updated October 4, 2026.

## What this is

Daniel wants the SkyGreeting fireworks engine streaming live, ideally 24/7, with viewers controlling it from chat, paid moments for bigger effects, and a simple Windows package he can run from his PC. It must stay **separate from skygreeting.com**: it lives on the branch `claude/project-thread-z80id2`, and PR #1 is a draft marked *Do not merge*. Never merge it into `ccr-09268299-owgtnw`, the branch the site deploys from.

It was built for TikTok LIVE first. On October 4 TikTok flagged the stream as "unoriginal or reproduced content" and restricted it, and Daniel said to drop TikTok entirely ("don't even try to fix it") and pivot to YouTube Live. The TikTok source is gone from the tree (it's in git history before the YouTube commit if ever needed).

## Where things are

| Path | What |
|---|---|
| `live/server.mjs` | the bridge: serves the site, the SSE feed (`/live/events`), the control panel and its API (`/live/api/*`), and manages the chat source |
| `live/sources/youtube.mjs` | youtubei.js adapter: finds the channel's live stream from its `/live` page, joins the chat, reads likes and viewers from the stream's metadata, waits for the next stream when one ends |
| `live/sources/youtube-fields.mjs` | pure readers: chat items to events, money strings to US cents (rough rate table), channel and video links, `1.2K` counts; tested in `youtube-fields.test.mjs` |
| `live/sources/sim.mjs` | the pretend audience (chat, Super Chats with and without commands, members, like totals) |
| `live/rules.mjs` | all game logic, pure and tested: commands, cooldowns, Super Chat tiers, likes goals, leaderboard, the paid sky queue, moderation |
| `live/settings.mjs` | the numbers, in US cents |
| `live/admin.html` | the control panel (plain HTML; polls `/live/api/state` every second) |
| `live/windows/` | the `.bat` launcher and `READ ME FIRST.txt` for the zip |
| `tools/package-live.sh` | builds `dist/SkyGreeting-LIVE.zip` with Node v22.23.3 for Windows (checksum-verified) |
| `src/live.js` | the stream page (`?live=1`, `&tall=1` for 9:16): turns actions into shells, text and ground shows from a fixed cue ring |
| `src/live-director.js` | the auto-director: look rotation, clock shows with countdowns, chat prompts |
| `src/live-overlay.js`, `src/live.css` | the overlay: plug line, commands and prices always on screen, feed, top spenders, likes bar, queue count, banner |
| `src/live-catalog.js` | the vocabulary both sides share (colours, shapes, occasion words, `!sky` words) |

## Engine changes (small, on this branch only)

- `fireworks.launchAt(type, x, h, palette)` takes an optional palette.
- `link.js` treats `live=1` as an embed with sound.
- `audio.js` resumes a context that was created before any gesture.
- `main.js` adds `live` to `MODULES`, and `index.html` preloads the live modules and skips Analytics on `live=1`.

## Decisions Daniel made

- Drop TikTok, use YouTube Live (October 4).
- Keep it all off the .com.
- Chat commands are free; words in the sky are paid. On TikTok that was a 99💎 gift (about $1). On YouTube I set it to a **$2 Super Chat** (YouTube's smallest Super Chat is $1); it's one number in the panel.
- "Yes to social plugs, jokes, personality, and some edge. Keep the engine, use the queue for context, and moderate harmful behavior, not whether someone's message is tasteful."
- Show the chat commands on screen at all times.
- Paid words launch completely alone with a clear sky (ground shows allowed), so they can be read. `src/live.js` holds aerial shells and the random show while words are queued or up (`hold()` / `release()` and `stepWords()`).
- No big title on the stream. The overlay sits on the sand; the "For X from Y" banner sits at the top, off the ground show.
- A "zip for dummies" with a GUI to start, stop and moderate, run from his PC: the zip plus the control panel.

## Auto-director

Daniel's worry: a quiet chat makes a repetitive stream, and YouTube flags repetitive content. `src/live-director.js` (on by default; `director=0` or the panel checkbox turns it off) rotates the look every 15 minutes with a sky ease and banner, plays a 10-second countdown and a mini show at :00/:20/:40 (a grand finale on the hour, waiting for any paid words first), and posts a command prompt in the feed every 2 minutes when chat is quiet. Tested headless with a shifted clock (countdown, mini show, look change, prompt all fired). Royalty-free background music is fine but doesn't address the repetition rule; the variety does.

## Defaults I picked for YouTube

- **16:9 by default** (normal YouTube live, TVs and desktops), with Tall 9:16 as a panel option for vertical live. In 16:9 the overlay is in the bottom-left corner and shells burst lower (`LIFT` in `live.js`) because the frame shows less sky.
- **youtubei.js** (unofficial, maintained, no key, no quota) rather than the YouTube Data API, whose 10,000-unit daily quota can't poll chat 24/7.
- Super Chat tiers: $1 ground show, $2 name, $5 barrage, $20 name plus finale. New members and milestones count as $2 (name in the sky); gifted memberships as $2 each (barrage).
- A Super Chat whose message is a words command (`!sky hi`) pays for those words and doesn't also spell the sender's name.
- Likes come from the stream's like button count (YouTube has no per-like events); the finale fires every 1,000.
- Dedications wait for **Play** (`manual`); the panel switches them to auto. The control panel binds to 127.0.0.1 only and has no login.

## Status

- **Done and tested in simulation:** everything above (13 tests; both shapes screenshotted headless with a clean console). The zip is in the project files (`tiktok-live/SkyGreeting-LIVE.zip`, the folder name is historical) and is rebuilt by `tools/package-live.sh`.
- **Not verified:** a real YouTube chat (this sandbox can't reach youtube.com), the `.bat` on real Windows, OBS capture, and real-GPU look and frame rate. If chat doesn't arrive, run with `LIVE_DEBUG=1` and read the "raw" lines; the likely fix is a newer `youtubei.js`.
- **Cloudflare:** the `Workers Builds: techdemo` check fails on this branch's preview builds. It doesn't affect the site. Daniel can turn off non-production branch builds in Cloudflare.

## Ideas not built yet

Team battles (`!orange` vs `!purple`), a Halloween boss that chat shoots fireworks at, and a night-sky default for the stream.

## How to check your work

- `cd live && npm test`
- `npm run check` from the root (the site's leak test)
- `node live/server.mjs --sim`, then open `http://localhost:8787/?live=1` (and `&tall=1`) and `/live/admin`.
- Headless Chromium runs the scene about 10× slower than real time (about 1 fps), so a paid-words run takes several minutes before the words go up.
