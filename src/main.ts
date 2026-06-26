import "./styles.css";
import "./controls.css";
import { AudioStream } from "./AudioStream";
import { Visualizer } from "./Visualizer";
import { Classifier } from "./classifier";
import { Controls } from "./controls";
import { loadProfile, loadProfileSync, saveProfile, dayKey, deskTotals, type Profile } from "./profile";
import { accrue, unlockLabel } from "./xp";
import { VENUES, VIBES, settingForHour, type AvatarId, type Setting, type VenueId, type VibeName } from "./config";
import { fetchLibrary, uploadFile } from "./library";
import { Presence } from "./presence";

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const audio = new AudioStream();
const scene = new Visualizer($<HTMLCanvasElement>("c"));
const classifier = new Classifier();
const presence = new Presence();
let profile: Profile = loadProfileSync(); // instant boot from the mirror

// time-of-day scene (café morning / park afternoon / club night); ?setting= forces one
const forcedSetting = new URLSearchParams(location.search).get("setting") as Setting | null;
const currentSetting = (): Setting =>
  forcedSetting && ["cafe", "park", "club"].includes(forcedSetting) ? forcedSetting : settingForHour(new Date().getHours());

// ── reflect the whole profile into the scene ────────────────────────────────
function syncScene(): void {
  scene.setState({
    hue: profile.palette, jacketHue: profile.jacketHue, venue: profile.venue,
    vibe: profile.vibe, avatar: profile.avatar, djName: profile.djName,
    setting: currentSetting(),
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
  onVolume: (v) => { audio.setVolume(v); updateFader(v); },
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
let awayPauseTimer = 0;
const AWAY_PAUSE_MS = 6000; // forgive a brief glance away before stopping the music
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
  audio.setVolume(v);
  updateFader(v);
}
let faderDrag = false;
volFader.addEventListener("pointerdown", (e) => { faderDrag = true; volFader.setPointerCapture(e.pointerId); faderFromY(e.clientY); });
volFader.addEventListener("pointermove", (e) => { if (faderDrag) faderFromY(e.clientY); });
volFader.addEventListener("pointerup", () => { faderDrag = false; });
volFader.addEventListener("pointercancel", () => { faderDrag = false; });
updateFader(0.8); // matches AudioStream's default volume

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
function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}
function flushDesk(): void {
  if (deskAddMs <= 0) return;
  const k = dayKey();
  profile.deskLog[k] = (profile.deskLog[k] ?? 0) + deskAddMs / 1000;
  deskAddMs = 0;
}
// flush + save the tail when the page is hidden/closed so the day total survives
addEventListener("pagehide", () => { flushDesk(); persist(); });
document.addEventListener("visibilitychange", () => { if (document.hidden) { flushDesk(); persist(); } });
setInterval(() => {
  scene.setState({ setting: currentSetting() }); // café → park → club as the day moves
  const here = presence.current.present || audio.playing;
  flushDesk();
  if (++persistTick >= 20) { persistTick = 0; persist(); } // checkpoint the log ~every 20s
  const todayMs = deskTotals(profile).today * 1000;
  deskTimer.classList.toggle("on", here);
  deskTimer.innerHTML =
    `<span class="dt-main">👤 ${fmtDuration(sessionMs)} <em>this session</em></span>` +
    `<span class="dt-sub">total today · ${fmtDuration(todayMs)}</span>`;
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
  if (presence.current.present || audio.playing) { sessionMs += dt; deskAddMs += dt; }
  const playing = audio.playing;
  const lv = playing ? audio.levels() : null;
  scene.render(lv, now / 1000, new Date());
  drawCam();

  if (lv) {
    controls.setEq(lv.spectrum);
    if (profile.auto) classifier.observe(lv, now);
    if (lv.beat && profile.settings.sound) audio.muffledKick(); // "kick through the wall"
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
