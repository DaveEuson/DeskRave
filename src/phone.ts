import { AVATARS, JACKET_HUES, PALETTES, VENUES, VENUE_ORDER, type AvatarId, type VenueId, type VibeName } from "./config";
import { minutesForLevel } from "./xp";
import type { Profile } from "./profile";
import type { Track } from "./tracks";

export interface PhoneCallbacks {
  onVibe(v: VibeName): void;
  onAuto(on: boolean): void;
  onPalette(hue: number): void;
  onName(name: string): void;
  onAvatar(a: AvatarId): void;
  onJacket(hue: number): void;
  onVenue(v: VenueId): void;
  onSettings(patch: Partial<Profile["settings"]>): void;
  onSelectTrack(i: number): void;
  onSend(): void;
  onAddFiles(): void;
}

type Tab = "send" | "dj" | "stage" | "level";
const $ = <T extends HTMLElement>(r: HTMLElement, sel: string) => r.querySelector(sel) as T;

export class Phone {
  private root: HTMLElement;
  private body: HTMLElement;
  private tab: Tab = "send";
  private optionsOpen = false;
  private tracks: Track[] = [];
  private currentIndex = 0;
  private nowVibe: VibeName = "groove";

  constructor(root: HTMLElement, private p: Profile, private cb: PhoneCallbacks) {
    this.root = root;
    root.innerHTML = `
      <div class="ph-frame"><div class="ph-screen">
        <header class="ph-head">
          <span class="ph-word">PIXEL&nbsp;DJ</span>
          <button class="ph-gear" data-act="gear">⚙</button>
        </header>
        <div class="ph-body"></div>
        <nav class="ph-tabs">
          <button data-tab="send">Send</button>
          <button data-tab="dj">DJ</button>
          <button data-tab="stage">Stage</button>
          <button data-tab="level">Level</button>
        </nav>
        <div class="ph-sheet" hidden></div>
      </div></div>`;
    this.body = $(root, ".ph-body");
    root.querySelectorAll<HTMLButtonElement>(".ph-tabs button").forEach((b) =>
      (b.onclick = () => { this.tab = b.dataset.tab as Tab; this.render(); }));
    $(root, '[data-act="gear"]').onclick = () => { this.optionsOpen = !this.optionsOpen; this.renderSheet(); };
    this.render();
  }

  setProfile(p: Profile): void { this.p = p; this.render(); this.renderSheet(); }
  setMedia(tracks: Track[], current: number): void { this.tracks = tracks; this.currentIndex = current; if (this.tab === "send") this.render(); }
  setNowPlaying(vibe: VibeName, current: number): void { this.nowVibe = vibe; this.currentIndex = current; if (this.tab === "send") this.updateNowPlaying(); }

  setEq(spectrum: number[]): void {
    const bars = this.body.querySelectorAll<HTMLElement>(".ph-eq i");
    if (!bars.length) return;
    for (let i = 0; i < bars.length; i++) bars[i].style.height = `${4 + (spectrum[i * 2] ?? 0) * 26}px`;
  }

  // ── tab render ──────────────────────────────────────────────────────────────
  private render(): void {
    this.root.querySelectorAll<HTMLButtonElement>(".ph-tabs button").forEach((b) =>
      b.classList.toggle("on", b.dataset.tab === this.tab));
    if (this.tab === "send") this.renderSend();
    else if (this.tab === "dj") this.renderDJ();
    else if (this.tab === "stage") this.renderStage();
    else this.renderLevel();
  }

  private renderSend(): void {
    const cur = this.tracks[this.currentIndex];
    this.body.innerHTML = `
      <div class="ph-card ph-now">
        <div class="ph-now-eq ph-eq">${"<i></i>".repeat(12)}</div>
        <div class="ph-now-meta"><b id="npTitle">${cur ? esc(cur.title) : "—"}</b>
          <span id="npVibe">🤖 ${this.nowVibe}</span></div>
      </div>
      <div class="ph-row"><button class="ph-btn ph-send" data-act="send">Send to the floor</button>
        <button class="ph-btn" data-act="add">＋ Add music</button></div>
      <div class="ph-label">Vibe ${this.p.auto ? '<span class="ph-auto on">🤖 AUTO</span>' : '<span class="ph-auto" >🤖 AUTO</span>'}</div>
      <div class="ph-seg" id="vibeSeg">
        ${(["chill", "groove", "rave"] as VibeName[]).map((v) => `<button data-vibe="${v}" class="${this.p.vibe === v ? "on" : ""}">${v}</button>`).join("")}
      </div>
      <div class="ph-label">Club lights</div>
      <div class="ph-swatches">${PALETTES.map((p) => `<button data-hue="${p.hue}" style="--c:hsl(${p.hue},80%,55%)" class="${this.p.palette === p.hue ? "on" : ""}" title="${p.name}"></button>`).join("")}</div>
      <div class="ph-grid">${this.tracks.map((t, i) => `
        <button class="ph-tile ${i === this.currentIndex ? "on" : ""}" data-i="${i}">
          <span class="ph-tile-k">${t.local ? "♪" : "▶"}</span>
          <span class="ph-tile-t">${esc(t.title)}</span>
          <span class="ph-tile-a">${esc(t.artist)}</span>
        </button>`).join("")}</div>`;
    $(this.body, '[data-act="send"]').onclick = () => this.cb.onSend();
    $(this.body, '[data-act="add"]').onclick = () => this.cb.onAddFiles();
    $(this.body, ".ph-auto").onclick = () => this.cb.onAuto(!this.p.auto);
    this.body.querySelectorAll<HTMLButtonElement>("#vibeSeg button").forEach((b) =>
      (b.onclick = () => this.cb.onVibe(b.dataset.vibe as VibeName)));
    this.body.querySelectorAll<HTMLButtonElement>(".ph-swatches button").forEach((b) =>
      (b.onclick = () => this.cb.onPalette(Number(b.dataset.hue))));
    this.body.querySelectorAll<HTMLButtonElement>(".ph-tile").forEach((b) =>
      (b.onclick = () => this.cb.onSelectTrack(Number(b.dataset.i))));
  }

