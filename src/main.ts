import "./styles.css";
import "./controls.css";
import { AudioStream } from "./AudioStream";
import { Visualizer } from "./Visualizer";
import { Classifier } from "./classifier";
import { Controls } from "./controls";
import { loadProfile, loadProfileSync, saveProfile, dayKey, deskTotals, type Profile } from "./profile";
import { trackFromStation } from "./tracks";
import { accrue, unlockLabel } from "./xp";
import { BALANCE, DAILY_MULT, GENRE_HUE, MATCH_MULT, PRIZES, REWARDS, VENUES, VENUE_ORDER, VIBES, dailyBonus, genreMult, radioUrl, type AvatarId, type Genre, type VenueId, type VibeName } from "./config";
import { fetchLibrary, serverInfo, uploadFile } from "./library";
import QRCode from "qrcode";
import { Presence } from "./presence";
import { showOnboarding } from "./onboarding";

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const audio = new AudioStream();
const scene = new Visualizer($<HTMLCanvasElement>("c"));
const classifier = new Classifier();
const presence = new Presence();
let profile: Profile = loadProfileSync(); // instant boot from the mirror

// venue drives the scene; the real clock only grades it (day/night). ?venue= forces one for testing
const forcedVenue = new URLSearchParams(location.search).get("venue") as VenueId | null;
const currentVenue = (): VenueId => (forcedVenue && forcedVenue in VENUES ? forcedVenue : profile.venue);
// Zen (calm) mode: hide the score/economy layer + drop all penalties. Default on.
const zen = (): boolean => profile.settings.zen;

// ?weather=rain|snow|haze|clear forces the atmosphere (testing / manual)
type WeatherKind = "clear" | "rain" | "snow" | "haze";
const isWeather = (w: unknown): w is WeatherKind => w === "clear" || w === "rain" || w === "snow" || w === "haze";
const forcedWeather = new URLSearchParams(location.search).get("weather");
const currentWeather = (): WeatherKind => (isWeather(forcedWeather) ? forcedWeather : profile.settings.weather);

// Pull live conditions from the server (IP-located or the manual city) and drive
// the scene atmosphere. No-op (stays clear) when the user turns live weather off.
async function refreshWeather(): Promise<void> {
  if (forcedWeather) { syncScene(); return; } // a URL override wins; skip the fetch
  if (!profile.settings.weatherAuto) {
    if (profile.settings.weather !== "clear") { profile.settings.weather = "clear"; persist(); }
    syncScene();
    return;
  }
  try {
    const r = await fetch(`/api/weather?city=${encodeURIComponent(profile.settings.weatherCity || "")}`);
    const d = (await r.json()) as { weather?: string };
    if (isWeather(d.weather) && d.weather !== profile.settings.weather) {
      profile.settings.weather = d.weather;
      persist();
      syncScene();
    }
  } catch {
    /* offline — leave the current atmosphere as-is */
  }
}

// ── reflect the whole profile into the scene ────────────────────────────────
function syncScene(): void {
  scene.setState({
    hue: profile.palette, jacketHue: profile.jacketHue, venue: currentVenue(),
    vibe: profile.vibe, avatar: profile.avatar, djName: profile.djName, weather: currentWeather(),
    showClock: profile.settings.showClock, showDate: profile.settings.showDate,
    clock24: profile.settings.clock24, live: audio.playing,
  });
  document.body.classList.toggle("no-scanlines", !profile.settings.scanlines);
  document.body.classList.toggle("zen", zen()); // hides the dock cred/fans chip in CSS
}

