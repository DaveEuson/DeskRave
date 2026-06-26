# Handoff: Cozy DJ — Pixel-Art Ambient Scene Player

## Overview
**Cozy DJ Scenes** is an ambient, animated **16-bit pixel-art "desk toy."** It renders a single producer/DJ performing across **39 hand-built venues** — from a cozy morning café to a sold-out headliner stage — each procedurally drawn and animated to a beat on an HTML `<canvas>`. The user flips between venues with a switcher bar; the scene loops forever with no win/lose state (an optional rhythm mini-game is included).

The whole thing is one self-contained file. There are no external images — **every pixel is drawn in code** at runtime.

## About the Design Files
The files in this bundle are a **design reference / working prototype built in HTML + Canvas** (authored as a "Design Component"). They are not meant to be shipped verbatim into a product. The task is to **recreate this experience in the target codebase's environment** (React + Canvas, a game engine, a native renderer, etc.) following that codebase's established patterns — or, if there is no existing environment, to pick the most appropriate stack for an animated canvas toy and implement it there.

That said: unlike a typical UI mock, **the value here IS the rendering code.** The procedural drawing logic (how each venue and figure is composed from pixel rectangles) is the design. A developer should port the *architecture and the per-scene draw routines*, not re-invent the art. Read `Cozy Scenes.dc.html` as the source of truth.

## Fidelity
**High-fidelity, final.** Colors, animation timing, composition, and behavior are all final and intentional. The pixel-art look depends on exact details (integer pixel snapping, nearest-neighbor scaling, the additive bloom pass) — these must be reproduced faithfully or the aesthetic breaks.

---

## Architecture (read this first)

### The rendering model — reproduce this exactly
1. **Low-resolution internal buffer.** The canvas backing store is **200px tall** (`PIXEL_H = 200`); width is derived from the element's aspect ratio (`w = round(200 * clientWidth/clientHeight)`, min 240). All drawing happens in this small buffer.
2. **Nearest-neighbor upscale.** `ctx.imageSmoothingEnabled = false` on every context. CSS stretches the 200px-tall buffer up to the display size, giving crisp chunky pixels. The element also sets `image-rendering: pixelated`.
3. **A unit system.** Everything is sized in units of `u = H / 100` (so the world is 100u tall regardless of buffer size). Scenes lay out against `W` (this.w) and `H` (this.h = 200). Always draw with integer-snapped rects (`Math.round`) — see the `px()` helper.
4. **Additive bloom pass.** A second offscreen canvas (`this.glow`) collects "glowing" elements. Each frame: draw the scene to the main context; anything bright (lights, screens, neon, sun) is *also* drawn to the glow canvas; then the glow canvas is blurred and composited back over the scene with `globalCompositeOperation = "lighter"`. This is what gives lights their soft halo. Helpers take an optional final arg (`this.glow`) to also paint into the bloom buffer.
5. **Animation loop.** A single `requestAnimationFrame` loop computes elapsed seconds `t` and calls `draw(t)`. The loop is **self-healing**: it re-acquires the canvas node inside the loop and restarts if the node changes (this handles hot-reload / remount). Reproduce this robustness — a naive "grab canvas in mount, start loop" will race and show a blank canvas.

### Core drawing helpers (in the logic class)
- `px(x, y, w, h, color, glowCtx?)` — the atomic primitive: an integer-snapped filled rectangle. Optional `glowCtx` also stamps it into the bloom buffer. **Almost everything is built from this.**
- `block(x, y, w, h, base, hi, outline)` — a rect with an optional top highlight band and outline (used for bodies, heads, props).
- `disc(cx, cy, rx, ry, color, glowCtx?)` — a filled pixel ellipse (suns, glows, heads, speaker cones).
- `limb(x1, y1, x2, y2, width, color, glowCtx?)` — a thick pixel line (arms, legs, light beams, lasers, rigging).
- `pulse(t, bpm)` — returns `{ beat, kick, energy, phase }` derived from a bpm. `beat` is the running beat count; `kick` spikes on each downbeat (used for bass-reactive motion); `energy` is a smooth 0–1. **All motion is driven off these** so everything moves in time.

