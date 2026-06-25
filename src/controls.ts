import { AVATARS, JACKET_HUES, PALETTES, VENUES, VENUE_ORDER, type AvatarId, type VenueId, type VibeName } from "./config";
import { minutesForLevel } from "./xp";
import type { Profile } from "./profile";
import type { Track } from "./tracks";

// The widget's control surface: a slim always-on now-playing dock + a tap-to-reveal
// sheet. Touch-first (no hover), reflows for desktop / Pi touchscreen / phone.
export interface ControlsCallbacks {
  onPlayPause(): void;
  onPrev(): void;
  onNext(): void;
  onMute(): void;
  onVolume(v: number): void;
  onVibe(v: VibeName): void;
  onAuto(on: boolean): void;
  onPalette(hue: number): void;
  onName(name: string): void;
  onAvatar(a: AvatarId): void;
  onJacket(hue: number): void;
  onVenue(v: VenueId): void;
  onSettings(patch: Partial<Profile["settings"]>): void;
  onSelectTrack(i: number): void;
  onAddFiles(): void;
}

type View = "music" | "dj" | "options";
const $ = <T extends HTMLElement>(r: HTMLElement, sel: string) => r.querySelector(sel) as T;

export class Controls {
  private root: HTMLElement;
  private sheetBody: HTMLElement;
  private open = false;
  private view: View = "music";
  private tracks: Track[] = [];
  private currentIndex = 0;
  private nowVibe: VibeName = "groove";
  private playing = false;
  private muted = false;

  constructor(root: HTMLElement, private p: Profile, private cb: ControlsCallbacks) {
    this.root = root;
    root.innerHTML = `
      <div class="scrim" data-act="close"></div>
      <div class="sheet">
        <div class="sheet-grip" data-act="close"></div>
        <div class="sheet-nav">
          <button data-view="music" class="on">♪ Music</button>
          <button data-view="dj">🎧 DJ</button>
          <button data-view="options" class="nav-gear" title="options">⚙</button>
        </div>
        <div class="sheet-body"></div>
      </div>
      <div class="dock" data-act="toggle">
        <button class="dock-pp" data-act="pp" title="play / pause">▶</button>
        <div class="dock-now"><b class="dock-title">—</b><span class="dock-sub">tap to open</span></div>
        <div class="dock-eq">${"<i></i>".repeat(7)}</div>
        <button class="dock-toggle" data-act="toggle">▴</button>
      </div>`;
    this.sheetBody = $(root, ".sheet-body");

    root.addEventListener("click", (e) => {
      const act = (e.target as HTMLElement).closest("[data-act]")?.getAttribute("data-act");
      if (act === "pp") { e.stopPropagation(); this.cb.onPlayPause(); return; }
      if (act === "toggle") this.setOpen(!this.open);
      else if (act === "close") this.setOpen(false);
    });
    root.querySelectorAll<HTMLButtonElement>(".sheet-nav button").forEach((b) =>
      (b.onclick = () => { this.view = b.dataset.view as View; this.renderNav(); this.renderBody(); }));

    this.renderBody();
  }

  private setOpen(open: boolean): void {
    this.open = open;
    this.root.classList.toggle("open", open);
    if (open) this.renderBody();
  }

  setProfile(p: Profile): void { this.p = p; if (this.open) this.renderBody(); this.renderDock(); }
  setMedia(tracks: Track[], current: number): void { this.tracks = tracks; this.currentIndex = current; if (this.open && this.view === "music") this.renderBody(); this.renderDock(); }
  setNowPlaying(vibe: VibeName, current: number): void { this.nowVibe = vibe; this.currentIndex = current; this.renderDock(); if (this.open && this.view === "music") this.renderBody(); }
  setTransport(playing: boolean, muted: boolean): void {
    this.playing = playing; this.muted = muted;
    this.root.querySelectorAll<HTMLElement>('[data-act="pp"]').forEach((b) => (b.textContent = playing ? "⏸" : "▶"));
    const m = this.sheetBody.querySelector<HTMLButtonElement>('[data-act="mute"]');
    if (m) { m.textContent = muted ? "🔇" : "🔊"; m.classList.toggle("on", muted); }
  }
  setEq(spectrum: number[]): void {
    this.root.querySelectorAll<HTMLElement>(".dock-eq i").forEach((bar, i) => (bar.style.height = `${3 + (spectrum[i * 3] ?? 0) * 18}px`));
  }

