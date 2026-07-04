// ─────────────────────────────────────────────────────────────────────────────
// Desk Rave — the ONE balance module.
// Every tunable number (vibes, venues, avatars, palettes, XP curve, FFT bands,
// timings) lives here so two devs build the same game and balance is one file.
// Per the handoff README: do not scatter these through the render code.
// ─────────────────────────────────────────────────────────────────────────────

export type VibeName = "chill" | "groove" | "rave";
export type AvatarId = "beanie" | "snapback" | "visor" | "afro";
export type SkyId = "night-warm" | "indoor-dim" | "club-dark";
export type RigId = "string" | "bars" | "truss";

// Dance/electronic genres only — used for venue affinity + the daily multiplier.
export type Genre =
  | "lofi" | "chill" | "downtempo" | "house" | "techno" | "trance" | "dnb"
  | "ambient" | "synthwave";

export const GENRE_HUE: Record<Genre, number> = {
  lofi: 280, chill: 150, downtempo: 175, house: 288, techno: 190,
  trance: 262, dnb: 200, ambient: 210, synthwave: 312,
};
export const GENRES = Object.keys(GENRE_HUE) as Genre[];

// The venue collection (the 39 Cozy DJ scenes + our signature neon Club).
// Venue = the place you unlock/pick; the real clock applies a day/night grade.
export type VenueId =
  | "soundcheck" | "openhero" | "bigroom" | "headliner" | "cafe" | "park"
  | "rooftop" | "beach" | "recordshop" | "radio" | "diner" | "bedroom"
  | "houseparty" | "car" | "arcade" | "prom" | "wedding" | "silent" | "rink"
  | "warehouse" | "underbridge" | "forest" | "bakersfield" | "festival"
  | "skilodge" | "boat" | "balloon" | "airport" | "laundromat" | "aquarium"
  | "dmv" | "tavern" | "space" | "whitehouse" | "japan" | "india" | "subway"
  | "heaven" | "studio" | "club";

// ── FFT band boundaries (fractions of frequencyBinCount) ─────────────────────
// Tuned for music, not pure tones: bass≈0-720Hz, mid≈0.7-4.3kHz, treble above
// (at 48kHz / fftSize 1024 → ~47Hz per bin). Adjust here, nowhere else.
export const BANDS = { bassEnd: 0.03, midEnd: 0.18 } as const;

// ── Vibes (auto-set by the DSP classifier) ───────────────────────────────────
// crowd = density mult · motion = dance amplitude · base = idle energy floor.
export interface VibeProfile {
  crowd: number;
  motion: number;
  base: number;
  bpm: number;
  djIntensity: number; // 0..1 scratch/pump energy
  moves: DanceMove[]; // dance-move mix for this vibe
}
export type DanceMove = "sway" | "nod" | "twostep" | "clap" | "pump" | "wave" | "jump";

export const VIBES: Record<VibeName, VibeProfile> = {
  chill: { crowd: 0.42, motion: 0.6, base: 0.3, bpm: 96, djIntensity: 0.25, moves: ["sway", "nod"] },
  groove: { crowd: 0.8, motion: 1.0, base: 0.55, bpm: 116, djIntensity: 0.6, moves: ["nod", "twostep", "clap"] },
  rave: { crowd: 1.0, motion: 1.4, base: 0.82, bpm: 128, djIntensity: 1.0, moves: ["pump", "wave", "jump", "twostep"] },
};

// ── Venues — the place you unlock/pick (39 Cozy scenes + our neon Club) ───────
// name = menu label · genre = native affinity (full multiplier when matched) ·
// price = Cred to unlock (0 = free starter) · dark = skip the day/night grade
// (interior / already-dark) · crowd = has an audience ("crowd goes wild") ·
// ported = has a real draw routine yet (else a tasteful "coming soon" card).
export interface VenueMeta {
  id: VenueId;
  name: string;
  label: string; // marquee text
  accent: string; // hex — chrome/marquee tint
  genre: Genre;
  price: number;
  dark?: boolean;
  crowd?: boolean;
  ported?: boolean;
  daypart?: "day" | "night"; // natural hour — pays off best then, less at the wrong time (omit = time-neutral)
  curfew?: boolean; // outdoor public spot — overstay after dark and the cops show up 🚓 (a fun gag, no penalty)
}