// ── control surface (dock + sheet) ──────────────────────────────────────────
const controls = new Controls($("controls"), profile, {
  onPlayPause: () => void audio.toggle(),
  onPrev: () => void audio.prev(),
  onNext: () => void audio.next(),
  onMute: () => { audio.toggleMute(); controls.setTransport(audio.playing, audio.muted); syncMuteIcon(); },
  onVolume: (v) => applyVolume(v),
  onVibe: (v: VibeName) => { profile.vibe = v; profile.auto = false; persist(); controls.setProfile(profile); syncScene(); },
  onAuto: (on: boolean) => { profile.auto = on; persist(); controls.setProfile(profile); },
  onPalette: (hue) => { profile.palette = hue; persist(); controls.setProfile(profile); syncScene(); },
  onName: (name) => { profile.djName = name || "DJ"; persist(); syncScene(); }, // no re-render (keeps focus)
  onAvatar: (a: AvatarId) => { profile.avatar = a; persist(); controls.setProfile(profile); syncScene(); },
  onJacket: (hue) => { profile.jacketHue = hue; persist(); controls.setProfile(profile); syncScene(); },
  onVenue: (v: VenueId) => { profile.venue = v; persist(); controls.setProfile(profile); syncScene(); },
  onBuyVenue: (id: VenueId) => {
    const m = VENUES[id];
    if (profile.unlocks.includes(id)) return;
    if (profile.cred < m.price) { toast(`◈ ${Math.ceil(m.price - profile.cred)} more Cred for ${m.name}`); return; }
    profile.cred -= m.price;
    profile.unlocks.push(id);
    profile.venue = id; // hop straight to the new place
    persist(); controls.setProfile(profile); syncScene();
    toast(`🎉 Unlocked ${m.name}!`);
  },
  onBuyPrize: (pid: string) => {
    const pz = PRIZES.find((p) => p.id === pid);
    if (!pz || profile.unlocks.includes(pid)) return;
    if (profile.cred < pz.price) { toast(`◈ ${Math.ceil(pz.price - profile.cred)} more Cred for ${pz.name}`); return; }
    profile.cred -= pz.price;
    profile.unlocks.push(pid);
    if (pz.kind === "palette") profile.palette = pz.hue; else profile.jacketHue = pz.hue; // wear it now
    persist(); controls.setProfile(profile); syncScene();
    toast(`🎉 ${pz.name} unlocked!`);
  },
  onSettings: (patch) => { Object.assign(profile.settings, patch); persist(); syncScene(); if ("zen" in patch) controls.setProfile(profile); if ("camera" in patch) void setCamera(!!patch.camera); if ("weatherAuto" in patch || "weatherCity" in patch) void refreshWeather(); },
  onSelectTrack: (i) => void audio.select(i),
  onAddFiles: () => fileInput.click(),
  onAddStation: (name: string, url: string, genre: Genre) => {
    let host = "";
    try { host = new URL(url.trim()).hostname; } catch { /* invalid */ }
    if (!host) { toast("⚠ Enter a valid stream URL (https://…)"); return; }
    const s = { name: name.trim() || host, stream: url.trim(), genre, hue: GENRE_HUE[genre] };
    if (profile.customStations.some((c) => c.stream === s.stream)) { toast("Already added"); return; }
    profile.customStations.push(s);
    persist();
    audio.addTracks([trackFromStation(s)]);
    controls.setMedia(audio.tracks, audio.index);
    toast(`📻 Added ${s.name}`);
  },
  onRemoveStation: (stream: string) => {
    profile.customStations = profile.customStations.filter((c) => c.stream !== stream);
    persist();
    const i = audio.tracks.findIndex((t) => t.src === radioUrl(stream));
    if (i >= 0) audio.removeTrack(i);
    controls.setMedia(audio.tracks, audio.index);
  },
});

// ── venue switcher (top-centre): ◀ ▶ instant-cycle owned venues; tap name → board ──
const venuePrev = $("venuePrev"), venueNext = $("venueNext"), venueName = $("venueName");
function cycleVenue(dir: number): void {
  const list = VENUE_ORDER.filter((id) => profile.unlocks.includes(id));
  if (!list.length) return;
  const i = Math.max(0, list.indexOf(profile.venue));
  profile.venue = list[(i + dir + list.length) % list.length];
  persist(); controls.setProfile(profile); syncScene();
}
venuePrev.onclick = () => cycleVenue(-1);
venueNext.onclick = () => cycleVenue(1);