  private renderDock(): void {
    const cur = this.tracks[this.currentIndex];
    const t = this.root.querySelector(".dock-title");
    const s = this.root.querySelector(".dock-sub");
    if (t) t.textContent = cur ? cur.title : "—";
    if (s) s.textContent = cur ? `${cur.artist} · 🤖 ${this.nowVibe}` : "tap to open";
  }

  private renderNav(): void {
    this.root.querySelectorAll<HTMLButtonElement>(".sheet-nav button[data-view]").forEach((b) =>
      b.classList.toggle("on", b.dataset.view === this.view));
  }

  private renderBody(): void {
    if (this.view === "music") this.renderMusic();
    else if (this.view === "dj") this.renderDJ();
    else this.renderOptions();
    this.renderDock();
  }

  private renderMusic(): void {
    this.sheetBody.innerHTML = `
      <div class="cv-transport">
        <button data-act="prev">⏮</button>
        <button data-act="pp" class="pp">${this.playing ? "⏸" : "▶"}</button>
        <button data-act="next">⏭</button>
        <button data-act="mute" class="${this.muted ? "on" : ""}">${this.muted ? "🔇" : "🔊"}</button>
      </div>
      <input class="cv-vol" type="range" min="0" max="100" value="80" title="volume" />
      <div class="cv-row"><span class="cv-label">Vibe</span>
        <button class="cv-auto ${this.p.auto ? "on" : ""}" data-act="auto">🤖 AUTO</button>
        <div class="cv-seg">${(["chill", "groove", "rave"] as VibeName[]).map((v) => `<button data-vibe="${v}" class="${this.p.vibe === v ? "on" : ""}">${v}</button>`).join("")}</div>
      </div>
      <div class="cv-row cv-listhead"><span class="cv-label">Stations & files</span><button class="cv-add" data-act="add">＋ Add</button></div>
      <div class="cv-list">${this.tracks.map((t, i) => `
        <button class="cv-track ${i === this.currentIndex ? "on" : ""}" data-i="${i}">
          <span class="cv-k">${t.local ? "♪" : "📻"}</span>
          <span class="cv-meta"><b>${esc(t.title)}</b><small>${esc(t.artist)}</small></span>
        </button>`).join("")}</div>`;
    $(this.sheetBody, ".cv-vol").oninput = (e) => this.cb.onVolume(Number((e.target as HTMLInputElement).value) / 100);
    $(this.sheetBody, '[data-act="prev"]').onclick = () => this.cb.onPrev();
    $(this.sheetBody, '[data-act="next"]').onclick = () => this.cb.onNext();
    $(this.sheetBody, '[data-act="mute"]').onclick = () => this.cb.onMute();
    $(this.sheetBody, '[data-act="auto"]').onclick = () => this.cb.onAuto(!this.p.auto);
    $(this.sheetBody, '[data-act="add"]').onclick = () => this.cb.onAddFiles();
    this.sheetBody.querySelectorAll<HTMLButtonElement>("[data-vibe]").forEach((b) => (b.onclick = () => this.cb.onVibe(b.dataset.vibe as VibeName)));
    this.sheetBody.querySelectorAll<HTMLButtonElement>(".cv-track").forEach((b) => (b.onclick = () => this.cb.onSelectTrack(Number(b.dataset.i))));
  }

