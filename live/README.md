# SkyGreeting on TikTok LIVE

Viewers run the fireworks from chat. A small local server (`live/server.mjs`) listens to your TikTok LIVE with [TikTok-Live-Connector](https://github.com/zerodytrash/TikTok-Live-Connector), and the stream page (`/?live=1`) turns what viewers do into the show, framed 9:16 with an overlay.

| Viewers do | The sky does |
|---|---|
| `!heart`, `!star`, `!ring`, `!willow`, `!palm`, `!crackle`, `!strobe`, `!boom`, `!mum` | that shell, with their name in the feed |
| `!purple`, `!red`, `!gold`, `!pink`, `!blue`, `!green`, … (or mixed: `!pink heart`) | a shell in that colour |
| `!pumpkin`, `!ghost`, `!bat`, `!skull` | the Halloween shapes |
| `!chaos` | six random shells at once |
| `!birthday Maya`, `!love Sam`, `!congrats Jo`, `!thanks Mom`, `!halloween Ash` (**needs a 99💎+ gift**) | a dedication: once approved, a 3-2-1 countdown, then that occasion's full Deluxe ending with the name in the sky |
| `!sky YOUR WORDS` (**needs a 99💎+ gift**) | their own words in the sky, up to 24 characters: jokes, plugs, anything that isn't harmful |
| Rose | a red bloom per rose |
| Finger Heart, Heart Me | a pink heart per gift |
| Doughnut, Perfume, any 10+ 💎 gift | the ground show and gold willows |
| Hand Hearts, any 99+ 💎 gift | **their name spelled in the sky** |
| Confetti, Money Gun, any 299+ 💎 gift | a fan of twelve shells |
| Galaxy, any 1000+ 💎 gift | their name, then the grand finale |
| Follow | a gold willow and a shout-out |
| Every 1,000 likes | the grand finale |

**Free:** chat shells, colours, `!chaos`, follows and the likes finale. **Paid:** everything with words in it. A dedication or `!sky` message needs a gift worth 99💎 or more (one Hand Hearts, or 99 Roses) in the last 10 minutes, and each one uses that up. If someone asks first, their request waits and goes in when the gift arrives. The commands are always on screen.

Each viewer can launch once every 6 seconds and chat as a whole is capped at 4 shells a second, so the sky stays readable. Gifters go on the Top fans board and jump the queue. Moderation stops harm, not taste: the word filter blocks slurs, hate, sexual terms and threats, and lets jokes, plugs and swearing through. The control page shows what each viewer actually typed, for context. All of this is in `live/settings.mjs`.

## Go live

You need Node 20 or newer.

**1. Install, once:**

```
cd live
npm install
```

**2. Try it with a pretend audience first** (no TikTok needed):

```
npm run sim
```

Open http://localhost:8787/?live=1 (the stream) and http://localhost:8787/live/admin (your control page). Fake viewers chat and send gifts every second or two. On the control page you can send chat as a tester, fire any gift, and approve dedications.

**3. Start your LIVE, then connect it:**

Mac or Linux:
```
TIKTOK_USERNAME=yourname npm start
```
Windows (PowerShell):
```
$env:TIKTOK_USERNAME="yourname"; npm start
```

Use your @handle without the @. If you start the server before you're live it waits and connects as soon as you are, and it reconnects by itself if the connection drops. The control page's dot goes green when it's connected.

**4. Put the stream page into your LIVE.** Either way, add `&preset=Halloween` (or any preset name) to the link to change the look.

- **TikTok LIVE Studio:** open the page as its own window, `chrome --app="http://localhost:8787/?live=1&preset=Halloween"` (or just a browser tab), set Live Studio to a portrait canvas, and add a **Window capture** of that window. A wide window is fine: the page frames the show 9:16 in the middle with black either side, so crop to it. Click the page once to turn the sound on, and let Live Studio capture desktop audio.
- **OBS** (best for running all day, if your account has a stream key): set the canvas to 1080×1920, add a **Browser** source at `http://localhost:8787/?live=1` sized 1080×1920 with "Control audio via OBS" on, and stream to the server URL and key from TikTok LIVE Studio → *Stream key* (or LIVE Center). OBS plays sound without a click.

## Settings

| Variable | What it does |
|---|---|
| `TIKTOK_USERNAME` | your handle. Without it the server runs the simulator. |
| `DEDICATIONS=auto` | dedications and messages play as soon as they pass the word filter, for unattended runs. Default: they wait for **Play** on the control page. You can switch this on the control page too. |
| `EULER_API_KEY` | optional key from eulerstream.com. The connector signs its connection through Euler Stream's free tier; a key raises its rate limits if connections start failing. |
| `PORT` | default 8787. |
| `LIVE_DEBUG=1` | prints every chat line and the first few raw gift events, to check gift names and prices. |
| `SIM_RATE` | how busy the simulator is (default 1). |

Stream page link options: `preset=Halloween`, `plug=Follow @you` (a line under the title), `volume=0.5` (default 0.7), `sound=0`.

The server only listens on this computer (127.0.0.1), because the control page has no login. Don't expose it to the internet.

## What's been tested, and what hasn't

- **Tested** (headless, software rendering): the rules (`npm test` in `live/`), the server in simulator mode, the stream page receiving events, names and dedications spelled in the sky, the 9:16 framing, and the site's own leak check.
- **Not yet tested against a real LIVE:** the connector's gift fields. TikTok has changed them before; if a gift launches the wrong effect, run with `LIVE_DEBUG=1` and adjust the name in `live/settings.mjs`. Tiers by diamond value cover gifts not named there.
- **Not tested on a real GPU or in OBS / Live Studio** from here. The show itself is the site's own engine, so it should look like skygreeting.com does on your machine.
- TikTok's rules on unattended or looping LIVE content apply to a 24/7 stream. Being around for chat, or rotating presets, keeps it looking like a live show.
