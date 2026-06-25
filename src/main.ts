import "./styles.css";
import "./controls.css";
import { AudioStream } from "./AudioStream";
import { Visualizer } from "./Visualizer";
import { Classifier } from "./classifier";
import { Controls } from "./controls";
import { loadProfile, loadProfileSync, saveProfile, type Profile } from "./profile";
import { accrue, unlockLabel } from "./xp";
import { VENUES, VIBES, type AvatarId, type VenueId, type VibeName } from "./config";
import { fetchLibrary, uploadFile } from "./library";
import { Presence } from "./presence";

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const audio = new AudioStream();
const scene = new Visualizer($<HTMLCanvasElement>("c"));
const classifier = new Classifier();
const presence = new Presence();
let profile: Profile = loadProfileSync(); // instant boot from the mirror

// ── reflect the whole profile into the scene ────────────────────────────────
function syncScene(): void {
  scene.setState({
    hue: profile.palette, jacketHue: profile.jacketHue, venue: profile.venue,
    vibe: profile.vibe, avatar: profile.avatar, djName: profile.djName,
    showClock: profile.settings.showClock, showDate: profile.settings.showDate,
    clock24: profile.settings.clock24, live: audio.playing,
  });
  document.body.classList.toggle("no-scanlines", !profile.settings.scanlines);
}

// ── control surface (dock + sheet) ──────────────────────────────────────────
const controls = new Controls($("controls"), profile, {
  onPlayPause: () => void audio.toggle(),
  onPrev: () => void audio.prev(),
  onNext: () => void audio.next(),
  onMute: () => { audio.toggleMute(); controls.setTransport(audio.playing, audio.muted); },
  onVolume: (v) => audio.setVolume(v),
  onVibe: (v: VibeName) => { profile.vibe = v; profile.auto = false; persist(); controls.setProfile(profile); syncScene(); },
  onAuto: (on: boolean) => { profile.auto = on; persist(); controls.setProfile(profile); },
  onPalette: (hue) => { profile.palette = hue; persist(); controls.setProfile(profile); syncScene(); },
  onName: (name) => { profile.djName = name || "DJ"; persist(); syncScene(); }, // no re-render (keeps focus)
  onAvatar: (a: AvatarId) => { profile.avatar = a; persist(); controls.setProfile(profile); syncScene(); },
  onJacket: (hue) => { profile.jacketHue = hue; persist(); controls.setProfile(profile); syncScene(); },
  onVenue: (v: VenueId) => { profile.venue = v; persist(); controls.setProfile(profile); syncScene(); },
  onSettings: (patch) => { Object.assign(profile.settings, patch); persist(); syncScene(); if ("camera" in patch) void setCamera(!!patch.camera); },
  onSelectTrack: (i) => void audio.select(i),
  onAddFiles: () => fileInput.click(),
});

// ── presence: the DJ wakes (and plays) when the camera sees you ──────────────
let presenceDrives = false; // does presence control playback right now?
presence.onChange = (st) => {
  scene.setPresence(st.count);
  if (presenceDrives) {
    // arrive → start the set; leave → wind down (autoplay needs the kiosk flag or a prior gesture)
    if (st.present && !audio.playing && audio.current) void audio.play();
    else if (!st.present && audio.playing) audio.pause();
  }
  syncScene();
};
// ── "what the camera sees" privacy preview ──────────────────────────────────
const camPreview = $("camPreview");
const camVideo = $<HTMLVideoElement>("camVideo");
const camBoxes = $<HTMLCanvasElement>("camBoxes");
const camStatus = $("camStatus");
$("camHide").onclick = () => { camPreview.hidden = true; };
function drawCam(): void {
  if (camPreview.hidden || !presence.active) return;
  const ctx = camBoxes.getContext("2d")!;
  ctx.clearRect(0, 0, camBoxes.width, camBoxes.height);
  ctx.strokeStyle = presence.current.present ? "#34d399" : "#f59e0b";
  ctx.lineWidth = 2;
  for (const b of presence.boxes) ctx.strokeRect(b.x * camBoxes.width, b.y * camBoxes.height, b.w * camBoxes.width, b.h * camBoxes.height);
}

async function setCamera(on: boolean): Promise<void> {
  if (on) {
    const ok = await presence.startCamera();
    if (!ok) {
      profile.settings.camera = false;
      controls.setProfile(profile);
      toast("📷 " + (presence.lastError || "camera unavailable"));
    } else {
      presenceDrives = true;
      if (presence.stream) camVideo.srcObject = presence.stream;
      camPreview.hidden = false; // show people exactly what the camera sees
      toast("👁 Presence on — the DJ plays when it sees you");
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
stageEl.addEventListener("click", () => controls.reveal()); // tap the scene → open controls
let dragDepth = 0;
addEventListener("dragenter", (e) => { if (e.dataTransfer?.types.includes("Files")) { dragDepth++; stageEl.classList.add("dragging"); } });
addEventListener("dragover", (e) => { if (e.dataTransfer?.types.includes("Files")) e.preventDefault(); });
addEventListener("dragleave", () => { if (--dragDepth <= 0) { dragDepth = 0; stageEl.classList.remove("dragging"); } });
addEventListener("drop", (e) => { e.preventDefault(); dragDepth = 0; stageEl.classList.remove("dragging"); ingest(e.dataTransfer?.files ?? null); });

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

// ── session "time at desk" timer ─────────────────────────────────────────────
const deskTimer = $("deskTimer");
let sessionMs = 0; // accumulates while present at the desk (or while playing)
function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}
setInterval(() => {
  const here = presence.current.present || audio.playing;
  deskTimer.classList.toggle("on", here);
  deskTimer.textContent = `👤 at desk ${fmtDuration(sessionMs)}`;
  const c = presence.current.count;
  camStatus.textContent = !presence.active ? "camera off"
    : presence.current.present ? `👁 I see you${c > 1 ? ` ×${c}` : ""}`
    : "👀 no one in view";
}, 1000);

// ── render loop ─────────────────────────────────────────────────────────────
syncScene();
controls.setProfile(profile);
toast("👆 Tap the screen to open controls & pick a station");
if (profile.settings.camera) void setCamera(true); // resume presence if it was on
let lastT = performance.now();
let frames = 0;
function frame(now: number): void {
  requestAnimationFrame(frame);
  frames++;
  const dt = now - lastT; lastT = now;
  if (presence.current.present || audio.playing) sessionMs += dt;
  const playing = audio.playing;
  const lv = playing ? audio.levels() : null;
  scene.render(lv, now / 1000, new Date());
  drawCam();

  if (lv) {
    controls.setEq(lv.spectrum);
    if (profile.auto) classifier.observe(lv, now);
    const crowd = Math.round(lv.level * VENUES[profile.venue].crowdScale * VIBES[profile.vibe].crowd * 1500);
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