// Curfew gag: linger at a curfew venue during these hours and you get "moved along".
export const CURFEW = { startHour: 21, endHour: 6, lingerSec: 120 }; // 9pm–6am, after ~2 min
export const VENUES: Record<VenueId, VenueMeta> = {
  // free starters: café / park / club (the day→night trio). everything else costs Cred
  soundcheck: { id: "soundcheck", name: "Soundcheck", label: "🎚 SOUNDCHECK", accent: "#7ad6b0", genre: "house", price: 40, crowd: true, ported: true },
  cafe: { id: "cafe", name: "Morning Café", label: "☕ MORNING CAFÉ", accent: "#f6b352", genre: "lofi", price: 0, ported: true, daypart: "day" },
  park: { id: "park", name: "Afternoon Park", label: "🌳 AFTERNOON PARK", accent: "#7fd06a", genre: "chill", price: 0, crowd: true, ported: true, daypart: "day", curfew: true },
  club: { id: "club", name: "Neon Club", label: "● LIVE TONIGHT ●", accent: "#d24fe0", genre: "techno", price: 0, dark: true, crowd: true, ported: true, daypart: "night" },
  // everyday spots
  bedroom: { id: "bedroom", name: "BFF's Bedroom", label: "BEST FRIENDS", accent: "#a98cff", genre: "lofi", price: 60, crowd: true, ported: true },
  diner: { id: "diner", name: "Night Owl Diner", label: "THE NIGHT OWL", accent: "#ff5e8a", genre: "synthwave", price: 60, crowd: true, ported: true, daypart: "night" },
  recordshop: { id: "recordshop", name: "Record Shop", label: "CRATE DIGGING", accent: "#e8a23c", genre: "house", price: 60, ported: true, daypart: "day" },
  car: { id: "car", name: "In Your Car", label: "WINDOWS DOWN", accent: "#ff5e8a", genre: "synthwave", price: 60, ported: true },
  studio: { id: "studio", name: "After Hours Studio", label: "AFTER HOURS", accent: "#8a8cff", genre: "lofi", price: 80, dark: true, ported: true, daypart: "night" },
  openhero: { id: "openhero", name: "Opening for Your Hero", label: "WARM-UP SLOT", accent: "#ffd24a", genre: "house", price: 90, crowd: true, ported: true, daypart: "night" },
  // bigger rooms + outdoors
  rooftop: { id: "rooftop", name: "Rooftop", label: "GOLDEN HOUR", accent: "#ff9e5e", genre: "house", price: 120, crowd: true, ported: true, daypart: "day", curfew: true },
  beach: { id: "beach", name: "Sunset Shore", label: "SUNSET SHORE", accent: "#ffb27a", genre: "chill", price: 120, crowd: true, ported: true, daypart: "day", curfew: true },
  houseparty: { id: "houseparty", name: "House Party", label: "HOUSE PARTY", accent: "#ffb84a", genre: "house", price: 120, crowd: true, ported: true, daypart: "night" },
  radio: { id: "radio", name: "Radio Booth", label: "ON AIR", accent: "#ff6a5e", genre: "downtempo", price: 120, dark: true, ported: true },
  arcade: { id: "arcade", name: "Barcade", label: "INSERT COIN", accent: "#62e0ff", genre: "synthwave", price: 140, dark: true, crowd: true, ported: true, daypart: "night" },
  laundromat: { id: "laundromat", name: "Laundromat", label: "SPIN CYCLE", accent: "#5fd0e0", genre: "techno", price: 140, dark: true, crowd: true, ported: true },
  subway: { id: "subway", name: "Subway Platform", label: "LAST TRAIN", accent: "#5fd0c8", genre: "lofi", price: 140, dark: true, crowd: true, ported: true, daypart: "night" },
  tavern: { id: "tavern", name: "Medieval Tavern", label: "YE OLDE DROP", accent: "#ffae4a", genre: "trance", price: 160, crowd: true, ported: true, daypart: "night" },
  // shows + novelty
  prom: { id: "prom", name: "School Prom", label: "PROM NIGHT", accent: "#9a8cff", genre: "house", price: 200, dark: true, crowd: true, ported: true, daypart: "night" },
  wedding: { id: "wedding", name: "The Reception", label: "THE RECEPTION", accent: "#ff9ec4", genre: "house", price: 200, crowd: true, ported: true },
  silent: { id: "silent", name: "Silent Disco", label: "SILENT DISCO", accent: "#4ce0c0", genre: "house", price: 200, dark: true, crowd: true, ported: true, daypart: "night" },
  rink: { id: "rink", name: "Roller Rink", label: "ROLLER DISCO", accent: "#ff5fae", genre: "synthwave", price: 200, dark: true, crowd: true, ported: true, daypart: "night" },
  skilodge: { id: "skilodge", name: "Ski Lodge", label: "APRÈS-SKI", accent: "#9ed2ff", genre: "house", price: 220, crowd: true, ported: true, daypart: "day" },
  boat: { id: "boat", name: "Sunset Cruise", label: "ON DECK", accent: "#ff8f6a", genre: "chill", price: 220, crowd: true, ported: true, daypart: "day", curfew: true },
  forest: { id: "forest", name: "Forest Rave", label: "DEEP WOODS", accent: "#7fe04a", genre: "trance", price: 240, crowd: true, ported: true, daypart: "night" },
  underbridge: { id: "underbridge", name: "Under the Bridge", label: "OVERPASS", accent: "#5fe0c0", genre: "dnb", price: 240, dark: true, crowd: true, ported: true, daypart: "night" },
  bakersfield: { id: "bakersfield", name: "Bakersfield Rave", label: "DESERT BASS", accent: "#ffc23c", genre: "techno", price: 240, crowd: true, ported: true, daypart: "night" },
  bigroom: { id: "bigroom", name: "Early Doors", label: "THE BIG ROOM", accent: "#6fd0e0", genre: "techno", price: 260, dark: true, crowd: true, ported: true, daypart: "night" },
  // big stages + spectacle
  warehouse: { id: "warehouse", name: "Warehouse", label: "WAREHOUSE", accent: "#d24fe0", genre: "techno", price: 320, dark: true, crowd: true, ported: true, daypart: "night" },
  festival: { id: "festival", name: "Main Stage", label: "MAIN STAGE", accent: "#ffd24a", genre: "techno", price: 360, crowd: true, ported: true },
  balloon: { id: "balloon", name: "Hot Air Balloon", label: "ABOVE IT ALL", accent: "#ff8f4a", genre: "ambient", price: 320, ported: true, daypart: "day" },
  airport: { id: "airport", name: "Departures Lounge", label: "GATE 13", accent: "#7fb0e8", genre: "ambient", price: 320, crowd: true, ported: true },
  aquarium: { id: "aquarium", name: "Aquarium", label: "DEEP CUTS", accent: "#4ec0ff", genre: "ambient", price: 320, dark: true, crowd: true, ported: true },
  dmv: { id: "dmv", name: "The DMV", label: "NOW SERVING", accent: "#9bd14a", genre: "downtempo", price: 280, dark: true, crowd: true, ported: true, daypart: "day" },
  // destination / legendary
  space: { id: "space", name: "Space Station", label: "ZERO-G", accent: "#b08cff", genre: "ambient", price: 500, dark: true, crowd: true, ported: true },
  whitehouse: { id: "whitehouse", name: "The White House", label: "HAIL TO THE BEAT", accent: "#6f9fe0", genre: "house", price: 500, crowd: true, ported: true },
  japan: { id: "japan", name: "Sakura Festival", label: "SAKURA SET", accent: "#ff9ec4", genre: "chill", price: 460, crowd: true, ported: true, daypart: "day" },
  india: { id: "india", name: "Holi House", label: "HOLI HOUSE", accent: "#ff9e3c", genre: "trance", price: 460, crowd: true, ported: true, daypart: "day" },
  heaven: { id: "heaven", name: "Heaven", label: "PEARLY GATES", accent: "#ffe9a0", genre: "ambient", price: 600, dark: true, crowd: true, ported: true },
  headliner: { id: "headliner", name: "Headliner", label: "TOP OF THE BILL", accent: "#ff4ea0", genre: "techno", price: 600, dark: true, crowd: true, ported: true, daypart: "night" },
};
// Browse/career order (matches the package's switcher order, club last).
export const VENUE_ORDER: VenueId[] = [
  "soundcheck", "openhero", "bigroom", "headliner", "cafe", "park", "rooftop",
  "beach", "recordshop", "radio", "diner", "bedroom", "houseparty", "car",
  "arcade", "prom", "wedding", "silent", "rink", "warehouse", "underbridge",
  "forest", "bakersfield", "festival", "skilodge", "boat", "balloon", "airport",
  "laundromat", "aquarium", "dmv", "tavern", "space", "whitehouse", "japan",
  "india", "subway", "heaven", "studio", "club",
];

