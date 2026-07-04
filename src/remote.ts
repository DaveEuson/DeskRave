// Phone/desktop remote control for the kiosk. Served at /remote.html on the same
// LAN address. It drives the kiosk through the /api/remote command channel — it
// does NOT play audio itself; it tells the kiosk what to do and mirrors its state.
import "./remote.css";
import { VENUES, VENUE_ORDER, type VenueId } from "./config";

interface State {
  venueId: VenueId;
  venueName: string;
  profileId: string;
  trackIndex: number;
  trackTitle: string | null;
  playing: boolean;
  muted: boolean;
  volume: number;
  mode: string;
  unlocks: string[];
  cred: number;
  tracks: { i: number; title: string; artist: string; station: boolean }[];
}

const app = document.getElementById("app")!;
const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const send = (cmd: string, value?: unknown): void => {
  void fetch("/api/remote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cmd, value }) }).catch(() => {});
  setTimeout(poll, 350); // snappy mirror after a command
};

let state: State | null = null;
let sig = ""; // re-render only when something meaningful changes (avoids flashing the UI / fighting the volume drag)

function render(): void {
  if (!state) { app.innerHTML = `<div class="loading">Connecting to the kiosk…<br><small>same Wi-Fi as the kiosk?</small></div>`; return; }
  const s = state, owned = VENUE_ORDER.filter((id) => s.unlocks.includes(id));
  const locked = VENUE_ORDER.filter((id) => !s.unlocks.includes(id)).sort((a, b) => VENUES[a].price - VENUES[b].price);
  app.innerHTML = `
    <header>
      <h1>🎧 Desk Rave — Remote</h1>
      <div class="now">${s.playing ? "▶" : "⏸"} <b>${esc(s.trackTitle || "—")}</b> · ${esc(s.venueName)}</div>
    </header>
    <div class="transport">
      <button data-cmd="prev">⏮</button>
      <button data-cmd="${s.playing ? "pause" : "play"}" class="pp">${s.playing ? "⏸" : "▶"}</button>
      <button data-cmd="next">⏭</button>
      <button data-cmd="mute" class="${s.muted ? "on" : ""}">${s.muted ? "🔇" : "🔊"}</button>
      <button data-cmd="mode" data-val="${s.mode === "calm" ? "game" : "calm"}" title="game / calm">${s.mode === "calm" ? "🎮" : "🌿"}</button>
    </div>
    <input class="vol" type="range" min="0" max="100" value="${Math.round(s.volume * 100)}" />
    <h2>Venue</h2>
    <div class="grid">${owned.map((id) => `<button class="card ${s.venueId === id ? "on" : ""}" data-venue="${id}" style="--c:${VENUES[id].accent}"><b>${esc(VENUES[id].name)}</b><small>${esc(VENUES[id].genre)}</small></button>`).join("")}</div>
    <h2>Store <span class="cred">◈ ${s.cred}</span></h2>
    <div class="grid">${locked.length ? locked.map((id) => `<button class="card store ${s.cred >= VENUES[id].price ? "" : "cant"}" data-buy="${id}" style="--c:${VENUES[id].accent}"><b>${esc(VENUES[id].name)}</b><small>${esc(VENUES[id].genre)}</small><span class="price">◈ ${VENUES[id].price}</span></button>`).join("") : `<div class="allset">Every venue unlocked! 🎉</div>`}</div>
    <h2>Stations &amp; files <label class="up">＋ upload<input type="file" accept="audio/*,.mp3,.wav,.m4a,.flac,.ogg" multiple hidden /></label></h2>
    <div class="list">${s.tracks.map((t) => `<button class="row ${t.i === s.trackIndex ? "on" : ""}" data-track="${t.i}"><span class="k">${t.station ? "📻" : "♪"}</span><span class="meta"><b>${esc(t.title)}</b><small>${esc(t.artist)}</small></span></button>`).join("")}</div>
    <h2>Backup</h2>
    <div class="backup">
      <button class="bk-save">💾 Save backup to this phone</button>
      <label class="bk-load">📂 Restore from a backup<input type="file" accept=".json,application/json" hidden /></label>
    </div>
    <small class="bk-note">Your DJ, Cred, venues &amp; desk history — keep a copy off the kiosk.</small>`;

  app.querySelectorAll<HTMLButtonElement>("[data-cmd]").forEach((b) => (b.onclick = () => send(b.dataset.cmd!, b.dataset.val)));
  app.querySelectorAll<HTMLButtonElement>("[data-venue]").forEach((b) => (b.onclick = () => send("venue", b.dataset.venue)));
  app.querySelectorAll<HTMLButtonElement>("[data-buy]").forEach((b) => (b.onclick = () => send("buyVenue", b.dataset.buy)));
  app.querySelectorAll<HTMLButtonElement>("[data-track]").forEach((b) => (b.onclick = () => send("selectTrack", Number(b.dataset.track))));
  const vol = app.querySelector<HTMLInputElement>(".vol");
  if (vol) vol.oninput = () => void fetch("/api/remote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cmd: "volume", value: Number(vol.value) / 100 }) }).catch(() => {});
  const up = app.querySelector<HTMLInputElement>(".up input");
  if (up) up.onchange = () => void upload(up.files);
  const bkSave = app.querySelector<HTMLButtonElement>(".bk-save");
  if (bkSave) bkSave.onclick = () => void downloadBackup(bkSave);
  const bkLoad = app.querySelector<HTMLInputElement>(".bk-load input");
  if (bkLoad) bkLoad.onchange = () => void restoreBackup(bkLoad);
}

// pull the kiosk's server-side profile and save it as a dated file on THIS
// device — the one copy that survives the kiosk's SD card dying
async function downloadBackup(btn: HTMLButtonElement): Promise<void> {
  if (!state?.profileId) return;
  try {
    const p = await fetch(`/api/profile?id=${encodeURIComponent(state.profileId)}`).then((r) => r.json());
    if (!p || typeof p !== "object") { btn.textContent = "⚠ nothing to back up yet"; return; }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(p, null, 2)], { type: "application/json" }));
    a.download = `desk-rave-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    btn.textContent = "✅ backup saved";
    setTimeout(() => { btn.textContent = "💾 Save backup to this phone"; }, 2500);
  } catch {
    btn.textContent = "⚠ kiosk unreachable";
  }
}

// send a backup file to the kiosk; it sanitizes, adopts it, and reloads
async function restoreBackup(input: HTMLInputElement): Promise<void> {
  const f = input.files?.[0];
  input.value = ""; // allow re-picking the same file
  if (!f) return;
  try {
    const p = JSON.parse(await f.text()) as { djName?: string; cred?: number; unlocks?: string[] };
    if (!p || typeof p !== "object" || !("cred" in p) || !Array.isArray(p.unlocks)) {
      alert("That file doesn't look like a Desk Rave backup."); return;
    }
    const ok = confirm(`Restore "${p.djName ?? "DJ"}" — ◈${Math.floor(p.cred ?? 0)} Cred, ${p.unlocks.length} unlocks?\n\nThis replaces the kiosk's current progress and reloads it.`);
    if (ok) send("restoreProfile", p);
  } catch {
    alert("Couldn't read that file as a backup.");
  }
}

async function upload(files: FileList | null): Promise<void> {
  if (!files?.length) return;
  for (const f of Array.from(files)) {
    await fetch("/api/upload", { method: "POST", headers: { "x-filename": encodeURIComponent(f.name) }, body: f }).catch(() => {});
  }
  send("reloadLibrary");
}

async function poll(): Promise<void> {
  try {
    const s = (await fetch("/api/remote/state", { cache: "no-store" }).then((r) => r.json())) as State | null;
    if (!s) return;
    const ns = JSON.stringify([s.venueId, s.trackIndex, s.playing, s.muted, s.mode, s.tracks.length, s.unlocks.length, s.cred]);
    state = s;
    if (ns !== sig) { sig = ns; render(); }
  } catch { /* kiosk offline */ }
}

render();
void poll();
setInterval(poll, 1500);
