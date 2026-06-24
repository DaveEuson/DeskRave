# Handoff: Pixel DJ — Desk Toy + Phone Companion

## Overview
**Pixel DJ** is an ambient "desk toy": a tiny 16-bit pixel-art nightclub that streams real
audio and makes the **DJ, lighting, and crowd react to the music** via a live FFT. A **phone
companion app** is the remote — you send media from your phone, name and dress your DJ, pick a
vibe, and recolor the club. It's a **career lifecycle**: you start at backyard/dorm parties with
a tiny crowd and level up to a resident club night and finally festival main stages with huge
crowds. An **after-hours Studio mode** shows the DJ alone at a DAW, lit by the monitor glow.

This is the design spec for the next build phase of the existing `pixel-rave` prototype
(`src/Visualizer.ts`, `src/AudioStream.ts`, `src/classifier.ts`). The reactive scene logic in
these mocks is a direct evolution of that `Visualizer`.

## About the Design Files
The files in this bundle are **design references created as HTML/Canvas** (Design Components) —
prototypes showing the intended look and behavior, **not production code to ship as-is**. The task
is to **recreate them in the target environment** (the existing `pixel-rave` Vite/TypeScript app,
or a framework of your choice) using its established patterns. The scene is drawn on a low-res
`<canvas>` (200px tall internal buffer) upscaled nearest-neighbor with an additive bloom pass; the
phone UI is plain DOM. Reproduce that rendering model — it's what makes the pixels crisp.

## Fidelity
**High-fidelity.** Final colors, pixel proportions, motion, and interaction model are intentional.
The phone UI colors/typography are final. The canvas scene is procedural — port the drawing
routines rather than tracing pixels.

---

## Locked product decisions
- **Persistence: backend, not just localStorage.** Progress (level, XP, unlocks, DJ
  name/avatar/jacket, venue, settings, peak-crowd, history) lives **server-side** keyed to an
  account/device identity, so a reboot never wipes it and the DJ moves between devices.
  localStorage is an offline cache/mirror, not the source of truth.