// Fixed look for the neon Club scene (the one venue that uses the original
// reactive nightclub renderer; every other venue has its own draw routine).
export interface ClubLook { crowdScale: number; sky: SkyId; rig: RigId; beams: number; speakers: boolean; }
export const CLUB_LOOK: ClubLook = { crowdScale: 1.0, sky: "club-dark", rig: "truss", beams: 5, speakers: true };

// The first 3 venues are free (café morning → park afternoon → club night).
export const STARTER_VENUES: VenueId[] = ["cafe", "park", "club"];

// ── Cred economy ──────────────────────────────────────────────────────────────
// Cred is earned while you're at the desk (camera sees you OR music is playing)
// and spent in the store on venues + cosmetic prizes. Rate tuned so ~40 desk-hours
// a week comfortably buys about two venues and a prize (≈600 Cred/week).
export const CRED_PER_MIN = 0.25; // (legacy; no longer used — earning is event-based, see below)

// ── Reward events (corrected model: reward the cycle, not raw presence) ────────
// Cred is earned at the BOUNDARIES of a healthy work rhythm — finishing a focus
// block, and (worth more) actually taking the break — never per-minute-present.
// Presence is a bad proxy (you can doomscroll in the chair and still earn); you
// reinforce what you measure, so measure the behaviour you want. Flat + bounded:
// no multipliers to min-max, and a daily cap so the carrot ENDS (a natural stop,
// which a dopamine-seeking brain needs). The break pays more than staying.
export const REWARDS = {
  focusBlock: 8, // Cred for completing a healthy focus block
  takeBreak: 14, // Cred for actually taking the break (> staying — un-breaks the break)
  focusFans: 3, // crowd that shows up when you do the work
  breakFans: 2,
  dailyCap: 60, // "you've banked today's max" — ≈2–3 cycles, then rest easy
};

// ── Balance / anti-burnout (Pomodoro) ────────────────────────────────────────
// A healthy focus block earns full Cred; overstay it and the rate soft-decays to
// a floor (a nudge, not a punishment); a real break away from the desk resets it.
export const BALANCE = {
  focusMin: 50, // a healthy focus block before the "take a break" nudge
  breakMin: 10, // minutes continuously away (and music stopped) before the focus block resets
  decayMin: 20, // minutes past the focus block over which the earn rate sinks to the floor
  decayFloor: 0.3, // earn-rate multiplier while you keep overstaying
  renagMin: 5, // re-nudge this often while a break is overdue
};

// Cosmetic prizes (bought with Cred). A palette prize adds a club-light colour to
// the picker; a jacket prize adds a DJ-jacket colour. Stored in profile.unlocks.
export interface Prize {
  id: string;
  name: string;
  price: number;
  kind: "palette" | "jacket";
  hue: number;
}
export const PRIZES: Prize[] = [
  { id: "pal-gold", name: "Gold Rush lights", price: 150, kind: "palette", hue: 45 },
  { id: "pal-vapor", name: "Vaporwave lights", price: 180, kind: "palette", hue: 312 },
  { id: "pal-toxic", name: "Toxic Green lights", price: 180, kind: "palette", hue: 96 },
  { id: "pal-ice", name: "Ice Blue lights", price: 200, kind: "palette", hue: 200 },
  { id: "pal-ember", name: "Ember lights", price: 240, kind: "palette", hue: 14 },
  { id: "jak-gold", name: "Gold jacket", price: 120, kind: "jacket", hue: 45 },
  { id: "jak-teal", name: "Teal jacket", price: 120, kind: "jacket", hue: 174 },
  { id: "jak-lime", name: "Lime jacket", price: 140, kind: "jacket", hue: 96 },
  { id: "jak-ice", name: "Ice jacket", price: 160, kind: "jacket", hue: 200 },
];

// ── DJ avatars (head/hat styles; visor & afro level-locked) ───────────────────
export interface AvatarConfig {
  id: AvatarId;
  name: string;
  unlockLevel: number;
}
export const AVATARS: Record<AvatarId, AvatarConfig> = {
  beanie: { id: "beanie", name: "Beanie", unlockLevel: 1 },
  snapback: { id: "snapback", name: "Snapback", unlockLevel: 1 },
  visor: { id: "visor", name: "Cyber Visor", unlockLevel: 3 },
  afro: { id: "afro", name: "Afro", unlockLevel: 5 },
};

// ── Club light palettes (one base hue drives the whole HSL scene) ─────────────
export const PALETTES: { name: string; hue: number }[] = [
  { name: "Magenta", hue: 288 },
  { name: "Cyan", hue: 190 },
  { name: "Amber", hue: 36 },
  { name: "Mint", hue: 150 },
  { name: "Violet", hue: 262 },
];
export const JACKET_HUES = [288, 190, 36, 150, 350];

// ── XP / level curve (time-based; ≈1 month to first festival at ~30min/day) ───
// XP is minutes listened + a novelty bonus per new track. LEVEL_MINUTES[L] is
// minutes needed to advance FROM level L. Cumulative drives the lifetime curve.
export const NOVELTY_BONUS_MIN = 5;
export const LEVEL_CAP = 12;
export const LEVEL_MINUTES: number[] = [
  0, // index 0 unused
  30, // 1→2  House Party
  60, // 2→3  Cyber Visor
  120, // 3→4  Neon Club
  240, // 4→5  Afro
  360, // 5→6  Festival · Opener (venue is fast-follow)
  900, // 6→7
  900, // 7→8  Festival · Sunset
  1800, // 8→9
  1800, // 9→10
  1800, // 10→11 Festival · Headliner
  3000, // 11→12 Stadium Tour
];

// What each level grants. Level is now a prestige track (from lifetime listening)
// that unlocks cosmetic avatars; venues are bought with Cred, not gated by level.
export const LEVEL_UNLOCKS: Record<number, { avatars?: AvatarId[] }> = {
  1: { avatars: ["beanie", "snapback"] },
  3: { avatars: ["visor"] },
  5: { avatars: ["afro"] },
};

// ── Ambient timing & real-clock curve ────────────────────────────────────────
export const AMBIENT = {
  windDownMs: 6000, // live→idle wind-down after playback stops
  peakHour: 23, // clock hour of max ambient energy (≈11pm)
  troughEnergy: 0.08, // ~4am near-dead floor
  peakEnergy: 0.5, // idle ceiling at peak hour
};

