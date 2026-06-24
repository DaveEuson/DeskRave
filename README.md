# Pixel DJ

An ambient desk-toy: a 16-bit pixel-art nightclub where a **DJ, lights, and crowd react to
real audio** via a live FFT, with a **phone-style companion** to drive it and a **DJ-career
progression** from backyard parties toward the big stages.

This repo is the build of the [design handoff](design_handoff_pixel_dj_companion/README.md)
(the source of truth). This README covers what's actually built.

## Run

```
npm install
npm run dev      # http://localhost:5190  (bound to 0.0.0.0 for LAN/phone)
```

Pick a track (or drop your own audio), hit **Send to the floor**, and watch the room react.

## MVP — what's built

- **Reactive desk scene** — low-res pixel backbuffer + additive bloom; 3 venues
  (Backyard / House Party / Neon Club) with their own sky + lighting rig; DJ booth with two
  turntables, avatar hats, and vibe-based animation; LED-wall EQ; crowd with per-vibe dance
  moves; **idle "closing-time" wash tied to the real clock**; marquee + desk clock.
- **Sources through one AnalyserNode** — local files (MP3/WAV/FLAC/M4A/OGG) + one CC-BY
  station (Internet Archive). Day-1 spike (`spike/audio-spike.html`) proved the FFT pipeline
  across local files, CC, and the `getDisplayMedia` tab-capture path.
- **Auto-vibe** — the DSP `Classifier` reads energy/tempo/brightness and sets chill/groove/rave.
- **Backend persistence** — server-authoritative profile (Vite middleware `/api/profile`,
  JSON store keyed by device id); localStorage is the offline mirror.
- **Progression** — time-based XP (minutes listened + novelty bonus) → levels → venue/avatar
  unlocks, with level-up toasts.
- **Phone companion** — Send / DJ / Stage / Level tabs + options sheet: now-playing + mini-EQ,
  media grid, vibe control + AUTO, club-light palette, DJ name/avatar/jacket, venue ladder,
  level + XP + unlocks, clock/date/24h/scanlines toggles.

## All balance lives in one place

[`src/config.ts`](src/config.ts) holds **every tunable**: vibe profiles, venue configs, avatar
unlock levels, palettes, the XP/level curve, FFT band boundaries, ambient timing, and the CC
station. Don't scatter these into the render code.

## Deferred (fast-follow / later — not in this MVP)

Festival tiers + totems · after-hours Studio mode · crowd requests · DJ peak "moment" · sound ·
pixel postcard · weather · trophy shelf · in-app tab-audio capture · residency calendar · away
time-lapse · two-deck crossfade · Essentia.js genre model.

## Architecture

`AudioStream` (sources → AnalyserNode → `Levels`) → `Classifier` (auto-vibe) →
`Visualizer` (the scene) ; `Phone` (companion DOM) ↔ `profile`/`xp` ↔ `/api/profile`. Entry: `main.ts`.
