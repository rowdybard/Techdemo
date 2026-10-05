# SkyGreeting on YouTube Live

Viewers run the fireworks from chat. A small local server (`live/server.mjs`) reads your YouTube live chat through [youtubei.js](https://github.com/LuanRT/YouTube.js), with no API key and no quota. It also serves a stream page (`/?live=1`) that turns what viewers do into the show, framed 16:9 (or 9:16) with an overlay, and a control panel (`/live/admin`) where you connect, moderate and change settings. OBS sends the stream page to YouTube.

This lives on its own branch (`claude/project-thread-z80id2`) and never goes to skygreeting.com. `live/HANDOFF.md` has the full state of the work. It started on TikTok LIVE; TikTok restricted the account for "unoriginal or reproduced content", so it moved to YouTube on October 4, 2026.

## Easiest: the Windows zip

`SkyGreeting-LIVE.zip` carries everything, including its own Node, so nothing needs installing. Unzip it, double-click **Start SkyGreeting LIVE.bat**, and the control panel opens in your browser. `READ ME FIRST.txt` inside walks through it. To rebuild the zip, run `tools/package-live.sh` from the repo root; it writes `dist/SkyGreeting-LIVE.zip`.

## From the repo (any OS, Node 20+)

```
cd live
npm install
npm start          # then open http://localhost:8787 (the control panel)
npm run sim        # or start with pretend viewers
npm test           # the rules' and the chat reader's tests
```

## Going live

1. In OBS, add a **Browser** source with the stream link from the control panel, at 1920×1080 (or 1080×1920 for Tall), and tick **Control audio via OBS**.
2. In YouTube Studio, **Create → Go live → Stream**, copy the stream key into OBS (**Settings → Stream**, service YouTube), and start streaming.
3. On the control panel, type your channel's `@handle` and press **Connect**. It waits until the channel is live, joins that stream's chat, and after a stream ends looks for the next one, so a 24/7 stream that YouTube restarts keeps working. A live video's link joins just that stream.

## The control panel

- **Connect:** your `@handle`, a channel link, or a live video link. **Practice with pretend viewers** runs the simulator instead.
- **Put the show on stream:** pick a look (preset), the shape (Wide 16:9 or Tall 9:16) and a plug line (for example "Subscribe for 24/7 fireworks"), then copy the link into OBS or **Open the stream window** to preview it.
- **Sky queue:** Play or Skip each dedication and `!sky` message. Each one shows what the viewer actually typed and how much they've spent. Big spenders are listed first.
- **Recent viewers:** Ban anyone. A banned viewer's chat does nothing; their Super Chats still count.
- **Pause chat:** chat commands stop until you resume. Super Chats and likes still count.
- **Settings:** whether words in the sky wait for you or play by themselves, the Super Chat they need (in dollars), the cooldown between a viewer's launches, and likes per finale.
- **Test the show:** send chat as a tester (it skips the payment needed for words) and fire any Super Chat, a new member, likes or the finale.
- **Stop SkyGreeting LIVE** shuts the server down.

The panel's choices are saved in `live/config.json`, which isn't in git.

## The auto-director

With few people chatting, the stream would look like the same loop, so the page directs itself (`src/live-director.js`). It is on by default; untick it in the control panel, or add `director=0` to the link.

- **Looks:** every 15 minutes it eases to another look (Classic sunset, Gold willows, Neon night, Calm evening, plus Red-white-and-blue in June and July and Halloween in September to November), with a banner naming it. `looks=30` changes the gap, `looks=0` never changes.
- **Clock shows:** at :00, :20 and :40 on the clock a 10-second countdown ("Mini show, starting in 10") plays, then a barrage and ground show, or a grand finale on the hour. It waits for any words in the sky to finish first. `shows=0` turns them off.
- **Chat prompts:** every 2 minutes, if nobody has chatted for 40 seconds, a line in the feed suggests a command (`!heart`, `!pink heart`, `!sky HELLO`).

## What viewers can do

The commands are always on screen, in the bottom-left corner on the sand (Wide) or across the water and sand (Tall), so the sky and the ground show stay clear.

Words in the sky are paid for, so they always go up alone. When one is next, the random show stops and viewers' shells wait. The words launch once every shell already up has faded, after a 3-2-1 countdown, with a ground show allowed underneath. When they've faded, the occasion's shells (or rings and willows) go up, then the waiting shells. A paying viewer's name goes through the same queue without needing approval.

| Viewers do | Costs | The sky does |
|---|---|---|
| `!heart`, `!star`, `!ring`, `!willow`, `!palm`, `!crackle`, `!strobe`, `!boom`, `!mum` | free | that shell, with their name in the feed |
| a colour, alone or mixed: `!purple`, `!pink heart`, `!blue ring` | free | a shell in that colour |
| `!pumpkin`, `!ghost`, `!bat`, `!skull` | free | the Halloween shapes |
| `!chaos` | free | six random shells at once |
| every 1,000 likes on the stream | free | the grand finale |
| `!birthday Maya`, `!love Sam`, `!congrats Jo`, `!thanks Mom`, `!halloween Ash` | a $2+ Super Chat | once approved: a 3-2-1 countdown, then that occasion's ending with the name in the sky |
| `!sky YOUR WORDS` | a $2+ Super Chat | their own words in the sky (24 characters): jokes, plugs, anything that isn't harmful |
| a $1+ Super Chat or Super Sticker | paid | the ground show (at most one every 12 s) and gold willows |
| a $2+ Super Chat, or joining as a member | paid | their name spelled in the sky |
| a $5+ Super Chat, or gifting memberships | paid | a fan of twelve shells |
| a $20+ Super Chat | paid | their name, then the grand finale |

- **Paying for words:** the simplest way is a $2 Super Chat whose message is the command (`!sky hi mom`); that Super Chat pays for the words instead of also spelling their name. Super Chats in the last 10 minutes add up, and each request uses up $2. If someone asks first, their request waits and goes in when the Super Chat arrives.
- **Money** is counted in US cents (`settings.mjs`). Other currencies go through a rough rate table in `sources/youtube-fields.mjs`.
- **Fair play:** each viewer can launch once every 6 seconds, and chat as a whole is capped at 4 shells a second.
- **Moderation stops harm, not taste:** the word filter (`src/moderate.js`) blocks slurs, hate, sexual terms and threats, and lets jokes, plugs and swearing through. Names that fail it fall back to "someone".

All the numbers live in `live/settings.mjs`.

## Environment variables (optional)

| Variable | What it does |
|---|---|
| `YOUTUBE_CHANNEL` | join this channel (or video link) at start, instead of the saved one |
| `DEDICATIONS=auto` | words in the sky play by themselves |
| `PORT` | default 8787 |
| `LIVE_DEBUG=1` | prints the first few raw chat items, to check how YouTube sends Super Chats and memberships |
| `SIM_RATE` | how busy the pretend audience is (default 1) |

Stream page link options: `tall=1` (9:16), `preset=Halloween`, `plug=Subscribe!`, `volume=0.5` (default 0.7), `sound=0`, `sides=1` (the site's side barges, off on stream), `smoke=0.12` (the site's smoke; the stream uses 0.05).

The server only listens on this computer (127.0.0.1), because the control panel has no login. Don't expose it to the internet.

## What's been tested, and what hasn't

- **Tested** (headless Chromium with software rendering, Linux): the rules and the chat reader (13 tests), the server and control panel in simulator mode, the stream page in both shapes with a clean console, and the site's own leak check (`npm run check`).
- **Not tested here:** a real YouTube live chat (the build machine can't reach youtube.com), the `.bat` file on real Windows, OBS capture, and frame rate on a real GPU. youtubei.js reads YouTube's own web API, which YouTube changes now and then; if chat stops arriving, update `youtubei.js` in `live/package.json` and rebuild the zip.
- **YouTube's rules:** a 24/7 stream must follow YouTube's policies. To earn from it (Super Chats need the YouTube Partner Program), YouTube looks for original content, not repetitive or reused content; the chat-driven show, the dedications and the presets help it change from minute to minute.
