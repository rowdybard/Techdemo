# SkyGreeting on TikTok LIVE

Viewers run the fireworks from chat. A small local server (`live/server.mjs`) listens to your TikTok LIVE through [TikTok-Live-Connector](https://github.com/zerodytrash/TikTok-Live-Connector). It also serves a stream page (`/?live=1`) that turns what viewers do into the show, framed 9:16 with an overlay, and a control panel (`/live/admin`) where you connect, moderate and change settings.

This lives on its own branch (`claude/project-thread-z80id2`) and never goes to skygreeting.com. `live/HANDOFF.md` has the full state of the work.

## Easiest: the Windows zip

`SkyGreeting-LIVE.zip` carries everything, including its own Node, so nothing needs installing. Unzip it, double-click **Start SkyGreeting LIVE.bat**, and the control panel opens in your browser. `READ ME FIRST.txt` inside walks through it. To rebuild the zip, run `tools/package-live.sh` from the repo root; it writes `dist/SkyGreeting-LIVE.zip`.

## From the repo (any OS, Node 20+)

```
cd live
npm install
npm start          # then open http://localhost:8787 (the control panel)
npm run sim        # or start with pretend viewers
npm test           # the rules' tests
```

## The control panel

- **Connect:** type your TikTok username and press Connect. It waits if you aren't live yet, reconnects if the connection drops, and can reconnect by itself next time you start it. **Practice with pretend viewers** runs the simulator instead.
- **Put the show on stream:** pick a look (preset) and a line under the title (for example "Follow @you"), then **Open the stream window**. In TikTok LIVE Studio, add a *Window capture* of that window. In OBS, add a *Browser* source with the link shown, at 1080×1920. Click the stream window once to start its sound (OBS plays it without a click).
- **Sky queue:** Play or Skip each dedication and `!sky` message. Each one shows what the viewer actually typed and how much they've gifted. Gifters are listed first.
- **Recent viewers:** Ban anyone. A banned viewer's chat does nothing; their gifts still count.
- **Pause chat:** chat commands stop until you resume. Gifts and likes still count.
- **Settings:** whether words in the sky wait for you or play by themselves, the gift they need, the cooldown between a viewer's launches, and likes per finale.
- **Test the show:** send chat as a tester (it skips the gift needed for words) and fire any gift, likes or the finale.
- **Stop SkyGreeting LIVE** shuts the server down.

The panel's choices are saved in `live/config.json`, which isn't in git.

## What viewers can do

The commands are always on screen. The overlay sits low on the water and sand, so the sky and the ground show stay clear.

Words in the sky are paid for, so they always go up alone. When one is next, the random show stops and viewers' shells wait. The words launch once every shell already up has faded, after a 3-2-1 countdown, with a ground show allowed underneath. When they've faded, the occasion's shells (or rings and willows) go up, then the waiting shells. A gifter's name (Hand Hearts, Galaxy) goes through the same queue without needing approval.

| Viewers do | Costs | The sky does |
|---|---|---|
| `!heart`, `!star`, `!ring`, `!willow`, `!palm`, `!crackle`, `!strobe`, `!boom`, `!mum` | free | that shell, with their name in the feed |
| a colour, alone or mixed: `!purple`, `!pink heart`, `!blue ring` | free | a shell in that colour |
| `!pumpkin`, `!ghost`, `!bat`, `!skull` | free | the Halloween shapes |
| `!chaos` | free | six random shells at once |
| follow | free | a gold willow and a shout-out |
| every 1,000 likes (room total) | free | the grand finale |
| `!birthday Maya`, `!love Sam`, `!congrats Jo`, `!thanks Mom`, `!halloween Ash` | a 99💎+ gift | once approved: a 3-2-1 countdown, then that occasion's Deluxe ending with the name in the sky |
| `!sky YOUR WORDS` | a 99💎+ gift | their own words in the sky (24 characters): jokes, plugs, anything that isn't harmful |
| Rose | gift | a red bloom per rose |
| Finger Heart, Heart Me | gift | a pink heart per gift |
| Doughnut, Perfume, any 10💎+ gift | gift | the ground show (at most one every 12 s) and gold willows |
| Hand Hearts, any 99💎+ gift | gift | their name spelled in the sky |
| Confetti, Money Gun, any 299💎+ gift | gift | a fan of twelve shells |
| Galaxy, any 1000💎+ gift | gift | their name, then the grand finale |

- **Paying for words:** "a 99💎+ gift" means gifts adding up to 99💎 in the last 10 minutes, such as one Hand Hearts or 99 Roses. Each request uses that up. If someone asks first, their request waits and goes in when the gift arrives.
- **Fair play:** each viewer can launch once every 6 seconds, and chat as a whole is capped at 4 shells a second.
- **Moderation stops harm, not taste:** the word filter (`src/moderate.js`) blocks slurs, hate, sexual terms and threats, and lets jokes, plugs and swearing through. Names that fail it fall back to the @handle, then "someone".

All the numbers live in `live/settings.mjs`. Gift names are matched in lower case there.

## Environment variables (optional)

| Variable | What it does |
|---|---|
| `TIKTOK_USERNAME` | connect to this account at start, instead of the saved one |
| `DEDICATIONS=auto` | words in the sky play by themselves |
| `EULER_API_KEY` | key from eulerstream.com; the connector signs its connection through Euler Stream's free tier, and a key raises its rate limits. The bridge only uses the free tier's calls; "requires a Business plan" means something asked for a paid one |
| `PORT` | default 8787 |
| `LIVE_DEBUG=1` | prints the first few raw chat, gift and like events, to check TikTok's field names, gift names and prices |
| `SIM_RATE` | how busy the pretend audience is (default 1) |

Stream page link options: `preset=Halloween`, `plug=Follow @you`, `volume=0.5` (default 0.7), `sound=0`, `sides=1` (the site's side barges, off on stream), `smoke=0.12` (the site's smoke; the stream uses 0.05).

The server only listens on this computer (127.0.0.1), because the control panel has no login. Don't expose it to the internet.

## What's been tested, and what hasn't

- **Tested** (headless Chromium with software rendering, Linux): the rules (10 tests), the server and control panel in simulator mode, the packaged folder starting and serving everything, the stream page showing names, dedications, `!sky` messages, hearts and the overlay with a clean console, and the site's own leak check (`npm run check`).
- **Not tested here:** a real TikTok LIVE connection (the build machine can't reach TikTok), the `.bat` file on real Windows, capture in LIVE Studio or OBS, and frame rate on a real GPU. Software rendering also exaggerates the fountains' glow and haze.
- **Event fields:** TikTok-Live-Connector 2.5 sends TikTok's raw messages, whose field names differ from its own README (chat `content`, like `count`/`total`, `gift.name`, `user.displayId`). `live/sources/tiktok-fields.mjs` reads both and has its own tests. Each like batch shows in the control panel's log with the room total.
- **Gift fields:** TikTok has changed its gift fields before. If a gift sets off the wrong effect, run with `LIVE_DEBUG=1` and fix the name in `live/settings.mjs`. Gifts not named there fall back to their diamond value.
- TikTok's rules on unattended or looping LIVE content apply to a 24/7 stream.