// ── Time-of-day setting: café (morning) → park (afternoon) → club (night) ─────
// The scene follows the real clock so the toy moves through the day with you.
export type Setting = "cafe" | "park" | "club";

export function settingForHour(h: number): Setting {
  if (h >= 6 && h < 11) return "cafe"; // morning coffee
  if (h >= 11 && h < 17) return "park"; // afternoon outdoors
  return "club"; // evening through late night
}

export const SETTING_LABEL: Record<Setting, string> = {
  cafe: "☕ MORNING CAFÉ",
  park: "🌳 AFTERNOON PARK",
  club: "● LIVE TONIGHT ●",
};

// Idle energy from the real clock: a cosine peaking at AMBIENT.peakHour.
export function clockAmbient(date = new Date()): number {
  const h = date.getHours() + date.getMinutes() / 60;
  const phase = ((h - AMBIENT.peakHour) / 24) * Math.PI * 2;
  const c = (Math.cos(phase) + 1) / 2; // 1 at peak hour, 0 opposite
  return AMBIENT.troughEnergy + (AMBIENT.peakEnergy - AMBIENT.troughEnergy) * c;
}

// ── Build edition ─────────────────────────────────────────────────────────────
// "standalone" (vite --mode itch) = a pure static build for itch.io/web hosting:
// no dev-server APIs, no radio proxy, no phone remote. The kiosk keeps them all.
export const STANDALONE = import.meta.env.MODE === "itch";

// The CC artists behind the soundtrack — shown as a compact per-artist credit in
// Options (a 89-track per-song list would be absurd; each track's specifics still
// show in the now-playing HUD). CC BY requires crediting the author; CC0 doesn't,
// but the CC0 artists get a thank-you anyway.
export const CC_ARTISTS: { artist: string; license: string; url: string }[] = [
  { artist: "SwapXFO", license: "CC BY 4.0", url: "https://archive.org/details/@swapxfo" },
  { artist: "Scott Buckley", license: "CC BY 4.0", url: "https://scottbuckley.com.au" },
  { artist: "Blue Dot Sessions", license: "CC BY", url: "https://www.sessions.blue" },
  { artist: "Kevin MacLeod", license: "CC BY / CC0", url: "https://incompetech.com" },
  { artist: "Lee Rosevere", license: "CC BY", url: "https://archive.org/details/@lee_rosevere" },
  { artist: "Broke For Free", license: "CC BY", url: "https://brokeforfree.bandcamp.com" },
  { artist: "Chris Zabriskie", license: "CC BY", url: "https://chriszabriskie.com" },
  { artist: "Andrey Avkhimovich", license: "CC BY 3.0", url: "https://archive.org/details/AAS006" },
];

// ── Discover: curated "music packs" (one-tap add) + live search ────────────────
// Each pack is a handful of hand-verified CC-BY/CC0 albums on the Internet
// Archive; adding one streams its tracks into your library (no download). The
// Discover panel also runs a live archive.org search behind these. Quality up
// front, infinite behind it — so the music never runs out.
export interface MusicPack { name: string; emoji: string; genre: Genre; blurb: string; items: string[]; }
// Every identifier below was verified against archive.org's metadata API as
// plain CC BY / CC0 / Public-Domain (NC/SA/ND rejected) AND confirmed to carry
// playable audio, so a one-tap pack never adds nothing or something unclearable.
export const MUSIC_PACKS: MusicPack[] = [
  { name: "Lofi & Focus", emoji: "🎧", genre: "lofi", blurb: "Calm beats to work to", items: ["MusicForPodcasts04", "MusicForPodcasts03", "MusicForPodcasts02", "MusicForPodcasts01"] },
  { name: "Deep Ambient", emoji: "🌌", genre: "ambient", blurb: "Spacious, cinematic drift", items: ["ChrisZabriskieDirectToVideo", "KaiEngelTheRun", "cz-blackhole", "cz-ogreatqueenelectric"] },
  { name: "Quiet Focus", emoji: "🍃", genre: "chill", blurb: "Tasteful, podcast-grade calm", items: ["jamendo-160711", "jamendo-160715", "jamendo-160716", "jamendo-160718"] },
  { name: "Downtempo Grooves", emoji: "🕺", genre: "downtempo", blurb: "Laid-back electronic funk", items: ["DirectionlessEP", "BrokeForFreeLayers", "Slam_Funk-7603"] },
];
export const PACK_MAX_PER_ITEM = 12; // cap per album so a pack stays a snack, not a firehose