// ── Venue Board: a centered, single-purpose venue picker (NOT the options menu) ──
const venueBoard = $("venueBoard");
const vbGrid = venueBoard.querySelector<HTMLElement>(".vb-grid")!;
function venueCardHtml(id: VenueId): string {
  const m = VENUES[id], owned = profile.unlocks.includes(id), current = profile.venue === id;
  return `<button class="vb-card ${owned ? "owned" : "locked"} ${current ? "on" : ""}" data-vb="${id}" style="--c:${m.accent}">
      <span class="vb-cname">${m.name}</span>
      <span class="vb-cgenre">${m.genre}</span>
      ${owned ? (current ? `<span class="vb-here">▶ here</span>` : "") : `<span class="vb-cprice">◈ ${m.price}</span>`}
    </button>`;
}
function openVenueBoard(): void {
  const owned = VENUE_ORDER.filter((id) => profile.unlocks.includes(id));
  const locked = VENUE_ORDER.filter((id) => !profile.unlocks.includes(id)).sort((a, b) => VENUES[a].price - VENUES[b].price);
  vbGrid.innerHTML =
    `<div class="vb-sec">Your venues</div><div class="vb-row">${owned.map(venueCardHtml).join("")}</div>` +
    (locked.length ? `<div class="vb-sec">Locked — tap to unlock in the Store</div><div class="vb-row">${locked.map(venueCardHtml).join("")}</div>` : "");
  vbGrid.querySelectorAll<HTMLButtonElement>("[data-vb]").forEach((b) => (b.onclick = () => pickVenue(b.dataset.vb as VenueId)));
  venueBoard.hidden = false;
}
function closeVenueBoard(): void { venueBoard.hidden = true; }
function pickVenue(id: VenueId): void {
  closeVenueBoard();
  if (profile.unlocks.includes(id)) { profile.venue = id; persist(); controls.setProfile(profile); syncScene(); }
  else controls.openStore(); // locked → go buy it in the Store
}
venueName.onclick = () => openVenueBoard();
venueBoard.querySelector(".vb-scrim")?.addEventListener("click", closeVenueBoard);
venueBoard.querySelector(".vb-close")?.addEventListener("click", closeVenueBoard);

// ── one-tap Game / Calm toggle — flips Zen (hides the game HUD for heads-down) ──
const modeToggle = $("modeToggle");
function syncModeToggle(): void {
  modeToggle.textContent = zen() ? "🌿" : "🎮";
  modeToggle.title = zen() ? "Calm view — tap for Game" : "Game view — tap for Calm";
}
modeToggle.onclick = (e) => {
  e.stopPropagation();
  profile.settings.zen = !profile.settings.zen;
  persist();
  syncScene(); // toggles body.zen → shows/hides buffs, Cred chip, desk counter
  controls.setProfile(profile);
  syncModeToggle();
  toast(zen() ? "🌿 Calm view" : "🎮 Game view");
};
syncModeToggle();

