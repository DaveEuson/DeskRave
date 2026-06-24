import "./styles.css";
import "./phone.css";
import { AudioStream } from "./AudioStream";
import { Visualizer } from "./Visualizer";
import { Classifier } from "./classifier";
import { Phone } from "./phone";
import { loadProfile, saveProfile, type Profile } from "./profile";
import { accrue, unlockLabel } from "./xp";
import { VENUES, VIBES, type AvatarId, type VenueId, type VibeName } from "./config";
import { uploadFile } from "./library";

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const audio = new AudioStream();
const scene = new Visualizer($<HTMLCanvasElement>("c"));
const classifier = new Classifier();
let profile: Profile = (await loadProfile().catch(() => null)) ?? defaultBoot();

function defaultBoot(): Profile {
  // loadProfile already falls back; this is just a type guard for the await
  return JSON.parse(localStorage.getItem("pixeldj.profile") || "null") ?? ({} as Profile);
}

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

// ── phone companion ─────────────────────────────────────────────────────────
const phone = new Phone($("phone"), profile, {
  onVibe: (v: VibeName) => { profile.vibe = v; profile.auto = false; persist(); phone.setProfile(profile); syncScene(); },
  onAuto: (on: boolean) => { profile.auto = on; persist(); phone.setProfile(profile); },
  onPalette: (hue) => { profile.palette = hue; persist(); phone.setProfile(profile); syncScene(); },
  onName: (name) => { profile.djName = name || "DJ"; persist(); syncScene(); }, // no phone re-render (keeps focus)
  onAvatar: (a: AvatarId) => { profile.avatar = a; persist(); phone.setProfile(profile); syncScene(); },
  onJacket: (hue) => { profile.jacketHue = hue; persist(); phone.setProfile(profile); syncScene(); },
  onVenue: (v: VenueId) => { profile.venue = v; persist(); phone.setProfile(profile); syncScene(); },
  onSettings: (patch) => { Object.assign(profile.settings, patch); persist(); syncScene(); },
  onSelectTrack: (i) => goLive(i),
  onSend: () => { if (!audio.playing) void audio.play(); syncScene(); },
  onAddFiles: () => fileInput.click(),
});

function goLive(i: number): void {
  void audio.select(i);
}

// ── audio events ────────────────────────────────────────────────────────────
audio.onTrackChange = () => {
  classifier.reset(performance.now());
  phone.setMedia(audio.tracks, audio.index);
  syncScene();
};
audio.onPlayState = () => syncScene();
audio.onPlaylistChange = () => phone.setMedia(audio.tracks, audio.index);
audio.load(0);
phone.setMedia(audio.tracks, audio.index);

// ── auto-vibe from the classifier ───────────────────────────────────────────
classifier.onResult = (c) => {
  phone.setNowPlaying(c.vibe, audio.index);
  if (profile.auto) { profile.vibe = c.vibe; persist(); phone.setProfile(profile); syncScene(); }
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
    for (const id of res.unlocked) toast(`🔓 Unlocked: ${unlockLabel(id)}`);
  }
  phone.setProfile(profile);
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

// ── render loop ─────────────────────────────────────────────────────────────
syncScene();
phone.setProfile(profile);
let lastT = performance.now();
function frame(now: number): void {
  requestAnimationFrame(frame);
  const dt = now - lastT; lastT = now;
  const playing = audio.playing;
  const lv = playing ? audio.levels() : null;
  scene.render(lv, now / 1000, new Date());

  if (lv) {
    phone.setEq(lv.spectrum);
    if (profile.auto) classifier.observe(lv, now);
    // headline crowd number for the "best moment" memory
    const crowd = Math.round(lv.level * VENUES[profile.venue].crowdScale * VIBES[profile.vibe].crowd * 1500);
    if (crowd > profile.peakCrowd) { profile.peakCrowd = crowd; }
  }
  tickProgress(dt);
}
requestAnimationFrame(frame);

// ── dev-only helpers (stripped from production builds) ──────────────────────
if (import.meta.env.DEV) {
  // headless render hook (rAF pauses in hidden tabs)
  (window as unknown as { __pr: unknown }).__pr = { scene, audio, profile: () => profile };
  // +time button: test progression without listening for real minutes
  const dev = document.createElement("button");
  dev.textContent = "+30 min";
  dev.className = "dev-time";
  dev.title = "dev: accrue 30 listening minutes";
  dev.onclick = () => applyProgress(accrue(profile, 30, "dev-" + Date.now()));
  document.body.appendChild(dev);
}