// ── Bundled CC-BY soundtrack (attribution shown in the HUD + options credits) ──
// The files ship IN the build (public/cc/) — redistribution is what CC BY is
// for, provided the credit stays attached. Same-origin means a clean FFT too.
export interface StationTrack {
  src: string;
  title: string;
  artist: string;
  license: string;
  sourceUrl: string;
  genre?: Genre; // drives the venue×genre Cred bonus
}
const cc = (file: string): string => `${import.meta.env.BASE_URL}cc/${file}`;
// Two self-publishing CC artists: SwapXFO (original chiptune, CC BY 4.0) and Lee
// Rosevere (ambient/lofi, the plain-CC-BY "Music For Podcasts" set — NOT his
// BY-NC releases). Every track's license was verified against archive.org's own
// metadata before bundling; the arrangements of copyrighted game music in
// SwapXFO's catalogue were deliberately excluded.
export const CC_STATION = {
  name: "Bundled soundtrack (CC BY)",
  tracks: [
    { src: cc("dubious-dream.mp3"), title: "Dubious Dream", artist: "SwapXFO", license: "CC BY 4.0", sourceUrl: "https://archive.org/details/mus-dubious-dream", genre: "synthwave" },
    { src: cc("funky-code-mod.mp3"), title: "funky code mod", artist: "SwapXFO", license: "CC BY 4.0", sourceUrl: "https://archive.org/details/mus-funky-code-mod", genre: "house" },
    { src: cc("10-print-hello-world.mp3"), title: "10 PRINT HELLO WORLD", artist: "Andrey Avkhimovich", license: "CC BY 3.0", sourceUrl: "https://archive.org/details/AAS006", genre: "synthwave" },
    { src: cc("high-speed-dilemma.mp3"), title: "High-speed Dilemma", artist: "SwapXFO", license: "CC BY 4.0", sourceUrl: "https://archive.org/details/mus-high-speed-dilemma", genre: "synthwave" },
    { src: cc("long-lost-home.m4a"), title: "Long Lost Home", artist: "SwapXFO", license: "CC BY 4.0", sourceUrl: "https://archive.org/details/mus-long-lost-home", genre: "trance" },
    { src: cc("ground-battery.m4a"), title: "Ground Battery", artist: "SwapXFO", license: "CC BY 4.0", sourceUrl: "https://archive.org/details/mus-ground-battery", genre: "techno" },
    { src: cc("liquid-sugar-overload.opus"), title: "Liquid Sugar Overload", artist: "SwapXFO", license: "CC BY 4.0", sourceUrl: "https://archive.org/details/mus-liquid-sugar-overload", genre: "house" },
    { src: cc("star-dichotomy.m4a"), title: "Star Dichotomy", artist: "SwapXFO", license: "CC BY 4.0", sourceUrl: "https://archive.org/details/mus-star-dichotomy", genre: "trance" },
    { src: cc("50-c.opus"), title: "50ºC", artist: "SwapXFO", license: "CC BY 4.0", sourceUrl: "https://archive.org/details/mus-50-degrees", genre: "synthwave" },
    { src: cc("an-insomniac-s-walk-through-the-night.mp3"), title: "An Insomniac's Walk Through the Night", artist: "SwapXFO", license: "CC BY 4.0", sourceUrl: "https://archive.org/details/mus-an-insomniac-s-walk-through-the-night", genre: "lofi" },
    { src: cc("fox-s-nest.m4a"), title: "Fox's Nest", artist: "SwapXFO", license: "CC BY 4.0", sourceUrl: "https://archive.org/details/mus-foxs-nest", genre: "chill" },
    { src: cc("116112.m4a"), title: "116112", artist: "SwapXFO", license: "CC BY 4.0", sourceUrl: "https://archive.org/details/116112", genre: "house" },
    { src: cc("the-beaten-path.m4a"), title: "The Beaten Path", artist: "SwapXFO", license: "CC BY 4.0", sourceUrl: "https://archive.org/details/the-beaten-path", genre: "downtempo" },
    { src: cc("dreaming-of-whoever.m4a"), title: "Dreaming of Whoever", artist: "SwapXFO", license: "CC BY 4.0", sourceUrl: "https://archive.org/details/dreaming-of-whoever", genre: "lofi" },
    { src: cc("unprecedented-happiness.opus"), title: "Unprecedented Happiness", artist: "SwapXFO", license: "CC BY 4.0", sourceUrl: "https://archive.org/details/unprecedented-happiness", genre: "house" },
    { src: cc("project-onto-the-sea.m4a"), title: "Project Onto the Sea", artist: "SwapXFO", license: "CC BY 4.0", sourceUrl: "https://archive.org/details/mus-project-onto-the-sea", genre: "chill" },
    { src: cc("ups-and-downs.mp3"), title: "Ups and Downs", artist: "SwapXFO", license: "CC BY 4.0", sourceUrl: "https://archive.org/details/mus-ups-and-downs", genre: "lofi" },
    { src: cc("chill-fite.m4a"), title: "Chill Fite", artist: "SwapXFO", license: "CC BY 4.0", sourceUrl: "https://archive.org/details/mus-chill-fite", genre: "chill" },
    { src: cc("abstract-space-adventure.mp3"), title: "Abstract Space Adventure", artist: "SwapXFO", license: "CC BY 4.0", sourceUrl: "https://archive.org/details/mus-abstract-space-adventure", genre: "ambient" },
    { src: cc("introducing-the-pre-roll.mp3"), title: "Introducing the Pre-roll", artist: "Lee Rosevere", license: "CC BY 4.0", sourceUrl: "https://archive.org/details/leerosevere_musicforpodcasts_5", genre: "ambient" },
    { src: cc("all-the-answers.mp3"), title: "All the Answers", artist: "Lee Rosevere", license: "CC BY 4.0", sourceUrl: "https://archive.org/details/leerosevere_musicforpodcasts_5", genre: "ambient" },
    { src: cc("thinking-it-over.mp3"), title: "Thinking It Over", artist: "Lee Rosevere", license: "CC BY 4.0", sourceUrl: "https://archive.org/details/leerosevere_musicforpodcasts_5", genre: "ambient" },
    { src: cc("you-re-enough.mp3"), title: "You're Enough", artist: "Lee Rosevere", license: "CC BY 4.0", sourceUrl: "https://archive.org/details/leerosevere_musicforpodcasts_5", genre: "ambient" },
    { src: cc("let-that-sink-in.mp3"), title: "Let That Sink In", artist: "Lee Rosevere", license: "CC BY 4.0", sourceUrl: "https://archive.org/details/leerosevere_musicforpodcasts_6", genre: "lofi" },
    { src: cc("thought-bubbles.mp3"), title: "Thought Bubbles", artist: "Lee Rosevere", license: "CC BY 4.0", sourceUrl: "https://archive.org/details/leerosevere_musicforpodcasts_6", genre: "lofi" },
    { src: cc("going-in-circles.mp3"), title: "Going In Circles", artist: "Lee Rosevere", license: "CC BY 4.0", sourceUrl: "https://archive.org/details/leerosevere_musicforpodcasts_6", genre: "lofi" },
    { src: cc("bigger-questions.mp3"), title: "Bigger Questions", artist: "Lee Rosevere", license: "CC BY 4.0", sourceUrl: "https://archive.org/details/leerosevere_musicforpodcasts_6", genre: "lofi" },
  ] as StationTrack[],
};