// ── 📱 QR to open the app on a phone (encodes the kiosk's LAN URL) ────────────
const qrBtn = $("qrBtn"), qrOverlay = $("qrOverlay");
let qrReady = false;
async function openQr(): Promise<void> {
  if (!qrReady) {
    const url = (await serverInfo()) || location.origin;
    (qrOverlay.querySelector(".qr-url") as HTMLElement).textContent = url.replace(/^https?:\/\//, "");
    try {
      (qrOverlay.querySelector(".qr-img") as HTMLImageElement).src =
        await QRCode.toDataURL(url, { margin: 1, width: 320, color: { dark: "#0c0816", light: "#ffffff" } });
      qrReady = true;
    } catch { /* leave placeholder */ }
  }
  qrOverlay.hidden = false;
}
qrBtn.onclick = (e) => { e.stopPropagation(); void openQr(); };
qrOverlay.querySelector(".qr-scrim")?.addEventListener("click", () => (qrOverlay.hidden = true));
qrOverlay.querySelector(".qr-close")?.addEventListener("click", () => (qrOverlay.hidden = true));

// ── presence: the DJ wakes (and plays) when the camera sees you ──────────────
let presenceDrives = false; // does presence control playback right now?
let awayPauseTimer = 0;
// Forgive a long absence before stopping the music. Deep work means sitting still,
// glancing at a second screen, or stepping away for a minute — none of that should
// cut the audio. Only a real, sustained departure winds it down.
const AWAY_PAUSE_MS = 60000;
presence.onChange = (st) => {
  scene.setPresence(st.count);
  if (presenceDrives) {
    if (st.present) {
      clearTimeout(awayPauseTimer);
      if (!audio.playing && audio.current) void audio.play(); // you're back → resume
    } else if (audio.playing) {
      clearTimeout(awayPauseTimer);
      awayPauseTimer = window.setTimeout(() => audio.pause(), AWAY_PAUSE_MS); // gone a while → wind down
    }
  }
  syncScene();
};
// ── "what the camera sees" privacy preview ──────────────────────────────────
const camPreview = $("camPreview");
const camVideo = $<HTMLVideoElement>("camVideo");
const camSnap = $<HTMLImageElement>("camSnap");
const camBoxes = $<HTMLCanvasElement>("camBoxes");
const camStatus = $("camStatus");
$("camHide").onclick = () => { camPreview.hidden = true; };
// smoothed presence figures — held through the grace window so they don't flicker
let figTargets: { x: number; y: number; s: number }[] = [];
const figDrawn: { x: number; y: number; s: number }[] = [];
function drawFigure(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, hue: number, t: number): void {
  const headR = s * 0.85;
  cy += Math.sin(t / 500) * s * 0.12; // gentle life
  ctx.fillStyle = `hsla(${hue},70%,55%,0.3)`;
  ctx.strokeStyle = `hsl(${hue},85%,66%)`;
  ctx.lineWidth = Math.max(1.5, s * 0.22);
  ctx.lineJoin = "round";
  ctx.beginPath(); ctx.arc(cx, cy, headR, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); // head
  const shY = cy + headR + s * 0.35; // shoulders → waist silhouette
  ctx.beginPath();
  ctx.moveTo(cx - s * 1.5, shY);
  ctx.quadraticCurveTo(cx - s * 1.7, shY + s * 2.6, cx - s * 1.05, shY + s * 3.1);
  ctx.lineTo(cx + s * 1.05, shY + s * 3.1);
  ctx.quadraticCurveTo(cx + s * 1.7, shY + s * 2.6, cx + s * 1.5, shY);
  ctx.quadraticCurveTo(cx, shY - s * 0.7, cx - s * 1.5, shY);
  ctx.closePath(); ctx.fill(); ctx.stroke();
}

function drawCam(): void {
  if (camPreview.hidden || !presence.active) return;
  const ctx = camBoxes.getContext("2d")!;
  const W = camBoxes.width, H = camBoxes.height;
  if (presence.isNative) {
    // hold the last positions while present (grace) so a missed frame doesn't flicker;
    // ease the drawn figures toward them for smooth motion
    if (presence.current.present) {
      if (presence.faces.length) figTargets = presence.faces.map((f) => ({ ...f }));
    } else {
      figTargets = [];
    }
    while (figDrawn.length < figTargets.length) figDrawn.push({ ...figTargets[figDrawn.length] });
    while (figDrawn.length > figTargets.length) figDrawn.pop();
    for (let i = 0; i < figDrawn.length; i++) {
      const a = figDrawn[i], b = figTargets[i];
      a.x += (b.x - a.x) * 0.25; a.y += (b.y - a.y) * 0.25; a.s += (b.s - a.s) * 0.25;
    }
    ctx.fillStyle = "#0c0a16";
    ctx.fillRect(0, 0, W, H);
    const t = performance.now();
    for (const f of figDrawn) {
      const s = Math.max(6, Math.min(20, f.s * W * 0.7));
      drawFigure(ctx, f.x * W, f.y * H + s * 0.3, s, profile.palette, t);
    }
    return;
  }
  ctx.clearRect(0, 0, W, H); // browser mode: boxes over the live video
  ctx.strokeStyle = presence.current.present ? "#34d399" : "#f59e0b";
  ctx.lineWidth = 2;
  for (const b of presence.boxes) ctx.strokeRect(b.x * W, b.y * H, b.w * W, b.h * H);
}

const forceNative = new URLSearchParams(location.search).get("presence") === "native";
async function setCamera(on: boolean): Promise<void> {
  if (on) {
    camPreview.hidden = false; // show it first so the <video> actually decodes frames
    let mode: "native" | "browser" | "none";
    if (forceNative) { presence.startNative(); mode = "native"; } // kiosk: on-device only, never touch the camera
    else mode = await presence.start(camVideo); // native service if running, else in-browser
    if (mode === "none") {
      camPreview.hidden = true;
      profile.settings.camera = false;
      controls.setProfile(profile);
      toast("📷 " + (presence.lastError || "camera unavailable"));
    } else {
      presenceDrives = true;
      const onDevice = mode === "native";
      camVideo.hidden = onDevice; // native: hide the video; we draw an abstract stick figure
      camSnap.hidden = true; // snapshot image no longer used
      toast(`👁 Presence on${onDevice ? " (on-device)" : ""} — the DJ plays when it sees you`);
    }
  } else {
    presenceDrives = false; // set before stop() so the resulting "absent" doesn't pause your music
    presence.stop();
    camPreview.hidden = true;
    camVideo.srcObject = null;
  }
  persist();
}

// ── audio events ────────────────────────────────────────────────────────────
audio.onTrackChange = () => {
  classifier.reset(performance.now());
  controls.setMedia(audio.tracks, audio.index);
  syncScene();
};
audio.onPlayState = () => { syncScene(); controls.setTransport(audio.playing, audio.muted); };
audio.onPlaylistChange = () => controls.setMedia(audio.tracks, audio.index);
if (profile.customStations.length) audio.addTracks(profile.customStations.map(trackFromStation));
audio.load(0);
controls.setMedia(audio.tracks, audio.index);

// load the persisted server library on boot (uploads survive reload)
void fetchLibrary().then((lib) => { if (lib.length) { audio.addTracks(lib); controls.setMedia(audio.tracks, audio.index); } });

// refresh the server-authoritative profile (the sync boot used the local mirror)
void loadProfile().then((p) => { profile = p; controls.setProfile(profile); syncScene(); });

// ── auto-vibe from the classifier ───────────────────────────────────────────
classifier.onResult = (c) => {
  controls.setNowPlaying(c.vibe, audio.index);
  if (profile.auto) { profile.vibe = c.vibe; persist(); controls.setProfile(profile); syncScene(); }
};

// ── adding / persisting local files ─────────────────────────────────────────
const fileInput = $<HTMLInputElement>("file");
fileInput.onchange = () => { ingest(fileInput.files); fileInput.value = ""; };
function ingest(files: FileList | null): void {
  if (!files || !files.length) return;
  const first = audio.addFiles(files);
  if (first >= 0) { void audio.select(first); for (const f of Array.from(files)) void uploadFile(f); }
}
const stageEl = $("stage");
// tap the BARE scene (canvas / crt / stage) → open controls. Taps on HUD overlays
// inside #stage (venue switcher, Venue Board, etc.) must NOT bubble up to open the menu.
stageEl.addEventListener("click", (e) => {
  const t = e.target as HTMLElement;
  if (t === stageEl || t.id === "c" || t.id === "crt") controls.reveal();
});
let dragDepth = 0;
addEventListener("dragenter", (e) => { if (e.dataTransfer?.types.includes("Files")) { dragDepth++; stageEl.classList.add("dragging"); } });
addEventListener("dragover", (e) => { if (e.dataTransfer?.types.includes("Files")) e.preventDefault(); });
addEventListener("dragleave", () => { if (--dragDepth <= 0) { dragDepth = 0; stageEl.classList.remove("dragging"); } });
addEventListener("drop", (e) => { e.preventDefault(); dragDepth = 0; stageEl.classList.remove("dragging"); ingest(e.dataTransfer?.files ?? null); });

// ── always-visible volume fader (right edge) ────────────────────────────────
const volFader = $("volFader");
const vfFill = volFader.querySelector(".vf-fill") as HTMLElement;
const vfKnob = volFader.querySelector(".vf-knob") as HTMLElement;
const VF_TOP = 6, VF_BOT = 20, VF_KNOB = 12;
function updateFader(v: number): void {
  const h = volFader.clientHeight || 156;
  const trackH = h - VF_TOP - VF_BOT;
  vfKnob.style.top = `${VF_TOP + (1 - v) * (trackH - VF_KNOB)}px`;
  vfFill.style.height = `${Math.round(v * 100)}%`;
}
function faderFromY(clientY: number): void {
  const r = volFader.getBoundingClientRect();
  const top = r.top + VF_TOP, bottom = r.bottom - VF_BOT;
  const v = Math.max(0, Math.min(1, 1 - (clientY - top) / (bottom - top)));
  applyVolume(v);
}
// one place to set volume: drives the audio + both UI controls (fader & menu
// slider) and remembers it in the profile (debounced so a drag isn't a save storm)
let volSaveT = 0;
function applyVolume(v: number): void {
  audio.setVolume(v);
  updateFader(v);
  controls.setVolume(v);
  profile.settings.volume = v;
  clearTimeout(volSaveT);
  volSaveT = window.setTimeout(persist, 400);
}
let faderDrag = false;
volFader.addEventListener("pointerdown", (e) => { faderDrag = true; volFader.setPointerCapture(e.pointerId); faderFromY(e.clientY); });
volFader.addEventListener("pointermove", (e) => { if (faderDrag) faderFromY(e.clientY); });
volFader.addEventListener("pointerup", () => { faderDrag = false; });
volFader.addEventListener("pointercancel", () => { faderDrag = false; });
// the speaker icon doubles as a mute toggle — tap it (doesn't drag the volume)
const vfIco = volFader.querySelector(".vf-ico") as HTMLElement;
function syncMuteIcon(): void {
  vfIco.textContent = audio.muted ? "🔇" : "🔊";
  volFader.classList.toggle("muted", audio.muted);
}
vfIco.addEventListener("pointerdown", (e) => {
  e.stopPropagation(); // don't let the fader read this tap as a volume drag
  audio.toggleMute();
  syncMuteIcon();
  controls.setTransport(audio.playing, audio.muted);
});
// restore the remembered volume across the audio + both UI controls
audio.setVolume(profile.settings.volume);
updateFader(profile.settings.volume);
controls.setVolume(profile.settings.volume);

// ── persistence (debounced inside saveProfile) ──────────────────────────────
function persist(): void { saveProfile(profile); }

// ── toasts ──────────────────────────────────────────────────────────────────
function toast(msg: string): void {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  $("toasts").appendChild(el);
  setTimeout(() => el.remove(), 3600);
}

// ── XP accrual + peak crowd ─────────────────────────────────────────────────
function applyProgress(res: ReturnType<typeof accrue>): void {
  if (res.leveledUp) {
    for (const lvl of res.newLevels) toast(`⭐ Level ${lvl}`);
    for (const id of res.unlocked) {
      toast(`🔓 Unlocked: ${unlockLabel(id)}`);
      if (id in VENUES) profile.venue = id as VenueId; // auto-advance the club glow-up
    }
  }
  controls.setProfile(profile);
  persist();
  syncScene();
}

let listenAcc = 0; // ms of playback toward the next minute
function tickProgress(dtMs: number): void {
  if (!audio.playing) return;
  listenAcc += dtMs;
  while (listenAcc >= 60000) {
    listenAcc -= 60000;
    applyProgress(accrue(profile, 1, audio.current?.src));
  }
}

// ── "time at desk" — live session + persistent daily log ─────────────────────
const deskTimer = $("deskTimer");
let sessionMs = 0; // this session — resets on reload
let deskAddMs = 0; // unflushed desk time, folded into the daily log each second
let persistTick = 0;

// ── balance / Pomodoro: a healthy focus block, then a break nudge ─────────────
// ?fast=1 shrinks the timings ~60× so the full focus→break→reward cycle can be
// exercised in ~a minute (verification only; harmless without the param).
const FAST = new URLSearchParams(location.search).has("fast") ? 1 / 60 : 1;
const FOCUS_MS = BALANCE.focusMin * 60000 * FAST, BREAK_MS = BALANCE.breakMin * 60000 * FAST;
const RENAG_MS = BALANCE.renagMin * 60000 * FAST;
let focusMs = 0; // continuous desk time this focus block
let awayMs = 0; // continuous time away (a real break resets the block)
let breakDue = false; // focus block complete → the break nudge is active
let onBreak = false; // away long enough to count as a real break
let lastNagMs = 0; // focusMs when we last re-nudged

// genre of the currently-playing station (null for local files / nothing playing)
function currentGenre(): Genre | null {
  return audio.playing && audio.current?.station ? (audio.current.genre ?? null) : null;
}
// Reward the CYCLE (finishing a focus block / taking the break) — flat base, capped
// daily. A venue×genre BONUS multiplies it when you're playing a fitting station
// (a modest boost on top of the healthy-habit reward; see the buff list on the left).
function award(cred: number, fans: number, msg: string): void {
  const gm = genreMult(profile.venue, currentGenre());
  const boosted = Math.round(cred * gm.mult);
  const today = dayKey();
  if (profile.earnedDate !== today) { profile.earnedDate = today; profile.earnedToday = 0; }
  const room = Math.max(0, REWARDS.dailyCap - profile.earnedToday);
  const got = Math.min(boosted, room);
  profile.cred += got;
  profile.earnedToday += got;
  profile.fans += fans; // crowd grows as you build a practice; never decays
  toast(room <= 0 ? "🌙 today's progress is banked — rest easy" : gm.mult > 1 ? `${msg} · ×${gm.mult} bonus!` : msg);
  controls.setCred(profile.cred); controls.setFans(profile.fans);
  persist();
}
function updateBalance(dt: number, here: boolean): void {
  if (here) {
    if (onBreak) { onBreak = false; toast("✨ Welcome back — refreshed!"); }
    focusMs += dt; awayMs = 0;
    if (focusMs >= FOCUS_MS) {
      if (!breakDue) {
        breakDue = true; lastNagMs = focusMs;
        award(REWARDS.focusBlock, REWARDS.focusFans, `🌿 Solid ${Math.round(FOCUS_MS / 60000 / FAST)}-min block — time for a break`);
        if (profile.settings.sound) audio.muffledKick(); // soft "ding through the wall"
      } else if (focusMs - lastNagMs >= RENAG_MS) {
        lastNagMs = focusMs; toast("🌿 Still going — a break would do you good");
        if (profile.settings.sound) audio.muffledKick();
      }
    } else {
      breakDue = false;
    }
  } else {
    awayMs += dt;
    if (awayMs >= BREAK_MS && focusMs > 0) {
      const completedBlock = breakDue; // did a full focus block happen before this break?
      focusMs = 0; breakDue = false; onBreak = true;
      sessionMs = 0; // a real break ends the sitting → "this session" starts fresh on return
      if (completedBlock) award(REWARDS.takeBreak, REWARDS.breakFans, "🌿 Break taken — good for you");
    }
  }
}
// ?fast test hook: drive the focus/break state machine + snapshot/restore the
// reward fields, so the full cycle (and the daily cap) can be verified in seconds
// without a real 50-min block or a body in front of the camera. Only exists with ?fast=1.
if (FAST < 1) {
  (window as unknown as { __fast: unknown }).__fast = {
    state: () => ({ focusMs, awayMs, breakDue, onBreak, cred: profile.cred, earnedToday: profile.earnedToday, fans: profile.fans }),
    tick: (ms: number, present: boolean) => updateBalance(ms, present),
    snap: () => ({ cred: profile.cred, earnedToday: profile.earnedToday, earnedDate: profile.earnedDate, fans: profile.fans }),
    restore: (s: { cred: number; earnedToday: number; earnedDate: string; fans: number }) => {
      profile.cred = s.cred; profile.earnedToday = s.earnedToday; profile.earnedDate = s.earnedDate; profile.fans = s.fans; persist();
    },
    FOCUS_MS, BREAK_MS,
  };
}
function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}
// Fold the desk time into the persistent daily log (drives the time-at-desk stats).
// No Cred here any more — earning is event-based (see award()).
function flushDesk(): void {
  if (deskAddMs <= 0) return;
  const k = dayKey();
  profile.deskLog[k] = (profile.deskLog[k] ?? 0) + deskAddMs / 1000;
  deskAddMs = 0;
}
// flush + save the tail when the page is hidden/closed so the day total survives
// ── left buff list (active venue×genre bonuses) + bottom-centre now-playing ───
const buffs = $("buffs"), nowPlaying = $("nowPlaying");
function renderBuffs(): void {
  const g = currentGenre(), daily = dailyBonus(), v = currentVenue();
  const nativeOn = !!g && g === VENUES[v].genre;
  const dailyOn = !!g && g === daily.genre && v === daily.venue;
  buffs.innerHTML =
    `<div class="buff-title">Bonuses</div>` +
    `<div class="buff ${nativeOn ? "on" : ""}"><span class="buff-ic">🎧</span><span class="buff-tx">fits ${VENUES[v].name}</span><b>×${MATCH_MULT}</b></div>` +
    `<div class="buff ${dailyOn ? "on" : ""}"><span class="buff-ic">🔥</span><span class="buff-tx">today · ${daily.genre} @ ${VENUES[daily.venue].name}</span><b>×${DAILY_MULT}</b></div>`;
}
function updateNowPlaying(): void {
  const c = audio.current;
  if (audio.playing && c) {
    (nowPlaying.querySelector(".np-title") as HTMLElement).textContent = c.title;
    (nowPlaying.querySelector(".np-sub") as HTMLElement).textContent = c.artist;
    nowPlaying.hidden = false;
  } else nowPlaying.hidden = true;
}