  private updateNowPlaying(): void {
    const cur = this.tracks[this.currentIndex];
    const t = this.body.querySelector("#npTitle");
    const v = this.body.querySelector("#npVibe");
    if (t && cur) t.textContent = cur.title;
    if (v) v.textContent = `🤖 ${this.nowVibe}`;
    this.body.querySelectorAll<HTMLElement>(".ph-tile").forEach((b) =>
      b.classList.toggle("on", Number(b.dataset.i) === this.currentIndex));
  }

  private renderDJ(): void {
    this.body.innerHTML = `
      <div class="ph-label">DJ name</div>
      <input class="ph-name" id="djName" maxlength="14" value="${esc(this.p.djName)}" />
      <div class="ph-label">Avatar</div>
      <div class="ph-avatars">${(Object.keys(AVATARS) as AvatarId[]).map((a) => {
        const locked = this.p.level < AVATARS[a].unlockLevel && !this.p.unlocks.includes(a);
        return `<button data-av="${a}" class="${this.p.avatar === a ? "on" : ""} ${locked ? "locked" : ""}" ${locked ? "disabled" : ""}>
          ${AVATARS[a].name}${locked ? `<small>Lv ${AVATARS[a].unlockLevel}</small>` : ""}</button>`;
      }).join("")}</div>
      <div class="ph-label">Jacket</div>
      <div class="ph-swatches">${JACKET_HUES.map((h) => `<button data-jh="${h}" style="--c:hsl(${h},65%,55%)" class="${this.p.jacketHue === h ? "on" : ""}"></button>`).join("")}</div>`;
    const name = $<HTMLInputElement>(this.body, "#djName");
    name.oninput = () => this.cb.onName(name.value); // no re-render → keeps focus
    this.body.querySelectorAll<HTMLButtonElement>(".ph-avatars button").forEach((b) =>
      (b.onclick = () => { if (!b.classList.contains("locked")) this.cb.onAvatar(b.dataset.av as AvatarId); }));
    this.body.querySelectorAll<HTMLButtonElement>(".ph-swatches button").forEach((b) =>
      (b.onclick = () => this.cb.onJacket(Number(b.dataset.jh))));
  }

  private renderStage(): void {
    this.body.innerHTML = `
      <div class="ph-label">Venue</div>
      <div class="ph-venues">${VENUE_ORDER.map((id) => {
        const V = VENUES[id];
        const locked = this.p.level < V.unlockLevel && !this.p.unlocks.includes(id);
        return `<button data-venue="${id}" class="${this.p.venue === id ? "on" : ""} ${locked ? "locked" : ""}" ${locked ? "disabled" : ""}>
          <b>${V.name}</b>${locked ? `<small>🔒 Lv ${V.unlockLevel}</small>` : `<small>crowd ×${V.crowdScale}</small>`}</button>`;
      }).join("")}</div>`;
    this.body.querySelectorAll<HTMLButtonElement>(".ph-venues button").forEach((b) =>
      (b.onclick = () => { if (!b.classList.contains("locked")) this.cb.onVenue(b.dataset.venue as VenueId); }));
  }

  private renderLevel(): void {
    const need = minutesForLevel(this.p.level);
    const unlocks = [...this.p.unlocks].filter((u) => u in VENUES || u in AVATARS);
    this.body.innerHTML = `
      <div class="ph-lvl"><b>Level ${this.p.level}</b><span>${Math.round(this.p.xp * 100)}% → Lv ${this.p.level + 1}</span></div>
      <div class="ph-bar"><i style="width:${Math.round(this.p.xp * 100)}%"></i></div>
      <div class="ph-stat">${this.p.listenedMinutes} min listened · ${this.p.uniqueTracks.length} tracks · next: ${need} min</div>
      <div class="ph-stat">peak crowd: <b>${this.p.peakCrowd}</b></div>
      <div class="ph-label">Unlocks</div>
      <div class="ph-unlocks">${unlocks.map((u) => `<span>${u in VENUES ? "🏟" : "🎧"} ${esc(u in VENUES ? VENUES[u as VenueId].name : AVATARS[u as AvatarId].name)}</span>`).join("")}</div>`;
  }

  private renderSheet(): void {
    const sheet = $(this.root, ".ph-sheet");
    sheet.hidden = !this.optionsOpen;
    if (!this.optionsOpen) return;
    const st = this.p.settings;
    const toggle = (k: keyof Profile["settings"], label: string) =>
      `<label class="ph-opt"><span>${label}</span><input type="checkbox" data-set="${k}" ${st[k] ? "checked" : ""}/></label>`;
    sheet.innerHTML = `<div class="ph-sheet-card">
      <div class="ph-label">Options</div>
      ${toggle("showClock", "Desk clock")}${toggle("showDate", "Show date")}${toggle("clock24", "24-hour time")}${toggle("scanlines", "CRT scanlines")}
      <button class="ph-btn" data-act="close">Done</button></div>`;
    sheet.querySelectorAll<HTMLInputElement>("input[data-set]").forEach((i) =>
      (i.onchange = () => this.cb.onSettings({ [i.dataset.set as string]: i.checked } as Partial<Profile["settings"]>)));
    $(sheet, '[data-act="close"]').onclick = () => { this.optionsOpen = false; this.renderSheet(); };
  }
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}