// ── Streamed CC catalogue (Internet Archive, no bundle cost) ──────────────────
// The variety engine: dozens more verified CC-BY/CC0 tracks referenced by URL
// (archive.org serves CORS * + range requests, so the AnalyserNode reads them
// like any local file). Needs a connection; the bundled set above is the
// offline core. All plain CC BY / CC0 — curated for quality, not just license.
export const CC_STREAM: StationTrack[] = [
  { src: "https://archive.org/download/mus-unfamiliar-metropolis/Unfamiliar%20Metropolis.m4a", title: "Unfamiliar Metropolis", artist: "SwapXFO", license: "CC BY 4.0", sourceUrl: "https://archive.org/details/mus-unfamiliar-metropolis", genre: "synthwave" },
  { src: "https://archive.org/download/album-intrepid-normalization/01%20-%20Viewgazing.mp3", title: "Viewgazing", artist: "SwapXFO", license: "CC BY 4.0", sourceUrl: "https://archive.org/details/album-intrepid-normalization", genre: "house" },
  { src: "https://archive.org/download/mus-cosmic-compulsion/Cosmic%20Compulsion.m4a", title: "Cosmic Compulsion", artist: "SwapXFO", license: "CC BY 4.0", sourceUrl: "https://archive.org/details/mus-cosmic-compulsion", genre: "techno" },
  { src: "https://archive.org/download/mus-pointless-discourse/Pointless%20Discourse.m4a", title: "Pointless Discourse", artist: "SwapXFO", license: "CC BY 4.0", sourceUrl: "https://archive.org/details/mus-pointless-discourse", genre: "trance" },
  { src: "https://archive.org/download/mus-fighting-for-a-dubious-cause/Fighting%20for%20a%20Dubious%20Cause.mp3", title: "Fighting for a Dubious Cause", artist: "SwapXFO", license: "CC BY 4.0", sourceUrl: "https://archive.org/details/mus-fighting-for-a-dubious-cause", genre: "chill" },
  { src: "https://archive.org/download/mus-yellow-twilight/Yellow%20Twilight.m4a", title: "Yellow Twilight", artist: "SwapXFO", license: "CC BY 4.0", sourceUrl: "https://archive.org/details/mus-yellow-twilight", genre: "lofi" },
  { src: "https://archive.org/download/mus-bait-and-switch/Bait%20and%20Switch.mp3", title: "Bait and Switch", artist: "SwapXFO", license: "CC BY 4.0", sourceUrl: "https://archive.org/details/mus-bait-and-switch", genre: "synthwave" },
  { src: "https://archive.org/download/mus-returnal/Returnal.mp3", title: "Returnal", artist: "SwapXFO", license: "CC BY 4.0", sourceUrl: "https://archive.org/details/mus-returnal", genre: "house" },
  { src: "https://archive.org/download/mus-moonrise/Moonrise.m4a", title: "Moonrise", artist: "SwapXFO", license: "CC BY 4.0", sourceUrl: "https://archive.org/details/mus-moonrise", genre: "techno" },
  { src: "https://archive.org/download/mus-cold-sun/Cold%20Sun.mp3", title: "Cold Sun", artist: "SwapXFO", license: "CC BY 4.0", sourceUrl: "https://archive.org/details/mus-cold-sun", genre: "trance" },
  { src: "https://archive.org/download/mus-street-end-dusk/Street-end%20Dusk.mp3", title: "Street-end Dusk", artist: "SwapXFO", license: "CC BY 4.0", sourceUrl: "https://archive.org/details/mus-street-end-dusk", genre: "chill" },
  { src: "https://archive.org/download/mus-eastern-wind/Eastern%20Wind.m4a", title: "Eastern Wind", artist: "SwapXFO", license: "CC BY 4.0", sourceUrl: "https://archive.org/details/mus-eastern-wind", genre: "lofi" },
  { src: "https://archive.org/download/xfo-preaching-to-the-choir/Preaching%20to%20the%20Choir.mp3", title: "Preaching to the Choir", artist: "SwapXFO", license: "CC BY 4.0", sourceUrl: "https://archive.org/details/xfo-preaching-to-the-choir", genre: "synthwave" },
  { src: "https://archive.org/download/mus-pitch-blackkave/Pitch%20Blackkave.m4a", title: "Pitch Blackkave", artist: "SwapXFO", license: "CC BY 4.0", sourceUrl: "https://archive.org/details/mus-pitch-blackkave", genre: "house" },
  // ── Scott Buckley — cinematic CC-BY, the quality tier ──
  { src: "https://archive.org/download/sb_legionnaire2022/sb_legionnaire2022.mp3", title: "Legionnaire", artist: "Scott Buckley", license: "CC BY 4.0", sourceUrl: "https://archive.org/details/sb_legionnaire2022", genre: "trance" },
  { src: "https://archive.org/download/Scott_Buckley-glow/Glow.mp3", title: "Glow", artist: "Scott Buckley", license: "CC BY 4.0", sourceUrl: "https://archive.org/details/Scott_Buckley-glow", genre: "ambient" },
  { src: "https://archive.org/download/adrift-among-infinite-stars/AdriftAmongInfiniteStars.mp3", title: "Adrift Among Infinite Stars", artist: "Scott Buckley", license: "CC BY 4.0", sourceUrl: "https://archive.org/details/adrift-among-infinite-stars", genre: "ambient" },
  { src: "https://archive.org/download/sb_reverie/sb_reverie.mp3", title: "Reverie", artist: "Scott Buckley", license: "CC BY 4.0", sourceUrl: "https://archive.org/details/sb_reverie", genre: "ambient" },
  // ── Blue Dot Sessions — tasteful CC-BY (the stuff podcasts use) ──
  { src: "https://archive.org/download/jamendo-160711/01-1365346-Blue%20Dot%20Sessions-Red%20City%20Theme.mp3", title: "Red City Theme", artist: "Blue Dot Sessions", license: "CC BY 3.0", sourceUrl: "https://archive.org/details/jamendo-160711", genre: "downtempo" },
  { src: "https://archive.org/download/jamendo-160715/01-1365382-Blue%20Dot%20Sessions-When%20We%20Set%20Out.mp3", title: "When We Set Out", artist: "Blue Dot Sessions", license: "CC BY 3.0", sourceUrl: "https://archive.org/details/jamendo-160715", genre: "chill" },
  { src: "https://archive.org/download/jamendo-160718/02-1365409-Blue%20Dot%20Sessions-Tranceless.mp3", title: "Tranceless", artist: "Blue Dot Sessions", license: "CC BY 3.0", sourceUrl: "https://archive.org/details/jamendo-160718", genre: "chill" },
  // ── Kevin MacLeod — the reliable royalty-free standard ──
  { src: "https://archive.org/download/come-play-with-me-by-kevin-macleod/come-play-with-me-by-kevin-macleod.mp3", title: "Come Play with Me", artist: "Kevin MacLeod", license: "CC BY 4.0", sourceUrl: "https://archive.org/details/come-play-with-me-by-kevin-macleod", genre: "house" },
  { src: "https://archive.org/download/kevin-mac-leod-doh-de-oh/Kevin%20MacLeod%20Doh%20De%20Oh.mp3", title: "Doh De Oh", artist: "Kevin MacLeod", license: "CC0", sourceUrl: "https://archive.org/details/kevin-mac-leod-doh-de-oh", genre: "downtempo" },
  { src: "https://archive.org/download/Slam_Funk-7603/Broke_For_Free_-_01_-_Nothing_Like_Captain_Crunch.mp3", title: "Nothing Like Captain Crunch", artist: "Broke For Free", license: "CC BY 3.0", sourceUrl: "https://archive.org/details/Slam_Funk-7603", genre: "downtempo" },
  { src: "https://archive.org/download/Slam_Funk-7603/Broke_For_Free_-_02_-_Calm_The_Fuck_Down.mp3", title: "Calm The Fuck Down", artist: "Broke For Free", license: "CC BY 3.0", sourceUrl: "https://archive.org/details/Slam_Funk-7603", genre: "downtempo" },
  { src: "https://archive.org/download/Slam_Funk-7603/Broke_For_Free_-_03_-_The_Great.mp3", title: "The Great", artist: "Broke For Free", license: "CC BY 3.0", sourceUrl: "https://archive.org/details/Slam_Funk-7603", genre: "downtempo" },
  { src: "https://archive.org/download/BrokeForFreeLayers/Broke%20For%20Free%20-%20Layers%20-%2001%20As%20Colourful%20As%20Ever.mp3", title: "As Colourful As Ever", artist: "Broke For Free", license: "CC BY 3.0", sourceUrl: "https://archive.org/details/BrokeForFreeLayers", genre: "house" },
  { src: "https://archive.org/download/BrokeForFreeLayers/Broke%20For%20Free%20-%20Layers%20-%2002%20Knock%20Knock.mp3", title: "Knock Knock", artist: "Broke For Free", license: "CC BY 3.0", sourceUrl: "https://archive.org/details/BrokeForFreeLayers", genre: "house" },
  { src: "https://archive.org/download/BrokeForFreeLayers/Broke%20For%20Free%20-%20Layers%20-%2003%20Only%20Knows.mp3", title: "Only Knows", artist: "Broke For Free", license: "CC BY 3.0", sourceUrl: "https://archive.org/details/BrokeForFreeLayers", genre: "house" },
  { src: "https://archive.org/download/DirectionlessEP/Broke%20For%20Free%20-%20Directionless%20EP%20-%2001%20Night%20Owl.mp3", title: "Night Owl", artist: "Broke For Free", license: "CC BY 3.0", sourceUrl: "https://archive.org/details/DirectionlessEP", genre: "chill" },
  { src: "https://archive.org/download/DirectionlessEP/Broke%20For%20Free%20-%20Directionless%20EP%20-%2002%20My%20Always%20Mood.mp3", title: "My Always Mood", artist: "Broke For Free", license: "CC BY 3.0", sourceUrl: "https://archive.org/details/DirectionlessEP", genre: "chill" },
  { src: "https://archive.org/download/DirectionlessEP/Broke%20For%20Free%20-%20Directionless%20EP%20-%2003%20Day%20Bird.mp3", title: "Day Bird", artist: "Broke For Free", license: "CC BY 3.0", sourceUrl: "https://archive.org/details/DirectionlessEP", genre: "chill" },
  { src: "https://archive.org/download/ChrisZabriskieDirectToVideo/Chris%20Zabriskie%20-%20Direct%20to%20Video%20-%2001%20Direct%20to%20Video.mp3", title: "Direct to Video", artist: "Chris Zabriskie", license: "CC BY 3.0", sourceUrl: "https://archive.org/details/ChrisZabriskieDirectToVideo", genre: "ambient" },
  { src: "https://archive.org/download/ChrisZabriskieDirectToVideo/Chris%20Zabriskie%20-%20Direct%20to%20Video%20-%2002%20What%20Does%20Anybody%20Know%20About%20Anything.mp3", title: "What Does Anybody Know About Anything", artist: "Chris Zabriskie", license: "CC BY 3.0", sourceUrl: "https://archive.org/details/ChrisZabriskieDirectToVideo", genre: "ambient" },
  { src: "https://archive.org/download/ChrisZabriskieDirectToVideo/Chris%20Zabriskie%20-%20Direct%20to%20Video%20-%2003%20I%20Don%27t%20See%20the%20Branches%2C%20I%20See%20the%20Leaves.mp3", title: "I Don't See the Branches, I See the Leaves", artist: "Chris Zabriskie", license: "CC BY 3.0", sourceUrl: "https://archive.org/details/ChrisZabriskieDirectToVideo", genre: "ambient" },
  { src: "https://archive.org/download/ChrisZabriskieDirectToVideo/Chris%20Zabriskie%20-%20Direct%20to%20Video%20-%2004%20I%20Want%20to%20Fall%20in%20Love%20on%20Snapchat.mp3", title: "I Want to Fall in Love on Snapchat", artist: "Chris Zabriskie", license: "CC BY 3.0", sourceUrl: "https://archive.org/details/ChrisZabriskieDirectToVideo", genre: "ambient" },
  { src: "https://archive.org/download/ChrisZabriskieDirectToVideo/Chris%20Zabriskie%20-%20Direct%20to%20Video%20-%2005%20But%20Enough%20About%20Me%2C%20Bill%20Paxton.mp3", title: "But Enough About Me, Bill Paxton", artist: "Chris Zabriskie", license: "CC BY 3.0", sourceUrl: "https://archive.org/details/ChrisZabriskieDirectToVideo", genre: "ambient" },
  { src: "https://archive.org/download/MusicForPodcasts04/Lee%20Rosevere%20-%20Music%20for%20Podcasts%204%20-%2001%20As%20I%20Was%20Saying.mp3", title: "As I Was Saying", artist: "Lee Rosevere", license: "CC BY 3.0", sourceUrl: "https://archive.org/details/MusicForPodcasts04", genre: "ambient" },
  { src: "https://archive.org/download/MusicForPodcasts04/Lee%20Rosevere%20-%20Music%20for%20Podcasts%204%20-%2002%20Sad%20Marimba%20Planet.mp3", title: "Sad Marimba Planet", artist: "Lee Rosevere", license: "CC BY 3.0", sourceUrl: "https://archive.org/details/MusicForPodcasts04", genre: "ambient" },
  { src: "https://archive.org/download/MusicForPodcasts04/Lee%20Rosevere%20-%20Music%20for%20Podcasts%204%20-%2003%20Small%20Steps.mp3", title: "Small Steps", artist: "Lee Rosevere", license: "CC BY 3.0", sourceUrl: "https://archive.org/details/MusicForPodcasts04", genre: "ambient" },
  { src: "https://archive.org/download/MusicForPodcasts04/Lee%20Rosevere%20-%20Music%20for%20Podcasts%204%20-%2004%20New%20Day.mp3", title: "New Day", artist: "Lee Rosevere", license: "CC BY 3.0", sourceUrl: "https://archive.org/details/MusicForPodcasts04", genre: "ambient" },
  { src: "https://archive.org/download/MusicForPodcasts04/Lee%20Rosevere%20-%20Music%20for%20Podcasts%204%20-%2005%20How%20I%20Used%20To%20See%20The%20Stars.mp3", title: "How I Used To See The Stars", artist: "Lee Rosevere", license: "CC BY 3.0", sourceUrl: "https://archive.org/details/MusicForPodcasts04", genre: "ambient" },
  { src: "https://archive.org/download/Love_Wins-18494/Lee_Rosevere_-_Love_Wins.mp3", title: "Love Wins", artist: "Lee Rosevere", license: "CC BY 4.0", sourceUrl: "https://archive.org/details/Love_Wins-18494", genre: "chill" },
];


