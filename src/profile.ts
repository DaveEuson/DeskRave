import { VENUES, STARTER_VENUES, type AvatarId, type VenueId, type VibeName } from "./config";

// Coerce legacy/invalid data forward: an unknown saved venue (e.g. a retired id)
// would crash the venue dispatch, so snap it to the club and guarantee starters.
function normalize(p: Profile): Profile {
  if (!p.venue || !(p.venue in VENUES)) p.venue = "club";
  if (!Array.isArray(p.unlocks)) p.unlocks = [];
  for (const v of STARTER_VENUES) if (!p.unlocks.includes(v)) p.unlocks.push(v);
  if (typeof p.deskLog !== "object" || p.deskLog === null) p.deskLog = {};
  if (typeof p.cred !== "number" || !isFinite(p.cred)) p.cred = 0;
  // settings merge is shallow, so backfill any keys a stale saved profile lacks
  p.settings = { ...defaultProfile().settings, ...(p.settings ?? {}) };
  return p;
}

// The server-authoritative profile (schema pinned by the handoff README).
// localStorage is an offline mirror, not the source of truth.
export interface Settings {
  showClock: boolean;
  showDate: boolean;
  clock24: boolean;
  scanlines: boolean;
  sound: boolean;
  camera: boolean; // presence detection — DJ wakes when it sees you
  weather: "clear" | "rain" | "snow" | "haze"; // active atmosphere (set by the live feed)
  weatherAuto: boolean; // pull real weather from /api/weather
  weatherCity: string; // manual city override; "" = auto-locate from IP
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
  unlocks: string[]; // venue + avatar + prize ids earned/bought
  cred: number; // spendable currency earned at the desk
  peakCrowd: number;
  history: string[]; // last ~6 titles
  deskLog: Record<string, number>; // local date "YYYY-MM-DD" → seconds at desk that day
  settings: Settings;
  lastSeen: string; // ISO — for the away time-lapse (fast-follow)
}

// ── desk-time accounting ─────────────────────────────────────────────────────
// Local-date key so day/week/month/year roll over on the user's own midnight.
export function dayKey(d = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

// today = this calendar day, week = rolling last 7 days, month/year = this
// calendar month/year. Values are seconds.
export function deskTotals(p: Profile, now = new Date()): { today: number; week: number; month: number; year: number } {
  const log = p.deskLog ?? {};
  const today = dayKey(now);
  const month = today.slice(0, 7), year = today.slice(0, 4);
  const weekKeys = new Set<string>();
  for (let i = 0; i < 7; i++) weekKeys.add(dayKey(new Date(now.getTime() - i * 86400000)));
  let t = 0, w = 0, mo = 0, y = 0;
  for (const [k, v] of Object.entries(log)) {
    if (!v) continue;
    if (k === today) t += v;
    if (weekKeys.has(k)) w += v;
    if (k.startsWith(month)) mo += v;
    if (k.startsWith(year)) y += v;
  }
  return { today: t, week: w, month: mo, year: y };
}

// "45m" / "2h 5m" / "13h" — compact, for the menu stats.
export function fmtSpan(sec: number): string {
  const m = Math.round(sec / 60);
  if (m < 1) return "0m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60), mm = m % 60;
  return mm ? `${h}h ${mm}m` : `${h}h`;
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
    venue: "club",
    vibe: "groove",
    auto: true,
    palette: 288,
    unlocks: ["soundcheck", "cafe", "park", "club", "beanie", "snapback"],
    cred: 0,
    peakCrowd: 0,
    history: [],
    deskLog: {},
    settings: { showClock: true, showDate: true, clock24: false, scanlines: true, sound: false, camera: false, weather: "clear", weatherAuto: true, weatherCity: "" },
    lastSeen: new Date().toISOString(),
  };
}

// Instant, synchronous boot from the localStorage mirror (or default) — avoids a
// top-level await so the widget starts immediately; the server copy refreshes after.
export function loadProfileSync(): Profile {
  const id = deviceId();
  try {
    const cached = localStorage.getItem(LS_KEY);
    if (cached) return normalize({ ...defaultProfile(), ...JSON.parse(cached), id });
  } catch {
    /* ignore */
  }
  return defaultProfile();
}

// Load: server is source of truth; fall back to the localStorage mirror, then default.
export async function loadProfile(): Promise<Profile> {
  const id = deviceId();
  try {
    const res = await fetch(`/api/profile?id=${encodeURIComponent(id)}`);
    if (res.ok) {
      const server = await res.json();
      if (server && typeof server === "object") {
        const merged = normalize({ ...defaultProfile(), ...server, id });
        localStorage.setItem(LS_KEY, JSON.stringify(merged));
        return merged;
      }
    }
  } catch {
    /* offline — use the mirror */
  }
  try {
    const cached = localStorage.getItem(LS_KEY);
    if (cached) return normalize({ ...defaultProfile(), ...JSON.parse(cached), id });
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
