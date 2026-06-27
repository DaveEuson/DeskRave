import { AVATARS, DAILY_MULT, JACKET_HUES, PALETTES, PRIZES, VENUES, VENUE_ORDER, dailyBonus, genreMult, type AvatarId, type VenueId, type VibeName } from "./config";
import { minutesForLevel } from "./xp";
import { deskTotals, fmtSpan, type Profile } from "./profile";
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
  onBuyVenue(id: VenueId): void;
  onBuyPrize(id: string): void;
  onSettings(patch: Partial<Profile["settings"]>): void;
  onSelectTrack(i: number): void;
  onAddFiles(): void;
}

type View = "music" | "dj" | "store" | "options";
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
          <button data-view="store">🛒 Store</button>
          <button data-view="options" class="nav-gear" title="options">⚙</button>
        </div>
        <div class="sheet-body"></div>
      </div>
      <div class="dock">
        <button class="dock-btn" data-act="prev" title="previous">⏮</button>
        <button class="dock-pp" data-act="pp" title="play / pause">▶</button>
        <button class="dock-btn" data-act="next" title="next">⏭</button>
        <button class="dock-btn" data-act="mute" title="mute">🔊</button>
        <div class="dock-now" data-act="toggle"><b class="dock-title">—</b><span class="dock-sub">tap for stations & options</span></div>
        <div class="dock-eq" data-act="toggle">${"<i></i>".repeat(6)}</div>
        <button class="dock-toggle" data-act="toggle" title="more">▴</button>
      </div>`;
    this.sheetBody = $(root, ".sheet-body");

    root.addEventListener("click", (e) => {
      const act = (e.target as HTMLElement).closest("[data-act]")?.getAttribute("data-act");
      if (act === "pp") { e.stopPropagation(); this.cb.onPlayPause(); return; }
      if (act === "prev") { e.stopPropagation(); this.cb.onPrev(); return; }
      if (act === "next") { e.stopPropagation(); this.cb.onNext(); return; }
      if (act === "mute") { e.stopPropagation(); this.cb.onMute(); return; }
      if (act === "toggle") this.setOpen(!this.open);
      else if (act === "close") this.setOpen(false);
    });
    root.querySelectorAll<HTMLButtonElement>(".sheet-nav button").forEach((b) =>
      (b.onclick = () => { this.view = b.dataset.view as View; this.renderNav(); this.renderBody(); }));

    root.classList.add("hint"); // pulse the dock until first interaction
    this.renderBody();
  }

  private setOpen(open: boolean): void {
    this.open = open;
    this.root.classList.toggle("open", open);
    this.root.classList.remove("hint"); // any interaction clears the "tap me" hint
    if (open) this.renderBody();
  }

  // tapping the scene anywhere opens the sheet (big touch target for the kiosk)
  reveal(): void {
    if (!this.open) this.setOpen(true);
  }

  setProfile(p: Profile): void { this.p = p; if (this.open) this.renderBody(); this.renderDock(); }
  setMedia(tracks: Track[], current: number): void { this.tracks = tracks; this.currentIndex = current; if (this.open && this.view === "music") this.renderBody(); this.renderDock(); }
  setNowPlaying(vibe: VibeName, current: number): void { this.nowVibe = vibe; this.currentIndex = current; this.renderDock(); if (this.open && this.view === "music") this.renderBody(); }
  setTransport(playing: boolean, muted: boolean): void {
    this.playing = playing; this.muted = muted;
    this.root.querySelectorAll<HTMLElement>('[data-act="pp"]').forEach((b) => (b.textContent = playing ? "⏸" : "▶"));
    this.root.querySelectorAll<HTMLElement>('[data-act="mute"]').forEach((b) => { b.textContent = muted ? "🔇" : "🔊"; b.classList.toggle("on", muted); });
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
    else if (this.view === "store") this.renderStore();
    else this.renderOptions();
    this.renderDock();
  }

  private renderMusic(): void {
    const cur = this.tracks[this.currentIndex];
    const playingGenre = cur?.station ? (cur.genre ?? null) : null;
    const daily = dailyBonus();
    const gm = genreMult(this.p.venue, playingGenre);
    const nowLine = gm.kind === "daily" ? `🔥 BONUS ACTIVE · ×${gm.mult} Cred`
      : gm.kind === "native" ? `✓ ${playingGenre} suits ${esc(VENUES[this.p.venue].name)} · ×${gm.mult}`
      : playingGenre ? `playing ${playingGenre} · ×1` : "play a genre that suits the venue → bonus Cred";
    this.sheetBody.innerHTML = `
      <div class="cv-bonus ${gm.kind ?? ""}">
        <span class="cv-bonus-today">🎯 Today: <b>${daily.genre}</b> @ <b>${esc(VENUES[daily.venue].name)}</b> ·×${DAILY_MULT}</span>
        <span class="cv-bonus-now">${nowLine}</span>
      </div>
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
    const jacketHues = [...JACKET_HUES, ...PRIZES.filter((p) => p.kind === "jacket" && this.p.unlocks.includes(p.id)).map((p) => p.hue)];
    const palettes = [...PALETTES, ...PRIZES.filter((p) => p.kind === "palette" && this.p.unlocks.includes(p.id)).map((p) => ({ name: p.name, hue: p.hue }))];
    this.sheetBody.innerHTML = `
      <div class="cv-level">
        <div class="cv-lvlrow"><b>Level ${this.p.level}</b><span>${esc(venue.name)} · ◈ <b class="cv-cred-val">${Math.floor(this.p.cred)}</b></span></div>
        <div class="cv-bar"><i style="width:${Math.round(this.p.xp * 100)}%"></i></div>
        <small>${this.p.listenedMinutes} min listened · next level in ~${Math.max(0, Math.round(need - need * this.p.xp))} min of play</small>
      </div>
      <span class="cv-label">Time at desk</span>
      ${(() => { const d = deskTotals(this.p); return `<div class="cv-stats">
        <div><b>${fmtSpan(d.today)}</b><small>today</small></div>
        <div><b>${fmtSpan(d.week)}</b><small>this week</small></div>
        <div><b>${fmtSpan(d.month)}</b><small>this month</small></div>
        <div><b>${fmtSpan(d.year)}</b><small>this year</small></div></div>`; })()}
      <span class="cv-label">DJ name</span>
      <input class="cv-name" maxlength="14" value="${esc(this.p.djName)}" />
      <span class="cv-label">Hat</span>
      <div class="cv-pills">${(Object.keys(AVATARS) as AvatarId[]).map((a) => {
        const locked = !this.p.unlocks.includes(a);
        return `<button data-av="${a}" class="${this.p.avatar === a ? "on" : ""} ${locked ? "locked" : ""}" ${locked ? "disabled" : ""}>${AVATARS[a].name}${locked ? ` · Lv${AVATARS[a].unlockLevel}` : ""}</button>`;
      }).join("")}</div>
      <span class="cv-label">Jacket</span>
      <div class="cv-swatches">${jacketHues.map((h) => `<button data-jh="${h}" style="--c:hsl(${h},65%,55%)" class="${this.p.jacketHue === h ? "on" : ""}"></button>`).join("")}</div>
      <span class="cv-label">Club lights</span>
      <div class="cv-swatches">${palettes.map((p) => `<button data-hue="${p.hue}" style="--c:hsl(${p.hue},80%,55%)" class="${this.p.palette === p.hue ? "on" : ""}" title="${esc(p.name)}"></button>`).join("")}</div>
      <span class="cv-label">Venue (${this.p.unlocks.filter((u) => u in VENUES).length}/${VENUE_ORDER.length} · buy more in 🛒 Store)</span>
      <div class="cv-pills">${VENUE_ORDER.map((id) => {
        const m = VENUES[id];
        const locked = !this.p.unlocks.includes(id);
        const tag = locked ? ` 🔒 ◈${m.price}` : (m.ported ? "" : " · soon");
        return `<button data-venue="${id}" class="${this.p.venue === id ? "on" : ""} ${locked ? "locked" : ""}" ${locked ? "disabled" : ""}>${m.name}${tag}</button>`;
      }).join("")}</div>`;
    const name = $<HTMLInputElement>(this.sheetBody, ".cv-name");
    name.oninput = () => this.cb.onName(name.value);
    this.sheetBody.querySelectorAll<HTMLButtonElement>("[data-av]").forEach((b) => (b.onclick = () => { if (!b.disabled) this.cb.onAvatar(b.dataset.av as AvatarId); }));
    this.sheetBody.querySelectorAll<HTMLButtonElement>("[data-jh]").forEach((b) => (b.onclick = () => this.cb.onJacket(Number(b.dataset.jh))));
    this.sheetBody.querySelectorAll<HTMLButtonElement>("[data-hue]").forEach((b) => (b.onclick = () => this.cb.onPalette(Number(b.dataset.hue))));
    this.sheetBody.querySelectorAll<HTMLButtonElement>("[data-venue]").forEach((b) => (b.onclick = () => { if (!b.disabled) this.cb.onVenue(b.dataset.venue as VenueId); }));
  }

  // Live-update just the Cred numbers (cheap; called every second from main).
  setCred(cred: number): void {
    this.root.querySelectorAll<HTMLElement>(".cv-cred-val").forEach((e) => (e.textContent = String(Math.floor(cred))));
  }

  private renderStore(): void {
    const cred = Math.floor(this.p.cred);
    const owned = (id: string) => this.p.unlocks.includes(id);
    const lockedVenues = VENUE_ORDER.filter((id) => !owned(id)).sort((a, b) => VENUES[a].price - VENUES[b].price);
    const venueCard = (id: VenueId) => {
      const m = VENUES[id], afford = this.p.cred >= m.price;
      return `<button class="cv-buy ${afford ? "" : "cant"}" data-buy-venue="${id}">
        <span class="cv-buy-name">${esc(m.name)}${m.ported ? "" : " · soon"}</span>
        <span class="cv-buy-price">◈ ${m.price}</span></button>`;
    };
    const prizeCard = (p: (typeof PRIZES)[number]) => {
      const has = owned(p.id), afford = this.p.cred >= p.price;
      return `<button class="cv-buy ${has ? "owned" : afford ? "" : "cant"}" data-buy-prize="${p.id}" ${has ? "disabled" : ""}>
        <span class="cv-buy-sw" style="--c:hsl(${p.hue},80%,55%)"></span>
        <span class="cv-buy-name">${esc(p.name)}</span>
        <span class="cv-buy-price">${has ? "✓" : `◈ ${p.price}`}</span></button>`;
    };
    this.sheetBody.innerHTML = `
      <div class="cv-credbar">◈ <b class="cv-cred-val">${cred}</b> Cred <small>earned at your desk</small></div>
      <span class="cv-label">Venues — ${lockedVenues.length} left to unlock</span>
      <div class="cv-buylist">${lockedVenues.map(venueCard).join("") || `<div class="cv-allset">Every venue unlocked! 🎉</div>`}</div>
      <span class="cv-label">Prizes</span>
      <div class="cv-buylist">${PRIZES.map(prizeCard).join("")}</div>`;
    this.sheetBody.querySelectorAll<HTMLButtonElement>("[data-buy-venue]").forEach((b) => (b.onclick = () => this.cb.onBuyVenue(b.dataset.buyVenue as VenueId)));
    this.sheetBody.querySelectorAll<HTMLButtonElement>("[data-buy-prize]").forEach((b) => (b.onclick = () => { if (!b.disabled) this.cb.onBuyPrize(b.dataset.buyPrize!); }));
  }

  private renderOptions(): void {
    const st = this.p.settings;
    const toggle = (k: keyof Profile["settings"], label: string) =>
      `<label class="cv-opt"><span>${label}</span><input type="checkbox" data-set="${k}" ${st[k] ? "checked" : ""}/></label>`;
    this.sheetBody.innerHTML = `${toggle("camera", "👁 Camera presence — DJ wakes when it sees you")}${toggle("sound", "🔊 Muffled kick (through the wall)")}`
      + `${toggle("weatherAuto", "🌦 Live weather — real rain/snow over the scene")}`
      + `<label class="cv-opt"><span>Weather city</span><input class="cv-city" type="text" placeholder="auto-detect from IP" maxlength="40" value="${esc(st.weatherCity)}" ${st.weatherAuto ? "" : "disabled"}/></label>`
      + `${toggle("showClock", "Desk clock")}${toggle("showDate", "Show date")}${toggle("clock24", "24-hour time")}${toggle("scanlines", "CRT scanlines")}`;
    this.sheetBody.querySelectorAll<HTMLInputElement>("input[data-set]").forEach((i) =>
      (i.onchange = () => { this.cb.onSettings({ [i.dataset.set as string]: i.checked } as Partial<Profile["settings"]>); if (i.dataset.set === "weatherAuto") this.renderOptions(); }));
    const city = this.sheetBody.querySelector<HTMLInputElement>(".cv-city");
    if (city) city.onchange = () => this.cb.onSettings({ weatherCity: city.value.trim() });
  }
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}
