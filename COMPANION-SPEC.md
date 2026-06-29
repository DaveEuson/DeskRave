# Spec — Remote Companion Page

**Goal:** control the kiosk and add music from any browser on the LAN (Windows desktop,
phone, tablet) — change the station/track, switch the venue/scene, transport + volume,
and upload MP3s. **A web page, not a native app** — served by the same server, so it works
on every platform with zero install.

## Why a web page (not Electron/native)
The kiosk is already a web app + a tiny server (Vite middleware in `vite.config.ts`). Upload
already exists (`POST /api/upload`, `GET /api/library`, phone-upload via QR). The only new
capability is **remote control of the running kiosk**. That's a small server channel — no
native app, cross-platform for free.

## Architecture: a command channel the kiosk polls
The kiosk already polls `/api/presence` every ~300ms, so it has a polling loop. Add a remote
command queue alongside it.

```
[Companion page]  --POST /api/remote {cmd,value}-->  [server queue (.data/remote.json)]
[Kiosk] --GET /api/remote?since=<seq>--> applies new commands (venue/track/play/vol/…)
[Kiosk] --POST /api/remote/state {venue,track,playing,volume}--> so the companion can mirror it
[Companion page] --GET /api/remote/state--> reflects what the kiosk is doing
```

Single kiosk on the LAN ⇒ one global channel (no pairing needed for v1). Multi-kiosk later:
key the queue by a `kioskId` from `/api/info`.

## Server (new middleware in `vite.config.ts`)
- `POST /api/remote` — body `{ cmd, value }`. Append `{ seq, ts, cmd, value }` to an in-memory
  ring (mirrored to `.data/remote.json`); return `{ seq }`. Commands:
  `venue` (VenueId) · `selectTrack` (index) · `addStation` ({name,url,genre}) ·
  `play` · `pause` · `next` · `prev` · `volume` (0..1) · `mode` ("game"|"calm").
- `GET /api/remote?since=<seq>` — `{ latest, cmds: [...] }` with `seq > since`. (Cap the ring ~50.)
- `POST /api/remote/state` — kiosk reports `{ venue, trackTitle, trackIndex, playing, volume, mode }`.
- `GET /api/remote/state` — companion reads the above. (Reuses no profile-id plumbing.)
- Reuse existing: `POST /api/upload`, `GET /api/library`.

## Kiosk (additions in `main.ts`)
- A poller (~1–2 s; or fold into the existing 1 s tick): `GET /api/remote?since=lastSeq`, apply
  each new cmd by calling the functions that already exist — `cycleVenue`/set `profile.venue`+`syncScene`,
  `audio.select(i)`, `audio.toggle/next/prev`, `applyVolume(v)`, `onAddStation(...)`,
  toggle Zen for `mode`. Persist + update the HUD as usual.
- After applying (and on track/venue change), `POST /api/remote/state` so the companion mirrors it.
- Gate behind the kiosk URL flag (`?remote=1`) or just always-on for the kiosk build.

## Companion page (`/remote` → `companion.html` + `companion.ts`)
A lightweight control surface (NOT an audio player — it drives the kiosk):
- **Now controlling** banner — reads `/api/remote/state` (current venue + track + play state).
- **Venues** — a grid like the in-app Venue Board (owned = switch; locked = note "unlock on the
  kiosk"). Tap → `POST /api/remote {cmd:"venue"}`.
- **Stations & files** — built-in `STATIONS` + `GET /api/library`; tap → `selectTrack`. Plus the
  add-station form (`addStation`) and a **drag-drop / file upload** (`POST /api/upload`).
- **Transport + volume + 🎮/🌿 mode** — buttons/slider → the matching commands.
- Reuses `config.ts` (VENUES, STATIONS, GENRES) so the lists stay in sync with the app.

Access: `http://<kiosk-ip>:5190/remote` on any device (the QR from `/api/info` already gives the
base URL). On Windows: bookmark it. On phone: add to home screen.

## Security (read before shipping)
- **LAN-only for v1, no auth** — fine on your home network; anyone on the LAN can control the kiosk.
- Before exposing beyond the LAN (or shipping to others): add a **pairing token** (kiosk shows a
  code; companion must send it with every command) and rate-limit. Do NOT put the kiosk on the
  public internet without this.
- The radio proxy host allowlist already covers added stations.

## Build order (each shippable on its own)
1. Server: `/api/remote` queue + `/api/remote/state`.
2. Kiosk: poll + apply commands; report state.
3. Companion page: state banner + venue grid + station/file list + transport + upload.
4. (Later) pairing token + multi-kiosk `kioskId`.

**Effort:** ~1 focused day. Mostly wiring existing pieces (upload, config lists, the venue/station
UI patterns) through a thin command channel. No new heavy dependencies.