### Shared scene-building blocks (reused across venues)
- `djBooth(cx, groundY, u, t, beat, kick, opts)` — the standard front-facing DJ + decks booth. `opts` carries the palette (skin, jacket/hi/sh, hat, cap flag, glow color, booth/hi/sh).
- `raisedStage(cx, stageTopY, halfW, u, t, beat, kick, opts)` — a DJ on a riser/stage. `opts.scale` shrinks the DJ (used to push them "to the back"); `opts.riser/riserHi` color the riser. Crowd is drawn *after* (in front) so the DJ reads as upstage.
- `crowdBand(baseY, u, t, beat, kick, {rows, hue, maxL, handsHue})` — a back-to-front silhouette crowd that bobs on the beat with raised glowstick hands. Higher `rows` = bigger/denser crowd.
- `parkDancer(...)`, `commuter(...)` — individual background figures (a dancer; a standing person checking a phone/watch).
- `speakerStack(cx, baseY, u, kick, big)` — a PA speaker stack whose cones pump on the kick.
- `stringLights(W, u, t, beat, hue, sag, spacing)` — a hung string of glowing bulbs.
- Scene-specific figures: `legendDJ` (the hero), `presidentPop`, `barStaff`, `sakuraTree`, `tajMahal`, `palm`, `airportPlane`, pets, etc.

### Scene dispatch
`draw(t)` looks up `this.state.scene` in a map of `{ key: this.drawXxx }` methods and calls it. **Each venue is one `drawXxx(t)` method** that paints background → midground → stage/DJ → crowd → foreground FX, in that order. To add or port a venue you only touch: the `SCENES` registry (label/title/subtitle/accent/text-shadow), the `order` array, the now-playing map, the `crowdScenes` set (if it has a hype meter), the dispatch map, and the `drawXxx` method.

---

## Screens / Views

There is **one screen**: a full-bleed canvas with a thin chrome overlay. The "views" are the 39 venues, all rendered into the same canvas.

### Persistent chrome (HTML/DOM overlay on top of the canvas)
- **Title block** (top center): venue `title` + `subtitle`, colored by the venue `accent` with a layered text-shadow. Pixel font.
- **Top-right cluster:** a **DAY / NIGHT** indicator (☀/☾) and small toggle buttons — **pet picker** (🐾), **disco-ball** (🪩), etc.
- **Now-playing ticker** (bottom-left): a spinning vinyl record, the track title + artist (per-venue), an animated EQ, and the BPM. Toggleable.
- **Switcher bar** (bottom center): `◁ / ▷` arrows, an index readout (`12 / 39 · VENUE NAME`), and a row of clickable dots to jump between venues. Colored by the active venue's accent.
- **Crowd-hype meter** (bottom-right): a slow-building gradient bar, shown only on "crowd" venues.
- **Pet collection panel** (modal): grid of pets, locked ones showing an unlock hint ("VISIT 6/9/13…"), selecting one drops it into the scene.

All chrome is styled with **inline styles** (no stylesheet) in a pixel/monospace font, sized off the venue accent. Exact colors are read from the `SCENES` registry in the file.

### The 39 venues (in `order`)
A career-arc cluster opens the set, then everyday spots, then big shows, then novelty/funny venues:

`soundcheck, openhero (Opening For Your Hero), bigroom (Early Doors), headliner, cafe, park, rooftop, beach, recordshop, radio, diner, bedroom, houseparty, car, arcade, prom, wedding, silent (Silent Disco), rink (Roller Rink), warehouse, underbridge, forest, bakersfield, festival, skilodge, boat (Sunset Cruise), balloon (Hot Air Balloon), airport, laundromat, aquarium, dmv, tavern, space (Space Station), whitehouse, japan (Sakura festival), india (Holi), subway, heaven, studio (After Hours)`

Each is a distinct procedural scene. A few notable behaviors:
- **studio (After Hours):** over-the-shoulder shot — the producer (back to camera, flat-brim cap + headphones) fills the foreground; a glowing DAW screen with colored clip lanes is the focal point; a cat naps on the desk. No crowd.
- **cafe:** sunrise window light, hanging string lights, a barista pulling a shot with steam, seated patrons with laptops; the hero producer's laptop screen-glow spills *up onto him* (the lid is matte — it must NOT look like a monitor).
- **boat (Sunset Cruise):** a white **hull bulwark** with a navy boot-stripe, **life-preserver rings**, and cleats sell it as a boat (not a beach); sun setting over the sea beyond the rail.
- **airport:** a plane **taxis and takes off on an ~11s loop**, climbing out over the tarmac; a second plane drifts high in the sky.
- **whitehouse:** a **different caricature president pops out of a window every ~8 seconds** (powdered wig, stovepipe+beard, sandy swoop, silver, dark, side-part), waves/bobs, ducks back; crowd on the South Lawn.
- **headliner:** giant LED wall (rainbow EQ + name band), flanking jumbotrons showing the DJ's face, packed crowd with phone lights, lasers, **pyro jets on the kick**, confetti, white flash on big hits.
- **openhero / bigroom:** story scenes — your hero watches side-stage under a spotlight while you play the warm-up; a cavernous half-empty room at early doors with a bored security guard.

---