- **XP / progression pace: time-based, ~1 month to the first festival.** XP accrues from real
  engagement — **minutes listened** and **unique tracks/stations played** — not raw "sends" (the
  mock's "+per send" is a stand-in). Tune the curve so a typical user reaches the **Festival tier
  (Lv 6) in ≈ one month** of normal use. No harsh anti-grind cap needed; the time-gated curve
  self-limits.
- **Offline / empty / denied → the club clears out.** No network, nothing playing, radio down, or
  `getDisplayMedia` denied → fall back to the **idle "closing-time" scene**: the crowd thins to a
  few / empties, the DJ rests on the booth, lights drop to a slow ambient wash tied to the real
  clock. **Already prototyped — it's the default resting state.**
- **Radio CORS → proxy or tab-capture for real reactivity; otherwise a graceful synthetic beat.**

### Can a local AI layer compensate for CORS?
**Not for CORS itself** — it's a hard browser boundary; if a stream omits the headers, JS cannot
read its samples and no model can analyze data the browser won't hand over. A local layer *can*
paper over the **missing reactivity**: with no FFT, drive visuals from an **inferred groove** (a
synthetic beat at a guessed BPM, nudged by station genre metadata) so the room still feels alive —
believable, not truly synced. Real-reactivity fixes: (1) a **tiny same-origin proxy** that
re-serves the stream with permissive CORS, or (2) **tab/system-audio capture**
(`getDisplayMedia({audio:true})`) — you own that stream, it always exposes samples, and it reacts
to anything (incl. YouTube), sidestepping per-station CORS. **Recommendation:** proxy the curated
stations, use tab-capture for "react to whatever I'm playing," reserve the synthetic beat for
un-proxyable streams.

---

## MVP scope (build this first)
Ship a tight v1, then fast-follow. Don't build everything at once.

**v1 (the core loop must feel alive):**
- Idle ↔ live scene with the real-clock ambient + "club clears out" idle state
- **3 venues:** Backyard, House Party, Neon Club (the small→resident arc)
- **Sources:** local files (MP3 + raw/WAV/etc) + **one** CC-BY station, both through the AnalyserNode
- **Auto-vibe** via the DSP classifier (chill/groove/rave)
- **Backend persistence** + identity
- **XP → levels → unlocks** (venues + DJ avatars)
- DJ avatar picker, club-light palette, desk clock + options

**Fast-follow (v1.1+):** festival tiers + totems · after-hours Studio · crowd requests · DJ
peak-reaction + chant moment · sound · pixel postcard · weather · trophy shelf · tab-audio capture.

**Later / code-side systems:** residency calendar · away time-lapse · the apartment scene ·
two-deck crossfade · seasonal dressings · Essentia.js genre model.

**Risk-first:** spike `AnalyserNode` + `getDisplayMedia` FFT across the source types on **day 1**,
before any UI — it's the one thing that can invalidate the design.

## Persistence schema + XP curve (pin these so two devs build the same thing)
**Profile object** (server-authoritative; localStorage is an offline mirror):
```json
{
  "id": "user-or-device-id",
  "djName": "DJ NOVA",
  "avatar": "beanie",            // beanie | cap | visor | afro
  "jacketHue": 288,
  "level": 4,
  "xp": 0.55,                     // fraction toward next level (0..1)
  "listenedMinutes": 812,         // lifetime — drives XP
  "uniqueTracks": ["<id>", "…"],  // set; novelty bonus
  "venue": "club",
  "palette": 288,                 // club light base hue
  "unlocks": ["backyard","house","club","beanie","cap","visor"],
  "peakCrowd": 1240,              // session/lifetime "best moment"
  "history": ["Bass Test", "…"],  // last ~6 titles
  "settings": { "showClock": true, "showDate": true, "clock24": false,
                "scanlines": true, "sound": false, "weather": "clear" },
  "lastSeen": "2026-06-23T20:00:00Z"  // for the away time-lapse
}
```
**XP / level curve (time-based, ≈ 1 month to the first festival).** XP is **minutes listened**,
plus a novelty bonus of **+5 min-equivalent per new track/station** (caps grinding the same song).
Per-level thresholds (minutes of listening to advance), cumulative:

| Level | → next needs | Cumulative | Unlock |
|---|---|---|---|
| 1→2 | 30 min | 0.5 h | House Party |
| 2→3 | 60 min | 1.5 h | Cyber Visor |
| 3→4 | 120 min | 3.5 h | Neon Club |
| 4→5 | 240 min | 7.5 h | Afro |
| 5→6 | 360 min | **13.5 h** | **Festival · Opener** |
| 6→8 | ~900 min | ~28 h | Festival · Sunset |
| 8→11 | ~1800 min | ~58 h | Festival · Headliner |

At a typical **~30 min/day**, Lv6 (first festival) lands at **~27 days ≈ one month**; the headliner
is a multi-month goal. Keep all of these — vibe profiles, venue unlock levels, crowd scales, the XP
thresholds — in **one config module** (they're the balance knobs), not scattered through the render
code as they are in the mock.

---

## The two surfaces

### 1. The Desk Scene (canvas renderer)
A back-to-front, depth-layered pixel scene, everything sized in `u` units (`u = canvasHeight/100`)
so it scales to any window. Internal render height is **200px**, width derived from aspect, then
CSS upscales with `image-rendering: pixelated`. A second offscreen canvas collects bright elements
and is blurred + added back with `globalCompositeOperation = "lighter"` for bloom. A CRT scanline
overlay and vignette sit on top in DOM.

Layers (back→front): background/sky → lighting rig + beams → back wall (speakers/fence/jumbotrons)
→ LED-wall EQ visualizer → stage deck + chasing LED lip → DJ (booth, two turntables, mixer) →
floor glow → crowd (+ totems at festivals) → bloom composite.

**Drives every frame from audio** (here simulated by a synthetic beat; in production read the
`AnalyserNode`):
- **bass / kick** → floor glow, kick-bob, beam flash, crowd jump, DJ scratch/pump
- **overall level (energy)** → beam count/brightness, EQ height, crowd size
- **treble** → shimmer flecks

### 2. The Phone Companion (DOM app, shown in a phone frame)
Four tabs + an options sheet:
- **Send** — Now-Playing card (live mini-EQ), a 3-col media grid (your "camera roll": title,
  duration, genre, kind ▶/♪), a **Send to the floor** button, a **Vibe** segmented control
  (Chill/Groove/Rave) with an **🤖 AUTO** toggle, and **Club lights** color swatches.
- **DJ** — DJ **name** field (pixel font, syncs to the on-scene marquee), **Avatar** picker
  (Beanie, Snapback, Cyber Visor, Afro — last two level-locked), **Jacket** color swatches.
- **Stage** — **Club night / After hours** toggle (After hours = Studio mode), and the **venue
  ladder** (locked venues show the required level).
- **Level** — Level + XP bar, and an **Unlocks** list (venues + avatars, sorted by level).
- **Options sheet** (gear in header) — Desk clock, Show date, 24-hour time, CRT scanlines.

---

## Music sources (REQUIRED — this is the product's spine)
All sources feed the **same analyser graph** so all get full reactive visuals:
`<audio crossorigin> → MediaElementSource → AnalyserNode → masterGain → speakers`, with the FFT
tapped off the AnalyserNode.

1. **Local files (MP3 + raw/uncompressed)** — drag-drop or "Add music". Support **MP3, WAV, AIFF,
   FLAC, M4A, OGG** (anything the browser can `decodeAudioData`). Files never leave the machine;
   upload-to-server is optional for persistence (existing `POST /api/upload` middleware).
2. **Free radio stations** — internet-radio stream URLs (e.g. SomaFM and other listener-supported
   / freely-streamable stations). These are continuous streams; treat them as a station list with
   now-playing metadata where available. **CORS caveat:** to run the FFT the stream must send
   `Access-Control-Allow-Origin` (use `crossorigin="anonymous"`); stations that don't will need a
   thin same-origin proxy, OR fall back to playback-only with a synthetic/level-estimated beat.
3. **Other free-use / CC stations** — attribution-only (CC BY) tracks, e.g. from the Internet
   Archive (archive.org serves `Access-Control-Allow-Origin: *`, so the analyser can read them).
   Show license + source link in the HUD to satisfy attribution.

### "Send whatever is on my phone" + YouTube — the honest constraint
The phone companion's promise is "send anything and the room reacts." Two routes:
- **Files** (above) expose real audio → full reactivity. This is the primary path.
- **Capture the tab/system audio** via `navigator.mediaDevices.getDisplayMedia({ audio: true })`.
  The user shares a tab (YouTube, Spotify, a DJ set, anything); you receive that **audio stream**,
  wire it into the AnalyserNode, and the room reacts to whatever is playing. This is the legitimate
  way to "react to YouTube." Trade-offs: user must pick the tab + grant share each session;
  desktop-only. A packaged desktop app (Electron) could capture loopback audio with no prompt.

**Do NOT rely on the YouTube IFrame Player API for reactivity.** It runs in a cross-origin iframe
and exposes **no raw audio samples** — you cannot attach an AnalyserNode, so it can play a playlist
but cannot drive the FFT visuals. Extracting/downloading audio from YouTube also violates their
Terms. Conclusion: offer **local files + free radio + CC stations + "listen to this tab"** as the
sources; skip a YouTube embed as a reactive source.

---

## AI: detect the music type → set the vibe
The **Vibe** (Chill / Groove / Rave) should auto-set from the audio when **AUTO** is on.
- **Now (reliable, dependency-free):** the existing DSP `Classifier` reads **energy, tempo,
  spectral brightness** from the first few seconds and maps to a vibe + performer. This already
  works; wire AUTO to call it on each new track and set the vibe.
- **Later (true genre):** swap `Classifier.decide()` for an in-browser neural model
  (**Essentia.js**) behind the same interface. No UI change — AUTO just gets smarter.
- In the mock, each media clip carries a `vibe` and AUTO applies it on Send (and shows
  `🤖 <vibe>` on the Now-Playing card). In production, replace the per-clip stub with the live
  classifier verdict.

Vibe affects: **BPM** (96/116/128), **crowd density & motion**, **DJ reaction intensity**, and the
**dance-move mix**.

---

## Career lifecycle & progression
A real DJ arc. **XP** is earned per Send (mock: +0.5/level-fraction); leveling unlocks venues and
avatars and fires a toast ("⭐ Level up" → "🔓 Unlocked: …"). Level cap 12.

**Venue ladder** (unlock level · crowd-scale · look):
| Venue | Lv | Crowd | Look |
|---|---|---|---|
| Backyard Jam | 1 | 0.45 | warm night sky + stars, sagging **string lights**, wooden fence, tiny crowd |
| House Party | 2 | 0.7 | dim indoor, simple **light bars**, small crowd |
| Neon Club | 4 | 1.0 | full **truss + 5 beams**, speaker stacks, resident-night look (the hero scene) |
| Festival · Opener | 6 | 1.5 | **daylight blue sky + sun**, mega rig, big crowd, **totems** |
| Festival · Sunset | 8 | 1.8 | **golden-hour sky**, mega rig, bigger crowd, totems |
| Festival · Headliner | 11 | 2.3 | **night**, mega rig, **lasers + jumbotrons + fireworks**, sea of totems |

**Festival tiers** are the same stage at three times of day (afternoon → sunset → night), each with
a bigger crowd and a wider/taller **LED-wall EQ**. **Totems** are tall poles rising from the crowd
topped with glowing signs (ring, heart, star-burst, flag, diamond) that sway — 5 at day/sunset, 7
at the headliner. Locked venues are visible in the Stage tab with their required level.

**Expanded venue ladder (build these — they reuse the existing `rig`/`sky` systems, no new art):**
the prototype ships 6; fill the gaps low and high so progression always has a next rung. Suggested
full ladder (name · unlock Lv · crowd-scale · rig/sky/effects):
- **Backyard Jam** · 1 · 0.45 · string lights + fence, grass
- **Dorm Room** · 1 · 0.30 · bars rig, house sky — tiniest, just a speaker
- **House Party** · 2 · 0.70 · bars rig, basement riser
- **Dive Bar** · 3 · 0.85 · bars rig, club (dark indoor) sky — sticky floors, loyal regulars
- **Neon Club** · 4 · 1.00 · truss + 5 beams (the hero scene)
- **Warehouse Rave** · 5 · 1.30 · truss, fest (night) sky, **lasers** — industrial
- **Festival · Opener** · 6 · 1.50 · mega, daylight, totems
- **Superclub** · 7 · 1.70 · mega, club sky, **jumbotrons + lasers** — VIP big room
- **Festival · Sunset** · 8 · 1.80 · mega, golden-hour, totems
- **Festival · Headliner** · 11 · 2.30 · mega, night, lasers + jumbotrons + fireworks + totems
- **Stadium Tour** · 12 · 2.80 · mega, night, the works — name in lights, 50k

(Each new venue is just a config entry; the renderer already branches on `rig`/`sky`/`laser`/
`jumbo`/`fireworks`/`totems`. Add matching trophy-shelf entries for the new milestone levels.)

## DJ avatar
Head/hat styles: **Beanie** (Lv1), **Snapback** (Lv1), **Cyber Visor** (Lv3, glowing LED bar),
**Afro** (Lv5). Plus a **jacket color** (5 swatches). The same avatar is used for the producer in
Studio mode. Name + avatar + jacket persist.

## DJ & crowd reactions
- **DJ** by vibe: Chill = slow sway + nod; Groove = head-bob + working the decks; Rave = fast
  scratching + a fist thrown up on strong kicks. Headphones always; hat per avatar.
- **Crowd** dance moves selected by vibe: `sway`, `nod`, `twostep`, `clap` (hands meet on the
  beat), `pump` (fist punches up on kick), `wave` (both arms up swaying), `jump` (whole body hops
  on the kick, legs together). Each dancer is a shaped silhouette (tapered torso, hair variants)
  with a neon rim light; density and motion scale with vibe × venue.

## Ambient & retention systems (prototyped)
These make it a thing you *glance at*, not a loop — port them faithfully:
- **Live → idle "closing-time" cycle.** A track plays "live" for ~26s (real version: the track's
  actual duration / stream activity), then the floor **winds down to idle**: energy drops, the
  crowd thins, the DJ leans on the booth, the marquee reverts to `● LIVE TONIGHT ●`, the phone
  card shows `Last: … · the floor is winding down`. Sending again revives it. This *is* the
  offline/empty fallback.
- **Real time-of-day ambient.** Idle brightness/energy tracks the **actual clock** (peak ≈ 11pm,
  dim late morning) via a cosine curve. The club is warmer in the evening, near-dead at 4am.
- **Track history + peak crowd.** Last 6 unique tracks kept; **peak crowd** (session max) and
  **last played** surface in the Level tab as a lightweight "best moment" memory.
- **Weather skins** (outdoor venues only — backyard + festivals): Clear / **Rain** (streaks) /
  **Snow** (drift) / **Haze** (warm overlay + stronger sun bloom). Chosen in the Stage tab; in
  production could auto-follow real weather/season.
- **Trophy shelf.** A 4-col grid of pixel trophies in the Level tab, one per milestone (Lv 1→11),
  greyscale+locked until earned — pure progression dopamine.
- **Crowd regulars.** Recurring characters that appear with level: a front-row **glowstick dancer**
  (Lv2+) and a **crowd-surfer** that glides across the top of the crowd (Lv3+, only while live).
  Festival **totems** are the third "regular." Personality > headcount.

## Reactions & moments (prototyped)
The character's whole life is the booth and the bedroom DAW — these make him feel present:
- **DJ reacts to the crowd.** On an energy **peak** (the drop), the DJ throws **both hands up** to
  the crowd instead of just working the decks. He responds to *them*, not only the music.
- **Peak "moment."** A `🔥 THE CROWD GOES WILD` banner flashes over the stage during the drop;
  level-ups fire a toast + unlock notice. (Production: add confetti / name-chant on big gigs.)
- **Sound (optional).** A **muffled kick "through the wall"** on every beat while live — a
  low-passed ~95→45 Hz sine, very low gain — silent when idle. Toggle in Options; lazily creates an
  AudioContext on a user gesture (autoplay-safe). Production can layer crowd murmur / vinyl crackle.
- **Crowd requests.** While live, a regular occasionally calls one out (`MORE BASS!`, `slow it
  down`, `keep it groovy`) → a card on the Send tab. **Honor** it (switches the vibe, small XP
  bonus) or dismiss. Turns the crowd from scenery into characters.
- **Pixel postcard.** "Save postcard" (Options) snapshots the live frame to a PNG with a caption
  bar (`DJ name · venue · peak crowd`) — a shareable keepsake.

## Bigger systems — spec only, build in code (NOT in the mock)
These are real engineering, not mock work; design intent captured here:
- **Residency calendar / "tonight's gig."** Turn venue-pick into being *booked*: "Tonight: Sunset
  slot." Showing up (opening the app) + playing earns the time-based XP. This is what makes the
  ~1-month arc a story rather than a grind.
- **Away time-lapse.** On return, a one-line "while you were gone: 3 sets · peak 1,240 · +2 levels"
  — needs the backend to accrue/estimate offline progress. The Tamagotchi hook.
- **The DJ's apartment** (a third scene beside club + studio): between gigs he flops on a couch /
  scrolls his phone, and **unlocked trophies physically sit on a shelf** in-scene — progression you
  see in the world, not just a grid.
- **Two-deck crossfade.** A focus deck vs a party deck so the toy doubles as a low-key work
  companion you ramp up on breaks — that's the audio engine.
- **Seasonal/holiday venue dressings.** Extends the existing weather system (snow at a winter rave,
  etc.).

## After-hours Studio (night) mode
Cozy "tiny producer on a desk": dark cool room, a window with a faint skyline, a **monitor low on
the desk showing a DAW** (transport bar + master meter, 5 playlist lanes with colored clips +
waveform ticks, a moving playhead, an 8-channel mixer strip), **studio monitor speakers**, a
**MIDI keyboard**, a **warm desk lamp** (warm pop against the cool monitor glow), and a mug. The
producer sits **behind** the monitor, head/headphones clearing the top edge, face lit cool blue by
the screen. The DAW meters/playhead react to energy/beat; when a clip is playing its name shows on
the master.

## Desk clock + date + options
A live **pixel-font clock** (HH:MM:SS, 12/24-hr) with **date** (`WD · MON D`) glows top-right of
the scene. Toggled in the **Options** sheet (gear icon) along with Show date, 24-hour time, and CRT
scanlines. Update once a second.

---

## Design tokens
**Type:** `Press Start 2P` (marquee, clock, wordmark, DJ name); system UI sans for body/controls.
**Phone bg:** `#120c1e → #0c0816`. Bezel `#1a1426 → #0a0712`.
**Neon accents:** magenta `#d946ef`, pink `#ff4fd8`, cyan `#22d3ee` / `#2cf0ff`, violet `#7c3aed`,
mint/green `#34d399`, amber `#f59e0b`. Selection ring cyan `#2cf0ff`.
**Club palettes (hue):** Magenta 288 (default), Cyan 190, Amber 36, Mint 150, Violet 262 — the
whole scene is derived from one base hue in HSL.
**Radii:** phone screen 34px, cards 12–16px, pills 999px. **Toggle:** 42×24 track, 18px knob.
**Scene:** 16:9, internal 200px tall, nearest-neighbor upscale, blur(2px) additive bloom, scanline
overlay `repeating-linear-gradient` @ opacity 0.5 multiply, inset vignette.

## State model
`djName, vibe(chill|groove|rave), auto, hue, selected, nowPlaying, mediaHue, venue, mode(day|night),
dj(avatar), jacket, tab, level, xp, toast, optionsOpen, showClock, showDate, clock24, scanlines`.
Production adds: audio source/track, AnalyserNode levels (bass/mid/treble/beat), classifier verdict,
persistence (localStorage/server), unlock set.

## Assets
None external except the `Press Start 2P` web font (Google Fonts). All art is procedural canvas
drawing — no image files. User-supplied media (their files) is the only runtime asset; in the mock
it's represented by colored placeholder tiles.

## Files
- `DJ Companion.dc.html` — the full experience: desk scene renderer + phone companion (all systems
  above). **Primary reference.**
- `Neon Nightclub.dc.html` — the standalone club scene (the original, simpler reactive nightclub).
- `support.js` — runtime for the `.dc.html` Design Components (lets the files open in a browser;
  not part of the production app).

Open either `.dc.html` in a browser to see it live and interact with it.
