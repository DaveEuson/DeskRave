// ─────────────────────────────────────────────────────────────────────────────
// Pixel DJ — the ONE balance module.
// Every tunable number (vibes, venues, avatars, palettes, XP curve, FFT bands,
// timings) lives here so two devs build the same game and balance is one file.
// Per the handoff README: do not scatter these through the render code.
// ─────────────────────────────────────────────────────────────────────────────

export type VibeName = "chill" | "groove" | "rave";
export type VenueId = "backyard" | "house" | "club";
export type AvatarId = "beanie" | "snapback" | "visor" | "afro";
export type SkyId = "night-warm" | "indoor-dim" | "club-dark";
export type RigId = "string" | "bars" | "truss";

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

// ── Venues (MVP = the small→resident arc; fast-follow festivals add config) ───
export interface VenueConfig {
  id: VenueId;
  name: string;
  unlockLevel: number;
  crowdScale: number;
  sky: SkyId;
  rig: RigId;
  beams: number;
  fence?: boolean;
  speakers?: boolean;
}
export const VENUES: Record<VenueId, VenueConfig> = {
  backyard: { id: "backyard", name: "Backyard Jam", unlockLevel: 1, crowdScale: 0.45, sky: "night-warm", rig: "string", beams: 0, fence: true },
  house: { id: "house", name: "House Party", unlockLevel: 2, crowdScale: 0.7, sky: "indoor-dim", rig: "bars", beams: 2 },
  club: { id: "club", name: "Neon Club", unlockLevel: 4, crowdScale: 1.0, sky: "club-dark", rig: "truss", beams: 5, speakers: true },
};
export const VENUE_ORDER: VenueId[] = ["backyard", "house", "club"];

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

// What each level grants (venues + avatars). MVP surfaces only MVP entries.
export const LEVEL_UNLOCKS: Record<number, { venues?: VenueId[]; avatars?: AvatarId[] }> = {
  1: { venues: ["backyard"], avatars: ["beanie", "snapback"] },
  2: { venues: ["house"] },
  3: { avatars: ["visor"] },
  4: { venues: ["club"] },
  5: { avatars: ["afro"] },
};

// ── Ambient timing & real-clock curve ────────────────────────────────────────
export const AMBIENT = {
  windDownMs: 6000, // live→idle wind-down after playback stops
  peakHour: 23, // clock hour of max ambient energy (≈11pm)
  troughEnergy: 0.08, // ~4am near-dead floor
  peakEnergy: 0.5, // idle ceiling at peak hour
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

export const ACCEPTED_AUDIO = /\.(mp3|wav|wave|aif|aiff|aifc|flac|m4a|mp4|aac|ogg|oga|opus)$/i;
