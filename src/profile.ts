import { type AvatarId, type VenueId, type VibeName } from "./config";

// The server-authoritative profile (schema pinned by the handoff README).
// localStorage is an offline mirror, not the source of truth.
export interface Settings {
  showClock: boolean;
  showDate: boolean;
  clock24: boolean;
  scanlines: boolean;
  sound: boolean;
  weather: "clear" | "rain" | "snow" | "haze";
}

export interface Profile {
  id: string;
  djName: string;
  avatar: AvatarId;
  jacketHue: number;
  level: number;
  xp: number; // fraction toward next level (0..1)
  listenedMinutes: number; // lifetime — drives XP
  uniqueTracks: string[]; // novelty bonus set
  venue: VenueId;
  vibe: VibeName;
  auto: boolean;
  palette: number; // club light base hue
  unlocks: string[]; // venue + avatar ids earned
  peakCrowd: number;
  history: string[]; // last ~6 titles
  settings: Settings;
  lastSeen: string; // ISO — for the away time-lapse (fast-follow)
}

const LS_KEY = "pixeldj.profile";
const ID_KEY = "pixeldj.device";

function deviceId(): string {
  let id = localStorage.getItem(ID_KEY);
  if (!id) {
    id = "dev-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(ID_KEY, id);
  }
  return id;
}

export function defaultProfile(): Profile {
  return {
    id: deviceId(),
    djName: "DJ NOVA",
    avatar: "beanie",
    jacketHue: 288,
    level: 1,
    xp: 0,
    listenedMinutes: 0,
    uniqueTracks: [],
    venue: "backyard",
    vibe: "groove",
    auto: true,
    palette: 288,
    unlocks: ["backyard", "beanie", "snapback"],
    peakCrowd: 0,
    history: [],
    settings: { showClock: true, showDate: true, clock24: false, scanlines: true, sound: false, weather: "clear" },
    lastSeen: new Date().toISOString(),
  };
}

// Load: server is source of truth; fall back to the localStorage mirror, then default.
export async function loadProfile(): Promise<Profile> {
  const id = deviceId();
  try {
    const res = await fetch(`/api/profile?id=${encodeURIComponent(id)}`);
    if (res.ok) {
      const server = await res.json();
      if (server && typeof server === "object") {
        const merged = { ...defaultProfile(), ...server, id };
        localStorage.setItem(LS_KEY, JSON.stringify(merged));
        return merged;
      }
    }
  } catch {
    /* offline — use the mirror */
  }
  try {
    const cached = localStorage.getItem(LS_KEY);
    if (cached) return { ...defaultProfile(), ...JSON.parse(cached), id };
  } catch {
    /* ignore */
  }
  return defaultProfile();
}

// Save: write the mirror immediately, push to the server (debounced by the caller).
let pending = 0;
export function saveProfile(p: Profile): void {
  p.lastSeen = new Date().toISOString();
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(p));
  } catch {
    /* ignore quota */
  }
  clearTimeout(pending);
  pending = window.setTimeout(() => {
    void fetch("/api/profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(p),
    }).catch(() => {});
  }, 600);
}