addEventListener("pagehide", () => { flushDesk(); persist(); });
document.addEventListener("visibilitychange", () => { if (document.hidden) { flushDesk(); persist(); } });
setInterval(() => {
  scene.setState({ venue: currentVenue() }); // keep the scene synced (honours ?venue=)
  flushDesk();
  controls.setCred(profile.cred);
  controls.setFans(profile.fans);
  venueName.textContent = VENUES[currentVenue()].name; // switcher label
  renderBuffs();
  updateNowPlaying();
  if (++persistTick >= 20) { persistTick = 0; persist(); } // checkpoint the log ~every 20s
  const todayMs = deskTotals(profile).today * 1000;
  // Zen: the desk timer only surfaces for the gentle break nudge — no always-on
  // session counter to glance at.
  deskTimer.classList.toggle("on", breakDue || (!zen() && presence.current.present));
  deskTimer.classList.toggle("break", breakDue);
  deskTimer.innerHTML = breakDue
    ? presence.current.present
      ? `<span class="dt-main">🌿 take a break</span>` +
        `<span class="dt-sub">step away ≈${BALANCE.breakMin} min to reset</span>`
      : `<span class="dt-main">🌿 on a break</span>` +
        `<span class="dt-sub">${fmtDuration(Math.max(0, BREAK_MS - awayMs))} left</span>`
    : `<span class="dt-main">👤 ${fmtDuration(sessionMs)} <em>this session</em></span>` +
      `<span class="dt-sub">🌿 break in ${fmtDuration(Math.max(0, FOCUS_MS - focusMs))} · today ${fmtDuration(todayMs)}</span>`;
  const c = presence.current.count;
  // framed as the DJ's behaviour, not a watching camera ("I see you" read as creepy)
  camStatus.textContent = !presence.active ? "camera off"
    : presence.current.present ? `🎧 playing for you${c > 1 ? ` +${c - 1}` : ""}`
    : "💤 resting";
}, 1000);

