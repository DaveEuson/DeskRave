// ─────────────────────────────────────────────────────────────────────────────
// Pixel DJ — the ONE balance module.
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

// ── The one CC-BY station for the MVP (attribution shown in HUD) ──────────────
export interface StationTrack {
  src: string;
  title: string;
  artist: string;
  license: string;
  sourceUrl: string;
}
const arc = (id: string, file: string) => `https://archive.org/download/${id}/${encodeURIComponent(file)}`;
export const CC_STATION = {
  name: "Internet Archive · Chiptune",
  tracks: [
    { src: arc("mus-dubious-dream", "Dubious Dream.mp3"), title: "Dubious Dream", artist: "SwapXFO", license: "CC BY 4.0", sourceUrl: "https://archive.org/details/mus-dubious-dream" },
    { src: arc("mus-funky-code-mod", "funky code mod.mp3"), title: "funky code mod", artist: "SwapXFO", license: "CC BY 4.0", sourceUrl: "https://archive.org/details/mus-funky-code-mod" },
    { src: arc("AAS006", "01_10_PRINT_HELLO_WORLD.mp3"), title: "10 PRINT HELLO WORLD", artist: "Andrey Avkhimovich", license: "CC BY 3.0", sourceUrl: "https://archive.org/details/AAS006" },
  ] as StationTrack[],
};

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

export const radioUrl = (stream: string): string => `/api/radio?url=${encodeURIComponent(stream)}`;

// ── venue × genre Cred multiplier ────────────────────────────────────────────
// Play music whose genre matches the venue and you earn faster. A native match
// (station genre == the venue's affinity) gives MATCH_MULT; hitting today's
// rotating bonus pairing (a random genre at a random place, same for everyone
// that day) gives the bigger DAILY_MULT.
export const MATCH_MULT = 1.5;
export const DAILY_MULT = 3;

// Today's bonus pairing — deterministic per UTC day so it's stable all day and
// rotates each day. Random-feeling genre × place via a cheap hash of the day.
export function dailyBonus(date = new Date()): { genre: Genre; venue: VenueId } {
  const day = Math.floor(date.getTime() / 86400000);
  const genres = [...new Set(STATIONS.map((s) => s.genre))];
  const hash = (n: number) => ((Math.sin(n) * 43758.5453) % 1 + 1) % 1; // 0..1
  const g = genres[Math.floor(hash(day * 2.17) * genres.length)];
  const v = VENUE_ORDER[Math.floor(hash(day * 7.31 + 11) * VENUE_ORDER.length)];
  return { genre: g, venue: v };
}

export function genreMult(venue: VenueId, stationGenre: Genre | null, date = new Date()): { mult: number; kind: "daily" | "native" | null } {
  if (!stationGenre) return { mult: 1, kind: null };
  const daily = dailyBonus(date);
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