  private renderDJ(): void {
    const need = minutesForLevel(this.p.level);
    const venue = VENUES[this.p.venue];
    this.sheetBody.innerHTML = `
      <div class="cv-level">
        <div class="cv-lvlrow"><b>Level ${this.p.level}</b><span>${venue.name}</span></div>
        <div class="cv-bar"><i style="width:${Math.round(this.p.xp * 100)}%"></i></div>
        <small>${this.p.listenedMinutes} min listened · next level in ~${Math.max(0, Math.round(need - need * this.p.xp))} min of play</small>
      </div>
      <span class="cv-label">DJ name</span>
      <input class="cv-name" maxlength="14" value="${esc(this.p.djName)}" />
      <span class="cv-label">Hat</span>
      <div class="cv-pills">${(Object.keys(AVATARS) as AvatarId[]).map((a) => {
        const locked = !this.p.unlocks.includes(a);
        return `<button data-av="${a}" class="${this.p.avatar === a ? "on" : ""} ${locked ? "locked" : ""}" ${locked ? "disabled" : ""}>${AVATARS[a].name}${locked ? ` · Lv${AVATARS[a].unlockLevel}` : ""}</button>`;
      }).join("")}</div>
      <span class="cv-label">Jacket</span>
      <div class="cv-swatches">${JACKET_HUES.map((h) => `<button data-jh="${h}" style="--c:hsl(${h},65%,55%)" class="${this.p.jacketHue === h ? "on" : ""}"></button>`).join("")}</div>
      <span class="cv-label">Club lights</span>
      <div class="cv-swatches">${PALETTES.map((p) => `<button data-hue="${p.hue}" style="--c:hsl(${p.hue},80%,55%)" class="${this.p.palette === p.hue ? "on" : ""}" title="${p.name}"></button>`).join("")}</div>
      <span class="cv-label">Venue (unlocks as you level)</span>
      <div class="cv-pills">${VENUE_ORDER.map((id) => {
        const locked = !this.p.unlocks.includes(id);
        return `<button data-venue="${id}" class="${this.p.venue === id ? "on" : ""} ${locked ? "locked" : ""}" ${locked ? "disabled" : ""}>${VENUES[id].name}${locked ? ` · Lv${VENUES[id].unlockLevel}` : ""}</button>`;
      }).join("")}</div>`;
    const name = $<HTMLInputElement>(this.sheetBody, ".cv-name");
    name.oninput = () => this.cb.onName(name.value);
    this.sheetBody.querySelectorAll<HTMLButtonElement>("[data-av]").forEach((b) => (b.onclick = () => { if (!b.disabled) this.cb.onAvatar(b.dataset.av as AvatarId); }));
    this.sheetBody.querySelectorAll<HTMLButtonElement>("[data-jh]").forEach((b) => (b.onclick = () => this.cb.onJacket(Number(b.dataset.jh))));
    this.sheetBody.querySelectorAll<HTMLButtonElement>("[data-hue]").forEach((b) => (b.onclick = () => this.cb.onPalette(Number(b.dataset.hue))));
    this.sheetBody.querySelectorAll<HTMLButtonElement>("[data-venue]").forEach((b) => (b.onclick = () => { if (!b.disabled) this.cb.onVenue(b.dataset.venue as VenueId); }));
  }

  private renderOptions(): void {
    const st = this.p.settings;
    const toggle = (k: keyof Profile["settings"], label: string) =>
      `<label class="cv-opt"><span>${label}</span><input type="checkbox" data-set="${k}" ${st[k] ? "checked" : ""}/></label>`;
    this.sheetBody.innerHTML = `${toggle("showClock", "Desk clock")}${toggle("showDate", "Show date")}${toggle("clock24", "24-hour time")}${toggle("scanlines", "CRT scanlines")}`;
    this.sheetBody.querySelectorAll<HTMLInputElement>("input[data-set]").forEach((i) =>
      (i.onchange = () => this.cb.onSettings({ [i.dataset.set as string]: i.checked } as Partial<Profile["settings"]>)));
  }
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}