// ── render loop ─────────────────────────────────────────────────────────────
syncScene();
controls.setProfile(profile);
toast("👆 Tap the screen to open controls & pick a station");
if (profile.settings.camera) void setCamera(true); // resume presence if it was on
void refreshWeather(); // pull live weather now, then keep it fresh
setInterval(() => void refreshWeather(), 15 * 60_000);

// first-run intro (once, or forced with ?onboard=1)
if (new URLSearchParams(location.search).has("onboard") || !profile.settings.onboarded) {
  showOnboarding(() => { profile.settings.onboarded = true; persist(); });
}
let lastT = performance.now();
let frames = 0;
function frame(now: number): void {
  requestAnimationFrame(frame);
  frames++;
  const dt = now - lastT; lastT = now;
  // "at the desk": when the camera's active it's the truth (music left playing in an
  // empty room is NOT focus); only fall back to "is music playing" when there's no camera.
  const here = presence.active ? presence.current.present : audio.playing;
  if (here) { sessionMs += dt; deskAddMs += dt; }
  updateBalance(dt, here);
  scene.setFans(profile.fans); // a bigger crowd as your fanbase grows
  const playing = audio.playing;
  const lv = playing ? audio.levels() : null;
  scene.render(lv, now / 1000, new Date());
  drawCam();

  if (lv) {
    controls.setEq(lv.spectrum);
    if (profile.auto) classifier.observe(lv, now);
    if (lv.beat && profile.settings.sound) audio.muffledKick(); // "kick through the wall"
    const crowd = Math.round(lv.level * (VENUES[profile.venue].crowd ? 1 : 0.4) * VIBES[profile.vibe].crowd * 1500);
    if (crowd > profile.peakCrowd) profile.peakCrowd = crowd;
  }
  tickProgress(dt);
}
requestAnimationFrame(frame);

