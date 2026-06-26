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

// Music genres used for venue affinity + the daily venue×genre multiplier.
export type Genre =
  | "lofi" | "chill" | "downtempo" | "house" | "techno" | "dnb" | "hardcore"
  | "ambient" | "metal" | "rock" | "pop" | "funk" | "jazz" | "country"
  | "world" | "synthwave" | "hiphop";

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
}
export const VENUES: Record<VenueId, VenueMeta> = {
  // free starters (the early career + the everyday work spots + signature club)
  soundcheck: { id: "soundcheck", name: "Soundcheck", label: "🎚 SOUNDCHECK", accent: "#7ad6b0", genre: "rock", price: 0, crowd: true },
  cafe: { id: "cafe", name: "Morning Café", label: "☕ MORNING CAFÉ", accent: "#f6b352", genre: "lofi", price: 0, ported: true },
  park: { id: "park", name: "Afternoon Park", label: "🌳 AFTERNOON PARK", accent: "#7fd06a", genre: "chill", price: 0, crowd: true, ported: true },
  club: { id: "club", name: "Neon Club", label: "● LIVE TONIGHT ●", accent: "#d24fe0", genre: "techno", price: 0, dark: true, crowd: true, ported: true },
  // everyday spots
  bedroom: { id: "bedroom", name: "BFF's Bedroom", label: "BEST FRIENDS", accent: "#a98cff", genre: "pop", price: 60, crowd: true },
  diner: { id: "diner", name: "Night Owl Diner", label: "THE NIGHT OWL", accent: "#ff5e8a", genre: "rock", price: 60, crowd: true },
  recordshop: { id: "recordshop", name: "Record Shop", label: "CRATE DIGGING", accent: "#e8a23c", genre: "funk", price: 60 },
  car: { id: "car", name: "In Your Car", label: "WINDOWS DOWN", accent: "#ff5e8a", genre: "hiphop", price: 60 },
  studio: { id: "studio", name: "After Hours Studio", label: "AFTER HOURS", accent: "#8a8cff", genre: "lofi", price: 80, dark: true },
  openhero: { id: "openhero", name: "Opening for Your Hero", label: "WARM-UP SLOT", accent: "#ffd24a", genre: "house", price: 90, crowd: true },
  // bigger rooms + outdoors
  rooftop: { id: "rooftop", name: "Rooftop", label: "GOLDEN HOUR", accent: "#ff9e5e", genre: "house", price: 120, crowd: true, ported: true },
  beach: { id: "beach", name: "Sunset Shore", label: "SUNSET SHORE", accent: "#ffb27a", genre: "chill", price: 120, crowd: true, ported: true },
  houseparty: { id: "houseparty", name: "House Party", label: "HOUSE PARTY", accent: "#ffb84a", genre: "pop", price: 120, crowd: true },
  radio: { id: "radio", name: "Radio Booth", label: "ON AIR", accent: "#ff6a5e", genre: "downtempo", price: 120, dark: true },
  arcade: { id: "arcade", name: "Barcade", label: "INSERT COIN", accent: "#62e0ff", genre: "synthwave", price: 140, dark: true, crowd: true },
  laundromat: { id: "laundromat", name: "Laundromat", label: "SPIN CYCLE", accent: "#5fd0e0", genre: "hardcore", price: 140, dark: true, crowd: true },
  subway: { id: "subway", name: "Subway Platform", label: "LAST TRAIN", accent: "#5fd0c8", genre: "lofi", price: 140, dark: true, crowd: true },
  tavern: { id: "tavern", name: "Medieval Tavern", label: "YE OLDE DROP", accent: "#ffae4a", genre: "world", price: 160, crowd: true },
  // shows + novelty
  prom: { id: "prom", name: "School Prom", label: "PROM NIGHT", accent: "#9a8cff", genre: "pop", price: 200, dark: true, crowd: true },
  wedding: { id: "wedding", name: "The Reception", label: "THE RECEPTION", accent: "#ff9ec4", genre: "pop", price: 200, crowd: true, ported: true },
  silent: { id: "silent", name: "Silent Disco", label: "SILENT DISCO", accent: "#4ce0c0", genre: "house", price: 200, dark: true, crowd: true, ported: true },
  rink: { id: "rink", name: "Roller Rink", label: "ROLLER DISCO", accent: "#ff5fae", genre: "funk", price: 200, dark: true, crowd: true, ported: true },
  skilodge: { id: "skilodge", name: "Ski Lodge", label: "APRÈS-SKI", accent: "#9ed2ff", genre: "house", price: 220, crowd: true },
  boat: { id: "boat", name: "Sunset Cruise", label: "ON DECK", accent: "#ff8f6a", genre: "chill", price: 220, crowd: true },
  forest: { id: "forest", name: "Forest Rave", label: "DEEP WOODS", accent: "#7fe04a", genre: "techno", price: 240, crowd: true },
  underbridge: { id: "underbridge", name: "Under the Bridge", label: "OVERPASS", accent: "#5fe0c0", genre: "dnb", price: 240, dark: true, crowd: true },
  bakersfield: { id: "bakersfield", name: "Bakersfield Rave", label: "DESERT BASS", accent: "#ffc23c", genre: "country", price: 240, crowd: true },
  bigroom: { id: "bigroom", name: "Early Doors", label: "THE BIG ROOM", accent: "#6fd0e0", genre: "techno", price: 260, dark: true, crowd: true },
  // big stages + spectacle
  warehouse: { id: "warehouse", name: "Warehouse", label: "WAREHOUSE", accent: "#d24fe0", genre: "techno", price: 320, dark: true, crowd: true, ported: true },
  festival: { id: "festival", name: "Main Stage", label: "MAIN STAGE", accent: "#ffd24a", genre: "techno", price: 360, crowd: true, ported: true },
  balloon: { id: "balloon", name: "Hot Air Balloon", label: "ABOVE IT ALL", accent: "#ff8f4a", genre: "ambient", price: 320 },
  airport: { id: "airport", name: "Departures Lounge", label: "GATE 13", accent: "#7fb0e8", genre: "ambient", price: 320, crowd: true },
  aquarium: { id: "aquarium", name: "Aquarium", label: "DEEP CUTS", accent: "#4ec0ff", genre: "ambient", price: 320, dark: true, crowd: true },
  dmv: { id: "dmv", name: "The DMV", label: "NOW SERVING", accent: "#9bd14a", genre: "jazz", price: 280, dark: true, crowd: true },
  // destination / legendary
  space: { id: "space", name: "Space Station", label: "ZERO-G", accent: "#b08cff", genre: "ambient", price: 500, dark: true, crowd: true },
  whitehouse: { id: "whitehouse", name: "The White House", label: "HAIL TO THE BEAT", accent: "#6f9fe0", genre: "funk", price: 500, crowd: true },
  japan: { id: "japan", name: "Sakura Festival", label: "SAKURA SET", accent: "#ff9ec4", genre: "world", price: 460, crowd: true },
  india: { id: "india", name: "Holi House", label: "HOLI HOUSE", accent: "#ff9e3c", genre: "world", price: 460, crowd: true },
  heaven: { id: "heaven", name: "Heaven", label: "PEARLY GATES", accent: "#ffe9a0", genre: "ambient", price: 600, dark: true, crowd: true },
  headliner: { id: "headliner", name: "Headliner", label: "TOP OF THE BILL", accent: "#ff4ea0", genre: "techno", price: 600, dark: true, crowd: true },
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

// Venues unlocked for free at the start (everything else costs Cred).
export const STARTER_VENUES: VenueId[] = ["soundcheck", "cafe", "park", "club"];

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
export interface Station {
  name: string;
  genre: string;
  stream: string;
  hue: number;
}
export const STATIONS: Station[] = [
  { name: "Groove Salad", genre: "downtempo", stream: "https://ice1.somafm.com/groovesalad-128-mp3", hue: 150 },
  { name: "Beat Blender", genre: "deep house", stream: "https://ice1.somafm.com/beatblender-128-mp3", hue: 288 },
  { name: "DEF CON Radio", genre: "electronic", stream: "https://ice1.somafm.com/defcon-128-mp3", hue: 190 },
  { name: "The Trip", genre: "prog house", stream: "https://ice1.somafm.com/thetrip-128-mp3", hue: 262 },
];

export const radioUrl = (stream: string): string => `/api/radio?url=${encodeURIComponent(stream)}`;

export const ACCEPTED_AUDIO = /\.(mp3|wav|wave|aif|aiff|aifc|flac|m4a|mp4|aac|ogg|oga|opus)$/i;