// ── Internet radio stations (first-class, like a real radio widget) ───────────
// Streamed through a same-origin proxy (/api/radio) so the AnalyserNode can read
// them regardless of each station's CORS headers. SomaFM is listener-supported
// and freely streamable — credited in the HUD.
// Each station carries a Genre so it can be matched against a venue's affinity
// (and the daily bonus pairing) for the Cred multiplier.
export interface Station {
  name: string;
  genre: Genre;
  stream: string;
  hue: number;
}
const soma = (id: string): string => `https://ice1.somafm.com/${id}-128-mp3`;
// Dance/electronic stations only — every dance Genre has at least one here.
export const STATIONS: Station[] = [
  { name: "Fluid", genre: "lofi", stream: soma("fluid"), hue: 280 },
  { name: "Groove Salad", genre: "chill", stream: soma("groovesalad"), hue: 150 },
  { name: "Lush", genre: "downtempo", stream: soma("lush"), hue: 175 },
  { name: "Beat Blender", genre: "house", stream: soma("beatblender"), hue: 288 },
  { name: "The Trip", genre: "trance", stream: soma("thetrip"), hue: 262 },
  { name: "DEF CON Radio", genre: "techno", stream: soma("defcon"), hue: 190 },
  { name: "Suburbs of Goa", genre: "trance", stream: soma("suburbsofgoa"), hue: 128 },
  { name: "Dub Step Beyond", genre: "dnb", stream: soma("dubstep"), hue: 200 },
  { name: "Drone Zone", genre: "ambient", stream: soma("dronezone"), hue: 210 },
  { name: "Underground 80s", genre: "synthwave", stream: soma("u80s"), hue: 312 },
  { name: "Nightwave Plaza", genre: "synthwave", stream: "https://radio.plaza.one/mp3", hue: 318 },
];