// ── PWA: register the service worker in production builds (skip in dev/HMR) ──
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  addEventListener("load", () => void navigator.serviceWorker.register("/sw.js").catch(() => {}));
}

// ── dev-only helpers (stripped from production builds) ──────────────────────
if (import.meta.env.DEV) {
  (window as unknown as { __pr: unknown }).__pr = { scene, audio, controls, presence, profile: () => profile };
  const dev = document.createElement("button");
  dev.textContent = "+30 min";
  dev.className = "dev-time";
  dev.title = "dev: accrue 30 listening minutes";
  dev.onclick = () => applyProgress(accrue(profile, 30, "dev-" + Date.now()));
  document.body.appendChild(dev);

  // mock presence toggle: test the "DJ wakes when it sees you" behaviour sans camera
  const mock = document.createElement("button");
  mock.textContent = "👤 mock present";
  mock.className = "dev-time";
  mock.style.left = "210px";
  let mockOn = false;
  mock.onclick = () => { mockOn = !mockOn; presenceDrives = mockOn; presence.setMock(mockOn, mockOn ? 2 : 0); mock.textContent = mockOn ? "👤 present ✓" : "👤 mock present"; };
  document.body.appendChild(mock);

  // perf overlay: FPS + frame-time + backbuffer size (benchmark on the Jetson)
  const perf = document.createElement("div");
  perf.className = "dev-perf";
  document.body.appendChild(perf);
  let lastSample = performance.now();
  setInterval(() => {
    const nowS = performance.now();
    const fps = Math.round((frames * 1000) / (nowS - lastSample));
    frames = 0;
    lastSample = nowS;
    const cv = $<HTMLCanvasElement>("c");
    perf.textContent = `${fps} fps · ${(1000 / Math.max(1, fps)).toFixed(1)} ms · ${cv.width}×${cv.height} · ${audio.playing ? "live" : "idle"}`;
  }, 1000);
}