## Interactions & Behavior
- **Switch venue:** arrows, dots, or (in the live build) keyboard. Switching triggers a short **cross-fade transition** (the canvas fades through black/overlay for ~0.4s).
- **Day/Night:** `timeMode` prop = `auto | day | night`. In `auto`, the app reads the **real system clock** — night is **19:00–07:00**. Night applies a cool blue color-grade + dims warm lights across every scene; day is warm/bright. The ☀/☾ badge reflects current state.
- **Beat-reactive everything:** crowds bob, speaker cones pump, lights/neon brighten, pyro fires — all off `pulse()`'s `beat`/`kick`. Each venue has its own BPM.
- **Pets (unlockable):** visiting venues unlocks pets at thresholds (cat/dog early, then more at 6/9/13/24 venues visited). Unlock progress persists. The chosen pet roams/sits in the current scene.
- **Rhythm mini-game (optional):** a toggle starts a simple tap-on-beat mode that scores hits (Perfect/Good/Miss), tracks combo + best combo. Off by default.
- **Ambient FX toggles:** rain and snow overlays (diagonal streaks / drifting flakes + a cool wash) and a **disco-ball** overlay (spinning faceted mirror ball casting beat-synced light dots) can be layered over **any** scene.

## State Management
Held in the logic class `state` + a few props:

**Props (host-tweakable):**
| Prop | Type | Default | Meaning |
|---|---|---|---|
| `timeMode` | `"auto" \| "day" \| "night"` | `auto` | Day/night source; `auto` = real clock |
| `nowPlaying` | boolean | `true` | Show the now-playing ticker |
| `hype` | boolean | `true` | Show the crowd-hype meter on crowd venues |
| `rain` | boolean | `false` | Rain overlay |
| `snow` | boolean | `false` | Snow overlay |

**Runtime state:** `scene` (current venue key), `visited` (array, persisted to `localStorage["cozy.visited"]`), `pet` (persisted to `localStorage["cozy.pet"]`), `petPanelOpen`, `menuOpen`, and rhythm-game fields (`rhythmOn`, `rhythmMode`, `score`, `combo`, `bestCombo`, `judgement`, `judgeAt`). Disco-ball / FX toggles are local UI state.

**Persistence:** only `cozy.visited` and `cozy.pet` are written to `localStorage`. Don't clobber other keys.

## Design Tokens
This is pixel art — color lives **inline in each draw call** as `hsl()`/`hsla()` strings, not in a token table. The only centralized tokens are the **per-venue chrome palettes** in the `SCENES` registry, each with:
- `accent` — hex, drives the title, switcher, dots, and ticker accent.
- `tc` — title text color (hex).
- `ts` — title text-shadow (layered glow).
- `sc` — subtitle color.
- `label`, `title`, `subtitle` — copy strings.

Geometry tokens: `PIXEL_H = 200` (buffer height), `u = H/100` (world unit). Bloom: gaussian-ish blur composited with `"lighter"`. There is no spacing/radius/typography scale beyond the pixel grid.

## Assets
**None external.** All art (scenes, figures, album covers, pets, UI glyphs) is procedurally drawn on canvas at runtime. Album cover thumbnails for the ticker are generated into small offscreen 64×64 canvases and cached as data URLs. The only font is a pixel/monospace web font referenced in the file's `<helmet>`.

## Screenshots
`screenshots/` contains a reference still of **all 39 venues**, named `NN-key.png` in switcher order (e.g. `05-cafe.png`, `39-studio.png`). These are single frames of a continuously-animated scene — use them for composition/color/layout reference, not as final frames. Captured in **day** mode; night mode applies a cool blue grade over the same compositions.

## Files
- `Cozy Scenes.dc.html` — **the entire app.** A Design Component: an HTML template (the chrome overlay markup) + a `class Component extends DCLogic` logic class (all the canvas rendering, scene methods, helpers, state). This is the implementation reference — port from here.
- `support.js` — the lightweight runtime that mounts a Design Component in the browser (template binding + the `DCLogic` base class with React-style lifecycle). In your target codebase you will **replace this** with your framework's component lifecycle; you only need: a canvas element, a mount hook to call `setup()` + start the rAF loop, a teardown to cancel it, and prop/state plumbing. None of the scene-drawing code depends on `support.js` internals.

### Porting notes
- Keep the **200px buffer + nearest-neighbor + bloom** pipeline — it's the whole look.
- Keep the **self-healing rAF loop** (re-acquire canvas, restart on node change) or you'll get blank-canvas races on mount/hot-reload.
- The scene methods are large but flat and dependency-free (only the shared helpers). Port helpers first, then scenes one at a time; each is independently testable.
- Day/night is a global post-grade keyed off `isNight()` — wire it once, it affects all scenes.
