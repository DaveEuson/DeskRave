<p align="center">
  <img src="promo/hero.svg" alt="Desk Rave" width="760">
</p>

<p align="center">
  <a href="https://github.com/DaveEuson/DeskRave/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/DaveEuson/DeskRave?color=d24fe0&label=release"></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/github/license/DaveEuson/DeskRave?color=7c3aed"></a>
  <a href="https://github.com/DaveEuson/DeskRave/releases"><img alt="Downloads" src="https://img.shields.io/github/downloads/DaveEuson/DeskRave/total?color=ffd86a"></a>
</p>

**A tiny 16-bit club for your desk that moves to whatever you play — and quietly keeps your focus honest.**

Desk Rave is a little pixel-art nightclub that lives in a corner of your screen. Play internet
radio, your own files, or the built-in Creative-Commons soundtrack, and the whole scene *reacts
to it in real time* — the bass drives the crowd, the highs shimmer the lights, the DJ scratches
on the beat. It's not a looping animation faking it; it's an actual FFT reading whatever's
playing.

It's also a gentle focus companion. It wakes when you're at your desk, grows a crowd as you
work, and — after a good stretch — nudges you to take a break. Rewards, never penalties.

<!-- promo/cover.gif — the club reacting to a bass drop (see SHOTLIST.md) -->

## Features

- **Real audio reactivity** — one `AnalyserNode` drives the crowd, the LED wall, the lights, and
  the DJ. Feed it anything: the bundled soundtrack, your own files, or any internet-radio stream.
- **40 hand-drawn venues** — a neon club, a rooftop at golden hour, a moonlit beach, a forest
  rave, a barcade, a ski lodge… each a bespoke little pixel scene.
- **Real day/night** — outdoor venues follow your actual clock. Linger somewhere after dark and
  you might get an unexpected visitor.
- **Presence, your way — 100% on-device** — the DJ wakes when you're there. Choose how it senses
  you: **keyboard/mouse** (default, zero permissions), **microphone** (room-loudness only), or
  **webcam** (on-device face detection). No video, no audio, nothing ever leaves your machine.
- **A soundtrack that doesn't run dry** — a built-in Creative-Commons library plus one-tap
  **music packs** and an in-app **Discover** search that pulls more free CC music from the
  Internet Archive. Every artist is credited.
- **Cozy progression** — earn Cred just by building a healthy work rhythm, unlock venues, grow
  your crowd. A progress meter shows how close the next venue is.
- **Calm mode** — hide the whole game layer and just have the music and the scene.
- **Readable on any monitor** — Small / Medium / Large HUD sizes.

## How to use it

- **Tap the scene** to open the menu (pick a station, drop in files, tweak options).
- **Click the now-playing track** (bottom-center) to open the **library grid** — browse and play
  anything in your library.
- **Change venues** with the ◀ ▶ arrows, by **scrolling the wheel** over the switcher, or from
  the venue board.
- **Drag & drop** audio files anywhere to add them (MP3 / WAV / FLAC / M4A / OGG).
- The **volume fader** lives on the right edge; the speaker icon mutes.

## Music & licensing

Every bundled and streamed track is verified **CC-BY, CC0, or Public Domain** (no NC/SA/ND),
sourced from the Internet Archive and checked against its license metadata before inclusion.
Full attribution is in the app (Options → credits) and in [CREDITS.md](CREDITS.md).

There is **no AI-generated art or music** here — the scenes are hand-coded pixel by pixel, and
the music is made by real people.

## Privacy

The presence feature can use your keyboard/mouse, microphone, or camera — **you pick, and it
defaults to keyboard/mouse.** If you choose the mic or camera, all processing happens **locally
in your browser** (via on-device face detection). No frames, no audio, and no images are ever
recorded, saved, or sent anywhere. No account, no tracking, no analytics.

## Run it

```bash
npm install
npm run dev        # open the local URL Vite prints
```

Pick a station or drop in a file and let it run in a corner while you work.

### Build for the web / itch.io

There are two editions, selected at build time:

```bash
npm run build          # kiosk build (dev-server APIs, phone remote) → dist/
npm run build:itch     # standalone static build (no server, no APIs)  → dist-itch/
npm run preview:itch   # preview the standalone build locally
```

The **standalone** build is a pure static site — no backend, no phone remote, localStorage for
saves — ready to zip and upload to itch.io or drop on any static host.

## Under the hood

- **Vite + TypeScript**, plain `<canvas>` (low-res pixel backbuffer, nearest-neighbor upscale,
  additive bloom). No game engine.
- On-device face detection via **MediaPipe Tasks Vision** (only loaded if you enable the camera).
- **All balance lives in one file:** [`src/config.ts`](src/config.ts) holds every tunable —
  venues, genres, the CC music catalogue + packs, reward curve, FFT bands. Don't scatter these
  into the render code.
- Rough flow: `AudioStream` (sources → AnalyserNode → `Levels`) → `Classifier` (auto-vibe) →
  `Visualizer` (the scene); `Presence` gates it on "are you here?"; `main.ts` is the entry point.

## Credits

- **Music** — SwapXFO, Komiku, Broke For Free, Chris Zabriskie, Lee Rosevere, and Andrey
  Avkhimovich, under their own CC-BY / CC0 licenses. Full list and sources in [CREDITS.md](CREDITS.md).
- **Font** — Press Start 2P by CodeMan38 (SIL Open Font License 1.1).
- **Face detection** — MediaPipe Tasks Vision (Apache 2.0), loaded only if you enable the camera.
- **Art & code** — hand-drawn and hand-coded by Dave Euson.

## License

The **source code** is released under the [MIT license](LICENSE). The **bundled music** is the
work of third-party artists under their own Creative Commons licenses (CC-BY / CC0) and is *not*
covered by MIT — see [CREDITS.md](CREDITS.md) for per-track attribution.