// Kiosk: streams go through the same-origin /api/radio proxy so the AnalyserNode
// can always read them. Standalone has no proxy — play the stream directly and
// rely on the station's own CORS headers (most icecast stations send them; ones
// that don't simply won't play, surfaced by the add-station flow).
export const radioUrl = (stream: string): string =>
  STANDALONE ? stream : `/api/radio?url=${encodeURIComponent(stream)}`;

// ── venue × genre Cred multiplier ────────────────────────────────────────────
// Play music whose genre matches the venue and you earn faster. A native match
// (station genre == the venue's affinity) gives MATCH_MULT; hitting today's
// rotating bonus pairing (a random genre at a random place, same for everyone
// that day) gives the bigger DAILY_MULT.
export const MATCH_MULT = 1.5;
export const DAILY_MULT = 3;

// Today's bonus pairing — deterministic per UTC day so it's stable all day and
// rotates each day. The GENRE is shared by everyone (a cheap hash of the day);
// the VENUE is drawn from the ones YOU'VE UNLOCKED so the bonus is always
// reachable (no "×3 at a venue you can't visit"). Pass your owned venues in.
export function dailyBonus(owned: VenueId[], date = new Date()): { genre: Genre; venue: VenueId } {
  const day = Math.floor(date.getTime() / 86400000);
  const genres = [...new Set(STATIONS.map((s) => s.genre))];
  const hash = (n: number) => ((Math.sin(n) * 43758.5453) % 1 + 1) % 1; // 0..1
  const g = genres[Math.floor(hash(day * 2.17) * genres.length)];
  // draw the venue from spots you can commit to ALL DAY: owned AND not a curfew
  // venue (parks/rooftops/beaches shut down after dark), so the ×3 is never
  // stranded behind a curfew.
  const base = owned.length ? owned : VENUE_ORDER;
  const open = base.filter((id) => !VENUES[id].curfew);
  const pool = open.length ? open : base; // never empty
  const v = pool[Math.floor(hash(day * 7.31 + 11) * pool.length)];
  return { genre: g, venue: v };
}

export function genreMult(venue: VenueId, stationGenre: Genre | null, owned: VenueId[], date = new Date()): { mult: number; kind: "daily" | "native" | null } {
  if (!stationGenre) return { mult: 1, kind: null };
  const daily = dailyBonus(owned, date);
  if (stationGenre === daily.genre && venue === daily.venue) return { mult: DAILY_MULT, kind: "daily" };
  if (stationGenre === VENUES[venue].genre) return { mult: MATCH_MULT, kind: "native" };
  return { mult: 1, kind: null };
}

// ── time-of-day suitability ──────────────────────────────────────────────────
// Some venues simply pay off at their natural hour: a park is a daytime place
// (worth less at midnight), a neon club comes alive at night (worth less at
// noon). A tagged venue earns TIME_LOW..TIME_HIGH × by how well NOW fits its
// daypart; untagged venues are time-neutral (always ×1).
export const TIME_LOW = 0.5; // the wrong time of day for this venue
export const TIME_HIGH = 1.3; // its natural hour

// Daylight strength 0..1 on the LOCAL clock — a cosine peaking ~1pm, trough ~1am.
export function daylight(date = new Date()): number {
  const h = date.getHours() + date.getMinutes() / 60;
  const phase = ((h - 13) / 24) * Math.PI * 2;
  return (Math.cos(phase) + 1) / 2;
}

export function timeMult(venue: VenueId, date = new Date()): { mult: number; daypart: "day" | "night" | null; fit: number } {
  const dp = VENUES[venue].daypart ?? null;
  if (!dp) return { mult: 1, daypart: null, fit: 0.5 };
  const fit = dp === "day" ? daylight(date) : 1 - daylight(date); // 1 = perfect hour, 0 = worst
  return { mult: TIME_LOW + (TIME_HIGH - TIME_LOW) * fit, daypart: dp, fit };
}

export const ACCEPTED_AUDIO = /\.(mp3|wav|wave|aif|aiff|aifc|flac|m4a|mp4|aac|ogg|oga|opus)$/i;
