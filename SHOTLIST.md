# Desk Rave — promo shot-list

Real captures of the app are your best promo assets: the pixel art *is* the selling point, and
it dodges the "AI slop" contradiction. This is the exact list of shots to grab, how to frame
them, and where each one goes.

## Setup (do this once before recording)

- **Window size:** capture at a clean 16:9 — record at **1280×720**, or 2× that and downscale.
- **HUD size:** set to **Medium** (Options → HUD size). Large is good for the cover; Small reads
  poorly when scaled down.
- **Turn presence to "off"** while recording so the scene never dozes off mid-shot.
- **Keep Game view on** for shots that show Cred/bonuses/progress; flip to **Calm** for a
  "just the vibe" shot.
- **Pick punchy music** for reactive shots — something with an obvious beat (Chiptune Heroes or
  Dancefloor Adventure pack) so the crowd/lights visibly move.
- Let a track settle for a few seconds before capturing so the visuals are mid-energy, not
  just-started.

## Tools

- **Windows:** [ScreenToGif](https://www.screentogif.com/) — record a region, trim, export GIF or
  MP4. Simplest for this.
- **Cross-platform:** OBS to record MP4, then convert to GIF (ffmpeg below) — better quality.
- Static screenshots: just the OS screenshot tool on the capture region.

## The hero: cover GIF (does ~80% of the clicks)

- **Shot:** Neon Club, a track with a strong bass drop. Capture ~3 seconds where the bass hits and
  the crowd + LED wall + lights visibly pump. End on a beat so the loop feels seamless.
- **Length/size:** ~3s loop, **≤ 3 MB**, ~15 fps is plenty for pixel art.
- **Use:** itch cover + the top of the README + social preview.
- **Save as:** `promo/cover.gif`

## Screenshots (grab 4–5)

1. **Neon Club, mid-beat** — Game view, HUD showing the crowd + LED wall lit up. → `promo/01-club.png`
2. **Rooftop at golden hour** — switch to Rooftop during daytime so the warm day lighting shows;
   great color contrast to the club. → `promo/02-rooftop.png`
3. **The library grid** — click the now-playing track to open it; shows the "lots of music"
   story. → `promo/03-library.png`
4. **A break nudge** — trigger/await the "take a break" state so the gentle-focus angle is
   visible. → `promo/04-break.png`
5. **A moody night venue** — Forest Rave or Sunset Shore at night (moon + stars) for variety.
   → `promo/05-night.png`

## Secondary GIFs (optional, for the itch description body)

- **Venue flip** — scroll the wheel / hit ▶ to cycle through 4–5 venues fast. Shows the range.
  → `promo/venues.gif`
- **Get more music** — open Discover, tap a pack, show tracks pour into the library.
  → `promo/discover.gif`
- **Presence wake** — scene dozing (resting) → you "arrive" → it wakes and the music kicks in.
  → `promo/presence.gif`

## Encoding (ffmpeg, if you record MP4 first)

High-quality GIF via a two-pass palette (keeps the neon colors clean and the file small):

```bash
# 1) build a palette from the clip
ffmpeg -i clip.mp4 -vf "fps=15,scale=640:-1:flags=lanczos,palettegen" palette.png
# 2) render the GIF using it
ffmpeg -i clip.mp4 -i palette.png -lavfi "fps=15,scale=640:-1:flags=lanczos[x];[x][1:v]paletteuse" cover.gif
```

Drop `fps` to 12 or `scale` to 480 if you need it under itch's size limits.

## itch.io asset specs (quick reference)

| Asset | Spec |
|---|---|
| Cover image | **630×500** (itch crops to this on the grid) |
| Cover GIF | ~3s, ≤ 3 MB |
| Screenshots | 3–5, native capture resolution |
| Embed viewport | ~1280×720, "click to launch", fullscreen + mobile on |
| Social card | 1200×630 (a screenshot in a simple neon frame) |

## Filenames map to the README

The README has commented `<!-- promo/... -->` placeholders. Drop the files into a `promo/` folder
with the names above and uncomment the lines to light them up.
