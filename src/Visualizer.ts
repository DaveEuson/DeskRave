import type { Levels } from "./AudioStream";
import { CLUB_LOOK, VENUES, VIBES, clockAmbient, type AvatarId, type ClubLook, type VenueId, type VenueMeta, type VibeName, type VibeProfile } from "./config";

export interface SceneState {
  hue: number; // club palette base
  jacketHue: number;
  venue: VenueId;
  vibe: VibeName;
  avatar: AvatarId;
  live: boolean;
  djName: string;
  showClock: boolean;
  showDate: boolean;
  clock24: boolean;
}

const PIXEL_H = 200; // internal render height; CSS upscales nearest-neighbor

interface Dancer { x: number; ph: number; scale: number; row: number; hair: number; }

// option bags for the ported cozy-scene figures
interface BarStaffOpts { shirt: string; shirtHi: string; shirtSh: string; apron?: string; skin: string; skinSh?: string; hair?: string; hat?: string; cap?: boolean; machine?: "espresso" | "bottles" | "taps"; counter?: string; counterHi?: string; counterW?: number; }
interface SeatedColors { jacket: string; jacketHi: string; jacketSh: string; skin: string; skinSh: string; hair: string; }
interface SeatedOpts { laptop?: boolean; cup?: boolean; beat?: number; lean?: number; phase?: number; }
interface LoungerColors { shirt: string; shirtSh: string; legs?: string; skin: string; hair: string; }
interface DancerColors { shirt: string; shirtSh: string; legs: string; skin: string; hair: string; }
interface BoothOpts { skin: string; skinSh?: string; jacket: string; jacketHi: string; jacketSh: string; hat?: string; cap?: boolean; hair?: string; glow: string; booth?: string; boothHi?: string; boothSh?: string; riser?: string; riserHi?: string; scale?: number; }

// The Pixel DJ desk scene. Low-res backbuffer + additive bloom. Driven by the live
// AnalyserNode while a track plays; falls back to a real-clock idle "closing time"
// wash when nothing is playing.
export class Visualizer {
  private g: CanvasRenderingContext2D;
  private glowCanvas: HTMLCanvasElement;
  private glow: CanvasRenderingContext2D;
  private bloomCanvas: HTMLCanvasElement;
  private bloom: CanvasRenderingContext2D;
  private frameN = 0;
  private momentT = 0; // seconds; "the crowd goes wild" banner shows until this
  private lastMomentT = -99;
  private w = 0;
  private h = 0;
  private dancers: Dancer[] = [];
  private clouds?: { x: number; y: number; s: number; v: number }[]; // park drifting clouds
  private energy = 0;
  private kick = 0;
  private beam = 0;
  private liveness = 0; // eased 0..1 for smooth idle↔live wind-down
  private spectrum: number[] = [];
  private presenceCount = 0; // real people the camera sees → guarantees some crowd
  private _moment = false; // "crowd goes wild" active this frame (read by club)
  // venue → scene renderer; venues absent here fall back to the "coming soon" card
  private renderers: Partial<Record<VenueId, (u: number, t: number) => void>> = {};

  private s: SceneState = {
    hue: 288, jacketHue: 288, venue: "club", vibe: "groove", avatar: "beanie",
    live: false, djName: "DJ NOVA", showClock: true, showDate: true, clock24: false,
  };

  constructor(private canvas: HTMLCanvasElement) {
    this.g = canvas.getContext("2d")!;
    this.glowCanvas = document.createElement("canvas");
    this.glow = this.glowCanvas.getContext("2d")!;
    this.bloomCanvas = document.createElement("canvas");
    this.bloom = this.bloomCanvas.getContext("2d")!;
    this.resize();
    addEventListener("resize", () => this.resize());
    // ported venue scenes (everything else → comingSoon). One line per venue.
    this.renderers = {
      cafe: (u, t) => this.renderCafe(u, t),
      park: (u, t) => this.renderPark(u, t),
      club: (u, t) => this.renderClub(u, t),
      warehouse: (u, t) => this.renderWarehouse(u, t),
      festival: (u, t) => this.renderFestival(u, t),
      silent: (u, t) => this.renderSilent(u, t),
      wedding: (u, t) => this.renderWedding(u, t),
      rink: (u, t) => this.renderRink(u, t),
      rooftop: (u, t) => this.renderRooftop(u, t),
      beach: (u, t) => this.renderBeach(u, t),
      subway: (u, t) => this.renderSubway(u, t),
      arcade: (u, t) => this.renderArcade(u, t),
      diner: (u, t) => this.renderDiner(u, t),
      studio: (u, t) => this.renderStudio(u, t),
      skilodge: (u, t) => this.renderSkiLodge(u, t),
      boat: (u, t) => this.renderBoat(u, t),
      airport: (u, t) => this.renderAirport(u, t),
      houseparty: (u, t) => this.renderHouseParty(u, t),
      laundromat: (u, t) => this.renderLaundromat(u, t),
      aquarium: (u, t) => this.renderAquarium(u, t),
      space: (u, t) => this.renderSpace(u, t),
      dmv: (u, t) => this.renderDMV(u, t),
      tavern: (u, t) => this.renderTavern(u, t),
    };
  }

  resize(): void {
    const cssW = this.canvas.clientWidth || 640;
    const cssH = this.canvas.clientHeight || 360;
    this.h = PIXEL_H;
    // Clamp the render aspect so the landscape club never gets cramped on a tall
    // phone or stretched on an ultrawide; CSS `object-fit: contain` letterboxes
    // the leftover into the scene's dark background. Keeps pixels square.
    const aspect = Math.min(3.4, Math.max(0.72, cssW / cssH));
    this.w = Math.round(PIXEL_H * aspect);
    this.canvas.width = this.w;
    this.canvas.height = this.h;
    this.glowCanvas.width = this.w;
    this.glowCanvas.height = this.h;
    this.bloomCanvas.width = this.w;
    this.bloomCanvas.height = this.h;
    this.g.imageSmoothingEnabled = false;
    this.glow.imageSmoothingEnabled = false;
  }

  setState(p: Partial<SceneState>): void {
    Object.assign(this.s, p);
  }

  setPresence(count: number): void {
    this.presenceCount = count;
  }

  private px(x: number, y: number, w: number, h: number, color: string, g = this.g): void {
    g.fillStyle = color;
    g.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  }
  private block(x: number, y: number, w: number, h: number, base: string, hi?: string | null, outline?: string | null): void {
    if (outline) this.px(x - 1, y - 1, w + 2, h + 2, outline);
    this.px(x, y, w, h, base);
    if (hi) this.px(x, y, w, Math.max(1, h * 0.34), hi);
  }
  // a thick pixel line (arms, legs, light beams, rigging)
  private limb(x0: number, y0: number, x1: number, y1: number, w: number, color: string, g = this.g): void {
    const steps = 5;
    for (let i = 0; i <= steps; i++) {
      const x = x0 + ((x1 - x0) * i) / steps;
      const y = y0 + ((y1 - y0) * i) / steps;
      this.px(x - w / 2, y - w / 2, w, w, color, g);
    }
  }
  // Real-audio "pulse": kick + energy come from the live FFT; beat is a continuous
  // time phase (per the venue's bpm) so ambient motion (twinkles, dancers) never
  // freezes when nothing is playing — it just stops reacting hard to a kick.
  private pulse(t: number, bpm: number): { kick: number; energy: number; beat: number } {
    return { kick: this.kick, energy: 0.35 + 0.6 * this.energy, beat: (t * bpm) / 60 };
  }

  render(lv: Levels | null, t: number, now: Date): void {
    const target = this.s.live && lv ? 1 : 0;
    this.liveness += (target - this.liveness) * 0.04;

    if (this.s.live && lv) {
      this.energy += (lv.level - this.energy) * 0.08;
      if (lv.beat) this.kick = 1;
      this.spectrum = lv.spectrum;
    } else {
      // idle: gentle wash tied to the real clock, slow synthetic breathing
      const amb = clockAmbient(now);
      this.energy += (amb * (0.5 + 0.5 * Math.sin(t * 0.6)) - this.energy) * 0.03;
      if (this.spectrum.length) this.spectrum = this.spectrum.map((v) => v * 0.92);
    }
    this.kick *= 0.86;
    this.beam += 0.01 + this.energy * 0.05;

    const W = this.w, H = this.h, u = H / 100;
    const meta = VENUES[this.s.venue];
    const stageTopY = Math.round(H * 0.6);

    // "the crowd goes wild" on a drop — crowd venues only: high energy + strong kick, cooldown'd
    if (meta.crowd && this.s.live && this.energy > 0.7 && this.kick > 0.6 && t - this.lastMomentT > 8) {
      this.momentT = t + 2.2;
      this.lastMomentT = t;
    }
    const moment = !!meta.crowd && t < this.momentT;
    this._moment = moment;

    // venue drives the scene; the real clock only grades it (day/night)
    this.glow.clearRect(0, 0, W, H);
    const renderer = this.renderers[this.s.venue];
    if (renderer) renderer(u, t);
    else this.comingSoon(u, t, meta);
    this.marquee(stageTopY, u);
    if (moment) this.drawMoment(stageTopY, u);

    // real-clock day/night colour grade over the venue (bloom is added after, so
    // lights still pop against a darkened night scene)
    this.applyTimeGrade(now);

    // bloom — the blur is the heaviest op, so refresh the cache every other frame
    this.frameN++;
    if (this.frameN % 2 === 0) {
      this.bloom.clearRect(0, 0, W, H);
      this.bloom.filter = "blur(2px)";
      this.bloom.drawImage(this.glowCanvas, 0, 0);
      this.bloom.filter = "none";
    }
    this.g.save();
    this.g.globalCompositeOperation = "lighter";
    this.g.globalAlpha = 0.9;
    this.g.drawImage(this.bloomCanvas, 0, 0);
    this.g.restore();

    if (this.s.showClock) this.clock(now, u);
  }

  private isNight(now: Date): boolean {
    const h = now.getHours();
    return h < 7 || h >= 19;
  }

  // a global colour grade keyed off the real clock — applies to any venue except
  // ones that are already dark / lit by their own interior (the club).
  private applyTimeGrade(now: Date): void {
    if (VENUES[this.s.venue].dark) return; // interior / already-dark venues light themselves
    const W = this.w, H = this.h, g = this.g;
    g.save();
    if (this.isNight(now)) {
      g.globalCompositeOperation = "multiply";
      g.fillStyle = "rgb(120,134,184)";
      g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = "source-over";
      g.fillStyle = "rgba(10,14,38,0.32)";
      g.fillRect(0, 0, W, H);
      const rad = g.createRadialGradient(W / 2, H * 0.45, H * 0.18, W / 2, H * 0.5, H * 0.85);
      rad.addColorStop(0, "rgba(0,0,0,0)");
      rad.addColorStop(1, "rgba(4,6,22,0.5)");
      g.fillStyle = rad;
      g.fillRect(0, 0, W, H);
    } else {
      g.globalCompositeOperation = "screen";
      g.fillStyle = "rgb(34,28,12)";
      g.fillRect(0, 0, W, H);
    }
    g.restore();
  }

  // ── CLUB (evening/night) — the original reactive nightclub ──────────────────
  private renderClub(u: number, t: number): void {
    const W = this.w, H = this.h, V = CLUB_LOOK;
    const vibe = VIBES[this.s.vibe], hue = this.s.hue, stageTopY = Math.round(H * 0.6);
    this.sky(V.sky, hue, t);
    this.rig(V, hue, stageTopY, u);
    if (V.speakers) this.speakers(stageTopY, u, hue);
    this.eqWall(stageTopY, u, hue);
    this.stageDeck(stageTopY, u, hue);
    this.dj((W * 0.5) | 0, stageTopY, u, t, vibe.djIntensity, this._moment);
    this.floorGlow(stageTopY + 10 * u, hue);
    this.crowd(Math.round(H * 0.95), u, t, vibe, V.crowdScale);
  }

  // ── COMING SOON — venues not yet ported keep the DJ grooving on a lit stage ──
  private comingSoon(u: number, t: number, meta: VenueMeta): void {
    const W = this.w, H = this.h, g = this.g;
    const { beat, kick } = this.pulse(t, 110);
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, "#0c0a16");
    grd.addColorStop(1, meta.accent + "44");
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 32; i++) {
      const sx = (Math.sin(i * 91.7) * 0.5 + 0.5) * W;
      const sy = (Math.sin(i * 47.3) * 0.5 + 0.5) * H * 0.62;
      this.px(sx, sy, 1, 1, `hsla(0,0%,100%,${0.18 + 0.32 * Math.sin(t * 2 + i)})`, this.glow);
    }
    const groundY = Math.round(H * 0.9);
    this.px(0, groundY, W, H - groundY, "#15121c");
    this.px(0, groundY, W, 1.4 * u, meta.accent);
    this.px(0, groundY, W, 1.4 * u, meta.accent, this.glow);
    this.djBooth(W * 0.5, groundY, u, t, beat, kick, {
      skin: "hsl(26,46%,62%)", jacket: `hsl(${this.s.jacketHue},60%,52%)`, jacketHi: `hsl(${this.s.jacketHue},66%,62%)`, jacketSh: `hsl(${this.s.jacketHue},56%,36%)`,
      hat: meta.accent, cap: true, glow: meta.accent,
    });
    g.fillStyle = "#cdbff0";
    g.font = `${Math.max(4, Math.round(4 * u))}px "Press Start 2P", monospace`;
    g.textAlign = "center";
    g.fillText("SCENE COMING SOON", W / 2, H * 0.42);
    g.textAlign = "left";
  }

  // ── shared crowd / stage blocks (reused across the big venues) ──────────────
  private crowdBand(baseY: number, u: number, t: number, beat: number, kick: number, opt: { rows?: number; color?: string; hue?: number; maxL?: number; handsHue?: number }): void {
    const W = this.w, s = u;
    const rows = opt.rows || 4;
    for (let r = 0; r < rows; r++) {
      const depth = rows === 1 ? 1 : r / (rows - 1);
      const sc = 0.55 + depth * 0.7;
      const y = baseY - (rows - 1 - r) * 5.5 * s;
      const L = 5 + depth * (opt.maxL || 9);
      const col = opt.color || `hsl(${opt.hue != null ? opt.hue : 240},${8 + depth * 6}%,${L}%)`;
      const spacing = 7 * s * sc;
      for (let i = 0, x = (r % 2) * spacing * 0.5 - spacing; x < W + spacing; x += spacing, i++) {
        const px = x + Math.sin(i * 1.7 + r) * 1 * s;
        const bob = Math.abs(Math.sin(beat * Math.PI * 2 + i * 0.7 + r)) * (1 + kick) * 1.3 * s * sc;
        const hy = y - bob, hr = 2.1 * s * sc;
        this.disc(px, hy, hr, hr, col);
        this.px(px - 3.1 * s * sc, hy + hr, 6.2 * s * sc, 7 * s * sc, col);
        if ((i * 7 + r * 3) % 3 === 0) {
          this.limb(px - 2 * s * sc, hy + hr, px - 3.2 * s * sc - Math.sin(t * 3 + i) * 1 * s, hy - 3.4 * s * sc, 1.3 * s * sc, col);
          this.limb(px + 2 * s * sc, hy + hr, px + 3.2 * s * sc + Math.sin(t * 3 + i + 1) * 1 * s, hy - 3.4 * s * sc, 1.3 * s * sc, col);
          if (opt.handsHue != null) {
            const hc = `hsl(${(opt.handsHue + i * 47) % 360},88%,66%)`;
            this.px(px + 3 * s * sc, hy - 4 * s * sc, 1.5 * s * sc, 1.5 * s * sc, hc);
            this.px(px + 3 * s * sc, hy - 4 * s * sc, 1.5 * s * sc, 1.5 * s * sc, hc, this.glow);
          }
        }
      }
    }
  }

  private speakerStack(cx: number, baseY: number, u: number, kick: number, tall: boolean): void {
    const s = u, w = 9 * s, rows = tall ? 4 : 3, cellH = 7 * s;
    const top = baseY - rows * cellH;
    this.px(cx - w / 2 - 1 * s, top - 1 * s, w + 2 * s, rows * cellH + 2 * s, "hsl(220,8%,8%)");
    for (let r = 0; r < rows; r++) {
      const cy = top + r * cellH;
      this.px(cx - w / 2, cy, w, cellH - 0.6 * s, "hsl(220,8%,16%)");
      this.px(cx - w / 2, cy, w, 1 * s, "hsl(220,8%,24%)");
      const pr = (2.6 + kick * 1.1) * s;
      this.disc(cx, cy + cellH * 0.5, 3 * s, 3 * s, "hsl(220,8%,6%)");
      this.disc(cx, cy + cellH * 0.5, pr, pr, "hsl(220,8%,20%)");
      this.disc(cx, cy + cellH * 0.5, pr * 0.4, pr * 0.4, "hsl(220,8%,12%)");
    }
    this.px(cx - 2 * s, top - 2 * s, 4 * s, 2 * s, "hsl(220,8%,22%)");
    if (kick > 0.5) this.disc(cx, top + rows * cellH * 0.5, w, rows * cellH * 0.5, `hsla(45,80%,60%,${0.05 * kick})`, this.glow);
  }

  private palm(cx: number, baseY: number, u: number, t: number): void {
    const s = u, sway = Math.sin(t * 0.8) * 2 * s;
    for (let i = 0; i < 9; i++) {
      const ty = baseY - i * 3 * s;
      const tx = cx + Math.sin(i * 0.3) * 2 * s + (i / 9) * sway;
      this.px(tx - 1.4 * s, ty, 2.8 * s, 3 * s, "hsl(30,40%,38%)");
      this.px(tx - 1.4 * s, ty, 1 * s, 3 * s, "hsl(32,44%,48%)");
    }
    const topX = cx + Math.sin(8 * 0.3) * 2 * s + sway, topY = baseY - 26 * s;
    for (let f = 0; f < 7; f++) {
      const a = (f / 7) * Math.PI * 2;
      const ex = topX + Math.cos(a) * 11 * s, ey = topY + Math.sin(a) * 7 * s + 3 * s;
      this.limb(topX, topY, ex, ey, 1.6 * s, "hsl(132,46%,36%)");
      this.px(ex - 1 * s, ey - 1 * s, 2 * s, 2 * s, "hsl(120,50%,46%)");
    }
    this.disc(topX, topY, 2.4 * s, 2.4 * s, "hsl(30,40%,36%)");
  }

  // ── WAREHOUSE — after-dark techno, lasers + fog + strobe ────────────────────
  private renderWarehouse(u: number, t: number): void {
    const W = this.w, H = this.h;
    const { kick, energy, beat } = this.pulse(t, 134);
    const stageY = Math.round(H * 0.62);
    const rg = this.g.createLinearGradient(0, 0, 0, H);
    rg.addColorStop(0, "hsl(278,22%,12%)"); rg.addColorStop(0.6, "hsl(276,24%,8%)"); rg.addColorStop(1, "hsl(276,22%,5%)");
    this.g.fillStyle = rg; this.g.fillRect(0, 0, W, H);
    for (let y = 4 * u; y < stageY - 4 * u; y += 4 * u) {
      this.px(0, y, W, 0.5 * u, "hsla(280,16%,4%,0.6)");
      const off = ((y / (4 * u)) % 2) * 6 * u;
      for (let x = -off; x < W; x += 12 * u) this.px(x, y, 0.5 * u, 4 * u, "hsla(280,16%,4%,0.5)");
    }
    this.px(0, 5 * u, W, 2.2 * u, "hsl(280,8%,18%)");
    for (let x = 4 * u; x < W; x += 7 * u) this.limb(x, 5 * u, x + 3.5 * u, 7.2 * u, 0.7 * u, "hsl(280,8%,12%)");
    for (let x = 8 * u; x < W; x += 16 * u) {
      this.px(x - 1.4 * u, 7.2 * u, 2.8 * u, 2.4 * u, "hsl(280,8%,14%)");
      const on = (Math.floor(beat + x) % 2) === 0;
      this.px(x - 1 * u, 9.2 * u, 2 * u, 1 * u, on ? "hsl(300,80%,62%)" : "hsl(280,20%,20%)");
    }
    const origins = [W * 0.3, W * 0.7];
    const laserHues = [305, 265, 190];
    for (let k = 0; k < origins.length; k++) {
      for (let j = 0; j < 3; j++) {
        const ang = Math.PI / 2 + Math.sin(t * (0.7 + j * 0.3) + k * 2 + j) * 0.8;
        const ex = origins[k] + Math.cos(ang) * H, ey = 9 * u + Math.sin(ang) * H;
        this.limb(origins[k], 9 * u, ex, ey, 0.8 * u, `hsla(${laserHues[j]},90%,60%,${0.22 + 0.15 * energy})`, this.glow);
      }
      this.disc(origins[k], 9 * u, 2 * u, 2 * u, "hsla(300,90%,70%,0.5)", this.glow);
    }
    this.px(W * 0.5 - 18 * u, stageY + 2 * u, 36 * u, 5 * u, "hsl(280,16%,10%)");
    this.px(W * 0.5 - 18 * u, stageY + 2 * u, 36 * u, 1 * u, "hsl(290,30%,22%)");
    this.djBooth(W * 0.5, stageY + 2 * u, u * 0.7, t, beat, kick, {
      skin: "hsl(26,40%,56%)", jacket: "hsl(282,28%,30%)", jacketHi: "hsl(282,34%,42%)", jacketSh: "hsl(282,28%,18%)",
      hat: "hsl(300,40%,40%)", glow: "hsl(304,90%,60%)", booth: "hsl(280,20%,18%)", boothHi: "hsl(286,28%,28%)", boothSh: "hsl(278,20%,10%)",
    });
    this.crowdBand(H * 1.02, u, t, beat, kick, { rows: 6, hue: 278, maxL: 7, handsHue: 280 });
    for (let i = 0; i < 5; i++) {
      const fx = ((t * (5 + i * 2) + i * 80) % (W + 60 * u)) - 30 * u;
      this.disc(fx, stageY + 10 * u + (i % 2) * 6 * u, 22 * u, 5 * u, "hsla(290,40%,60%,0.06)", this.glow);
    }
    if (kick > 0.7) { this.g.fillStyle = `hsla(300,40%,92%,${(kick - 0.7) * 0.5})`; this.g.fillRect(0, 0, W, H); }
  }

  // ── FESTIVAL — main stage, auto-advancing day→dusk→night, LED wall + crowd ──
  private renderFestival(u: number, t: number): void {
    const W = this.w, H = this.h;
    const { kick, energy, beat } = this.pulse(t, 128);
    const stageY = Math.round(H * 0.52);
    const lvl = Math.floor(t / 22) % 3;
    const night = lvl === 2, dusk = lvl === 1;
    const sg = this.g.createLinearGradient(0, 0, 0, stageY);
    if (night) { sg.addColorStop(0, "hsl(244,52%,12%)"); sg.addColorStop(1, "hsl(270,40%,26%)"); }
    else if (dusk) { sg.addColorStop(0, "hsl(258,46%,40%)"); sg.addColorStop(0.5, "hsl(18,72%,60%)"); sg.addColorStop(1, "hsl(38,86%,72%)"); }
    else { sg.addColorStop(0, "hsl(210,72%,60%)"); sg.addColorStop(1, "hsl(40,80%,76%)"); }
    this.g.fillStyle = sg; this.g.fillRect(0, 0, W, stageY);
    if (night) {
      for (let i = 0; i < 36; i++) this.px(((i * 73.7) % 1) * W, ((i * 41.3) % 1) * stageY * 0.8, 1, 1, `hsla(210,40%,92%,${0.4 + 0.5 * Math.abs(Math.sin(t + i))})`);
      this.disc(W * 0.18, stageY * 0.3, 5 * u, 5 * u, "hsl(210,30%,90%)");
    } else {
      const sunY = dusk ? stageY * 0.82 : stageY * 0.5;
      this.disc(W * 0.5, sunY, dusk ? 12 * u : 16 * u, dusk ? 12 * u : 16 * u, dusk ? "hsl(40,100%,76%)" : "hsla(46,100%,80%,0.25)", this.glow);
      if (dusk) this.disc(W * 0.5, sunY, 8 * u, 8 * u, "hsl(44,100%,82%)");
    }
    const lvlName = ["DOORS OPEN", "SUNSET SET", "HEADLINE"][lvl];
    for (let i = 0; i < lvlName.length; i++) this.px(W * 0.5 - lvlName.length * 1.6 * u + i * 3.2 * u, stageY - 1 * u, 2.2 * u, 2.2 * u, `hsla(45,90%,${night ? 70 : 30}%,0.5)`);
    this.g.fillStyle = night ? "hsl(120,20%,18%)" : "hsl(96,34%,34%)";
    this.g.fillRect(0, stageY, W, H - stageY);
    const wallX = W * 0.22, wallW = W * 0.56, wallY = 8 * u, wallH = stageY - 12 * u;
    this.px(wallX - 2 * u, wallY - 2 * u, wallW + 4 * u, wallH + 4 * u, "hsl(220,12%,10%)");
    this.px(wallX, wallY, wallW, wallH, "hsl(222,30%,8%)");
    const cols = 18, cw = wallW / cols;
    for (let c = 0; c < cols; c++) {
      const bh = (0.25 + 0.75 * Math.abs(Math.sin(t * 3 + c * 0.6) * (0.6 + energy))) * (wallH - 4 * u);
      const hue = (c * 18 + t * 30) % 360;
      this.px(wallX + c * cw + 0.6 * u, wallY + wallH - 2 * u - bh, cw - 1.2 * u, bh, `hsl(${hue},80%,58%)`);
      this.px(wallX + c * cw + 0.6 * u, wallY + wallH - 2 * u - bh, cw - 1.2 * u, 1.4 * u, `hsl(${hue},90%,72%)`);
    }
    this.px(wallX, wallY, wallW, wallH, "hsla(0,0%,100%,0.04)", this.glow);
    for (const tx of [wallX - 8 * u, wallX + wallW + 8 * u]) {
      this.px(tx - 2 * u, wallY - 6 * u, 4 * u, wallH + 12 * u, "hsl(220,8%,16%)");
      for (let y = wallY - 4 * u; y < stageY; y += 4 * u) this.limb(tx - 2 * u, y, tx + 2 * u, y + 4 * u, 0.6 * u, "hsl(220,8%,26%)");
      const beams = night ? 3 : 1;
      for (let bx = 0; bx < beams; bx++) { const ang = Math.sin(t * 1.2 + tx + bx * 2) * 0.7; this.limb(tx, wallY - 6 * u, tx + Math.cos(Math.PI / 2 + ang) * 34 * u, wallY - 6 * u + Math.sin(Math.PI / 2 + ang) * 34 * u, 1.4 * u, `hsla(${(tx * 3 + bx * 80) % 360},85%,65%,${night ? 0.4 : 0.25})`, this.glow); }
    }
    this.speakerStack(wallX - 16 * u, stageY + 2 * u, u, kick, true);
    this.speakerStack(wallX + wallW + 16 * u, stageY + 2 * u, u, kick, true);
    this.px(wallX - 12 * u, stageY - 3 * u, wallW + 24 * u, 5 * u, "hsl(220,10%,14%)");
    this.djBooth(W * 0.5, stageY + 1 * u, u * 0.78, t, beat, kick, {
      skin: "hsl(26,44%,60%)", jacket: "hsl(45,75%,52%)", jacketHi: "hsl(48,82%,64%)", jacketSh: "hsl(42,68%,38%)",
      hat: "hsl(0,0%,12%)", cap: true, glow: "hsl(45,95%,60%)", booth: "hsl(220,12%,18%)", boothHi: "hsl(220,16%,28%)", boothSh: "hsl(220,12%,10%)",
    });
    this.crowdBand(H * 1.0, u, t, beat, kick, { rows: 6, hue: 28, maxL: 10, handsHue: 40 });
    for (const [fx, fy, hue] of [[W * 0.12, H * 0.78, 320], [W * 0.84, H * 0.8, 190], [W * 0.66, H * 0.74, 50]]) {
      const sway = Math.sin(t * 1.5 + fx) * 2 * u;
      this.px(fx - 0.6 * u, fy, 1.2 * u, 16 * u, "hsl(28,20%,20%)");
      this.px(fx + sway, fy - 4 * u, 9 * u, 6 * u, `hsl(${hue},70%,55%)`);
      this.px(fx + sway, fy - 4 * u, 9 * u, 1.4 * u, `hsl(${hue},80%,70%)`);
    }
    for (let i = 0; i < 30; i++) {
      const cx2 = ((i * 61.3) % 1) * W;
      const cy2 = ((t * (8 + (i % 5) * 3) + i * 33) % (H * 0.9));
      this.px(cx2 + Math.sin(t * 3 + i) * 2 * u, cy2, 1.4 * u, 1.4 * u, `hsl(${(i * 53) % 360},85%,64%)`);
    }
  }

  // ── SILENT DISCO — moonlit beach, three glowing headphone channels ──────────
  private renderSilent(u: number, t: number): void {
    const W = this.w, H = this.h;
    const { kick, beat } = this.pulse(t, 120);
    const chan = ["hsl(0,85%,58%)", "hsl(140,80%,52%)", "hsl(210,90%,60%)"];
    const seaY = Math.round(H * 0.5), sandY = Math.round(H * 0.62);
    const sky = this.g.createLinearGradient(0, 0, 0, seaY);
    sky.addColorStop(0, "hsl(238,46%,12%)"); sky.addColorStop(1, "hsl(220,42%,26%)");
    this.g.fillStyle = sky; this.g.fillRect(0, 0, W, seaY);
    for (let i = 0; i < 40; i++) { const sx = ((i * 73.7) % 1) * W, sy = ((i * 41.3) % 1) * seaY * 0.85; this.px(sx, sy, 1, 1, `hsla(210,40%,92%,${0.4 + 0.5 * Math.abs(Math.sin(t * 1.3 + i))})`); }
    const moonX = W * 0.78, moonY = seaY * 0.34;
    this.disc(moonX, moonY, 6 * u, 6 * u, "hsl(210,30%,90%)");
    this.disc(moonX, moonY, 9 * u, 9 * u, "hsla(210,40%,86%,0.18)", this.glow);
    const seaG = this.g.createLinearGradient(0, seaY, 0, sandY);
    seaG.addColorStop(0, "hsl(212,44%,24%)"); seaG.addColorStop(1, "hsl(214,40%,16%)");
    this.g.fillStyle = seaG; this.g.fillRect(0, seaY, W, sandY - seaY);
    for (let y = seaY; y < sandY; y += 1.4 * u) { const wob = Math.sin(y * 0.5 + t * 2) * 3 * u; this.px(moonX - 3 * u + wob, y, 6 * u, 0.8 * u, "hsla(210,50%,82%,0.4)"); }
    this.px(0, sandY - 1.4 * u, W, 1.4 * u, "hsla(200,40%,80%,0.4)");
    const sandG = this.g.createLinearGradient(0, sandY, 0, H);
    sandG.addColorStop(0, "hsl(36,24%,30%)"); sandG.addColorStop(1, "hsl(34,22%,22%)");
    this.g.fillStyle = sandG; this.g.fillRect(0, sandY, W, H - sandY);
    this.palm(W * 0.08, sandY + 4 * u, u * 0.8, t); this.palm(W * 0.95, sandY + 2 * u, u * 0.9, t);
    for (let i = 0; i < 3; i++) {
      const gx = W * (0.3 + 0.2 * i) + Math.sin(t * 0.5 + i) * 10 * u;
      this.disc(gx, H * 0.42, 22 * u, 14 * u, chan[i].replace("hsl", "hsla").replace(")", ",0.06)"), this.glow);
    }
    const stageY = sandY + 4 * u;
    this.djBooth(W * 0.5, stageY + 4 * u, u, t, beat, kick, {
      skin: "hsl(26,44%,58%)", jacket: "hsl(220,16%,26%)", jacketHi: "hsl(220,20%,36%)", jacketSh: "hsl(220,16%,16%)",
      hair: "hsl(24,28%,18%)", glow: "hsl(180,80%,55%)", booth: "hsl(220,14%,16%)", boothHi: "hsl(220,18%,26%)", boothSh: "hsl(220,14%,9%)",
    });
    for (let i = 0; i < 3; i++) {
      const lit = (Math.floor(beat) % 3) === i;
      this.px(W * 0.5 - 5 * u + i * 4 * u, stageY - 6 * u, 2.6 * u, 2.6 * u, lit ? chan[i] : "hsl(220,12%,22%)");
      if (lit) this.px(W * 0.5 - 5 * u + i * 4 * u, stageY - 6 * u, 2.6 * u, 2.6 * u, chan[i], this.glow);
    }
    this.silentCrowd(H * 0.99, u, t, beat, kick, chan);
  }

  private silentCrowd(baseY: number, u: number, t: number, beat: number, kick: number, chan: string[]): void {
    const W = this.w, s = u, rows = 5;
    for (let r = 0; r < rows; r++) {
      const depth = r / (rows - 1), sc = 0.55 + depth * 0.7;
      const y = baseY - (rows - 1 - r) * 5.5 * s;
      const body = `hsl(222,12%,${6 + depth * 7}%)`;
      const spacing = 7.5 * s * sc;
      for (let i = 0, x = (r % 2) * spacing * 0.5 - spacing; x < W + spacing; x += spacing, i++) {
        const ch = Math.floor((t * 0.4 + i * 1.3 + r) % 3);
        const bob = Math.abs(Math.sin(beat * Math.PI * 2 + i * 0.8 + r)) * (1 + kick) * 1.3 * s * sc;
        const sway = Math.sin(t * 1.5 + i) * 1.4 * s * sc;
        const px = x + sway, hy = y - bob, hr = 2.1 * s * sc;
        this.disc(px, hy, hr, hr, body);
        this.px(px - 3 * s * sc, hy + hr, 6 * s * sc, 7 * s * sc, body);
        const c = chan[ch];
        this.px(px - hr - 1.4 * s * sc, hy - 0.6 * s * sc, 1.6 * s * sc, 2.4 * s * sc, c);
        this.px(px + hr - 0.2 * s * sc, hy - 0.6 * s * sc, 1.6 * s * sc, 2.4 * s * sc, c);
        this.px(px - hr - 1.4 * s * sc, hy - 0.6 * s * sc, 1.6 * s * sc, 2.4 * s * sc, c, this.glow);
        this.px(px + hr - 0.2 * s * sc, hy - 0.6 * s * sc, 1.6 * s * sc, 2.4 * s * sc, c, this.glow);
        if ((i * 5 + r) % 3 === 0) this.limb(px + 2 * s * sc, hy + hr, px + 3.4 * s * sc, hy - 3.4 * s * sc, 1.3 * s * sc, body);
      }
    }
  }

  // ── WEDDING — warm reception, fairy lights, checkerboard floor, first dance ──
  private renderWedding(u: number, t: number): void {
    const W = this.w, H = this.h;
    const { kick, beat } = this.pulse(t, 76);
    const floorBack = Math.round(H * 0.5);
    const rg = this.g.createLinearGradient(0, 0, 0, H);
    rg.addColorStop(0, "hsl(282,24%,22%)"); rg.addColorStop(1, "hsl(286,22%,12%)");
    this.g.fillStyle = rg; this.g.fillRect(0, 0, W, floorBack);
    for (let i = 0; i < 9; i++) {
      const dx = (i / 8) * W;
      this.px(dx - 0.6 * u, 0, 1.2 * u, floorBack * 0.5, "hsla(320,20%,40%,0.4)");
      this.disc(dx, floorBack * 0.5, 4 * u, 2 * u, "hsla(320,20%,46%,0.3)");
    }
    for (let row = 0; row < 3; row++) {
      const topY = (2 + row * 3) * u, sag = (7 + row * 2) * u;
      const n = 16;
      let pxp = 0, pyp = topY;
      for (let i = 0; i <= n; i++) {
        const fx = (i / n) * W, fy = topY + Math.sin((i / n) * Math.PI) * sag;
        if (i > 0) this.limb(pxp, pyp, fx, fy, 0.6 * u, "hsla(30,20%,30%,0.6)");
        pxp = fx; pyp = fy;
        const tw = 0.7 + 0.3 * Math.sin(beat * 1.2 + i + row);
        this.px(fx - 0.5 * u, fy, 1 * u, 1 * u, `hsl(42,95%,${66 + tw * 16}%)`);
        this.disc(fx, fy, 1.6 * u, 1.6 * u, `hsla(44,98%,74%,${0.4 * tw})`, this.glow);
      }
    }
    const rows = 7;
    for (let r = 0; r < rows; r++) {
      const depth = r / rows;
      const y = floorBack + depth * (H - floorBack);
      const rh = (H - floorBack) * (0.07 + depth * 0.16);
      const halfW = W * (0.22 + depth * 0.32);
      const cells = 8;
      for (let c = 0; c < cells; c++) {
        const cx0 = W / 2 - halfW + (c / cells) * halfW * 2;
        const cw = (halfW * 2) / cells;
        const on = (r + c) % 2 === 0;
        const hue = (t * 40 + r * 30 + c * 12) % 360;
        this.px(cx0, y, cw + 0.5, rh + 0.5, on ? `hsl(${hue},60%,${30 + depth * 18}%)` : "hsl(286,16%,14%)");
        if (on) this.px(cx0, y, cw + 0.5, rh + 0.5, `hsla(${hue},70%,60%,${0.12 + depth * 0.12})`, this.glow);
      }
    }
    this.weddingCouple(W * 0.5, H * 0.9, u, t);
    this.barStaff(W * 0.13, H * 0.94, u * 0.92, t, {
      shirt: "hsl(0,0%,90%)", shirtHi: "hsl(0,0%,100%)", shirtSh: "hsl(0,0%,74%)",
      skin: "hsl(26,44%,62%)", hair: "hsl(24,30%,18%)", machine: "bottles",
      counter: "hsl(300,16%,30%)", counterHi: "hsl(300,22%,42%)", counterW: 22,
    });
    this.djBooth(W * 0.84, H * 0.96, u * 0.9, t, beat, kick, {
      skin: "hsl(26,44%,60%)", jacket: "hsl(280,20%,32%)", jacketHi: "hsl(280,26%,44%)", jacketSh: "hsl(280,20%,20%)",
      hair: "hsl(24,28%,18%)", glow: "hsl(330,80%,64%)", booth: "hsl(300,18%,24%)", boothHi: "hsl(300,24%,34%)", boothSh: "hsl(300,18%,14%)",
    });
  }

  private weddingCouple(cx: number, feetY: number, u: number, t: number): void {
    const s = u;
    const sway = Math.sin(t * 0.8) * 2 * s;
    const spin = Math.sin(t * 0.4);
    const ax = cx - 3 * s + sway;
    this.px(ax - 2.4 * s, feetY - 7 * s, 5 * s, 7 * s, "hsl(222,16%,18%)");
    this.block(ax - 3 * s, feetY - 16 * s, 6 * s, 10 * s, "hsl(222,18%,24%)", "hsla(0,0%,100%,0.1)", "hsl(222,18%,14%)");
    this.px(ax - 0.6 * s, feetY - 16 * s, 1.2 * s, 8 * s, "hsl(0,0%,92%)");
    const ahr = 2.4 * s;
    this.block(ax - ahr, feetY - 21 * s, ahr * 2, ahr * 2, "hsl(26,44%,60%)", null, "hsl(26,40%,46%)");
    this.px(ax - ahr, feetY - 22.5 * s, ahr * 2, 1.8 * s, "hsl(24,30%,18%)");
    const bx = cx + 3 * s + sway;
    this.px(bx - 4 * s - spin * s, feetY - 9 * s, 8 * s + spin * 2 * s, 9 * s, "hsl(320,30%,72%)");
    this.px(bx - 4 * s - spin * s, feetY - 1 * s, 8 * s + spin * 2 * s, 1.4 * s, "hsla(320,40%,84%,0.6)");
    this.block(bx - 2.6 * s, feetY - 17 * s, 5.2 * s, 8 * s, "hsl(320,32%,76%)", "hsla(0,0%,100%,0.2)", "hsl(320,30%,60%)");
    const bhr = 2.3 * s;
    this.block(bx - bhr, feetY - 21.5 * s, bhr * 2, bhr * 2, "hsl(26,46%,64%)", null, "hsl(26,40%,50%)");
    this.px(bx - bhr - 0.4 * s, feetY - 23.5 * s, bhr * 2 + 0.8 * s, 2.4 * s, "hsl(30,40%,30%)");
    this.limb(ax + 2.4 * s, feetY - 14 * s, bx - 2 * s, feetY - 13 * s, 1.6 * s, "hsl(26,44%,60%)");
    this.limb(bx - 2.4 * s, feetY - 15 * s, ax + 2 * s, feetY - 17 * s, 1.5 * s, "hsl(26,46%,64%)");
    for (let i = 0; i < 3; i++) {
      const hy = feetY - 24 * s - ((t * 6 + i * 9) % 16) * s;
      const a = Math.max(0, 1 - ((t * 6 + i * 9) % 16) / 16);
      this.px(cx - 0.7 * s + Math.sin(t + i) * 3 * s, hy, 1.6 * s, 1.4 * s, `hsla(336,80%,68%,${a})`);
    }
  }

  // ── ROLLER RINK — neon grid, disco ball, skaters gliding ────────────────────
  private renderRink(u: number, t: number): void {
    const W = this.w, H = this.h;
    const { kick, beat } = this.pulse(t, 116);
    const horizon = Math.round(H * 0.42);
    this.g.fillStyle = "hsl(265,40%,9%)"; this.g.fillRect(0, 0, W, H);
    for (let i = 0; i < 4; i++) {
      const y = 6 * u + i * 4 * u;
      const hue = [320, 280, 190, 50][i];
      this.px(0, y, W, 1.4 * u, `hsl(${hue},85%,58%)`);
      this.px(0, y, W, 1.4 * u, `hsla(${hue},90%,64%,0.4)`, this.glow);
    }
    const vpx = W * 0.5;
    this.g.fillStyle = "hsl(266,42%,7%)"; this.g.fillRect(0, horizon, W, H - horizon);
    for (let i = -8; i <= 8; i++) { const fx = vpx + (i / 8) * W * 0.9; this.limb(vpx, horizon, fx, H, 0.6 * u, "hsla(300,90%,60%,0.5)"); }
    for (let r = 0; r < 9; r++) { const y = horizon + Math.pow(r / 9, 1.8) * (H - horizon); this.px(0, y, W, 0.7 * u, "hsla(190,90%,60%,0.45)"); }
    this.px(0, horizon, W, 1 * u, "hsl(320,90%,62%)");
    this.px(0, horizon, W, 1 * u, "hsl(320,90%,62%)", this.glow);
    const bx = W * 0.5, by = 6 * u;
    this.px(bx - 0.5 * u, 0, 1, by - 3 * u, "hsl(0,0%,30%)");
    this.disc(bx, by, 4 * u, 4 * u, "hsl(220,12%,60%)");
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 + t; this.px(bx + Math.cos(a) * 3 * u, by + Math.sin(a) * 3 * u, 1 * u, 1 * u, (i % 2) ? "hsl(0,0%,90%)" : "hsl(220,20%,40%)"); }
    this.disc(bx, by, 6 * u, 6 * u, "hsla(0,0%,100%,0.12)", this.glow);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + t * 0.6;
      const rr = (10 + (i % 3) * 8) * u;
      const sx = bx + Math.cos(a) * rr * 2, sy = horizon + 6 * u + Math.abs(Math.sin(a)) * (H - horizon) * 0.5;
      this.px(sx, sy, 1.4 * u, 1.4 * u, `hsla(${(i * 40 + t * 60) % 360},85%,70%,0.5)`, this.glow);
    }
    this.skater(W * 0.24, H * 0.74, u, t, { shirt: "hsl(320,75%,60%)", legs: "hsl(280,40%,40%)", skin: "hsl(28,46%,64%)", hair: "hsl(30,40%,24%)" }, 0);
    this.skater(W * 0.7, H * 0.82, u, t, { shirt: "hsl(190,75%,55%)", legs: "hsl(220,30%,36%)", skin: "hsl(26,44%,58%)", hair: "hsl(20,30%,16%)" }, 2.0);
    this.skater(W * 0.84, H * 0.68, u, t, { shirt: "hsl(50,85%,60%)", legs: "hsl(330,40%,42%)", skin: "hsl(28,46%,66%)", hair: "hsl(24,34%,28%)" }, 4.0);
    this.djBooth(W * 0.42, H * 0.96, u, t, beat, kick, {
      skin: "hsl(26,44%,60%)", jacket: "hsl(300,40%,40%)", jacketHi: "hsl(300,46%,52%)", jacketSh: "hsl(300,40%,26%)",
      hat: "hsl(190,70%,46%)", glow: "hsl(320,90%,62%)", booth: "hsl(270,30%,20%)", boothHi: "hsl(280,36%,30%)", boothSh: "hsl(266,28%,12%)",
    });
  }

  private skater(cx: number, feetY: number, u: number, t: number, c: { shirt: string; legs: string; skin: string; hair: string }, ph: number): void {
    const s = u;
    const glide = Math.sin(t * 1.2 + ph) * 8 * s;
    const x = cx + glide;
    const lean = Math.sin(t * 1.2 + ph) * 1.5 * s;
    const hipY = feetY - 9 * s;
    const shoulderY = hipY - 9 * s;
    const headR = 2.3 * s, headCY = shoulderY - headR - 0.5 * s;
    this.limb(x - 0.5 * s, hipY, x - 3 * s + lean, feetY - 1 * s, 1.8 * s, c.legs);
    this.limb(x + 0.5 * s, hipY, x + 3.5 * s + lean, feetY, 1.8 * s, c.legs);
    for (const [fx, fy] of [[x - 3 * s + lean, feetY - 1 * s], [x + 3.5 * s + lean, feetY]]) {
      this.px(fx - 2 * s, fy, 4.4 * s, 1.4 * s, "hsl(0,0%,92%)");
      this.px(fx - 1.6 * s, fy + 1.4 * s, 1.2 * s, 1.2 * s, "hsl(48,90%,58%)");
      this.px(fx + 1 * s, fy + 1.4 * s, 1.2 * s, 1.2 * s, "hsl(48,90%,58%)");
    }
    this.block(x - 3 * s + lean * 0.5, shoulderY, 6 * s, 9 * s, c.shirt, "hsla(0,0%,100%,0.2)", `hsl(${c.shirt.match(/\d+/)![0]},60%,36%)`);
    this.block(x - headR + lean * 0.6, headCY - headR, headR * 2, headR * 2, c.skin, null, "hsl(26,40%,48%)");
    this.px(x - headR + lean * 0.6, headCY - headR - 1 * s, headR * 2, 1.8 * s, c.hair);
    this.limb(x - 2.6 * s + lean * 0.5, shoulderY + 2 * s, x - 6 * s, shoulderY + 4 * s, 1.5 * s, c.shirt);
    this.limb(x + 2.6 * s + lean * 0.5, shoulderY + 2 * s, x + 6 * s, shoulderY - 1 * s, 1.5 * s, c.shirt);
  }

  private stringLights(W: number, u: number, beat: number, hue: number, topY: number, sag: number): void {
    const n = Math.max(7, Math.round(W / (22 * u)));
    let px = 0, py = topY;
    for (let i = 0; i <= n; i++) {
      const fx = (i / n) * W;
      const fy = topY + Math.sin((i / n) * Math.PI) * sag;
      if (i > 0) this.limb(px, py, fx, fy, 1, "hsla(0,0%,8%,0.7)");
      px = fx; py = fy;
    }
    for (let i = 0; i < n; i++) {
      const fx = ((i + 0.5) / n) * W;
      const fy = topY + Math.sin(((i + 0.5) / n) * Math.PI) * sag;
      const tw = 0.78 + 0.22 * Math.sin(beat * 1.5 + i * 1.7);
      this.px(fx - 0.5 * u, fy, 1 * u, 1.4 * u, "hsla(0,0%,10%,0.7)");
      this.disc(fx, fy + 2.4 * u, 1.7 * u, 2 * u, `hsl(${hue},95%,${58 + tw * 16}%)`);
      this.disc(fx, fy + 2.4 * u, 2.6 * u, 2.9 * u, `hsla(${hue},98%,70%,${0.5 * tw})`, this.glow);
    }
  }

  private skyline(W: number, baseY: number, u: number, color: string, scale: number, count: number): void {
    const seed = scale > 0.8 ? 1 : 2;
    for (let i = 0; i < count; i++) {
      const bw = (W / count);
      const bx = i * bw + (i % 3) * 1.5 * u;
      const bh = (8 + ((i * 53 * seed) % 16)) * u * scale;
      this.px(bx, baseY - bh, bw - 2 * u, bh, color);
      for (let wy = baseY - bh + 2 * u; wy < baseY - 2 * u; wy += 3 * u) {
        for (let wx = bx + 1.5 * u; wx < bx + bw - 3 * u; wx += 3 * u) {
          if (((wx * 7 + wy * 13) | 0) % 3 === 0) this.px(wx, wy, 1.2 * u, 1.4 * u, "hsla(45,95%,72%,0.8)");
        }
      }
    }
  }

  private bonfire(cx: number, baseY: number, u: number, t: number, kick: number): void {
    const s = u;
    this.px(cx - 6 * s, baseY - 1 * s, 12 * s, 2.4 * s, "hsl(26,38%,30%)");
    this.px(cx - 5 * s, baseY - 2.4 * s, 10 * s, 2 * s, "hsl(28,42%,38%)");
    this.disc(cx, baseY - 1 * s, 11 * s, 4 * s, "hsla(30,100%,60%,0.22)", this.glow);
    const fl = 0.7 + 0.3 * Math.sin(t * 9) + kick * 0.4;
    for (let i = 0; i < 5; i++) {
      const fx = cx + (i - 2) * 2 * s + Math.sin(t * 6 + i) * 1 * s;
      const fh = (5 + (i % 2) * 3) * s * fl;
      this.px(fx - 1.4 * s, baseY - 3 * s - fh, 2.8 * s, fh, "hsl(18,95%,52%)");
      this.px(fx - 0.8 * s, baseY - 3 * s - fh * 0.7, 1.6 * s, fh * 0.7, "hsl(40,100%,64%)");
    }
    this.disc(cx, baseY - 6 * s, 6 * s, 7 * s, `hsla(28,100%,60%,${0.4 * fl})`, this.glow);
    for (let i = 0; i < 6; i++) {
      const sp = (t * 12 + i * 5) % 20;
      this.px(cx + Math.sin(i * 3 + t) * 5 * s, baseY - 6 * s - sp * s, 1, 1, `hsla(40,100%,70%,${1 - sp / 20})`, this.glow);
    }
  }

  // ── ROOFTOP — golden hour, skyline, string lights, cocktail bar ─────────────
  private renderRooftop(u: number, t: number): void {
    const W = this.w, H = this.h;
    const { kick, beat } = this.pulse(t, 112);
    const parapetY = Math.round(H * 0.54);
    const roofY = Math.round(H * 0.62);
    const sg = this.g.createLinearGradient(0, 0, 0, parapetY + 8 * u);
    sg.addColorStop(0, "hsl(30,68%,58%)"); sg.addColorStop(0.5, "hsl(36,84%,70%)"); sg.addColorStop(1, "hsl(20,78%,62%)");
    this.g.fillStyle = sg; this.g.fillRect(0, 0, W, parapetY + 8 * u);
    const sunX = W * 0.7, sunY = parapetY - 4 * u;
    this.disc(sunX, sunY, 14 * u, 14 * u, "hsla(42,100%,76%,0.3)", this.glow);
    this.disc(sunX, sunY, 8 * u, 8 * u, "hsl(46,100%,82%)");
    this.disc(sunX, sunY, 8 * u, 8 * u, "hsla(46,100%,82%,0.5)", this.glow);
    this.skyline(W, parapetY, u, "hsl(18,42%,40%)", 0.62, 6);
    this.skyline(W, parapetY, u, "hsl(14,46%,30%)", 1.0, 11);
    this.g.fillStyle = "hsl(220,8%,30%)"; this.g.fillRect(0, roofY, W, H - roofY);
    for (let py = roofY + 5 * u; py < H; py += 6 * u) this.px(0, py, W, 1, "hsl(220,8%,24%)");
    this.px(0, parapetY, W, roofY - parapetY + 1, "hsl(20,24%,40%)");
    this.px(0, parapetY, W, 1.4 * u, "hsl(24,30%,52%)");
    this.px(0, roofY - 1.5 * u, W, 1.5 * u, "hsl(20,22%,30%)");
    this.stringLights(W, u, beat, 38, 3 * u, 11 * u);
    this.px(W * 0.08, roofY - 6 * u, 13 * u, 6 * u, "hsl(220,6%,46%)");
    this.px(W * 0.08, roofY - 6 * u, 13 * u, 1 * u, "hsl(220,6%,58%)");
    for (let i = 0; i < 4; i++) this.px(W * 0.08 + 1.5 * u + i * 2.8 * u, roofY - 5 * u, 1.6 * u, 4 * u, "hsl(220,6%,34%)");
    this.px(W * 0.94, roofY - 7 * u, 4 * u, 7 * u, "hsl(16,45%,42%)");
    this.disc(W * 0.94 + 2 * u, roofY - 7 * u, 4 * u, 3 * u, "hsl(128,42%,40%)");
    this.barStaff(W * 0.1, H * 0.93, u, t, {
      shirt: "hsl(280,28%,46%)", shirtHi: "hsl(280,34%,58%)", shirtSh: "hsl(280,28%,32%)",
      skin: "hsl(28,44%,64%)", hair: "hsl(24,30%,20%)", machine: "bottles",
      counter: "hsl(24,20%,30%)", counterHi: "hsl(26,26%,40%)", counterW: 24,
    });
    this.parkDancer(W * 0.2, H * 0.93, u, beat, kick, { shirt: "hsl(330,60%,62%)", shirtSh: "hsl(330,55%,46%)", legs: "hsl(220,24%,34%)", skin: "hsl(28,46%,66%)", hair: "hsl(28,40%,24%)" }, 0);
    this.parkDancer(W * 0.83, H * 0.95, u, beat, kick, { shirt: "hsl(190,55%,54%)", shirtSh: "hsl(190,52%,40%)", legs: "hsl(28,30%,34%)", skin: "hsl(26,44%,58%)", hair: "hsl(20,30%,16%)" }, 2.1);
    this.djBooth(W * 0.5, H * 0.92, u, t, beat, kick, {
      skin: "hsl(26,46%,62%)", jacket: "hsl(280,30%,46%)", jacketHi: "hsl(280,34%,58%)", jacketSh: "hsl(280,30%,32%)",
      hat: "hsl(8,55%,50%)", cap: true, glow: "hsl(38,95%,62%)", booth: "hsl(24,18%,24%)", boothHi: "hsl(26,22%,34%)", boothSh: "hsl(20,18%,16%)",
    });
  }

  // ── BEACH — sunset shore, bonfire, palms, dancers ───────────────────────────
  private renderBeach(u: number, t: number): void {
    const W = this.w, H = this.h;
    const { kick, beat } = this.pulse(t, 100);
    const seaY = Math.round(H * 0.46);
    const sandY = Math.round(H * 0.6);
    const sg = this.g.createLinearGradient(0, 0, 0, seaY);
    sg.addColorStop(0, "hsl(268,38%,46%)"); sg.addColorStop(0.45, "hsl(20,72%,64%)"); sg.addColorStop(1, "hsl(36,88%,72%)");
    this.g.fillStyle = sg; this.g.fillRect(0, 0, W, seaY);
    const sunX = W * 0.5, sunY = seaY - 3 * u;
    this.disc(sunX, sunY, 16 * u, 16 * u, "hsla(40,100%,74%,0.28)", this.glow);
    this.disc(sunX, sunY, 9 * u, 9 * u, "hsl(44,100%,80%)");
    this.disc(sunX, sunY, 9 * u, 9 * u, "hsla(44,100%,80%,0.5)", this.glow);
    const eg = this.g.createLinearGradient(0, seaY, 0, sandY);
    eg.addColorStop(0, "hsl(196,48%,52%)"); eg.addColorStop(1, "hsl(204,42%,40%)");
    this.g.fillStyle = eg; this.g.fillRect(0, seaY, W, sandY - seaY);
    for (let y = seaY; y < sandY; y += 1.4 * u) { const wob = Math.sin(y * 0.5 + t * 2) * 3 * u; this.px(sunX - 4 * u + wob, y, 8 * u, 0.8 * u, "hsla(44,100%,82%,0.55)"); }
    for (let i = 0; i < 40; i++) {
      const wx = ((i * 91.7) % 1) * W;
      const wy = seaY + 2 * u + ((i * 37.3) % 1) * (sandY - seaY - 3 * u);
      if (Math.sin(t * 2 + i) > 0.4) this.px(wx, wy, 2 * u, 0.8 * u, "hsla(0,0%,100%,0.4)");
    }
    this.px(0, sandY - 1.5 * u, W, 1.5 * u, "hsla(0,0%,100%,0.55)");
    const dg = this.g.createLinearGradient(0, sandY, 0, H);
    dg.addColorStop(0, "hsl(40,52%,68%)"); dg.addColorStop(1, "hsl(34,46%,56%)");
    this.g.fillStyle = dg; this.g.fillRect(0, sandY, W, H - sandY);
    for (let i = 0; i < 50; i++) { const gx = ((i * 71.3) % 1) * W, gy = sandY + 3 * u + ((i * 41.7) % 1) * (H - sandY); this.px(gx, gy, 1, 1, "hsla(30,40%,44%,0.5)"); }
    this.palm(W * 0.12, sandY + 3 * u, u, t);
    this.bonfire(W * 0.82, H * 0.9, u, t, kick);
    this.parkLounger(W * 0.9, H * 0.93, u, t, { shirt: "hsl(20,60%,56%)", shirtSh: "hsl(20,56%,42%)", skin: "hsl(28,44%,62%)", hair: "hsl(24,36%,22%)", legs: "hsl(40,30%,46%)" }, 1.3);
    this.parkDancer(W * 0.64, H * 0.92, u, beat, kick, { shirt: "hsl(48,85%,62%)", shirtSh: "hsl(44,80%,46%)", legs: "hsl(190,40%,40%)", skin: "hsl(26,46%,64%)", hair: "hsl(20,30%,16%)" }, 0.6);
    this.djBooth(W * 0.38, H * 0.92, u, t, beat, kick, {
      skin: "hsl(26,46%,62%)", jacket: "hsl(176,42%,46%)", jacketHi: "hsl(176,46%,58%)", jacketSh: "hsl(176,42%,32%)",
      hair: "hsl(24,30%,18%)", glow: "hsl(28,95%,62%)", booth: "hsl(34,40%,42%)", boothHi: "hsl(36,46%,54%)", boothSh: "hsl(30,38%,28%)",
    });
  }

  // ── SUBWAY — platform busker, a train rushes through, uninterested commuters ─
  private renderSubway(u: number, t: number): void {
    const W = this.w, H = this.h;
    const { kick, beat } = this.pulse(t, 124);
    const platY = Math.round(H * 0.66);
    const tunnelTop = Math.round(platY - 26 * u);
    this.g.fillStyle = "hsl(40,12%,82%)"; this.g.fillRect(0, 0, W, tunnelTop);
    for (let y = 0; y < tunnelTop; y += 5 * u) {
      this.px(0, y + 4.6 * u, W, 0.5 * u, "hsl(40,10%,70%)");
      const off = ((y / (5 * u)) % 2) * 4 * u;
      for (let x = -off; x < W; x += 8 * u) this.px(x, y, 0.5 * u, 5 * u, "hsl(40,10%,70%)");
    }
    const tg = this.g.createLinearGradient(0, tunnelTop, 0, platY);
    tg.addColorStop(0, "hsl(220,16%,12%)"); tg.addColorStop(1, "hsl(222,18%,5%)");
    this.g.fillStyle = tg; this.g.fillRect(0, tunnelTop, W, platY - tunnelTop);
    this.px(0, tunnelTop, W, 1.4 * u, "hsl(40,10%,46%)");
    this.px(0, tunnelTop + 1.4 * u, W, 1 * u, "hsla(0,0%,0%,0.4)");
    for (let x = 14 * u; x < W; x += 30 * u) this.px(x, tunnelTop + 5 * u, 1.4 * u, 1.4 * u, "hsla(40,80%,60%,0.5)");
    this.px(0, platY - 3 * u, W, 0.8 * u, "hsla(200,30%,60%,0.35)");
    this.px(0, platY - 1.4 * u, W, 0.8 * u, "hsla(200,30%,60%,0.25)");
    this.subwayTrain(W, u, t, tunnelTop, platY);
    this.px(0, 0, W, 3 * u, "hsl(220,8%,28%)");
    for (let x = 6 * u; x < W; x += 26 * u) {
      this.px(x, 1 * u, 16 * u, 1.6 * u, "hsl(54,40%,92%)");
      this.px(x, 1 * u, 16 * u, 1.6 * u, "hsla(54,80%,90%,0.5)", this.glow);
    }
    const rx = W * 0.16, ry = 13 * u;
    this.disc(rx, ry, 9 * u, 9 * u, "hsl(2,70%,48%)");
    this.disc(rx, ry, 6 * u, 6 * u, "hsl(40,12%,90%)");
    this.px(rx - 11 * u, ry - 2 * u, 22 * u, 4 * u, "hsl(214,60%,40%)");
    this.px(rx - 2.2 * u, ry - 2.4 * u, 4.4 * u, 5 * u, "hsl(214,60%,40%)");
    this.px(W * 0.62, 6 * u, 30 * u, 9 * u, "hsl(220,14%,12%)");
    for (let i = 0; i < 2; i++) {
      this.px(W * 0.62 + 1.5 * u, 8 * u + i * 3.4 * u, (16 + (i * 6)) * u, 1.4 * u, i === 0 ? "hsl(38,90%,58%)" : "hsl(150,70%,50%)");
      this.px(W * 0.62 + 25 * u, 8 * u + i * 3.4 * u, 3 * u, 1.4 * u, "hsl(38,90%,58%)");
    }
    this.g.fillStyle = "hsl(30,8%,46%)"; this.g.fillRect(0, platY, W, H - platY);
    for (let py = platY + 5 * u; py < H; py += 7 * u) this.px(0, py, W, 1, "hsl(30,8%,38%)");
    this.px(0, platY + 1.5 * u, W, 1.8 * u, "hsl(45,90%,55%)");
    this.px(0, platY, W, 1.5 * u, "hsl(30,10%,56%)");
    this.commuter(W * 0.08, platY + 16 * u, u, t, "hsl(220,20%,34%)", 0.4, "phone");
    this.commuter(W * 0.9, platY + 18 * u, u, t, "hsl(160,18%,34%)", 1.7, "watch");
    this.commuter(W * 0.72, platY + 10 * u, u, t, "hsl(8,30%,40%)", 2.6, "ignore");
    this.parkDancer(W * 0.62, platY + 22 * u, u, beat, kick * 0.6, { shirt: "hsl(280,30%,50%)", shirtSh: "hsl(280,28%,36%)", legs: "hsl(220,16%,26%)", skin: "hsl(26,44%,60%)", hair: "hsl(20,30%,16%)" }, 0.5);
    this.djBooth(W * 0.36, platY + 24 * u, u, t, beat, kick, {
      skin: "hsl(26,46%,62%)", jacket: "hsl(206,16%,30%)", jacketHi: "hsl(206,18%,42%)", jacketSh: "hsl(206,16%,20%)",
      hat: "hsl(2,55%,46%)", glow: "hsl(184,90%,56%)", booth: "hsl(26,30%,30%)", boothHi: "hsl(28,34%,40%)", boothSh: "hsl(24,28%,18%)",
    });
    this.parkNotes(W * 0.36, platY + 13 * u, u, t);
  }

  private subwayTrain(W: number, u: number, t: number, tunnelTop: number, platY: number): void {
    const s = u;
    const cycle = 21;
    const ph = t % cycle;
    const dur = 4.6;
    const trainH = (platY - tunnelTop) - 3 * s;
    const ty = tunnelTop + 2 * s;
    const trainLen = W * 1.7;
    const approach = cycle - dur - 2.2;
    if (ph >= approach && ph < cycle - dur) {
      const g = (ph - approach) / 2.2;
      this.disc(6 * s, ty + trainH * 0.5, (6 + g * 10) * s, (4 + g * 6) * s, `hsla(48,100%,72%,${0.25 + g * 0.4})`, this.glow);
    }
    if (ph < cycle - dur) return;
    const prog = (ph - (cycle - dur)) / dur;
    const leadX = prog * (W + trainLen) - trainLen;
    const speed = 1 - Math.abs(prog - 0.5) * 0.5;
    for (let i = 0; i < 7; i++) {
      const sy = ty + 2 * s + i * (trainH - 3 * s) / 6;
      this.px(Math.max(0, leadX - 30 * s), sy, Math.min(W, leadX + trainLen) - Math.max(0, leadX - 30 * s), 0.8 * s, `hsla(200,30%,80%,${0.06 + 0.05 * speed})`);
    }
    const bodyTop = ty, bodyH = trainH;
    this.px(leadX, bodyTop, trainLen, bodyH, "hsl(210,8%,62%)");
    this.px(leadX, bodyTop, trainLen, 1.6 * s, "hsl(210,10%,74%)");
    this.px(leadX, bodyTop + bodyH - 2.4 * s, trainLen, 2.4 * s, "hsl(214,12%,30%)");
    this.px(leadX, bodyTop + bodyH * 0.5 - 1 * s, trainLen, 2 * s, "hsl(184,70%,46%)");
    this.px(leadX, bodyTop + bodyH * 0.5 - 1 * s, trainLen, 0.7 * s, "hsl(184,80%,62%)");
    for (let wx = leadX + 3 * s; wx < leadX + trainLen - 4 * s; wx += 6.5 * s) {
      if (wx + 5 * s < 0 || wx > W) continue;
      const isDoor = (Math.round((wx - leadX) / 6.5 / s) % 4) === 0;
      if (isDoor) {
        this.px(wx, bodyTop + 2 * s, 5 * s, bodyH * 0.5 - 1 * s, "hsl(214,12%,40%)");
        this.px(wx + 2.2 * s, bodyTop + 2 * s, 0.6 * s, bodyH * 0.5 - 1 * s, "hsl(214,12%,24%)");
      } else {
        this.px(wx, bodyTop + 2.4 * s, 5 * s, 3.6 * s, "hsl(48,90%,80%)");
        this.px(wx, bodyTop + 2.4 * s, 5 * s, 3.6 * s, "hsla(48,95%,82%,0.4)", this.glow);
        if (((wx * 13) | 0) % 3 === 0) this.px(wx + 1.4 * s, bodyTop + 2.8 * s, 2.4 * s, 3 * s, "hsla(220,20%,25%,0.7)");
      }
    }
    const noseX = leadX + trainLen - 1 * s;
    if (noseX > -10 * s && noseX < W + 10 * s) {
      this.px(noseX - 8 * s, bodyTop + 1.6 * s, 6 * s, 4 * s, "hsl(214,14%,22%)");
      this.px(noseX - 2.4 * s, bodyTop + bodyH - 5 * s, 2.4 * s, 2.4 * s, "hsl(54,100%,86%)");
      this.disc(noseX, bodyTop + bodyH - 4 * s, 5 * s, 4 * s, "hsla(50,100%,80%,0.5)", this.glow);
    }
    if (Math.sin(t * 40) > 0.6) {
      const spx = leadX + Math.abs(Math.sin(t * 7)) * trainLen;
      if (spx > 0 && spx < W) this.px(spx, platY - 2 * s, 1.4 * s, 1.4 * s, "hsla(190,100%,80%,0.9)", this.glow);
    }
  }

  private commuter(cx: number, feetY: number, u: number, t: number, coat: string, ph: number, mode: string): void {
    const s = u;
    const bob = Math.sin(t * 1.1 + ph) * 0.4 * s;
    const shoulderY = feetY - 13 * s + bob;
    const headR = 2.3 * s;
    const headCY = shoulderY - headR - 1 * s;
    this.px(cx - 2.4 * s, feetY - 5 * s, 2 * s, 5 * s, "hsl(220,12%,20%)");
    this.px(cx + 0.4 * s, feetY - 5 * s, 2 * s, 5 * s, "hsl(220,12%,20%)");
    this.block(cx - 3.4 * s, shoulderY, 6.8 * s, 9 * s, coat, "hsla(0,0%,100%,0.12)", "hsla(0,0%,0%,0.25)");
    if (mode === "phone") {
      this.limb(cx + 2.4 * s, shoulderY + 2 * s, cx + 2.6 * s, shoulderY + 5 * s, 1.4 * s, coat);
      this.px(cx + 1.6 * s, shoulderY + 4.4 * s, 2.2 * s, 2.8 * s, "hsl(210,30%,18%)");
      this.px(cx + 1.8 * s, shoulderY + 4.8 * s, 1.8 * s, 1.6 * s, "hsl(200,72%,72%)");
      this.px(cx + 1.8 * s, shoulderY + 4.8 * s, 1.8 * s, 1.6 * s, "hsla(200,80%,76%,0.6)", this.glow);
    } else if (mode === "watch") {
      this.limb(cx - 2.4 * s, shoulderY + 2 * s, cx - 1.4 * s, shoulderY + 4 * s, 1.4 * s, coat);
      this.px(cx - 2 * s, shoulderY + 3.4 * s, 1.6 * s, 1.2 * s, "hsl(45,40%,40%)");
    }
    const turn = mode === "ignore" ? 0.8 * s : 0;
    this.block(cx - headR + turn, headCY - headR, headR * 2, headR * 2, "hsl(26,42%,60%)", null, "hsl(26,38%,46%)");
    this.px(cx - headR + turn, headCY - headR - 1 * s, headR * 2, 1.8 * s, "hsl(24,28%,20%)");
    if (mode === "phone") this.px(cx - headR + 0.4 * s, headCY + 1 * s, headR * 2 - 0.8 * s, 1 * s, "hsla(200,70%,70%,0.4)");
  }

  private raisedStage(cx: number, stageTopY: number, halfW: number, u: number, t: number, beat: number, kick: number, o: BoothOpts): void {
    const s = u, H = this.h;
    const scale = o.scale || 1;
    this.px(cx - halfW, stageTopY, halfW * 2, H - stageTopY, o.riser || "hsl(220,10%,16%)");
    this.px(cx - halfW, stageTopY, halfW * 2, 1.4 * s, o.riserHi || "hsl(220,12%,26%)");
    this.px(cx - halfW, stageTopY + 1.4 * s, halfW * 2, 1 * s, o.glow, this.glow);
    for (let x = cx - halfW + 4 * s; x < cx + halfW - 2 * s; x += 6 * s) this.px(x, stageTopY + 4 * s, 1, H - stageTopY - 6 * s, "hsla(0,0%,0%,0.25)");
    this.djBooth(cx, stageTopY + 2 * s * scale, u * scale, t, beat, kick, o);
  }

  // ── ARCADE — barcade, neon cabinets, DJ on a riser, screen-lit crowd ────────
  private renderArcade(u: number, t: number): void {
    const W = this.w, H = this.h;
    const { kick, beat } = this.pulse(t, 130);
    const floorY = Math.round(H * 0.66);
    this.g.fillStyle = "hsl(250,30%,9%)"; this.g.fillRect(0, 0, W, H);
    const glow = 0.6 + 0.4 * Math.sin(beat * Math.PI * 2);
    this.px(W * 0.5 - 18 * u, 4 * u, 36 * u, 6 * u, "hsl(250,24%,14%)");
    this.px(W * 0.5 - 16 * u, 5.4 * u, 32 * u, 3 * u, `hsl(320,90%,${50 + glow * 16}%)`);
    this.px(W * 0.5 - 16 * u, 5.4 * u, 32 * u, 3 * u, `hsla(320,95%,64%,${glow * 0.5})`, this.glow);
    const cabHues = [190, 320, 50, 150, 270, 0];
    const n = 6, cw = W / n;
    for (let i = 0; i < n; i++) {
      const cx0 = i * cw + cw * 0.5, cabW = cw * 0.72, top = floorY - 30 * u;
      this.px(cx0 - cabW / 2, top, cabW, 30 * u, "hsl(250,18%,16%)");
      this.px(cx0 - cabW / 2, top, cabW, 1.2 * u, "hsl(250,18%,26%)");
      this.px(cx0 - cabW / 2 + 1 * u, top + 1.4 * u, cabW - 2 * u, 3 * u, `hsl(${cabHues[i]},80%,52%)`);
      this.px(cx0 - cabW / 2 + 1 * u, top + 1.4 * u, cabW - 2 * u, 3 * u, `hsla(${cabHues[i]},85%,60%,0.5)`, this.glow);
      const scx = cx0 - cabW / 2 + 1.6 * u, scy = top + 6 * u, scw = cabW - 3.2 * u, sch = 9 * u;
      this.px(scx, scy, scw, sch, "hsl(230,40%,8%)");
      for (let b = 0; b < 5; b++) { const bx = scx + ((b * 3.1 + t * (6 + i)) % (scw - 2 * u)); this.px(bx, scy + 1 * u + ((b * 2 + i) % 3) * 2.4 * u, 2 * u, 1.6 * u, `hsl(${(cabHues[i] + b * 40) % 360},85%,62%)`); }
      this.px(scx, scy, scw, sch, `hsla(${cabHues[i]},80%,60%,0.10)`, this.glow);
      this.px(scx, scy + sch + 1 * u, scw, 4 * u, "hsl(250,16%,12%)");
      this.px(cx0 - 0.8 * u, scy + sch + 1.6 * u, 1.6 * u, 1.6 * u, `hsl(${cabHues[i]},85%,58%)`);
      this.disc(cx0, floorY + 3 * u, cabW * 0.5, 3 * u, `hsla(${cabHues[i]},80%,55%,0.12)`, this.glow);
    }
    this.g.fillStyle = "hsl(250,24%,7%)"; this.g.fillRect(0, floorY, W, H - floorY);
    this.px(0, floorY, W, 1, "hsl(300,60%,30%)");
    this.raisedStage(W * 0.5, H * 0.58, 12 * u, u, t, beat, kick, {
      skin: "hsl(26,44%,58%)", jacket: "hsl(270,36%,40%)", jacketHi: "hsl(270,42%,52%)", jacketSh: "hsl(270,36%,26%)",
      hat: "hsl(190,70%,46%)", glow: "hsl(190,90%,58%)", booth: "hsl(250,24%,18%)", boothHi: "hsl(252,30%,28%)", boothSh: "hsl(250,24%,10%)",
      riser: "hsl(265,40%,22%)", riserHi: "hsl(300,80%,58%)", scale: 0.7,
    });
    this.crowdBand(H * 1.02, u, t, beat, kick, { rows: 5, hue: 252, maxL: 8, handsHue: 300 });
  }

  // ── DINER — 24hr night owl, neon, flipping cook, sliding root beer ──────────
  private renderDiner(u: number, t: number): void {
    const W = this.w, H = this.h;
    const { kick, beat } = this.pulse(t, 98);
    const counterY = Math.round(H * 0.62), floorY = Math.round(H * 0.74);
    this.g.fillStyle = "hsl(190,16%,24%)"; this.g.fillRect(0, 0, W, floorY);
    this.px(0, floorY - 10 * u, W, 1.4 * u, "hsl(2,60%,50%)");
    this.px(0, floorY - 8.6 * u, W, 1 * u, "hsl(190,12%,18%)");
    const wx = W * 0.62, wy = 6 * u, ww = W * 0.32, wh = 24 * u;
    this.px(wx - 2 * u, wy - 2 * u, ww + 4 * u, wh + 4 * u, "hsl(190,14%,16%)");
    this.g.fillStyle = "hsl(225,34%,14%)"; this.g.fillRect(wx, wy, ww, wh);
    for (let i = 0; i < 10; i++) this.px(wx + ((i * 53) % 1) * ww, wy + ((i * 31) % 1) * wh, 1.2 * u, 1.2 * u, "hsla(45,90%,70%,0.6)");
    const glow = 0.55 + 0.45 * Math.sin(beat * Math.PI * 2);
    this.px(W * 0.1, 8 * u, 22 * u, 7 * u, "hsl(190,16%,12%)");
    this.px(W * 0.1 + 2 * u, 9.6 * u, 18 * u, 3.6 * u, `hsl(330,90%,${52 + glow * 14}%)`);
    this.px(W * 0.1 + 2 * u, 9.6 * u, 18 * u, 3.6 * u, `hsla(330,95%,64%,${glow * 0.55})`, this.glow);
    this.disc(W * 0.1 + 11 * u, 11.4 * u, 16 * u, 8 * u, "hsla(330,90%,60%,0.08)", this.glow);
    this.px(0, counterY, W, 4 * u, "hsl(2,50%,46%)");
    this.px(0, counterY, W, 1 * u, "hsl(2,56%,60%)");
    this.px(0, counterY + 4 * u, W, floorY - counterY - 4 * u, "hsl(40,12%,82%)");
    for (let x = 6 * u; x < W; x += 10 * u) this.px(x, counterY + 5 * u, 0.6 * u, floorY - counterY - 6 * u, "hsl(40,10%,68%)");
    for (let i = 0; i < 4; i++) { const sx2 = W * 0.1 + i * 14 * u; this.px(sx2 - 0.8 * u, floorY - 1 * u, 1.6 * u, H - floorY, "hsl(220,8%,30%)"); this.disc(sx2, floorY - 2 * u, 3 * u, 1.4 * u, "hsl(2,55%,48%)"); }
    this.g.fillStyle = "hsl(200,10%,16%)"; this.g.fillRect(0, floorY, W, H - floorY);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 18; c++) if ((r + c) % 2 === 0) this.px(c * (W / 18), floorY + r * ((H - floorY) / 4), W / 18 + 0.5, (H - floorY) / 4 + 0.5, "hsl(200,8%,24%)");
    this.dinerCook(W * 0.78, counterY, u, t, beat);
    const mugX = this.slideBarDrinks(W * 0.7, W * 0.1, counterY, u, t);
    this.dinerPatron(W * 0.1, floorY - 2 * u, u, t, beat, kick, { shirt: "hsl(210,40%,46%)", shirtSh: "hsl(210,38%,32%)", skin: "hsl(28,44%,62%)", hair: "hsl(24,30%,22%)", into: true }, mugX, counterY);
    this.dinerPatron(W * 0.24, floorY - 2 * u, u, t, beat, kick, { shirt: "hsl(30,16%,40%)", shirtSh: "hsl(30,16%,28%)", skin: "hsl(26,42%,58%)", hair: "hsl(0,0%,72%)", into: false }, null, counterY);
    this.dinerPatron(W * 0.38, floorY - 2 * u, u, t, beat, kick, { shirt: "hsl(150,30%,42%)", shirtSh: "hsl(150,30%,28%)", skin: "hsl(28,46%,64%)", hair: "hsl(20,30%,16%)", into: true }, null, counterY);
    this.djBooth(W * 0.26, H * 0.97, u * 0.92, t, beat, kick, {
      skin: "hsl(26,44%,60%)", jacket: "hsl(330,40%,44%)", jacketHi: "hsl(330,46%,56%)", jacketSh: "hsl(330,40%,30%)",
      hat: "hsl(190,60%,46%)", glow: "hsl(330,90%,62%)", booth: "hsl(190,16%,20%)", boothHi: "hsl(190,22%,30%)", boothSh: "hsl(190,16%,12%)",
    });
  }

  private dinerPatron(cx: number, seatY: number, u: number, t: number, beat: number, kick: number, c: { shirt: string; shirtSh: string; skin: string; hair: string; into: boolean }, mugX: number | null, counterY: number): void {
    const s = u;
    const into = c.into;
    const bob = into ? Math.abs(Math.sin(beat * Math.PI * 2)) * (1 + kick) * 1.4 * s : Math.sin(t * 0.7 + cx) * 0.4 * s;
    const shoulderY = seatY - 12 * s - bob;
    const headR = 2.4 * s, hcy = shoulderY - headR - 1 * s;
    this.px(cx - 1.4 * s, seatY - 4 * s, 2.8 * s, 4 * s, c.shirtSh);
    this.block(cx - 3.6 * s, shoulderY, 7.2 * s, 9 * s, c.shirt, "hsla(0,0%,100%,0.12)", c.shirtSh);
    const catching = mugX != null && Math.abs(mugX - cx) < 6 * s;
    if (catching) {
      this.limb(cx + 2.6 * s, shoulderY + 2 * s, mugX!, counterY - 4 * s, 1.6 * s, c.shirt);
      this.px(mugX! - 1 * s, counterY - 5 * s, 2.4 * s, 1.8 * s, c.skin);
    } else if (into) {
      const a = Math.sin(beat * Math.PI * 2) * 2 * s;
      this.limb(cx - 2.6 * s, shoulderY + 1 * s, cx - 4 * s, shoulderY - 3 * s + a, 1.5 * s, c.shirt);
      this.limb(cx + 2.6 * s, shoulderY + 1 * s, cx + 4 * s, shoulderY - 3 * s - a, 1.5 * s, c.shirt);
    } else {
      this.limb(cx + 2.4 * s, shoulderY + 2 * s, cx + 3.4 * s, counterY - 5 * s, 1.5 * s, c.shirt);
    }
    this.block(cx - headR, hcy - headR, headR * 2, headR * 2, c.skin, null, "hsl(26,40%,46%)");
    this.px(cx - headR, hcy - headR - 1 * s, headR * 2, 2 * s, c.hair);
    this.px(cx - headR + 0.5 * s, hcy - headR + 0.5 * s, headR * 2 - 1 * s, 1.4 * s, c.hair);
  }

  private dinerCook(cx: number, counterY: number, u: number, t: number, beat: number): void {
    const s = u, bp = beat * Math.PI * 2;
    const bob = Math.abs(Math.sin(bp)) * 1.3 * s;
    const shoulderY = counterY - 13 * s - bob, headR = 2.4 * s, hcy = shoulderY - headR - 1 * s;
    this.block(cx - 3.6 * s, shoulderY, 7.2 * s, 13 * s, "hsl(0,0%,90%)", "hsl(0,0%,100%)", "hsl(0,0%,76%)");
    this.px(cx - 1.6 * s, shoulderY + 1 * s, 3.2 * s, 7 * s, "hsl(2,40%,52%)");
    this.block(cx - headR, hcy - headR, headR * 2, headR * 2, "hsl(26,44%,60%)", null, "hsl(26,40%,46%)");
    this.px(cx - headR - 0.5 * s, hcy - headR - 1.4 * s, headR * 2 + 1 * s, 2.4 * s, "hsl(0,0%,94%)");
    this.px(cx - headR - 0.2 * s, hcy - headR - 3 * s, headR * 2 + 0.4 * s, 1.8 * s, "hsl(0,0%,99%)");
    const panX = cx - 6.5 * s, panY = counterY - 4 * s - bob;
    this.limb(cx - 3 * s, shoulderY + 2 * s, panX + 1.5 * s, panY, 1.8 * s, "hsl(0,0%,86%)");
    this.px(panX - 2.6 * s, panY, 5.4 * s, 1.4 * s, "hsl(0,0%,16%)");
    this.px(panX - 5 * s, panY + 0.2 * s, 2.4 * s, 1 * s, "hsl(0,0%,12%)");
    const flip = Math.max(0, Math.sin(bp)) * 8 * s;
    this.px(panX - 1 * s + Math.sin(t * 3) * 1 * s, panY - 2 * s - flip, 2.4 * s, 1.4 * s, "hsl(26,55%,44%)");
    if (flip > 4 * s) this.px(panX - 0.4 * s, panY - 2.6 * s - flip, 1 * s, 0.8 * s, "hsl(28,60%,56%)");
    for (let k = 0; k < 4; k++) { const sy = panY - 2 * s - k * 1.5 * s; this.px(panX + Math.sin(t * 4 + k) * 1.2 * s, sy, 1, 1 * s, `hsla(0,0%,100%,${Math.max(0, 0.32 - k * 0.06)})`, this.glow); }
    const chop = Math.abs(Math.sin(bp + Math.PI)) * 1.6 * s;
    this.limb(cx + 3 * s, shoulderY + 2 * s, cx + 5.4 * s, counterY - 2.5 * s - chop, 1.6 * s, "hsl(0,0%,86%)");
    this.px(cx + 4.4 * s, counterY - 3.6 * s - chop, 2 * s, 1.4 * s, "hsl(26,44%,62%)");
    this.px(cx + 5.6 * s, counterY - 3.8 * s - chop, 0.8 * s, 2 * s, "hsl(0,0%,80%)");
    this.px(cx + 3.4 * s, counterY - 1.4 * s, 4.4 * s, 1 * s, "hsl(28,30%,40%)");
  }

  private slideBarDrinks(xFrom: number, xTo: number, counterY: number, u: number, t: number): number | null {
    const s = u, period = 11, dur = 2.3;
    const local = t % period;
    if (local > dur) return null;
    const ph = local / dur;
    const x = xFrom + (xTo - xFrom) * ph;
    const topY = counterY - 0.5 * s;
    const slosh = Math.sin(t * 12) * 0.4 * s;
    this.px(x + 3 * s, topY - 3 * s, 3 * s, 1 * s, "hsla(36,60%,82%,0.25)");
    this.px(x + 5 * s, topY - 2.6 * s, 2 * s, 0.8 * s, "hsla(36,60%,82%,0.15)");
    this.px(x - 2 * s, topY - 5 * s, 4 * s, 5 * s, "hsl(28,55%,40%)");
    this.px(x - 2 * s, topY - 5 * s, 4 * s, 1.4 * s + slosh, "hsl(36,72%,82%)");
    this.px(x - 2 * s, topY - 5 * s, 1 * s, 5 * s, "hsla(0,0%,100%,0.25)");
    this.px(x + 2 * s, topY - 4 * s, 1.2 * s, 2.4 * s, "hsl(28,50%,34%)");
    this.px(x - 2.4 * s, topY, 5 * s, 0.8 * s, "hsla(0,0%,100%,0.18)");
    return x;
  }

  // ── AFTER HOURS STUDIO — over-the-shoulder producer at a glowing DAW ────────
  private renderStudio(u: number, t: number): void {
    const W = this.w, H = this.h;
    const { kick, beat } = this.pulse(t, 90);
    const cx = Math.round(W * 0.5);
    const rg = this.g.createLinearGradient(0, 0, 0, H);
    rg.addColorStop(0, "hsl(224,34%,9%)"); rg.addColorStop(0.55, "hsl(222,30%,12%)"); rg.addColorStop(1, "hsl(224,28%,6%)");
    this.g.fillStyle = rg; this.g.fillRect(0, 0, W, H);
    for (let i = 0; i < 30; i++) {
      const sx = ((i * 73.7) % 1) * W, sy = ((i * 41.3) % 1) * H * 0.46;
      const tw = 0.35 + 0.55 * Math.abs(Math.sin(t * 1.4 + i));
      this.px(sx, sy, 1, 1, `hsla(214,40%,90%,${tw})`);
    }
    const cst = [[0.72, 0.10], [0.78, 0.16], [0.86, 0.12], [0.83, 0.22], [0.92, 0.20]];
    for (const [fx, fy] of cst) this.px(W * fx, H * fy, 1.4 * u, 1.4 * u, "hsla(210,50%,94%,0.9)");
    const horizon = Math.round(H * 0.56);
    const sky = [[0.0, 16], [0.07, 26], [0.13, 20], [0.80, 22], [0.86, 34], [0.93, 28], [1.0, 18]];
    for (let i = 0; i < sky.length - 1; i++) {
      const x0 = sky[i][0] * W, x1 = sky[i + 1][0] * W, bh = sky[i][1] * u;
      this.px(x0, horizon - bh, x1 - x0 + 1, bh + (H - horizon), "hsl(225,30%,11%)");
      for (let wy = horizon - bh + 3 * u; wy < horizon - 2 * u; wy += 4 * u) {
        for (let wx = x0 + 2 * u; wx < x1 - 2 * u; wx += 4 * u) {
          if (((wx * 7 + wy * 13) | 0) % 4 === 0) this.px(wx, wy, 1.4 * u, 1.4 * u, ((wx | 0) % 2) ? "hsla(45,90%,68%,0.7)" : "hsla(150,70%,60%,0.6)");
        }
      }
    }
    const deskTop = Math.round(H * 0.50);
    this.g.fillStyle = "hsl(226,20%,11%)"; this.g.fillRect(0, deskTop, W, H - deskTop);
    this.px(0, deskTop, W, 1.2 * u, "hsl(226,18%,17%)");
    this.px(0, Math.round(H * 0.585), W, 1.4 * u, "hsla(226,16%,3%,0.6)");
    const halo = 0.85 + 0.15 * (0.5 + 0.5 * Math.sin(t * 0.8));
    this.disc(cx, H * 0.33, 62 * u, 42 * u, `hsla(205,75%,64%,${0.09 * halo})`, this.glow);
    this.disc(cx, H * 0.33, 42 * u, 27 * u, `hsla(202,80%,70%,${0.13 * halo})`, this.glow);
    this.studioMonitorBig(W * 0.13, deskTop + 2 * u, u, kick);
    this.studioMonitorBig(W * 0.87, deskTop + 2 * u, u, kick);
    this.deskCat(W * 0.79, H * 0.53, u, t);
    this.dawScreen(cx, H * 0.21, u, beat, kick);
    this.glowKeys(cx, H * 0.515, u, beat, kick);
    this.producerOTS(cx, H * 0.74, 6.4 * u, u, beat, kick);
  }

  private producerOTS(cx: number, hcy0: number, headR: number, u: number, beat: number, kick: number): void {
    const s = u;
    const nod = Math.sin(beat * Math.PI * 2) * 0.5 * s + kick * 0.5 * s;
    const hcy = hcy0 + nod * 0.4;
    const SH = "hsl(206,30%,40%)", SHH = "hsl(204,42%,56%)", SHS = "hsl(208,30%,26%)";
    const shoulderTop = hcy + headR + 1 * s;
    const shHalf = 11 * s, rows = 11;
    for (let i = 0; i < rows; i++) {
      const yy = shoulderTop + i * 1.8 * s;
      let hw;
      if (i === 0) hw = 6 * s;
      else if (i === 1) hw = 9 * s;
      else hw = shHalf - (i - 2) * 0.25 * s;
      this.px(cx - hw, yy, hw * 2, 2 * s, SH);
    }
    this.px(cx - 8 * s, shoulderTop + 1.6 * s, 16 * s, 3 * s, SHH);
    this.px(cx - 0.8 * s, shoulderTop + 2 * s, 1.6 * s, 16 * s, SHS);
    this.px(cx - shHalf + 1 * s, shoulderTop + 1.4 * s, shHalf * 2 - 2 * s, 1 * s, "hsla(200,88%,74%,0.5)");
    this.px(cx - 2.4 * s, hcy + headR - 1.4 * s, 4.8 * s, 4 * s, "hsl(26,40%,50%)");
    this.px(cx - 2.4 * s, hcy + headR - 1.4 * s, 4.8 * s, 1.2 * s, "hsl(26,36%,38%)");
    this.block(cx - headR, hcy - headR, headR * 2, headR * 2, "hsl(26,42%,56%)", null, "hsl(26,38%,44%)");
    this.px(cx - headR + 1 * s, hcy + headR - 3 * s, headR * 2 - 2 * s, 2.6 * s, "hsl(24,30%,28%)");
    this.px(cx - headR - 2.8 * s, hcy - 1.6 * s, 3.4 * s, 6.4 * s, "hsl(228,10%,13%)");
    this.px(cx + headR - 0.6 * s, hcy - 1.6 * s, 3.4 * s, 6.4 * s, "hsl(228,10%,13%)");
    this.px(cx - headR - 2.8 * s, hcy - 0.8 * s, 3.4 * s, 1.8 * s, "hsl(228,12%,24%)");
    this.px(cx + headR - 0.6 * s, hcy - 0.8 * s, 3.4 * s, 1.8 * s, "hsl(228,12%,24%)");
    const capY = hcy - headR;
    this.px(cx - headR - 1.6 * s, capY - 4.4 * s, headR * 2 + 3.2 * s, 5.4 * s, "hsl(222,26%,19%)");
    this.px(cx - headR - 1.6 * s, capY - 4.4 * s, headR * 2 + 3.2 * s, 1.8 * s, "hsl(222,30%,32%)");
    this.px(cx - headR - 3.2 * s, capY + 0.6 * s, headR * 2 + 6.4 * s, 2.2 * s, "hsl(222,28%,13%)");
    this.px(cx - 1 * s, capY - 5.4 * s, 2 * s, 1.6 * s, "hsl(222,26%,26%)");
    this.px(cx - headR - 2.2 * s, capY - 5 * s, headR * 2 + 4.4 * s, 1.6 * s, "hsl(228,10%,20%)");
  }

  private deskCat(cx: number, baseY: number, u: number, t: number): void {
    const s = u;
    const breathe = Math.sin(t * 1.5) * 0.4 * s;
    const B = "hsl(26,28%,26%)", BH = "hsl(28,32%,34%)";
    this.disc(cx, baseY + breathe, 5.2 * s, 3 * s, B);
    this.disc(cx - 1 * s, baseY - 1 * s + breathe, 3.4 * s, 2.4 * s, BH);
    this.disc(cx - 4.4 * s, baseY + 0.6 * s + breathe, 2.4 * s, 1.1 * s, B);
    this.disc(cx + 3.6 * s, baseY - 0.4 * s + breathe, 2.2 * s, 1.9 * s, BH);
    this.px(cx + 2.4 * s, baseY - 3 * s + breathe, 1.1 * s, 1.6 * s, B);
    this.px(cx + 4.3 * s, baseY - 3 * s + breathe, 1.1 * s, 1.6 * s, B);
    this.px(cx + 5.2 * s, baseY - 0.4 * s + breathe, 1 * s, 0.8 * s, "hsla(40,30%,60%,0.5)");
  }

  private studioMonitorBig(cx: number, deskY: number, u: number, kick: number): void {
    const s = u;
    const cabW = 15 * s, cabH = 20 * s;
    const top = deskY - 2 * s - cabH;
    this.px(cx - 1.2 * s, deskY - 2 * s, 2.4 * s, 2 * s, "hsl(226,12%,16%)");
    this.px(cx - 5 * s, deskY, 10 * s, 1.4 * s, "hsl(226,12%,12%)");
    this.px(cx - cabW / 2 - 1 * s, top - 1 * s, cabW + 2 * s, cabH + 2 * s, "hsl(226,16%,8%)");
    this.px(cx - cabW / 2, top, cabW, cabH, "hsl(226,12%,15%)");
    this.px(cx - cabW / 2, top, cabW, 1.2 * s, "hsl(226,12%,24%)");
    this.px(cx - cabW / 2, top, 1.2 * s, cabH, "hsl(226,12%,20%)");
    this.disc(cx, top + 4.5 * s, 2 * s, 2 * s, "hsl(226,10%,6%)");
    this.px(cx - 0.6 * s, top + 4 * s, 1.2 * s, 1.2 * s, "hsl(40,30%,70%)");
    const wy = top + 13 * s, pr = (5.4 + kick * 1.2) * s;
    this.disc(cx, wy, 6 * s, 6 * s, "hsl(226,10%,5%)");
    this.disc(cx, wy, pr, pr, "hsl(226,8%,16%)");
    this.disc(cx, wy, pr * 0.66, pr * 0.66, "hsl(226,8%,10%)");
    this.disc(cx, wy, pr * 0.3, pr * 0.3, "hsl(226,8%,20%)");
    if (kick > 0.4) this.disc(cx, wy, pr + 1 * s, pr + 1 * s, `hsla(205,70%,60%,${0.1 * kick})`, this.glow);
    this.px(cx - cabW / 2 + 1.6 * s, deskY - 4 * s, 1.4 * s, 1.4 * s, "hsl(140,80%,55%)");
    this.px(cx - cabW / 2 + 1.6 * s, deskY - 4 * s, 1.4 * s, 1.4 * s, "hsla(140,90%,60%,0.9)", this.glow);
  }

  private dawScreen(cx: number, topY: number, u: number, beat: number, kick: number): void {
    const s = u;
    const W2 = 50 * s, Hh = 26 * s;
    const sx = cx - W2 / 2, sy = topY;
    this.disc(cx, sy + Hh * 0.5, W2 * 0.62, Hh * 0.78, "hsla(204,85%,66%,0.22)", this.glow);
    this.px(sx - 1.4 * s, sy - 1.4 * s, W2 + 2.8 * s, Hh + 2.8 * s, "hsl(224,16%,6%)");
    this.px(sx, sy, W2, Hh, "hsl(214,34%,16%)");
    this.px(sx, sy, W2, Hh, "hsla(204,80%,66%,0.06)", this.glow);
    this.px(sx, sy, W2, 3 * s, "hsl(216,28%,21%)");
    this.px(sx + 1.4 * s, sy + 0.9 * s, 1.6 * s, 1.4 * s, "hsl(146,70%,52%)");
    this.px(sx + 3.4 * s, sy + 0.9 * s, 1.6 * s, 1.4 * s, "hsl(146,70%,52%)");
    this.px(sx + 5.4 * s, sy + 0.9 * s, 1.6 * s, 1.4 * s, "hsl(2,75%,56%)");
    for (let i = 0; i < 4; i++) this.px(sx + W2 - 13 * s + i * 2 * s, sy + 0.9 * s, 1.6 * s, 1.4 * s, "hsl(190,70%,54%)");
    this.px(sx + W2 - 4.6 * s, sy + 0.9 * s, 1.6 * s, 1.4 * s, "hsl(45,90%,56%)");
    this.px(sx + 1 * s, sy + 4 * s, 4 * s, Hh - 9 * s, "hsl(216,26%,12%)");
    const laneHues = [190, 330, 150, 45];
    const laneTop = sy + 4.2 * s, laneH = 2.0 * s, gap = 1.2 * s;
    const fieldX = sx + 6.5 * s, fieldW = W2 - 8 * s;
    const playX = fieldX + fieldW * 0.30;
    for (let l = 0; l < laneHues.length; l++) {
      const ly = laneTop + l * (laneH + gap);
      const groups = (l % 2 === 0) ? [[0.34, 0.92]] : [[0.02, 0.27], [0.5, 0.99]];
      for (const [a, b] of groups) {
        const gx = fieldX + fieldW * a, gw = fieldW * (b - a);
        for (let dx = gx; dx < gx + gw - 1 * s; dx += 2.2 * s) {
          const near = Math.abs(dx - playX) < 5 * s;
          const lit = near ? 70 : 56;
          this.px(dx, ly + 0.5 * s, 1.5 * s, laneH - 1 * s, `hsl(${laneHues[l]},72%,${lit}%)`);
          if (near) this.px(dx, ly + 0.5 * s, 1.5 * s, laneH - 1 * s, `hsla(${laneHues[l]},85%,72%,${0.5 * kick})`, this.glow);
        }
      }
    }
    this.px(playX, sy + 3.4 * s, 0.8 * s, Hh - 9 * s, "hsla(0,0%,100%,0.92)");
    this.px(playX, sy + 3.4 * s, 0.8 * s, Hh - 9 * s, "hsla(190,60%,90%,0.5)", this.glow);
    const rowY = sy + Hh - 3.4 * s;
    this.px(sx + 1 * s, rowY - 1 * s, W2 - 2 * s, 0.6 * s, "hsl(216,26%,10%)");
    const blockHues = [205, 330, 150, 268, 330, 45, 190, 150];
    for (let i = 0; i < blockHues.length; i++) {
      const bx = fieldX + (i + 0.5) * (fieldW / blockHues.length) - 1.4 * s;
      const blink = (Math.floor(beat) % blockHues.length) === i;
      const L = blink ? 64 : 46;
      this.px(bx, rowY, 2.8 * s, 2.4 * s, `hsl(${blockHues[i]},66%,${L}%)`);
      this.px(bx, rowY, 2.8 * s, 0.8 * s, `hsl(${blockHues[i]},74%,${L + 12}%)`);
      if (blink) this.px(bx, rowY, 2.8 * s, 2.4 * s, `hsla(${blockHues[i]},85%,70%,0.6)`, this.glow);
    }
  }

  private glowKeys(cx: number, topY: number, u: number, beat: number, kick: number): void {
    const s = u, kw = 40 * s, kx = cx - kw / 2, ky = topY;
    this.disc(cx, ky + 1.5 * s, kw * 0.55, 5 * s, "hsla(200,40%,90%,0.3)", this.glow);
    this.px(kx - 1.4 * s, ky - 1.4 * s, kw + 2.8 * s, 5.4 * s, "hsl(220,16%,20%)");
    this.px(kx - 1.4 * s, ky - 1.4 * s, kw + 2.8 * s, 1 * s, "hsl(220,16%,30%)");
    this.px(kx, ky, kw, 4 * s, "hsl(200,30%,94%)");
    this.px(kx, ky, kw, 4 * s, "hsla(195,60%,90%,0.45)", this.glow);
    const nKeys = 22, litKey = Math.floor((beat * 2) % nKeys);
    for (let i = 0; i < nKeys; i++) {
      this.px(kx + i * (kw / nKeys), ky, 0.5 * s, 4 * s, "hsl(214,18%,62%)");
      if (i === litKey && kick > 0.3) {
        this.px(kx + i * (kw / nKeys), ky, (kw / nKeys) - 0.5 * s, 4 * s, "hsla(200,90%,72%,0.7)");
        this.px(kx + i * (kw / nKeys), ky, (kw / nKeys) - 0.5 * s, 4 * s, "hsla(200,95%,75%,0.5)", this.glow);
      }
    }
    for (let i = 0; i < nKeys; i++) {
      const m = i % 7;
      if (m === 0 || m === 1 || m === 3 || m === 4 || m === 5) this.px(kx + i * (kw / nKeys) + 1.2 * s, ky, 1.1 * s, 2.4 * s, "hsl(220,14%,14%)");
    }
  }

  // ── SKI LODGE — après-ski, picture window of snowy peaks, fireplace ─────────
  private renderSkiLodge(u: number, t: number): void {
    const W = this.w, H = this.h;
    const { kick, beat } = this.pulse(t, 92);
    const floorY = Math.round(H * 0.72);
    const wg = this.g.createLinearGradient(0, 0, 0, floorY);
    wg.addColorStop(0, "hsl(26,38%,34%)"); wg.addColorStop(1, "hsl(24,36%,26%)");
    this.g.fillStyle = wg; this.g.fillRect(0, 0, W, floorY);
    for (let y = 5 * u; y < floorY; y += 6 * u) this.px(0, y, W, 0.6 * u, "hsla(22,30%,18%,0.6)");
    const wx = W * 0.30, wy = H * 0.12, ww = W * 0.46, wh = H * 0.42;
    this.px(wx - 2.4 * u, wy - 2.4 * u, ww + 4.8 * u, wh + 4.8 * u, "hsl(24,34%,22%)");
    const sg = this.g.createLinearGradient(0, wy, 0, wy + wh);
    sg.addColorStop(0, "hsl(244,42%,40%)"); sg.addColorStop(0.6, "hsl(280,34%,52%)"); sg.addColorStop(1, "hsl(20,50%,66%)");
    this.g.fillStyle = sg; this.g.fillRect(wx, wy, ww, wh);
    for (let i = 0; i < 22; i++) this.px(wx + ((i * 53.7) % 1) * ww, wy + ((i * 31.3) % 1) * wh * 0.6, 1, 1, "hsla(0,0%,100%,0.7)");
    this.g.save();
    this.g.beginPath(); this.g.rect(wx, wy, ww, wh); this.g.clip();
    for (const [mx, mh] of [[0.18, 22], [0.46, 30], [0.74, 24]]) {
      const px0 = wx + ww * mx, base = wy + wh;
      for (let yy = 0; yy < mh * u; yy++) { const half = (mh * u - yy) * 1.1; this.px(px0 - half, base - yy, half * 2, 1, yy < 5 * u ? "hsl(210,30%,92%)" : "hsl(225,28%,60%)"); }
    }
    const peakX = wx + ww * 0.46, peakBase = wy + wh, peakH = 30 * u;
    for (let i = 0; i < 3; i++) {
      const prog = ((t * 0.12 + i * 0.34) % 1);
      const side = (i % 2) ? 1 : -1;
      const d = prog * peakH * 1.1;
      const wob = Math.sin(prog * 14 + i * 2) * 1.2 * u;
      const fx = peakX + side * d + wob;
      const surfYy = Math.max(0, peakH - Math.abs(fx - peakX) / 1.1);
      const sy = peakBase - surfYy;
      this.px(fx - 0.6 * u, sy - 5 * u, 1.6 * u, 1.6 * u, "hsl(28,44%,64%)");
      this.px(fx - 1 * u, sy - 3.8 * u, 2 * u, 3 * u, ["hsl(0,72%,52%)", "hsl(208,72%,52%)", "hsl(45,85%,55%)"][i]);
      this.px(fx - 2.2 * u, sy - 0.6 * u, 4.4 * u, 0.8 * u, "hsl(200,18%,92%)");
      this.px(fx + side * 1.8 * u, sy - 1 * u, 1.2 * u, 1.2 * u, "hsla(0,0%,100%,0.7)");
    }
    this.g.restore();
    this.px(wx, wy + wh - 2 * u, ww, 2 * u, "hsl(210,24%,80%)");
    this.px(wx + ww / 2 - 0.6 * u, wy, 1.2 * u, wh, "hsl(24,34%,22%)");
    for (let i = 0; i < 40; i++) { const fx = wx + (((i * 47.3) % 1) * ww + Math.sin(t + i) * 2 * u); const fy = wy + ((t * (8 + (i % 3) * 4) + i * 19) % wh); this.px(fx, fy, 1, 1, "hsla(0,0%,100%,0.7)"); }
    this.stringLights(W, u, beat, 38, 2 * u, 7 * u);
    const fxp = W * 0.085;
    this.px(fxp - 6 * u, floorY - 22 * u, 12 * u, 22 * u, "hsl(220,8%,34%)");
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) this.px(fxp - 5.4 * u + c * 4 * u + (r % 2) * 1.4 * u, floorY - 21 * u + r * 4 * u, 3.2 * u, 3.2 * u, "hsl(220,6%,28%)");
    this.px(fxp - 4 * u, floorY - 8 * u, 8 * u, 6 * u, "hsl(16,40%,12%)");
    const fl = 0.7 + 0.3 * Math.sin(t * 9);
    for (let i = 0; i < 4; i++) { const fh = (3 + (i % 2) * 2) * u * fl; this.px(fxp - 3 * u + i * 1.8 * u, floorY - 3 * u - fh, 1.6 * u, fh, "hsl(22,95%,55%)"); }
    this.disc(fxp, floorY - 6 * u, 9 * u, 8 * u, `hsla(28,100%,60%,${0.18 * fl})`, this.glow);
    this.g.fillStyle = "hsl(24,34%,30%)"; this.g.fillRect(0, floorY, W, H - floorY);
    for (let py = floorY + 4 * u; py < H; py += 5 * u) this.px(0, py, W, 1, "hsl(22,30%,22%)");
    this.px(0, floorY, W, 1, "hsl(28,38%,40%)");
    this.parkLounger(W * 0.16, H * 0.92, u, t, { shirt: "hsl(8,55%,52%)", shirtSh: "hsl(8,52%,38%)", skin: "hsl(28,44%,64%)", hair: "hsl(0,0%,90%)", legs: "hsl(220,24%,30%)" }, 0.6);
    this.djBooth(W * 0.62, H * 0.95, u, t, beat, kick, {
      skin: "hsl(26,46%,62%)", jacket: "hsl(205,40%,46%)", jacketHi: "hsl(205,46%,58%)", jacketSh: "hsl(205,40%,30%)",
      hat: "hsl(8,55%,50%)", glow: "hsl(38,90%,60%)", booth: "hsl(26,34%,32%)", boothHi: "hsl(28,40%,42%)", boothSh: "hsl(22,30%,20%)",
    });
    this.parkDancer(W * 0.84, H * 0.95, u, beat, kick, { shirt: "hsl(190,50%,52%)", shirtSh: "hsl(190,48%,38%)", legs: "hsl(28,30%,30%)", skin: "hsl(26,44%,60%)", hair: "hsl(30,40%,26%)" }, 1.3);
  }

  // ── SUNSET CRUISE — boat deck, hull bulwark, life rings, dancers ────────────
  private renderBoat(u: number, t: number): void {
    const W = this.w, H = this.h;
    const { kick, beat } = this.pulse(t, 108);
    const horizon = Math.round(H * 0.46), deckY = Math.round(H * 0.6);
    const sg = this.g.createLinearGradient(0, 0, 0, horizon);
    sg.addColorStop(0, "hsl(258,40%,46%)"); sg.addColorStop(0.5, "hsl(18,74%,64%)"); sg.addColorStop(1, "hsl(38,88%,72%)");
    this.g.fillStyle = sg; this.g.fillRect(0, 0, W, horizon);
    const sunX = W * 0.66;
    this.disc(sunX, horizon - 4 * u, 14 * u, 14 * u, "hsla(40,100%,76%,0.26)", this.glow);
    this.disc(sunX, horizon - 4 * u, 8 * u, 8 * u, "hsl(44,100%,80%)");
    this.disc(sunX, horizon - 4 * u, 8 * u, 8 * u, "hsla(44,100%,80%,0.5)", this.glow);
    const eg = this.g.createLinearGradient(0, horizon, 0, deckY);
    eg.addColorStop(0, "hsl(202,50%,46%)"); eg.addColorStop(1, "hsl(210,44%,34%)");
    this.g.fillStyle = eg; this.g.fillRect(0, horizon, W, deckY - horizon);
    for (let y = horizon; y < deckY; y += 1.4 * u) { const wob = Math.sin(y * 0.5 + t * 2) * 3 * u; this.px(sunX - 4 * u + wob, y, 8 * u, 0.8 * u, "hsla(44,100%,82%,0.5)"); }
    for (let i = 0; i < 30; i++) { const wx2 = ((i * 91.7) % 1) * W, wy2 = horizon + 1.5 * u + ((i * 37.3) % 1) * (deckY - horizon - 2 * u); if (Math.sin(t * 2 + i) > 0.4) this.px(wx2, wy2, 2 * u, 0.7 * u, "hsla(0,0%,100%,0.4)"); }
    const bob = Math.sin(t * 0.8) * 1 * u;
    this.g.fillStyle = "hsl(30,34%,40%)"; this.g.fillRect(0, deckY + bob, W, H - deckY);
    for (let py = deckY + 4 * u; py < H; py += 5 * u) this.px(0, py + bob, W, 1, "hsl(28,30%,30%)");
    this.px(0, deckY + bob, W, 1.4 * u, "hsl(32,40%,52%)");
    const bw = deckY - 7 * u + bob;
    this.px(0, horizon + 3 * u + bob, W, 1 * u, "hsl(40,22%,84%)");
    for (let x = 7 * u; x < W; x += 15 * u) this.px(x, horizon + 3 * u + bob, 1 * u, bw - (horizon + 3 * u), "hsla(40,18%,82%,0.6)");
    this.px(0, bw, W, deckY + bob - bw + 1 * u, "hsl(206,16%,84%)");
    this.px(0, bw, W, 1.4 * u, "hsl(34,34%,60%)");
    this.px(0, bw + 2.4 * u, W, 1.4 * u, "hsl(210,58%,44%)");
    this.px(0, bw + 1.6 * u, W, 0.7 * u, "hsl(206,18%,93%)");
    for (const lx of [W * 0.17, W * 0.83]) {
      this.disc(lx, bw + 4 * u, 3 * u, 3 * u, "hsl(0,0%,96%)");
      this.px(lx - 0.7 * u, bw + 1 * u, 1.4 * u, 1.2 * u, "hsl(0,72%,52%)");
      this.px(lx - 0.7 * u, bw + 6 * u, 1.4 * u, 1.2 * u, "hsl(0,72%,52%)");
      this.px(lx - 3.4 * u, bw + 3.4 * u, 1.2 * u, 1.4 * u, "hsl(0,72%,52%)");
      this.px(lx + 2.2 * u, bw + 3.4 * u, 1.2 * u, 1.4 * u, "hsl(0,72%,52%)");
      this.disc(lx, bw + 4 * u, 1.4 * u, 1.4 * u, "hsl(206,16%,84%)");
    }
    for (const cxp of [W * 0.42, W * 0.58]) { this.px(cxp - 1.4 * u, bw - 1 * u, 2.8 * u, 1.4 * u, "hsl(220,8%,40%)"); }
    this.px(W * 0.5 - 0.8 * u, 2 * u, 1.6 * u, deckY - 4 * u + bob, "hsl(30,30%,30%)");
    this.stringLights(W, u, beat, 44, 3 * u, 8 * u);
    this.djBooth(W * 0.5, H * 0.97, u, t, beat, kick, {
      skin: "hsl(26,46%,62%)", jacket: "hsl(196,46%,50%)", jacketHi: "hsl(196,52%,62%)", jacketSh: "hsl(196,46%,34%)",
      hat: "hsl(40,70%,56%)", cap: true, glow: "hsl(40,92%,62%)", booth: "hsl(204,30%,40%)", boothHi: "hsl(204,36%,50%)", boothSh: "hsl(204,30%,26%)",
    });
    this.parkDancer(W * 0.22, H * 0.95, u, beat, kick, { shirt: "hsl(8,72%,60%)", shirtSh: "hsl(8,68%,44%)", legs: "hsl(204,40%,40%)", skin: "hsl(28,46%,64%)", hair: "hsl(30,42%,24%)" }, 0);
    this.parkDancer(W * 0.8, H * 0.96, u, beat, kick, { shirt: "hsl(48,84%,62%)", shirtSh: "hsl(44,78%,46%)", legs: "hsl(220,30%,36%)", skin: "hsl(26,44%,58%)", hair: "hsl(20,30%,16%)" }, 2.3);
  }

  private airportPlane(cx: number, cy: number, u: number, climb: number): void {
    const s = u, tilt = climb * 2.2 * s;
    const B = "hsl(210,16%,82%)", BH = "hsl(210,16%,92%)", BS = "hsl(210,14%,66%)";
    this.px(cx - 14 * s, cy - tilt * 0.4, 28 * s, 2.8 * s, B);
    this.px(cx + 9 * s, cy - tilt * 0.4, 5 * s, 2.8 * s, BH);
    this.px(cx - 14 * s, cy + 0.5 * s - tilt * 0.4, 28 * s, 0.9 * s, BS);
    this.px(cx - 13 * s, cy - 5 * s - tilt, 2.4 * s, 5.2 * s, B);
    this.px(cx - 13 * s, cy - 5 * s - tilt, 4.6 * s, 1.6 * s, "hsl(205,60%,52%)");
    this.px(cx - 13 * s, cy - 0.4 * s, 4 * s, 1.4 * s, B);
    this.px(cx - 4 * s, cy + 1.4 * s, 12 * s, 1.6 * s, BS);
    this.px(cx - 1 * s, cy + 2.4 * s, 4 * s, 2 * s, "hsl(210,14%,40%)");
    if (Math.floor(performance.now() / 400) % 2 === 0) { this.px(cx + 13 * s, cy - tilt * 0.4, 1 * s, 1 * s, "hsl(0,90%,60%)"); this.disc(cx + 13 * s, cy, 2 * s, 2 * s, "hsla(0,90%,60%,0.4)", this.glow); }
    if (climb < 0.05) for (let i = 0; i < 4; i++) this.px(cx - 16 * s - i * 2.4 * s, cy + 3 * s, 1.6 * s, 1 * s, `hsla(40,40%,80%,${0.3 - i * 0.06})`);
    else for (let i = 0; i < 5; i++) this.px(cx - 14 * s - i * 3 * s, cy + 2 * s + i * 1 * s, 2 * s, 1 * s, `hsla(0,0%,90%,${0.4 - i * 0.07})`);
  }

  // ── AIRPORT — departures lounge, a plane takes off on a loop ────────────────
  private renderAirport(u: number, t: number): void {
    const W = this.w, H = this.h;
    const { kick, beat } = this.pulse(t, 110);
    const floorY = Math.round(H * 0.72);
    this.g.fillStyle = "hsl(214,18%,22%)"; this.g.fillRect(0, 0, W, floorY);
    const wy = 8 * u, wh = 34 * u;
    const sg = this.g.createLinearGradient(0, wy, 0, wy + wh);
    sg.addColorStop(0, "hsl(232,40%,30%)"); sg.addColorStop(0.6, "hsl(212,46%,50%)"); sg.addColorStop(1, "hsl(28,60%,62%)");
    this.g.fillStyle = sg; this.g.fillRect(4 * u, wy, W - 8 * u, wh);
    this.px(4 * u, wy + wh - 6 * u, W - 8 * u, 6 * u, "hsl(220,14%,20%)");
    for (let x = 8 * u; x < W - 6 * u; x += 8 * u) this.px(x, wy + wh - 3 * u, 1.4 * u, 1.4 * u, ((x | 0) % 2) ? "hsl(40,95%,62%)" : "hsl(150,80%,55%)");
    this.g.save();
    this.g.beginPath(); this.g.rect(4 * u, wy, W - 8 * u, wh); this.g.clip();
    const runwayY = wy + wh - 8 * u;
    const T = 11, p = (t % T) / T;
    let plx, ply, climb;
    if (p < 0.62) { const f = p / 0.62; plx = 6 * u + (f * f) * (W * 0.72); ply = runwayY; climb = 0; }
    else { const f = (p - 0.62) / 0.38; plx = W * 0.72 + f * (W * 0.55); ply = runwayY - f * f * 36 * u; climb = f; }
    this.airportPlane(plx, ply, u, climb);
    this.airportPlane(((t * 3 + 40) % (W + 60 * u)) - 30 * u, wy + 5 * u, u * 0.6, 0.4);
    this.g.restore();
    for (let x = 4 * u; x < W; x += 18 * u) this.px(x, wy, 1.2 * u, wh, "hsl(214,16%,16%)");
    this.px(4 * u, wy + wh, W - 8 * u, 1.6 * u, "hsl(214,16%,16%)");
    this.px(W * 0.5 - 20 * u, 3 * u, 40 * u, 4 * u, "hsl(214,20%,10%)");
    for (let i = 0; i < 10; i++) { const flip = (Math.floor(beat * 2 + i) % 5) === 0; this.px(W * 0.5 - 18 * u + i * 3.6 * u, 3.8 * u, 3 * u, 2.4 * u, flip ? "hsl(45,90%,58%)" : "hsl(214,16%,22%)"); }
    this.g.fillStyle = "hsl(214,16%,16%)"; this.g.fillRect(0, floorY, W, H - floorY);
    this.px(0, floorY, W, 1.2 * u, "hsl(214,16%,26%)");
    this.disc(W * 0.5, floorY + 8 * u, 30 * u, 6 * u, "hsla(210,60%,60%,0.06)", this.glow);
    for (let i = 0; i < 4; i++) { const sx2 = W * 0.08 + i * 9 * u; this.px(sx2, floorY - 8 * u, 7 * u, 6 * u, "hsl(208,40%,42%)"); this.px(sx2, floorY - 11 * u, 7 * u, 3 * u, "hsl(208,40%,48%)"); this.px(sx2, floorY - 2 * u, 1 * u, 2 * u, "hsl(214,12%,20%)"); }
    this.parkDancer(W * 0.82, H * 0.95, u, beat, kick * 0.5, { shirt: "hsl(214,30%,52%)", shirtSh: "hsl(214,28%,38%)", legs: "hsl(220,18%,30%)", skin: "hsl(26,44%,60%)", hair: "hsl(24,30%,20%)" }, 0.5);
    this.px(W * 0.88, floorY + 2 * u, 4 * u, 7 * u, "hsl(0,0%,30%)");
    this.px(W * 0.895, floorY - 1 * u, 1 * u, 3 * u, "hsl(0,0%,46%)");
    this.commuter(W * 0.1, floorY + 13 * u, u, t, "hsl(208,22%,40%)", 0.8, "watch");
    this.commuter(W * 0.66, floorY + 13 * u, u, t, "hsl(30,18%,40%)", 2.2, "phone");
    this.djBooth(W * 0.42, H * 0.97, u, t, beat, kick, {
      skin: "hsl(26,46%,62%)", jacket: "hsl(208,42%,46%)", jacketHi: "hsl(208,48%,58%)", jacketSh: "hsl(208,42%,30%)",
      hair: "hsl(24,30%,18%)", glow: "hsl(196,90%,58%)", booth: "hsl(214,18%,22%)", boothHi: "hsl(214,24%,32%)", boothSh: "hsl(214,18%,12%)",
    });
  }

  // ── HOUSE PARTY — someone's living room, couch, red cups, floor lamp ────────
  private renderHouseParty(u: number, t: number): void {
    const W = this.w, H = this.h;
    const { kick, beat } = this.pulse(t, 118);
    const floorY = Math.round(H * 0.70);
    const wg = this.g.createLinearGradient(0, 0, 0, floorY);
    wg.addColorStop(0, "hsl(28,30%,32%)"); wg.addColorStop(1, "hsl(26,28%,24%)");
    this.g.fillStyle = wg; this.g.fillRect(0, 0, W, floorY);
    for (const [fx, fw, hue] of [[W * 0.12, 14, 320], [W * 0.3, 11, 190], [W * 0.86, 13, 45]]) {
      this.px(fx - fw / 2 * u, 8 * u, fw * u, 16 * u, "hsl(26,24%,16%)");
      this.px(fx - fw / 2 * u + 1.2 * u, 9.4 * u, fw * u - 2.4 * u, 13 * u, `hsl(${hue},45%,40%)`);
      this.px(fx - fw / 2 * u + 1.2 * u, 9.4 * u, fw * u - 2.4 * u, 4 * u, `hsl(${hue},55%,54%)`);
    }
    this.stringLights(W, u, beat, 40, 2 * u, 6 * u);
    const lampX = W * 0.93;
    this.px(lampX - 0.8 * u, floorY - 26 * u, 1.6 * u, 26 * u, "hsl(26,20%,24%)");
    this.px(lampX - 4 * u, floorY - 30 * u, 8 * u, 4.4 * u, "hsl(40,60%,54%)");
    this.disc(lampX, floorY - 22 * u, 14 * u, 18 * u, "hsla(38,95%,60%,0.12)", this.glow);
    this.g.fillStyle = "hsl(26,30%,28%)"; this.g.fillRect(0, floorY, W, H - floorY);
    for (let py = floorY + 4 * u; py < H; py += 5 * u) this.px(0, py, W, 1, "hsl(24,26%,20%)");
    this.px(0, floorY, W, 1, "hsl(28,34%,38%)");
    this.disc(W * 0.5, H * 0.9, 40 * u, 9 * u, "hsl(8,40%,34%)");
    this.disc(W * 0.5, H * 0.9, 30 * u, 6 * u, "hsl(20,44%,42%)");
    this.px(W * 0.05, floorY - 10 * u, 26 * u, 12 * u, "hsl(214,24%,38%)");
    this.px(W * 0.05, floorY - 16 * u, 26 * u, 7 * u, "hsl(214,26%,44%)");
    this.px(W * 0.05, floorY - 16 * u, 4 * u, 13 * u, "hsl(214,26%,48%)");
    this.px(W * 0.05 + 22 * u, floorY - 16 * u, 4 * u, 13 * u, "hsl(214,26%,34%)");
    const plx = W * 0.34;
    this.px(plx - 2.4 * u, floorY - 6 * u, 4.8 * u, 6 * u, "hsl(16,50%,44%)");
    this.disc(plx, floorY - 8 * u, 4 * u, 5 * u, "hsl(132,40%,40%)");
    this.disc(plx - 2 * u, floorY - 11 * u, 2.4 * u, 3 * u, "hsl(122,46%,46%)");
    this.barStaff(W * 0.5, H * 0.66, u * 0.9, t, {
      shirt: "hsl(190,45%,48%)", shirtHi: "hsl(190,52%,60%)", shirtSh: "hsl(190,45%,32%)",
      skin: "hsl(28,44%,62%)", hair: "hsl(30,40%,26%)", machine: "bottles",
      counter: "hsl(26,24%,28%)", counterHi: "hsl(28,30%,38%)", counterW: 26,
    });
    this.parkDancer(W * 0.46, H * 0.94, u, beat, kick, { shirt: "hsl(45,80%,58%)", shirtSh: "hsl(42,74%,44%)", legs: "hsl(220,28%,36%)", skin: "hsl(28,46%,64%)", hair: "hsl(30,42%,24%)" }, 0);
    this.parkDancer(W * 0.6, H * 0.95, u, beat, kick, { shirt: "hsl(320,55%,58%)", shirtSh: "hsl(320,50%,42%)", legs: "hsl(28,30%,32%)", skin: "hsl(26,44%,58%)", hair: "hsl(20,30%,16%)" }, Math.PI);
    this.px(W * 0.43, H * 0.86, 2 * u, 2.4 * u, "hsl(2,70%,52%)");
    this.px(W * 0.64, H * 0.87, 2 * u, 2.4 * u, "hsl(2,70%,52%)");
    this.djBooth(W * 0.8, H * 0.97, u * 0.92, t, beat, kick, {
      skin: "hsl(26,46%,62%)", jacket: "hsl(28,46%,46%)", jacketHi: "hsl(30,52%,58%)", jacketSh: "hsl(26,42%,30%)",
      hat: "hsl(8,55%,50%)", cap: true, glow: "hsl(40,90%,60%)", booth: "hsl(26,28%,26%)", boothHi: "hsl(28,34%,36%)", boothSh: "hsl(24,24%,16%)",
    });
  }

  // ── LAUNDROMAT — mint tiles, washers tumbling, bubbles ──────────────────────
  private renderLaundromat(u: number, t: number): void {
    const W = this.w, H = this.h;
    const { kick, beat } = this.pulse(t, 122);
    const floorY = Math.round(H * 0.72);
    this.g.fillStyle = "hsl(180,20%,70%)"; this.g.fillRect(0, 0, W, floorY);
    for (let y = 4 * u; y < floorY; y += 6 * u) this.px(0, y, W, 0.6 * u, "hsla(180,16%,52%,0.5)");
    for (let x = 0; x < W; x += 6 * u) this.px(x, 0, 0.6 * u, floorY, "hsla(180,16%,52%,0.5)");
    this.px(0, 0, W, 3 * u, "hsl(190,12%,82%)");
    for (let x = 8 * u; x < W; x += 26 * u) { this.px(x, 1 * u, 16 * u, 1.4 * u, "hsl(54,40%,94%)"); this.px(x, 1 * u, 16 * u, 1.4 * u, "hsla(54,80%,92%,0.5)", this.glow); }
    const n = 5, mw = W / n;
    for (let i = 0; i < n; i++) {
      const cx0 = i * mw + mw * 0.5, top = floorY - 26 * u, bw = mw * 0.78;
      this.px(cx0 - bw / 2, top, bw, 26 * u, "hsl(200,10%,90%)");
      this.px(cx0 - bw / 2, top, bw, 1.4 * u, "hsl(200,10%,98%)");
      this.px(cx0 - bw / 2, top + 1.6 * u, bw, 3 * u, "hsl(200,10%,80%)");
      for (let b = 0; b < 4; b++) this.px(cx0 - bw / 2 + 2 * u + b * 2.2 * u, top + 2.6 * u, 1 * u, 1 * u, ["hsl(0,75%,56%)", "hsl(150,70%,50%)", "hsl(45,90%,56%)", "hsl(205,80%,56%)"][b]);
      const dy = top + 14 * u, dr = bw * 0.32;
      this.disc(cx0, dy, dr + 1 * u, dr + 1 * u, "hsl(200,12%,70%)");
      this.disc(cx0, dy, dr, dr, "hsl(205,55%,30%)");
      const spin = t * (5 + i * 0.6);
      const ch = [0, 50, 150, 320, 200];
      for (let c = 0; c < 4; c++) { const a = spin + c * 1.57; this.px(cx0 + Math.cos(a) * dr * 0.5 - 1 * u, dy + Math.sin(a) * dr * 0.5 - 1 * u, 2.2 * u, 2.2 * u, `hsl(${(ch[i] + c * 40) % 360},65%,58%)`); }
      this.disc(cx0 - dr * 0.4, dy - dr * 0.4, dr * 0.3, dr * 0.3, "hsla(0,0%,100%,0.3)");
    }
    this.g.fillStyle = "hsl(200,8%,40%)"; this.g.fillRect(0, floorY, W, H - floorY);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 18; c++) if ((r + c) % 2 === 0) this.px(c * (W / 18), floorY + r * ((H - floorY) / 4), W / 18 + 0.5, (H - floorY) / 4 + 0.5, "hsl(200,8%,46%)");
    this.px(0, floorY, W, 1, "hsl(200,10%,56%)");
    for (let i = 0; i < 22; i++) { const bx = ((i * 61.7) % 1) * W + Math.sin(t + i) * 3 * u; const by = floorY - ((t * (10 + (i % 4) * 5) + i * 23) % (floorY * 0.9)); const br = (1 + (i % 3)) * u; this.disc(bx, by, br, br, "hsla(190,60%,90%,0.35)"); this.px(bx - br * 0.4, by - br * 0.4, 0.8 * u, 0.8 * u, "hsla(0,0%,100%,0.6)"); }
    this.parkLounger(W * 0.1, H * 0.93, u, t, { shirt: "hsl(40,60%,56%)", shirtSh: "hsl(40,56%,42%)", skin: "hsl(28,44%,62%)", hair: "hsl(24,30%,22%)", legs: "hsl(220,20%,32%)" }, 0.7);
    this.px(W * 0.16, floorY + 6 * u, 8 * u, 5 * u, "hsl(20,60%,52%)");
    this.px(W * 0.16, floorY + 5 * u, 8 * u, 1.4 * u, "hsl(0,0%,92%)");
    this.djBooth(W * 0.6, H * 0.96, u, t, beat, kick, {
      skin: "hsl(26,44%,60%)", jacket: "hsl(190,46%,48%)", jacketHi: "hsl(190,52%,60%)", jacketSh: "hsl(190,46%,32%)",
      hat: "hsl(0,0%,96%)", glow: "hsl(186,90%,58%)", booth: "hsl(200,12%,84%)", boothHi: "hsl(200,12%,94%)", boothSh: "hsl(200,12%,66%)",
    });
  }

  // ── AQUARIUM — the tank is the back wall, fish, jellyfish, a bored shark ─────
  private renderAquarium(u: number, t: number): void {
    const W = this.w, H = this.h;
    const { kick, beat } = this.pulse(t, 92);
    const floorY = Math.round(H * 0.80);
    const wg = this.g.createLinearGradient(0, 0, 0, floorY);
    wg.addColorStop(0, "hsl(205,60%,30%)"); wg.addColorStop(1, "hsl(212,64%,16%)");
    this.g.fillStyle = wg; this.g.fillRect(0, 0, W, floorY);
    for (let i = 0; i < 6; i++) { const cx0 = ((i / 6) * W + t * 6) % W; this.px(cx0, 0, 8 * u, floorY * 0.7, "hsla(190,80%,70%,0.05)"); }
    this.disc(W * 0.5, 0, W * 0.5, 18 * u, "hsla(190,90%,80%,0.06)", this.glow);
    for (let k = 0; k < 7; k++) { const kx = (k + 0.5) * (W / 7); for (let seg = 0; seg < 8; seg++) { const sy = floorY - seg * 3 * u; const off = Math.sin(t * 1.2 + k + seg * 0.5) * 2 * u; this.px(kx + off - 1 * u, sy - 3 * u, 2.2 * u, 3.4 * u, `hsl(140,50%,${28 + seg}%)`); } }
    const fishHues = [30, 320, 150, 45, 190];
    for (let i = 0; i < 10; i++) { const dir = (i % 2) ? 1 : -1; const fx = (((t * (8 + (i % 4) * 4) * dir) + i * 47) % (W + 20 * u) + W + 20 * u) % (W + 20 * u) - 10 * u; const fy = 8 * u + ((i * 37) % 1) * (floorY - 16 * u); const fs = 1.4 * u; this.disc(fx, fy, 2.4 * fs, 1.4 * fs, `hsl(${fishHues[i % 5]},65%,58%)`); this.px(fx + dir * 2.4 * fs, fy - 1 * fs, dir * 1.6 * fs, 2 * fs, `hsl(${fishHues[i % 5]},65%,50%)`); this.px(fx - dir * 1 * fs, fy - 0.5 * fs, 0.7 * fs, 0.7 * fs, "hsl(0,0%,10%)"); }
    for (let j = 0; j < 3; j++) { const jx = W * (0.2 + 0.3 * j) + Math.sin(t * 0.6 + j) * 6 * u; const jy = 14 * u + ((t * 4 + j * 30) % (floorY * 0.6)); this.disc(jx, jy, 3 * u, 2.4 * u, "hsla(300,80%,72%,0.7)"); this.disc(jx, jy, 4.4 * u, 3.4 * u, "hsla(300,85%,72%,0.3)", this.glow); for (let tt = 0; tt < 4; tt++) this.px(jx - 2 * u + tt * 1.4 * u, jy + 2 * u + Math.sin(t * 3 + tt) * 1 * u, 0.8 * u, 4 * u, "hsla(300,75%,78%,0.55)"); }
    const shx = ((t * 7) % (W + 60 * u)) - 30 * u, shy = floorY * 0.42;
    this.disc(shx, shy, 14 * u, 4 * u, "hsl(210,18%,46%)"); this.px(shx - 16 * u, shy - 1 * u, 5 * u, 5 * u, "hsl(210,18%,42%)");
    this.px(shx - 2 * u, shy - 5 * u, 4 * u, 4 * u, "hsl(210,18%,50%)");
    this.px(shx + 9 * u, shy - 0.5 * u, 0.8 * u, 0.8 * u, "hsl(0,0%,8%)");
    this.px(shx + 6 * u, shy + 2.4 * u, 6 * u, 0.8 * u, "hsl(210,16%,30%)");
    for (let i = 0; i < 26; i++) { const bx = ((i * 71.3) % 1) * W; const by = floorY - ((t * (12 + (i % 4) * 6) + i * 19) % floorY); const br = (0.8 + (i % 3) * 0.6) * u; this.disc(bx, by, br, br, "hsla(190,70%,88%,0.4)"); }
    this.px(0, floorY - 1 * u, W, 2 * u, "hsl(206,24%,12%)");
    this.g.fillStyle = "hsl(210,16%,9%)"; this.g.fillRect(0, floorY, W, H - floorY);
    this.disc(W * 0.5, floorY + 6 * u, 34 * u, 6 * u, "hsla(195,80%,60%,0.10)", this.glow);
    for (const sx of [W * 0.12, W * 0.86]) { this.px(sx - 3 * u, floorY - 1 * u, 6 * u, H - floorY + 1 * u, "hsl(210,20%,8%)"); this.disc(sx, floorY - 3 * u, 2.4 * u, 2.4 * u, "hsl(210,20%,8%)"); }
    this.djBooth(W * 0.5, H * 0.99, u, t, beat, kick, {
      skin: "hsl(26,42%,54%)", jacket: "hsl(205,40%,40%)", jacketHi: "hsl(205,46%,52%)", jacketSh: "hsl(205,40%,26%)",
      hair: "hsl(210,20%,16%)", glow: "hsl(190,90%,60%)", booth: "hsl(206,24%,18%)", boothHi: "hsl(206,30%,28%)", boothSh: "hsl(206,24%,10%)",
    });
  }

  private floater(cx: number, cy: number, u: number, t: number, accent: string, ph: number): void {
    const s = u, bob = Math.sin(t * 1.2 + ph) * 3 * s, y = cy + bob;
    const a1 = Math.sin(t * 3 + ph), a2 = Math.cos(t * 3 + ph);
    const SUIT = "hsl(210,12%,84%)", SUITS = "hsl(210,12%,64%)";
    this.limb(cx - 2.5 * s, y - 2 * s, cx - 6 * s, y - 4 * s + a1 * 2 * s, 1.6 * s, SUIT);
    this.limb(cx + 2.5 * s, y - 2 * s, cx + 6 * s, y - 4 * s - a1 * 2 * s, 1.6 * s, SUIT);
    this.limb(cx - 2 * s, y + 4 * s, cx - 4 * s, y + 8 * s + a2 * 2 * s, 1.8 * s, SUIT);
    this.limb(cx + 2 * s, y + 4 * s, cx + 4 * s, y + 8 * s - a2 * 2 * s, 1.8 * s, SUIT);
    this.block(cx - 3 * s, y - 4 * s, 6 * s, 9 * s, SUIT, "hsl(210,12%,94%)", SUITS);
    this.px(cx - 3 * s, y - 1 * s, 6 * s, 2 * s, accent);
    this.disc(cx, y - 6 * s, 3 * s, 3 * s, "hsl(205,40%,26%)");
    this.disc(cx, y - 6 * s, 3.4 * s, 3.4 * s, "hsla(195,80%,70%,0.2)", this.glow);
    this.px(cx - 1 * s, y - 6.8 * s, 1.4 * s, 1.2 * s, "hsla(0,0%,100%,0.45)");
  }

  private alienCameo(t: number): void {
    const W = this.w, H = this.h, u = H / 100;
    const period = 150;
    const local = t % period, dur = 9;
    if (local > dur) return;
    const p = local / dur;
    const cx = -20 * u + p * (W + 40 * u);
    const cy = H * 0.2 + Math.sin(p * 6) * 5 * u;
    this.disc(cx, cy + 8 * u, 7 * u, 9 * u, "hsla(140,90%,60%,0.12)", this.glow);
    this.disc(cx, cy + 1.6 * u, 11 * u, 3 * u, "hsl(220,10%,40%)");
    this.disc(cx, cy + 1 * u, 9 * u, 2.4 * u, "hsl(220,12%,56%)");
    for (let i = -3; i <= 3; i++) { const on = (Math.floor(t * 4 + i) % 2) === 0; this.px(cx + i * 2.6 * u - 0.5 * u, cy + 2 * u, 1 * u, 1 * u, on ? "hsl(140,90%,60%)" : "hsl(320,90%,64%)"); }
    this.disc(cx, cy - 1 * u, 4.4 * u, 4 * u, "hsla(150,70%,70%,0.4)");
    this.disc(cx, cy - 1 * u, 4.4 * u, 4 * u, "hsla(150,80%,72%,0.18)", this.glow);
    this.disc(cx, cy + 0.6 * u, 2.4 * u, 2.6 * u, "hsl(120,55%,52%)");
    this.px(cx - 1.6 * u, cy - 3 * u, 0.8 * u, 2.2 * u, "hsl(120,50%,46%)");
    this.px(cx + 0.8 * u, cy - 3 * u, 0.8 * u, 2.2 * u, "hsl(120,50%,46%)");
    this.px(cx - 1.6 * u, cy - 3.4 * u, 0.8 * u, 0.8 * u, "hsl(140,90%,64%)");
    this.px(cx + 0.8 * u, cy - 3.4 * u, 0.8 * u, 0.8 * u, "hsl(140,90%,64%)");
    this.px(cx - 1 * u, cy + 0.2 * u, 1 * u, 1.4 * u, "hsl(0,0%,8%)");
    this.px(cx + 0.4 * u, cy + 0.2 * u, 1 * u, 1.4 * u, "hsl(0,0%,8%)");
  }

  // ── SPACE STATION — zero-G, porthole Earth, floating astronauts, a UFO ──────
  private renderSpace(u: number, t: number): void {
    const W = this.w, H = this.h;
    const { kick, energy, beat } = this.pulse(t, 128);
    const rg = this.g.createLinearGradient(0, 0, 0, H);
    rg.addColorStop(0, "hsl(258,30%,12%)"); rg.addColorStop(1, "hsl(260,28%,7%)");
    this.g.fillStyle = rg; this.g.fillRect(0, 0, W, H);
    const px0 = W * 0.76, py0 = H * 0.42, pr = 26 * u;
    this.disc(px0, py0, pr + 2 * u, pr + 2 * u, "hsl(220,16%,20%)");
    this.disc(px0, py0, pr, pr, "hsl(240,50%,6%)");
    for (let i = 0; i < 40; i++) { const a = (i * 53.7) % (Math.PI * 2), rr = ((i * 31.3) % 1) * pr; const sx = px0 + Math.cos(a) * rr, sy = py0 + Math.sin(a) * rr; if (Math.hypot(sx - px0, sy - py0) < pr) this.px(sx, sy, 1, 1, `hsla(220,30%,92%,${0.4 + 0.5 * Math.abs(Math.sin(t + i))})`); }
    this.disc(px0 - 6 * u, py0 + 6 * u, 11 * u, 11 * u, "hsl(210,70%,46%)");
    this.disc(px0 - 6 * u, py0 + 6 * u, 12 * u, 12 * u, "hsla(200,90%,60%,0.2)", this.glow);
    for (const [ox, oy, r] of [[-9, 3, 3], [-3, 9, 2.6], [-7, 10, 2]]) this.disc(px0 - 6 * u + ox * u, py0 + 6 * u + oy * u, r * u, r * u * 0.8, "hsl(130,46%,44%)");
    this.px(px0 - 1 * u, py0 - 1 * u, 1.2 * u, 1.2 * u, "hsl(0,0%,100%)");
    this.px(0, H * 0.16, W * 0.3, H * 0.5, "hsl(255,16%,16%)");
    this.px(0, H * 0.16, W * 0.3, 1.4 * u, "hsl(255,18%,26%)");
    for (let r = 0; r < 5; r++) for (let c = 0; c < 6; c++) { const lit = ((Math.floor(beat * 2) + r + c) % 4) === 0; this.px(3 * u + c * 4 * u, H * 0.2 + r * 5 * u, 2.4 * u, 2.4 * u, lit ? ["hsl(0,75%,55%)", "hsl(150,70%,50%)", "hsl(45,90%,56%)", "hsl(205,80%,56%)"][(r + c) % 4] : "hsl(255,12%,22%)"); }
    this.px(2 * u, H * 0.5, W * 0.26, 8 * u, "hsl(200,50%,10%)");
    for (let i = 0; i < 10; i++) { const wh = (1 + Math.abs(Math.sin(t * 4 + i)) * 4) * u; this.px(3 * u + i * 2.4 * u, H * 0.5 + 6 * u - wh, 1.4 * u, wh, "hsl(190,80%,56%)"); }
    for (let j = 0; j < 2; j++) { const a = Math.PI / 2 + Math.sin(t * 0.9 + j * 2) * 0.7; this.limb(W * 0.45, 2 * u, W * 0.45 + Math.cos(a) * H, 2 * u + Math.sin(a) * H, 1 * u, `hsla(275,90%,66%,${0.18 + 0.12 * energy})`, this.glow); }
    const vy = H * 0.7 + Math.sin(t * 1.1) * 4 * u, vx = W * 0.4 + Math.cos(t * 0.5) * 5 * u;
    this.disc(vx, vy, 3 * u, 3 * u, "hsl(255,10%,12%)"); this.disc(vx, vy, 1 * u, 1 * u, "hsl(45,85%,56%)");
    const dx2 = W * 0.55 + Math.sin(t * 0.7) * 6 * u, dy2 = H * 0.24 + Math.cos(t * 0.9) * 4 * u;
    this.disc(dx2, dy2, 2.2 * u, 1.8 * u, "hsl(48,95%,60%)"); this.px(dx2 + 1.8 * u, dy2 - 0.6 * u, 1.6 * u, 1.2 * u, "hsl(40,90%,52%)"); this.px(dx2 - 0.4 * u, dy2 - 0.6 * u, 0.7 * u, 0.7 * u, "hsl(0,0%,10%)");
    this.floater(W * 0.2, H * 0.45, u, t, "hsl(8,75%,56%)", 0);
    this.floater(W * 0.36, H * 0.66, u, t, "hsl(190,70%,52%)", 2.1);
    this.floater(W * 0.5, H * 0.5, u, t, "hsl(140,60%,50%)", 4.0);
    const bobY = Math.sin(t * 0.9) * 2 * u;
    this.djBooth(W * 0.5, H * 0.99 + bobY, u, t, beat, kick, {
      skin: "hsl(26,42%,54%)", jacket: "hsl(270,40%,44%)", jacketHi: "hsl(270,46%,56%)", jacketSh: "hsl(270,40%,28%)",
      hat: "hsl(200,30%,40%)", glow: "hsl(275,90%,64%)", booth: "hsl(255,18%,20%)", boothHi: "hsl(255,24%,30%)", boothSh: "hsl(255,18%,10%)",
    });
    this.alienCameo(t);
  }

  private sevenSeg(x: number, y: number, w: number, h: number, ch: string, color: string): void {
    const segs = ({
      "0": [1, 1, 1, 0, 1, 1, 1], "1": [0, 0, 1, 0, 0, 1, 0], "2": [1, 0, 1, 1, 1, 0, 1], "3": [1, 0, 1, 1, 0, 1, 1],
      "4": [0, 1, 1, 1, 0, 1, 0], "5": [1, 1, 0, 1, 0, 1, 1], "6": [1, 1, 0, 1, 1, 1, 1], "7": [1, 0, 1, 0, 0, 1, 0],
      "8": [1, 1, 1, 1, 1, 1, 1], "9": [1, 1, 1, 1, 0, 1, 1],
    } as Record<string, number[]>)[ch] || [0, 0, 0, 0, 0, 0, 0];
    const th = Math.max(1, h * 0.16), midY = y + h / 2;
    const on = () => color, off = "hsl(150,30%,16%)";
    this.px(x + th, y, w - 2 * th, th, segs[0] ? on() : off);
    this.px(x, y + th, th, h / 2 - 1.5 * th, segs[1] ? on() : off);
    this.px(x + w - th, y + th, th, h / 2 - 1.5 * th, segs[2] ? on() : off);
    this.px(x + th, midY - th / 2, w - 2 * th, th, segs[3] ? on() : off);
    this.px(x, midY + th / 2, th, h / 2 - 1.5 * th, segs[4] ? on() : off);
    this.px(x + w - th, midY + th / 2, th, h / 2 - 1.5 * th, segs[5] ? on() : off);
    this.px(x + th, y + h - th, w - 2 * th, th, segs[6] ? on() : off);
  }

  private dmvClerk(cx: number, ledgeY: number, u: number, t: number): void {
    const s = u;
    const shoulderY = ledgeY - 9 * s, headR = 2.5 * s, hcy = shoulderY - headR - 1 * s;
    this.block(cx - 4 * s, shoulderY, 8 * s, 9 * s, "hsl(205,26%,46%)", "hsl(205,32%,56%)", "hsl(205,26%,32%)");
    this.px(cx - 1 * s, shoulderY, 2 * s, 4 * s, "hsl(205,20%,38%)");
    this.px(cx - 4 * s, shoulderY + 5 * s, 8 * s, 2 * s, "hsl(0,0%,90%)");
    const stamp = Math.max(0, Math.sin(t * 1.6)) * 2 * s;
    this.limb(cx + 3 * s, shoulderY + 2 * s, cx + 5 * s, ledgeY - 2 * s - stamp, 1.5 * s, "hsl(205,26%,46%)");
    this.px(cx + 4.2 * s, ledgeY - 3 * s - stamp, 2 * s, 1.6 * s, "hsl(26,42%,60%)");
    this.block(cx - headR, hcy - headR, headR * 2, headR * 2, "hsl(28,42%,62%)", null, "hsl(28,38%,48%)");
    this.px(cx - headR, hcy - headR - 1 * s, headR * 2, 1.8 * s, "hsl(28,30%,28%)");
    this.px(cx - headR + 0.4 * s, hcy - headR - 0.2 * s, headR * 2 - 0.8 * s, 0.8 * s, "hsl(28,26%,22%)");
    const blink = (t % 4) < 0.18;
    this.px(cx - 1.4 * s, hcy - 0.2 * s, 1 * s, blink ? 0.4 * s : 0.9 * s, "hsl(0,0%,12%)");
    this.px(cx + 0.5 * s, hcy - 0.2 * s, 1 * s, blink ? 0.4 * s : 0.9 * s, "hsl(0,0%,12%)");
    this.px(cx - 0.4 * s, shoulderY + 0.5 * s, 0.8 * s, 3 * s, "hsl(45,40%,40%)");
    this.px(cx - 1 * s, shoulderY + 3.5 * s, 2 * s, 1.4 * s, "hsl(0,0%,86%)");
  }

  private dmvPerson(cx: number, feetY: number, u: number, t: number, beat: number, hue: number, idx: number, annoyed: boolean): void {
    const s = u;
    const shoulderY = feetY - 14 * s;
    const headR = 2.3 * s, hcy = shoulderY - headR - 1 * s;
    const tap = annoyed ? Math.sin(t * 3 + idx) * 0.3 * s : Math.abs(Math.sin(beat * Math.PI * 2)) * 1 * s;
    this.px(cx - 2.2 * s, feetY - 6 * s, 2 * s, 6 * s, "hsl(220,14%,28%)");
    this.px(cx + 0.2 * s, feetY - 6 * s, 2 * s, 6 * s, "hsl(220,14%,28%)");
    this.block(cx - 3.2 * s, shoulderY - tap, 6.4 * s, 9 * s, `hsl(${hue},32%,46%)`, null, `hsl(${hue},32%,32%)`);
    if (annoyed) {
      this.px(cx - 3.4 * s, shoulderY + 2 * s - tap, 6.8 * s, 1.8 * s, `hsl(${hue},32%,40%)`);
    } else {
      this.limb(cx + 2.4 * s, shoulderY + 2 * s, cx + 3 * s, shoulderY + 5 * s, 1.4 * s, `hsl(${hue},32%,46%)`);
      this.px(cx + 2.2 * s, shoulderY + 4 * s, 2 * s, 2.6 * s, "hsl(210,30%,20%)");
      this.px(cx + 2.4 * s, shoulderY + 4.4 * s, 1.6 * s, 1.4 * s, "hsl(200,70%,70%)");
    }
    const droop = annoyed ? 0.6 * s : 0;
    this.block(cx - headR, hcy - headR + droop - tap, headR * 2, headR * 2, "hsl(28,42%,60%)", null, "hsl(28,38%,46%)");
    this.px(cx - headR, hcy - headR - 1 * s + droop - tap, headR * 2, 1.8 * s, ["hsl(24,30%,22%)", "hsl(0,0%,72%)", "hsl(20,30%,16%)", "hsl(30,36%,30%)"][idx % 4]);
    if (annoyed && (t * 0.7 + idx) % 5 < 0.6) this.px(cx + headR + 0.5 * s, hcy - 1 * s, 1 * s, 1 * s, "hsla(0,0%,100%,0.4)", this.glow);
  }

  // ── THE DMV — fluorescent purgatory, a queue, a deadpan clerk, glorious DJ ──
  private renderDMV(u: number, t: number): void {
    const W = this.w, H = this.h;
    const { kick, beat } = this.pulse(t, 96);
    const floorY = Math.round(H * 0.72);
    this.g.fillStyle = "hsl(48,14%,70%)"; this.g.fillRect(0, 0, W, floorY);
    this.px(0, floorY - 8 * u, W, 1.2 * u, "hsl(150,18%,42%)");
    this.px(0, 0, W, 3 * u, "hsl(48,10%,82%)");
    for (let x = 8 * u; x < W; x += 26 * u) { this.px(x, 1 * u, 16 * u, 1.4 * u, "hsl(54,30%,92%)"); this.px(x, 1 * u, 16 * u, 1.4 * u, "hsla(54,60%,90%,0.4)", this.glow); }
    const winX = W * 0.62, winW = W * 0.3, winTop = floorY - 22 * u;
    this.px(winX - 2 * u, winTop - 2 * u, winW + 4 * u, 24 * u, "hsl(40,14%,44%)");
    this.px(winX, winTop, winW, 13 * u, "hsl(202,34%,66%)");
    this.px(winX, winTop, winW, 1.4 * u, "hsla(0,0%,100%,0.4)");
    this.px(winX + winW * 0.5 - 0.6 * u, winTop, 1.2 * u, 13 * u, "hsl(40,14%,40%)");
    this.px(winX + winW * 0.5 - 3 * u, winTop + 9 * u, 6 * u, 1.6 * u, "hsl(40,12%,30%)");
    this.px(winX - 2 * u, winTop + 13 * u, winW + 4 * u, 3 * u, "hsl(40,18%,52%)");
    this.px(winX - 2 * u, winTop + 13 * u, winW + 4 * u, 0.8 * u, "hsl(40,22%,62%)");
    this.px(winX + winW - 13 * u, winTop - 6 * u, 13 * u, 4.4 * u, "hsl(150,24%,16%)");
    this.px(winX + winW - 11.5 * u, winTop - 5 * u, 6 * u, 2.4 * u, "hsl(150,70%,52%)");
    this.px(winX + winW - 4.5 * u, winTop - 5.2 * u, 3 * u, 3 * u, "hsl(150,80%,56%)");
    this.px(winX + winW - 4.5 * u, winTop - 5.2 * u, 3 * u, 3 * u, "hsla(150,90%,60%,0.4)", this.glow);
    this.dmvClerk(winX + winW * 0.5, winTop + 13 * u, u, t);
    const num = 5 + (Math.floor(t / 8) % 90);
    this.px(W * 0.05, 5 * u, 33 * u, 12 * u, "hsl(150,22%,12%)");
    this.px(W * 0.05, 5 * u, 33 * u, 1.2 * u, "hsl(150,30%,22%)");
    for (let i = 0; i < 7; i++) this.px(W * 0.05 + 2 * u + i * 2.2 * u, 6.6 * u, 1.6 * u, 1.6 * u, "hsl(45,75%,60%)");
    this.px(W * 0.05 + 2 * u, 11 * u, 4.5 * u, 4 * u, "hsl(150,40%,22%)");
    const digits = String(num).split("");
    for (let d = 0; d < digits.length; d++) {
      const dx = W * 0.05 + 9 * u + d * 7 * u;
      this.sevenSeg(dx, 10.5 * u, 5.4 * u, 5 * u, digits[d], "hsl(150,85%,52%)");
      this.px(dx, 10.5 * u, 5.4 * u, 5 * u, "hsla(150,90%,58%,0.22)", this.glow);
    }
    this.px(W * 0.42, floorY - 12 * u, 4 * u, 12 * u, "hsl(0,50%,46%)");
    this.px(W * 0.42, floorY - 10 * u, 4 * u, 2 * u, "hsl(0,0%,92%)");
    this.g.fillStyle = "hsl(48,10%,56%)"; this.g.fillRect(0, floorY, W, H - floorY);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 20; c++) if ((r + c) % 2 === 0) this.px(c * (W / 20), floorY + r * ((H - floorY) / 4), W / 20 + 0.5, (H - floorY) / 4 + 0.5, "hsl(48,10%,60%)");
    this.px(0, floorY, W, 1, "hsl(48,12%,64%)");
    for (let i = 0; i < 5; i++) { const rx = W * 0.18 + i * 7 * u; this.px(rx - 0.5 * u, floorY - 1 * u, 1 * u, 7 * u, "hsl(220,8%,32%)"); this.px(rx - 0.7 * u, floorY - 1 * u, 1.4 * u, 1.2 * u, "hsl(45,60%,54%)"); if (i > 0) this.px(rx - 7 * u, floorY + 1 * u, 7 * u, 0.6 * u, "hsla(0,70%,50%,0.6)"); }
    const advance = ((t % 8) / 8);
    const qHues = [205, 0, 45, 280, 150];
    for (let i = 4; i >= 0; i--) {
      const step = i - advance;
      const slot = W * 0.2 + step * 6.5 * u;
      const depth = 1 - step * 0.08;
      const fy = floorY + 16 * u - step * 1.6 * u;
      const annoyed = i !== 0;
      this.dmvPerson(slot, fy, u * depth, t, beat, qHues[i], i, annoyed);
    }
    const chairHues = [205, 150, 45];
    for (let i = 0; i < 3; i++) {
      const cx0 = W * 0.08 + i * 8 * u;
      this.px(cx0 - 3 * u, floorY - 5 * u, 6 * u, 5 * u, "hsl(205,30%,44%)");
      this.px(cx0 - 3 * u, floorY - 9 * u, 6 * u, 4 * u, "hsl(205,30%,50%)");
      const droop = 0.6 + Math.sin(t * 0.6 + i) * 0.2;
      this.block(cx0 - 2.6 * u, floorY - 14 * u, 5.2 * u, 9 * u, `hsl(${chairHues[i]},35%,46%)`, null, `hsl(${chairHues[i]},35%,32%)`);
      this.block(cx0 - 2 * u, floorY - 18 * u + droop * u, 4 * u, 4 * u, "hsl(28,42%,60%)", null, "hsl(28,38%,46%)");
      this.px(cx0 - 2 * u, floorY - 19 * u + droop * u, 4 * u, 1.6 * u, "hsl(24,30%,22%)");
      this.px(cx0 + 1.4 * u, floorY - 8 * u, 1.6 * u, 2 * u, "hsl(0,0%,94%)");
    }
    this.djBooth(W * 0.34, H * 0.97, u, t, beat, kick, {
      skin: "hsl(26,44%,60%)", jacket: "hsl(150,36%,42%)", jacketHi: "hsl(150,42%,54%)", jacketSh: "hsl(150,36%,28%)",
      hat: "hsl(0,60%,48%)", glow: "hsl(96,80%,55%)", booth: "hsl(40,16%,48%)", boothHi: "hsl(40,22%,58%)", boothSh: "hsl(40,16%,32%)",
    });
  }

  private peasant(cx: number, feetY: number, u: number, beat: number, kick: number, c: { tunic: string; tunicSh: string; skin: string; hair: string }, ph: number): void {
    const s = u;
    const bp = beat * Math.PI * 2 + ph;
    const bob = Math.abs(Math.sin(bp)) * (1 + kick) * 1.3 * s;
    const sway = Math.sin(bp) * 1.6 * s;
    const hipY = feetY - bob;
    const shoulderY = hipY - 10 * s;
    const headR = 2.3 * s, hcy = shoulderY - headR - 1 * s;
    const step = Math.sin(bp) * 1.8 * s;
    this.limb(cx - 0.5 * s, hipY - 1 * s, cx - 2.2 * s - step, feetY, 1.8 * s, "hsl(30,24%,34%)");
    this.limb(cx + 0.5 * s, hipY - 1 * s, cx + 2.2 * s + step, feetY, 1.8 * s, "hsl(30,24%,34%)");
    this.block(cx - 3.2 * s + sway * 0.3, shoulderY, 6.4 * s, 9 * s, c.tunic, "hsla(0,0%,100%,0.12)", c.tunicSh);
    this.px(cx - 3.2 * s + sway * 0.3, shoulderY + 5 * s, 6.4 * s, 1.2 * s, "hsl(28,40%,28%)");
    this.block(cx - headR + sway * 0.5, hcy - headR, headR * 2, headR * 2, c.skin, null, "hsl(26,40%,48%)");
    this.px(cx - headR + sway * 0.5, hcy - headR - 1 * s, headR * 2, 1.8 * s, c.hair);
    const lift = (3 + kick * 1.5) * s;
    this.limb(cx + 2.6 * s, shoulderY + 1 * s, cx + 4 * s + sway, shoulderY - lift, 1.5 * s, c.tunic);
    this.px(cx + 3.2 * s + sway, shoulderY - lift - 1.6 * s, 2.2 * s, 2.4 * s, "hsl(30,30%,52%)");
    this.px(cx + 3.2 * s + sway, shoulderY - lift - 2 * s, 2.2 * s, 0.8 * s, "hsl(36,60%,76%)");
    this.limb(cx - 2.6 * s, shoulderY + 1 * s, cx - 3.6 * s + sway, shoulderY + 4 * s, 1.5 * s, c.tunic);
  }

  private knight(cx: number, feetY: number, u: number, beat: number): void {
    const s = u;
    const nod = Math.abs(Math.sin(beat * Math.PI * 2)) * 0.8 * s;
    const shoulderY = feetY - 14 * s, headR = 2.4 * s, hcy = shoulderY - headR - 1 * s - nod;
    const STEEL = "hsl(220,8%,62%)", STEELS = "hsl(220,8%,44%)", STEELH = "hsl(220,10%,76%)";
    this.px(cx - 2.4 * s, feetY - 6 * s, 2.2 * s, 6 * s, STEELS); this.px(cx + 0.2 * s, feetY - 6 * s, 2.2 * s, 6 * s, STEELS);
    this.block(cx - 3.6 * s, shoulderY, 7.2 * s, 10 * s, STEEL, STEELH, STEELS);
    this.px(cx - 1.6 * s, shoulderY, 3.2 * s, 10 * s, "hsl(0,55%,44%)");
    this.px(cx - 0.8 * s, shoulderY + 3 * s, 1.6 * s, 1.6 * s, "hsl(45,70%,56%)");
    this.px(cx - 4.4 * s, shoulderY, 1.8 * s, 3 * s, STEELH); this.px(cx + 2.6 * s, shoulderY, 1.8 * s, 3 * s, STEELH);
    this.block(cx - headR, hcy - headR, headR * 2, headR * 2, STEEL, STEELH, STEELS);
    this.px(cx - headR, hcy - 0.4 * s, headR * 2, 1 * s, "hsl(220,10%,18%)");
    this.px(cx - 0.6 * s, hcy - headR - 1.6 * s, 1.2 * s, 2 * s, "hsl(0,60%,50%)");
    this.px(cx + 4.4 * s, feetY - 22 * s, 1 * s, 22 * s, "hsl(28,30%,30%)");
    this.px(cx + 4 * s, feetY - 24 * s, 1.8 * s, 2.4 * s, STEELH);
  }

  private king(cx: number, feetY: number, u: number, beat: number, kick: number): void {
    const s = u;
    const bob = Math.abs(Math.sin(beat * Math.PI * 2)) * (0.6 + kick) * 1 * s;
    this.px(cx - 6 * s, feetY - 22 * s, 12 * s, 22 * s, "hsl(28,34%,30%)");
    this.px(cx - 6 * s, feetY - 22 * s, 12 * s, 2 * s, "hsl(36,40%,42%)");
    for (const fx of [cx - 6 * s, cx + 4 * s]) { this.px(fx, feetY - 26 * s, 2 * s, 5 * s, "hsl(30,34%,34%)"); this.disc(fx + 1 * s, feetY - 26 * s, 1.4 * s, 1.4 * s, "hsl(45,75%,54%)"); }
    this.px(cx - 7 * s, feetY - 4 * s, 14 * s, 4 * s, "hsl(28,32%,26%)");
    const shoulderY = feetY - 16 * s - bob, headR = 2.6 * s, hcy = shoulderY - headR - 1 * s;
    this.block(cx - 4.4 * s, shoulderY, 8.8 * s, 13 * s, "hsl(280,38%,42%)", "hsl(280,44%,54%)", "hsl(280,38%,28%)");
    this.px(cx - 4.4 * s, shoulderY, 2 * s, 13 * s, "hsl(0,0%,94%)");
    for (let k = 0; k < 4; k++) this.px(cx - 4 * s, shoulderY + 1.5 * s + k * 3 * s, 1.2 * s, 1.2 * s, "hsl(220,10%,20%)");
    this.block(cx - headR, hcy - headR, headR * 2, headR * 2, "hsl(28,44%,64%)", null, "hsl(28,40%,50%)");
    this.px(cx - headR, hcy + 1 * s, headR * 2, 2.4 * s, "hsl(0,0%,92%)");
    this.px(cx - headR - 0.4 * s, hcy - headR - 2 * s, headR * 2 + 0.8 * s, 2 * s, "hsl(45,80%,52%)");
    for (let k = 0; k < 4; k++) this.px(cx - headR + k * (headR * 2 / 3) - 0.4 * s, hcy - headR - 3.4 * s, 1.4 * s, 1.8 * s, "hsl(45,85%,56%)");
    this.px(cx - 0.4 * s, hcy - headR - 3.6 * s, 1 * s, 1 * s, "hsl(0,75%,56%)");
    const lift = (2 + kick * 2) * s;
    this.limb(cx + 3.6 * s, shoulderY + 2 * s, cx + 5.4 * s, shoulderY - lift, 1.6 * s, "hsl(280,38%,42%)");
    this.px(cx + 4.6 * s, shoulderY - lift - 1.6 * s, 1.8 * s, 2.4 * s, "hsl(45,75%,52%)");
  }

  // ── TAVERN — ye olde drop, torches, peasants, knights, a king on his throne ─
  private renderTavern(u: number, t: number): void {
    const W = this.w, H = this.h;
    const { kick, beat } = this.pulse(t, 104);
    const floorY = Math.round(H * 0.72);
    this.g.fillStyle = "hsl(28,12%,30%)"; this.g.fillRect(0, 0, W, floorY);
    for (let y = 4 * u; y < floorY; y += 6 * u) { this.px(0, y, W, 0.6 * u, "hsla(28,12%,18%,0.7)"); const off = ((y / (6 * u)) % 2) * 8 * u; for (let x = -off; x < W; x += 16 * u) this.px(x, y, 0.6 * u, 6 * u, "hsla(28,12%,18%,0.6)"); }
    this.px(0, 0, W, 4 * u, "hsl(26,34%,22%)");
    for (let x = 10 * u; x < W; x += 24 * u) this.px(x, 0, 3 * u, floorY, "hsla(26,34%,20%,0.7)");
    for (let i = 0; i < 3; i++) { const bx = W * (0.2 + 0.3 * i), hue = [0, 220, 45][i]; this.px(bx - 4 * u, 4 * u, 8 * u, 12 * u, `hsl(${hue},50%,40%)`); this.px(bx - 4 * u, 4 * u, 8 * u, 2 * u, `hsl(${hue},55%,52%)`); this.px(bx - 1 * u, 9 * u, 2 * u, 3 * u, "hsl(45,70%,56%)"); for (let p = 0; p < 3; p++) this.px(bx - 4 * u + p * 3 * u, 16 * u, 2 * u, 2 * u, `hsl(${hue},50%,40%)`); }
    for (const tx of [W * 0.08, W * 0.92]) {
      this.px(tx - 0.6 * u, floorY - 24 * u, 1.2 * u, 6 * u, "hsl(28,30%,24%)");
      const fl = 0.7 + 0.3 * Math.sin(t * 9 + tx);
      for (let k = 0; k < 4; k++) { const fh = (3 + (k % 2) * 2) * u * fl; this.px(tx - 1.4 * u + k * 0.9 * u, floorY - 28 * u - fh, 1.4 * u, fh, k % 2 ? "hsl(40,100%,62%)" : "hsl(20,95%,52%)"); }
      this.disc(tx, floorY - 28 * u, 8 * u, 9 * u, `hsla(28,100%,60%,${0.16 * fl})`, this.glow);
    }
    const chx = W * 0.5, chy = 12 * u;
    this.px(chx - 0.6 * u, 0, 1.2 * u, chy - 8 * u, "hsl(26,30%,22%)");
    this.disc(chx, chy, 9 * u, 2 * u, "hsl(26,30%,20%)");
    for (let i = -3; i <= 3; i++) { const cx2 = chx + i * 2.6 * u; this.px(cx2, chy - 2 * u, 1 * u, 2 * u, "hsl(45,40%,82%)"); const fl = 0.7 + 0.3 * Math.sin(t * 8 + i); this.px(cx2 + 0.1 * u, chy - 3.4 * u, 0.8 * u, 1.6 * u, "hsl(40,100%,68%)"); this.px(cx2 - 0.4 * u, chy - 3.8 * u, 1.6 * u, 1.6 * u, `hsla(42,100%,72%,${0.4 * fl})`, this.glow); }
    this.g.fillStyle = "hsl(26,30%,28%)"; this.g.fillRect(0, floorY, W, H - floorY);
    for (let py = floorY + 4 * u; py < H; py += 5 * u) this.px(0, py, W, 1, "hsl(24,26%,20%)");
    this.px(0, floorY, W, 1, "hsl(28,34%,38%)");
    this.barStaff(W * 0.13, H * 0.94, u, t, { shirt: "hsl(30,40%,42%)", shirtHi: "hsl(30,46%,54%)", shirtSh: "hsl(30,40%,28%)", apron: "hsl(26,24%,22%)", skin: "hsl(28,44%,62%)", hair: "hsl(24,30%,22%)", machine: "taps", counter: "hsl(26,32%,30%)", counterHi: "hsl(28,38%,40%)", counterW: 22 });
    this.peasant(W * 0.3, H * 0.95, u, beat, kick, { tunic: "hsl(150,28%,42%)", tunicSh: "hsl(150,28%,28%)", skin: "hsl(28,46%,64%)", hair: "hsl(24,34%,26%)" }, 0);
    this.peasant(W * 0.7, H * 0.95, u, beat, kick, { tunic: "hsl(28,40%,46%)", tunicSh: "hsl(28,38%,30%)", skin: "hsl(26,44%,60%)", hair: "hsl(0,0%,72%)" }, 1.6);
    this.knight(W * 0.16, H * 0.95, u, beat);
    this.knight(W * 0.84, H * 0.95, u, beat);
    this.king(W * 0.92, H * 0.96, u, beat, kick);
    this.px(W * 0.5 - 14 * u, H * 0.9, 8 * u, 12 * u, "hsl(26,34%,32%)");
    this.px(W * 0.5 + 6 * u, H * 0.9, 8 * u, 12 * u, "hsl(26,34%,32%)");
    for (const bxx of [W * 0.5 - 14 * u, W * 0.5 + 6 * u]) { this.px(bxx, H * 0.9 + 3 * u, 8 * u, 1.4 * u, "hsl(40,30%,46%)"); this.px(bxx, H * 0.9 + 7 * u, 8 * u, 1.4 * u, "hsl(40,30%,46%)"); }
    this.djBooth(W * 0.5, H * 0.9, u, t, beat, kick, {
      skin: "hsl(26,44%,60%)", jacket: "hsl(28,44%,40%)", jacketHi: "hsl(30,50%,52%)", jacketSh: "hsl(28,40%,26%)",
      hat: "hsl(0,50%,44%)", glow: "hsl(38,92%,58%)", booth: "hsl(26,34%,30%)", boothHi: "hsl(28,40%,40%)", boothSh: "hsl(24,30%,18%)",
    });
  }

  // ── CAFÉ (morning) — cozy coffee shop, a producer chilling with a laptop ────
  private renderCafe(u: number, t: number): void {
    const W = this.w, H = this.h;
    const { kick, beat } = this.pulse(t, 84);
    const floorY = Math.round(H * 0.70);

    // wall gradient
    const grd = this.g.createLinearGradient(0, 0, 0, floorY);
    grd.addColorStop(0, "hsl(30,40%,60%)");
    grd.addColorStop(1, "hsl(26,38%,49%)");
    this.g.fillStyle = grd;
    this.g.fillRect(0, 0, W, floorY);
    this.px(0, floorY - 5 * u, W, 1.4 * u, "hsl(28,34%,40%)");
    this.px(0, floorY - 5 * u, W, 0.6 * u, "hsl(30,42%,56%)");

    // floor (wood planks)
    const fg = this.g.createLinearGradient(0, floorY, 0, H);
    fg.addColorStop(0, "hsl(26,44%,40%)");
    fg.addColorStop(1, "hsl(24,40%,30%)");
    this.g.fillStyle = fg;
    this.g.fillRect(0, floorY, W, H - floorY);
    for (let py = floorY + 4 * u; py < H; py += 5 * u) this.px(0, py, W, 1, "hsl(24,38%,26%)");
    for (let i = 0; i < 9; i++) {
      const px = (i / 8) * W + ((i % 2) * 6 * u);
      this.px(px, floorY, 1, H - floorY, "hsla(24,30%,22%,0.5)");
    }
    this.px(0, floorY, W, 1, "hsl(28,46%,50%)");

    this.cafeWindow(W, H, u);
    this.cafeStringLights(W, u, beat);
    this.cafeShelf(W, u, t);
    this.cafeLightShaft(W, H, u, floorY);

    // barista at the espresso bar (right)
    this.barStaff(W * 0.9, floorY + 1 * u, u * 0.95, t, {
      shirt: "hsl(20,42%,46%)", shirtHi: "hsl(20,48%,58%)", shirtSh: "hsl(20,40%,32%)",
      apron: "hsl(26,28%,22%)", skin: "hsl(28,44%,64%)", hair: "hsl(30,40%,26%)",
      machine: "espresso", counter: "hsl(26,40%,34%)", counterHi: "hsl(28,46%,46%)", counterW: 20,
    });

    // background patron near the window
    this.seated(W * 0.205, floorY - 1 * u, u * 0.82, t, {
      jacket: "hsl(150,22%,46%)", jacketHi: "hsl(150,26%,58%)", jacketSh: "hsl(150,24%,32%)",
      skin: "hsl(28,42%,68%)", skinSh: "hsl(28,40%,54%)", hair: "hsl(30,40%,28%)",
    }, { laptop: true, beat, lean: 0.3, phase: 1.2 });

    // foreground patron right
    this.seated(W * 0.78, floorY + 3 * u, u * 1.0, t, {
      jacket: "hsl(214,30%,52%)", jacketHi: "hsl(214,34%,64%)", jacketSh: "hsl(214,30%,36%)",
      skin: "hsl(26,46%,60%)", skinSh: "hsl(26,42%,46%)", hair: "hsl(20,30%,18%)",
    }, { laptop: true, beat, lean: -0.2, phase: 3.4 });

    // hero: the producer
    this.cafeProducer(W * 0.435, floorY + 2 * u, u * 1.05, kick, beat);

    // floating dust in the shaft
    this.cafeMotes(W, H, u, t);
  }

  private cafeWindow(W: number, H: number, u: number): void {
    const x = Math.round(W * 0.06), y = Math.round(H * 0.13);
    const w = Math.round(W * 0.34), h = Math.round(H * 0.40);
    this.px(x - 2.4 * u, y - 2.4 * u, w + 4.8 * u, h + 4.8 * u, "hsl(26,40%,32%)");
    this.px(x - 2.4 * u, y - 2.4 * u, w + 4.8 * u, 1 * u, "hsl(30,44%,46%)");
    const sg = this.g.createLinearGradient(0, y, 0, y + h);
    sg.addColorStop(0, "hsl(222,46%,68%)");
    sg.addColorStop(0.42, "hsl(20,82%,76%)");
    sg.addColorStop(1, "hsl(40,92%,82%)");
    this.g.fillStyle = sg;
    this.g.fillRect(x, y, w, h);
    for (let i = 0; i < 7; i++) {
      const bw = w / 7, bx = x + i * bw;
      const bh = (3 + ((i * 37) % 5)) * u;
      this.px(bx, y + h - bh, bw - 1, bh, "hsla(20,40%,52%,0.7)");
    }
    const sunX = x + w * 0.62, sunY = y + h * 0.52;
    this.disc(sunX, sunY, 7 * u, 7 * u, "hsl(48,100%,88%)", this.glow);
    this.disc(sunX, sunY, 4.4 * u, 4.4 * u, "hsl(45,100%,90%)");
    this.disc(sunX, sunY, 4.4 * u, 4.4 * u, "hsl(45,100%,90%)", this.glow);
    this.px(x + w / 2 - 0.7 * u, y, 1.4 * u, h, "hsl(28,42%,38%)");
    this.px(x, y + h * 0.46 - 0.7 * u, w, 1.4 * u, "hsl(28,42%,38%)");
    this.px(x + w / 2 - 0.7 * u, y, 0.5 * u, h, "hsl(32,46%,52%)");
    this.px(x - 2.4 * u, y + h, w + 4.8 * u, 2.2 * u, "hsl(28,40%,42%)");
    this.px(x - 2.4 * u, y + h, w + 4.8 * u, 0.7 * u, "hsl(32,46%,56%)");
    const potX = x + w * 0.2;
    this.px(potX - 2.6 * u, y + h - 3 * u, 5.2 * u, 3 * u, "hsl(16,55%,46%)");
    this.disc(potX, y + h - 3 * u, 3 * u, 2.4 * u, "hsl(132,42%,40%)");
    this.disc(potX - 1.4 * u, y + h - 4.4 * u, 1.8 * u, 1.6 * u, "hsl(122,46%,48%)");
    this.disc(potX + 1.6 * u, y + h - 4 * u, 1.6 * u, 1.5 * u, "hsl(128,44%,44%)");
  }

  private cafeStringLights(W: number, u: number, beat: number): void {
    const n = Math.max(7, Math.round(W / (22 * u)));
    const topY = 2 * u, sag = 9 * u;
    const wireC = "hsl(26,28%,24%)";
    let prevX = 0, prevY = topY;
    for (let i = 0; i <= n; i++) {
      const fx = (i / n) * W;
      const fy = topY + Math.sin((i / n) * Math.PI) * sag;
      if (i > 0) this.limb(prevX, prevY, fx, fy, 1, wireC);
      prevX = fx; prevY = fy;
    }
    for (let i = 0; i < n; i++) {
      const fx = ((i + 0.5) / n) * W;
      const fy = topY + Math.sin(((i + 0.5) / n) * Math.PI) * sag;
      const tw = 0.78 + 0.22 * Math.sin(beat * 1.5 + i * 1.7);
      const c = `hsl(42,95%,${58 + tw * 16}%)`;
      this.px(fx - 0.5 * u, fy, 1 * u, 1.6 * u, "hsl(28,30%,28%)");
      this.disc(fx, fy + 2.6 * u, 1.8 * u, 2.1 * u, c);
      this.disc(fx, fy + 2.6 * u, 2.8 * u, 3.1 * u, `hsla(42,98%,70%,${0.5 * tw})`, this.glow);
      this.px(fx - 0.5 * u, fy + 1.8 * u, 0.8 * u, 0.8 * u, "hsl(48,100%,92%)");
    }
  }

  private cafeShelf(W: number, u: number, t: number): void {
    const sx = Math.round(W * 0.66), sw = Math.round(W * 0.28), sy = Math.round(this.h * 0.20);
    this.px(sx, sy - 1 * u, sw * 0.5, 13 * u, "hsl(26,40%,30%)");
    this.px(sx + 1 * u, sy, sw * 0.5 - 2 * u, 11 * u, "hsl(160,14%,16%)");
    for (let i = 0; i < 4; i++) {
      this.px(sx + 2.4 * u, sy + 2 * u + i * 2.4 * u, (sw * 0.5 - 6 * u) * (0.5 + (i % 3) * 0.16), 0.8 * u, "hsla(40,40%,82%,0.7)");
    }
    this.px(sx + 2.4 * u, sy + 1 * u, 5 * u, 0.9 * u, "hsl(40,80%,70%)");
    const bx = sx + sw * 0.6, bw = sw * 0.5;
    this.px(bx, sy + 2 * u, bw, 1.4 * u, "hsl(26,42%,40%)");
    this.px(bx, sy + 2 * u, bw, 0.5 * u, "hsl(30,46%,54%)");
    for (let i = 0; i < 4; i++) {
      const mx = bx + 2 * u + i * (bw - 3 * u) / 4;
      const mc = ["hsl(8,55%,52%)", "hsl(150,30%,46%)", "hsl(210,30%,54%)", "hsl(40,60%,56%)"][i];
      this.px(mx, sy - 1.4 * u, 3 * u, 3.4 * u, mc);
      this.px(mx, sy - 1.4 * u, 3 * u, 0.7 * u, "hsla(0,0%,100%,0.4)");
      this.px(mx + 3 * u, sy - 0.4 * u, 1 * u, 1.6 * u, mc);
    }
    const hx = sx + sw * 0.86;
    this.px(hx - 0.5 * u, 2 * u, 1, sy - 6 * u, "hsl(26,28%,30%)");
    this.px(hx - 3 * u, sy - 6 * u, 6 * u, 2.6 * u, "hsl(18,50%,46%)");
    this.disc(hx, sy - 6 * u, 4 * u, 2.4 * u, "hsl(128,42%,42%)");
    for (let i = 0; i < 5; i++) {
      const vx = hx - 3 * u + i * 1.5 * u;
      const vl = (4 + (i % 3) * 3) * u + Math.sin(t * 0.8 + i) * 0.8 * u;
      this.px(vx, sy - 4 * u, 0.8 * u, vl, "hsl(124,44%,38%)");
      this.px(vx - 0.4 * u, sy - 4 * u + vl, 1.6 * u, 1.4 * u, "hsl(118,48%,46%)");
    }
  }

  private cafeLightShaft(W: number, H: number, u: number, floorY: number): void {
    const x = W * 0.30, topY = H * 0.18, baseY = floorY + 8 * u;
    const halfTop = 4 * u, halfBase = 18 * u;
    const g = this.glow;
    const grd = g.createLinearGradient(x, topY, x, baseY);
    grd.addColorStop(0, "hsla(44,96%,80%,0.22)");
    grd.addColorStop(1, "hsla(44,96%,80%,0)");
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(x - halfTop, topY);
    g.lineTo(x + halfTop, topY);
    g.lineTo(x + halfBase, baseY);
    g.lineTo(x - halfBase + 6 * u, baseY);
    g.closePath();
    g.fill();
  }

  private cafeMotes(W: number, H: number, u: number, t: number): void {
    for (let i = 0; i < 26; i++) {
      const seedx = (i * 73.13) % 1;
      const drift = (t * (4 + (i % 4) * 2) + i * 30) % (H * 0.7);
      const mx = W * 0.16 + seedx * W * 0.34 + Math.sin(t * 0.5 + i) * 3 * u;
      const my = H * 0.16 + drift;
      const a = 0.25 + 0.25 * Math.sin(t * 1.3 + i * 2);
      this.px(mx, my, 1, 1, `hsla(46,90%,86%,${a})`, this.glow);
    }
  }

  private barStaff(cx: number, counterY: number, u: number, t: number, o: BarStaffOpts): void {
    const s = u, cw = (o.counterW || 22) * s;
    const sway = Math.sin(t * 1.6) * 0.5 * s;
    const shoulderY = counterY - 12 * s;
    const headR = 2.4 * s, hcy = shoulderY - headR - 1 * s;
    this.block(cx - 3.6 * s + sway * 0.3, shoulderY, 7.2 * s, 13 * s, o.shirt, o.shirtHi, o.shirtSh);
    const armPh = Math.sin(t * 3) * 1.6 * s;
    this.limb(cx + 2.6 * s, shoulderY + 2 * s, cx + 5 * s, counterY - 2 * s + armPh, 1.6 * s, o.shirt);
    this.px(cx + 4.2 * s, counterY - 3 * s + armPh, 2 * s, 1.6 * s, o.skin);
    this.block(cx - headR + sway, hcy - headR, headR * 2, headR * 2, o.skin, null, o.skinSh || "hsl(26,40%,48%)");
    if (o.hat) {
      this.px(cx - headR - 0.5 * s + sway, hcy - headR - 1.4 * s, headR * 2 + 1 * s, 2.2 * s, o.hat);
      if (o.cap) this.px(cx + headR - 0.4 * s + sway, hcy - headR + 0.2 * s, 2.2 * s, 1.2 * s, o.hat);
    } else {
      this.px(cx - headR + sway, hcy - headR - 1 * s, headR * 2, 1.8 * s, o.hair || "hsl(24,30%,20%)");
    }
    this.px(cx - headR + sway + 0.5 * s, hcy + 0.6 * s, headR * 2 - 1 * s, 1 * s, o.skinSh || "hsl(26,40%,48%)");
    this.px(cx - cw / 2, counterY, cw, 11 * s, o.counter || "hsl(26,38%,34%)");
    this.px(cx - cw / 2, counterY, cw, 1.4 * s, o.counterHi || "hsl(28,44%,46%)");
    if (o.apron) { this.px(cx - 3 * s, counterY - 1 * s, 6 * s, 1.4 * s, o.apron); }
    if (o.machine === "espresso") {
      this.px(cx - cw / 2 + 1.5 * s, counterY - 5 * s, 6 * s, 5 * s, "hsl(0,0%,74%)");
      this.px(cx - cw / 2 + 1.5 * s, counterY - 5 * s, 6 * s, 1.2 * s, "hsl(0,0%,88%)");
      this.px(cx - cw / 2 + 3 * s, counterY - 0.6 * s, 1 * s, 1.4 * s, "hsl(0,0%,40%)");
      for (let k = 0; k < 5; k++) { const sy2 = counterY - 6 * s - k * 1.6 * s; this.px(cx - cw / 2 + 3.4 * s + Math.sin(t * 2.4 + k) * 1 * s, sy2, 1, 1.2 * s, `hsla(0,0%,100%,${Math.max(0, 0.42 - k * 0.07)})`, this.glow); }
      this.px(cx + cw / 2 - 4 * s, counterY - 2.4 * s, 2.6 * s, 2.4 * s, "hsl(0,0%,96%)");
    } else if (o.machine === "bottles") {
      const bh = [150, 30, 330, 200, 48];
      for (let b = 0; b < 5; b++) this.px(cx - cw / 2 + 1.6 * s + b * 2.6 * s, counterY - 5 * s, 1.6 * s, 5 * s, `hsl(${bh[b]},48%,44%)`);
      this.px(cx + 4.4 * s, counterY - 4 * s + armPh, 2 * s, 3 * s, "hsl(0,0%,80%)");
    } else if (o.machine === "taps") {
      for (let b = 0; b < 3; b++) { this.px(cx - 3 * s + b * 3 * s, counterY - 3.4 * s, 0.8 * s, 3.4 * s, "hsl(40,50%,52%)"); this.px(cx - 3.4 * s + b * 3 * s, counterY - 3.6 * s, 1.6 * s, 1 * s, "hsl(40,60%,62%)"); }
    }
  }

  private cafeTableLeg(cx: number, topY: number, u: number): void {
    this.px(cx - 1.2 * u, topY + 1 * u, 2.4 * u, 13 * u, "hsl(26,40%,30%)");
    this.px(cx - 1.2 * u, topY + 1 * u, 0.8 * u, 13 * u, "hsl(28,44%,40%)");
  }

  private cafeTableTop(cx: number, topY: number, u: number): void {
    this.disc(cx, topY, 13 * u, 3.4 * u, "hsl(26,40%,34%)");
    this.disc(cx, topY - 0.9 * u, 13 * u, 3.2 * u, "hsl(28,44%,44%)");
    this.disc(cx, topY - 1.5 * u, 11 * u, 2.4 * u, "hsl(30,48%,52%)");
  }

  private seated(cx: number, tableTopY: number, u: number, t: number, c: SeatedColors, opts: SeatedOpts): void {
    const s = u;
    const ph = opts.phase || 0;
    const sway = Math.sin(t * 1.4 + ph) * 0.6 * s;
    const shoulderY = tableTopY - 11 * s;
    const headR = 2.5 * s;
    const headCY = shoulderY - headR - 1 * s;
    this.cafeTableLeg(cx, tableTopY, u);
    this.block(cx - 4 * s + sway * 0.4, shoulderY, 8 * s, 15 * s, c.jacket, c.jacketHi, c.jacketSh);
    this.block(cx - headR + sway, headCY - headR, headR * 2, headR * 2, c.skin, null, c.skinSh);
    this.px(cx - headR + sway, headCY - headR - 1 * s, headR * 2, 2 * s, c.hair);
    this.px(cx - headR + sway, headCY - headR, 1.4 * s, headR * 1.6, c.hair);
    this.px(cx - headR + sway + 0.6 * s, headCY + 0.4 * s, headR * 2 - 1.2 * s, 1 * s, c.skinSh);
    this.cafeTableTop(cx, tableTopY, u);
    if (opts.laptop) {
      this.px(cx - 4 * s, tableTopY - 2.4 * s, 8 * s, 1.8 * s, c.jacket);
      this.px(cx - 4 * s, tableTopY - 2.4 * s, 8 * s, 0.7 * s, c.jacketHi);
      this.px(cx - 4.6 * s, tableTopY - 2.6 * s, 2 * s, 1.6 * s, c.skin);
      this.px(cx + 2.6 * s, tableTopY - 2.6 * s, 2 * s, 1.6 * s, c.skin);
      this.miniLaptop(cx, tableTopY - 0.5 * s, s, opts.beat || 0);
    } else if (opts.cup) {
      const cupX = cx + 6 * s, cupY = tableTopY - 2.4 * s;
      this.px(cx - 1.5 * s, tableTopY - 2.6 * s, 7 * s, 1.8 * s, c.jacket);
      this.px(cx - 1.5 * s, tableTopY - 2.6 * s, 7 * s, 0.7 * s, c.jacketHi);
      this.px(cx + 4.6 * s, tableTopY - 3 * s, 2 * s, 1.6 * s, c.skin);
      this.cup(cupX, cupY, s, t, opts.phase || 0);
    }
  }

  private miniLaptop(cx: number, topY: number, s: number, beat: number): void {
    const lw = 9 * s, lh = 5.5 * s, lx = cx - lw / 2, ly = topY - lh;
    this.px(lx - 1 * s, ly - 1.6 * s, lw + 2 * s, 2 * s, "hsla(200,80%,72%,0.4)", this.glow);
    this.px(lx - 0.8 * s, ly - 0.8 * s, lw + 1.6 * s, lh + 0.8 * s, "hsl(220,12%,13%)");
    this.px(lx, ly, lw, lh, "hsl(218,12%,30%)");
    this.px(lx, ly, lw, 0.8 * s, "hsl(218,14%,42%)");
    this.px(cx - 1 * s, ly + lh * 0.34, 2 * s, 1.6 * s, "hsl(200,78%,60%)");
    this.px(cx - 1 * s, ly + lh * 0.34, 2 * s, 1.6 * s, "hsla(200,88%,66%,0.8)", this.glow);
    this.px(lx - 0.5 * s, topY, lw + 1 * s, 0.8 * s, "hsl(220,10%,16%)");
    const bw = lw + 3 * s, bx = cx - bw / 2;
    this.px(bx, topY + 0.8 * s, bw, 1.8 * s, "hsl(220,12%,33%)");
    this.px(bx, topY + 0.8 * s, bw, 0.6 * s, "hsl(220,10%,46%)");
    for (let i = 0; i < 5; i++) { const lit = Math.abs(Math.sin(beat * 5 + i * 1.3)) > 0.6; this.px(bx + 1 * s + i * ((bw - 2 * s) / 5), topY + 1.5 * s, (bw - 2 * s) / 5 - 0.4 * s, 0.7 * s, lit ? "hsl(200,75%,62%)" : "hsl(220,12%,22%)"); }
  }

  private cup(cx: number, cy: number, s: number, t: number, ph: number): void {
    this.px(cx - 2 * s, cy - 2.6 * s, 4 * s, 3.4 * s, "hsl(0,0%,96%)");
    this.px(cx - 2 * s, cy - 2.6 * s, 4 * s, 0.8 * s, "hsl(0,0%,100%)");
    this.px(cx - 2 * s, cy + 0.2 * s, 4 * s, 0.8 * s, "hsl(0,0%,80%)");
    this.px(cx + 2 * s, cy - 1.6 * s, 1.2 * s, 1.6 * s, "hsl(0,0%,86%)");
    for (let k = 0; k < 6; k++) {
      const sy = cy - 3.4 * s - k * 1.7 * s;
      const sx = cx + Math.sin(t * 2.2 + k * 0.7 + ph) * 1.4 * s;
      const a = Math.max(0, 0.42 - k * 0.06);
      this.px(sx, sy, 1, 1.2 * s, `hsla(0,0%,100%,${a})`, this.glow);
    }
  }

  private cafeProducer(cx: number, tableTopY: number, u: number, kick: number, beat: number): void {
    const s = u;
    this.cafeTableLeg(cx, tableTopY, u * 1.05);
    const nod = Math.sin(beat * Math.PI * 2) * 0.7 * s + kick * 0.7 * s;
    const shoulderY = tableTopY - 15 * s;
    const headR = 2.7 * s;
    const headCY = shoulderY - headR - 1 * s + nod * 0.5;
    const deckY = tableTopY - 2 * s;
    const lidBottom = deckY - 1 * s;
    const lidH = 8 * s, lidW = 13 * s;
    this.disc(cx, lidBottom - lidH * 0.5, lidW, 7 * s, "hsla(192,85%,70%,0.22)", this.glow);
    const J = "hsl(16,52%,50%)", JH = "hsl(18,58%,62%)", JS = "hsl(14,50%,36%)";
    this.block(cx - 4.4 * s, shoulderY, 8.8 * s, 16 * s, J, JH, JS);
    this.px(cx - 0.5 * s, shoulderY + 1 * s, 1 * s, 7 * s, JS);
    this.px(cx - 3 * s, shoulderY - 0.5 * s, 6 * s, 2.4 * s, JS);
    this.limb(cx - 3.8 * s, shoulderY + 3 * s, cx - 5.4 * s, deckY, 2 * s, J);
    this.limb(cx + 3.8 * s, shoulderY + 3 * s, cx + 5.4 * s, deckY, 2 * s, J);
    this.block(cx - headR, headCY - headR, headR * 2, headR * 2, "hsl(26,46%,62%)", null, "hsl(26,42%,48%)");
    this.px(cx - headR, headCY - headR - 1.2 * s, headR * 2, 2 * s, "hsl(22,34%,22%)");
    this.px(cx - headR + 0.4 * s, headCY + 1 * s, headR * 2 - 1 * s, 1.6 * s, "hsla(192,75%,66%,0.5)");
    this.px(cx - headR - 1.4 * s, headCY - 0.8 * s, 1.7 * s, 3.2 * s, "hsl(20,30%,24%)");
    this.px(cx + headR - 0.3 * s, headCY - 0.8 * s, 1.7 * s, 3.2 * s, "hsl(20,30%,24%)");
    this.px(cx - headR - 1.1 * s, headCY - headR - 1 * s, headR * 2 + 2.2 * s, 1.1 * s, "hsl(20,28%,30%)");
    this.px(cx - headR - 1.4 * s, headCY - 0.4 * s, 0.8 * s, 1.2 * s, "hsl(190,70%,60%)");
    this.cafeTableTop(cx, tableTopY, u * 1.05);
    const lidW2 = 19 * s, lidH2 = 6 * s;
    const lx = cx - lidW2 / 2, ly = deckY - 2 * s - lidH2;
    this.disc(cx, ly - 4 * s, lidW2 * 0.5, 5 * s, "hsla(192,85%,72%,0.20)", this.glow);
    this.px(lx + 2.5 * s, ly - 1.4 * s, lidW2 - 5 * s, 1.2 * s, "hsla(190,90%,78%,0.4)", this.glow);
    this.px(lx, ly, lidW2, lidH2, "hsl(216,8%,46%)");
    this.px(lx, ly, lidW2, 1 * s, "hsl(214,10%,62%)");
    this.px(lx, ly + lidH2 - 1 * s, lidW2, 1 * s, "hsl(216,9%,34%)");
    this.px(lx + 1 * s, ly + 1.4 * s, lidW2 - 2 * s, lidH2 - 3 * s, "hsl(216,8%,40%)");
    this.px(cx - 1 * s, ly + lidH2 * 0.5 - 1 * s, 2 * s, 2 * s, "hsl(214,10%,58%)");
    this.px(lx + 1 * s, deckY - 2 * s, lidW2 - 2 * s, 1.6 * s, "hsl(218,10%,22%)");
    this.px(lx + 2 * s, deckY - 2.4 * s, 2.4 * s, 1 * s, "hsl(216,9%,34%)");
    this.px(cx + lidW2 / 2 - 4.4 * s, deckY - 2.4 * s, 2.4 * s, 1 * s, "hsl(216,9%,34%)");
    const bbw = lidW2 + 6 * s, bx = cx - bbw / 2, fbw = lidW2 + 0.5 * s;
    this.g.fillStyle = "hsl(218,11%,33%)";
    this.g.beginPath();
    this.g.moveTo(cx - fbw / 2, deckY - 0.4 * s); this.g.lineTo(cx + fbw / 2, deckY - 0.4 * s);
    this.g.lineTo(cx + bbw / 2, deckY + 3 * s); this.g.lineTo(cx - bbw / 2, deckY + 3 * s);
    this.g.closePath(); this.g.fill();
    this.px(cx - fbw / 2, deckY - 0.4 * s, fbw, 0.7 * s, "hsl(218,10%,46%)");
    this.px(bx - 0.6 * s, deckY + 3 * s, bbw + 1.2 * s, 1.8 * s, "hsl(218,11%,18%)");
    this.px(bx - 0.6 * s, deckY + 3 * s, bbw + 1.2 * s, 0.6 * s, "hsl(218,10%,40%)");
    for (let r = 0; r < 3; r++) {
      const ry = deckY + 0.3 * s + r * 0.9 * s, rw = fbw + (bbw - fbw) * (r / 3) - 4 * s;
      for (let i = 0; i < 11; i++) {
        const lit = Math.abs(Math.sin(beat * 5 + i * 0.9 + r)) > 0.78;
        this.px(cx - rw / 2 + i * (rw / 11), ry, rw / 11 - 0.3 * s, 0.7 * s, lit ? "hsla(190,80%,66%,0.7)" : "hsl(218,12%,22%)");
      }
    }
    this.px(cx - 2.2 * s, deckY + 2 * s, 4.4 * s, 0.8 * s, "hsl(218,12%,26%)");
    this.px(cx - 6.5 * s, deckY - 1.8 * s, 2.8 * s, 1.8 * s, "hsl(26,46%,62%)");
    this.px(cx + 3.6 * s, deckY - 1.8 * s, 2.8 * s, 1.8 * s, "hsl(26,46%,62%)");
  }

  // ── PARK (afternoon) — outdoors, blue sky, dancers + the DJ on the grass ─────
  private renderPark(u: number, t: number): void {
    const W = this.w, H = this.h;
    const { kick, beat } = this.pulse(t, 102);
    const horizon = Math.round(H * 0.66);

    const sg = this.g.createLinearGradient(0, 0, 0, horizon);
    sg.addColorStop(0, "hsl(208,76%,66%)");
    sg.addColorStop(1, "hsl(196,70%,84%)");
    this.g.fillStyle = sg;
    this.g.fillRect(0, 0, W, horizon);

    this.parkSun(W, H, u, t);
    this.parkClouds(W, u);
    this.parkBirds(W, u, t);

    this.px(0, horizon - 6 * u, W, 8 * u, "hsl(138,34%,44%)");
    for (let i = 0; i < W; i += 5 * u) this.disc(i, horizon - 6 * u, 4 * u, 3 * u, "hsl(135,36%,47%)");

    const gg = this.g.createLinearGradient(0, horizon, 0, H);
    gg.addColorStop(0, "hsl(108,44%,52%)");
    gg.addColorStop(1, "hsl(96,50%,40%)");
    this.g.fillStyle = gg;
    this.g.fillRect(0, horizon, W, H - horizon);
    this.px(0, horizon, W, 1.2 * u, "hsl(112,48%,58%)");
    for (let i = 0; i < 70; i++) {
      const gx = ((i * 91.7) % 1) * W;
      const gy = horizon + 4 * u + ((i * 53.3) % 1) * (H - horizon - 5 * u);
      const sc = 0.5 + (gy - horizon) / (H - horizon);
      this.px(gx, gy, 1, 2 * u * sc, "hsl(118,46%,34%)");
      if (i % 7 === 0) this.px(gx + 1, gy - 1 * u * sc, 1.4 * u * sc, 1.4 * u * sc, ["hsl(48,95%,68%)", "hsl(330,80%,72%)", "hsl(0,80%,66%)"][i % 3]);
    }

    this.parkTree(W * 0.13, horizon + 3 * u, u * 1.25, t, 0.4);
    this.parkTree(W * 0.9, horizon + 1 * u, u * 1.45, t, 1.7);
    this.parkTree(W * 0.5, horizon - 2 * u, u * 0.7, t, 2.6);

    this.parkBlanket(W * 0.74, H * 0.9, u);
    this.parkLounger(W * 0.70, H * 0.9, u, t, { shirt: "hsl(280,40%,58%)", shirtSh: "hsl(280,38%,42%)", skin: "hsl(28,44%,66%)", hair: "hsl(28,40%,26%)" }, 0.5);
    this.parkLounger(W * 0.80, H * 0.92, u, t, { shirt: "hsl(190,55%,52%)", shirtSh: "hsl(190,52%,38%)", skin: "hsl(26,46%,58%)", hair: "hsl(18,30%,16%)" }, 2.2);

    this.parkDancer(W * 0.55, H * 0.86, u, beat, kick, { shirt: "hsl(8,75%,60%)", shirtSh: "hsl(8,70%,44%)", legs: "hsl(220,30%,40%)", skin: "hsl(28,46%,66%)", hair: "hsl(30,42%,24%)" }, 0);
    this.parkDancer(W * 0.63, H * 0.87, u, beat, kick, { shirt: "hsl(168,55%,50%)", shirtSh: "hsl(168,52%,36%)", legs: "hsl(28,36%,40%)", skin: "hsl(26,44%,58%)", hair: "hsl(20,30%,14%)" }, Math.PI);

    this.djBooth(W * 0.33, H * 0.95, u, t, beat, kick, {
      skin: "hsl(26,46%,62%)", jacket: `hsl(${this.s.jacketHue},70%,56%)`, jacketHi: `hsl(${this.s.jacketHue},76%,66%)`, jacketSh: `hsl(${this.s.jacketHue},62%,40%)`,
      hat: "hsl(8,55%,50%)", cap: true, glow: `hsl(${this.s.hue},80%,55%)`, booth: "hsl(28,34%,34%)", boothHi: "hsl(30,40%,44%)", boothSh: "hsl(24,30%,20%)",
    });
    this.parkNotes(W * 0.33, H * 0.8, u, t);
  }

  private parkSun(W: number, H: number, u: number, t: number): void {
    const cx = W * 0.84, cy = H * 0.16;
    const g = this.glow;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + t * 0.08;
      const r0 = 8 * u, r1 = 12 * u + Math.sin(t * 1.2 + i) * 1.2 * u;
      this.limb(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, cx + Math.cos(a) * r1, cy + Math.sin(a) * r1, 1.4 * u, "hsla(50,100%,82%,0.3)", g);
    }
    this.disc(cx, cy, 8 * u, 8 * u, "hsla(50,100%,80%,0.22)", g);
    this.disc(cx, cy, 6 * u, 6 * u, "hsl(50,100%,84%)");
    this.disc(cx, cy, 6 * u, 6 * u, "hsla(50,100%,84%,0.5)", g);
    this.disc(cx, cy, 4 * u, 4 * u, "hsl(54,100%,90%)");
  }

  private parkClouds(W: number, u: number): void {
    if (!this.clouds) {
      this.clouds = [];
      for (let i = 0; i < 5; i++) {
        this.clouds.push({ x: Math.random() * W, y: (8 + Math.random() * 30) * u, s: 0.7 + Math.random() * 0.8, v: (1.2 + Math.random() * 1.4) });
      }
    }
    for (const c of this.clouds) {
      c.x += c.v * 0.04;
      if (c.x - 16 * u * c.s > W) c.x = -16 * u * c.s;
      const s = u * c.s, cx = c.x, cy = c.y;
      const sh = "hsl(206,30%,84%)", wh = "hsl(0,0%,100%)";
      this.disc(cx, cy + 1 * s, 9 * s, 4 * s, sh);
      this.disc(cx - 4 * s, cy + 1 * s, 5 * s, 3.4 * s, sh);
      this.disc(cx + 4 * s, cy + 1.4 * s, 5 * s, 3 * s, sh);
      this.disc(cx, cy, 8.5 * s, 4 * s, wh);
      this.disc(cx - 4 * s, cy, 4.6 * s, 3.2 * s, wh);
      this.disc(cx + 4.5 * s, cy + 0.6 * s, 4.4 * s, 2.8 * s, wh);
    }
  }

  private parkBirds(W: number, u: number, t: number): void {
    for (let i = 0; i < 3; i++) {
      const bx = ((t * (6 + i * 2) + i * 140) % (W + 40 * u)) - 20 * u;
      const by = (10 + i * 7) * u + Math.sin(t * 1.5 + i) * 2 * u;
      const fw = 2 * u;
      this.px(bx - fw, by, fw, 1, "hsla(220,20%,30%,0.7)");
      this.px(bx, by - 0.6 * u, fw, 1, "hsla(220,20%,30%,0.7)");
      this.px(bx + fw, by, fw, 1, "hsla(220,20%,30%,0.7)");
    }
  }

  private parkTree(cx: number, baseY: number, u: number, t: number, ph: number): void {
    const s = u;
    const sway = Math.sin(t * 0.7 + ph) * 1.6 * s;
    this.px(cx - 2 * s, baseY - 18 * s, 4 * s, 18 * s, "hsl(26,42%,32%)");
    this.px(cx - 2 * s, baseY - 18 * s, 1.4 * s, 18 * s, "hsl(28,46%,42%)");
    this.px(cx + 0.6 * s, baseY - 18 * s, 1.4 * s, 18 * s, "hsl(24,40%,24%)");
    const fy = baseY - 24 * s;
    const base = "hsl(132,46%,40%)", hi = "hsl(116,52%,54%)", sh = "hsl(142,46%,28%)";
    this.disc(cx + sway, fy + 4 * s, 13 * s, 10 * s, sh);
    this.disc(cx - 6 * s + sway, fy + 2 * s, 8 * s, 7 * s, base);
    this.disc(cx + 6 * s + sway, fy + 3 * s, 8 * s, 7 * s, base);
    this.disc(cx + sway, fy - 3 * s, 9 * s, 8 * s, base);
    this.disc(cx - 3 * s + sway, fy - 2 * s, 5 * s, 4.4 * s, hi);
    this.disc(cx + 4 * s + sway, fy - 1 * s, 4 * s, 3.6 * s, hi);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      this.px(cx + sway + Math.cos(a + t) * 7 * s, fy + Math.sin(a + t) * 5 * s, 1.2 * s, 1.2 * s, "hsla(80,80%,72%,0.5)");
    }
  }

  private parkBlanket(cx: number, cy: number, u: number): void {
    const s = u, w = 30 * s, h = 9 * s;
    this.disc(cx, cy, w / 2, h / 2, "hsl(0,60%,58%)");
    for (let i = -3; i <= 3; i++) this.px(cx + i * 4 * s, cy - h / 2, 1, h, "hsla(0,0%,100%,0.45)");
    for (let j = 0; j < 2; j++) this.px(cx - w / 2, cy - h / 2 + j * 4 * s, w, 1, "hsla(0,0%,100%,0.4)");
    this.px(cx + w * 0.32, cy - 4 * s, 5 * s, 4 * s, "hsl(34,55%,46%)");
    this.px(cx + w * 0.32, cy - 4 * s, 5 * s, 1 * s, "hsl(36,60%,58%)");
    this.px(cx + w * 0.32 + 1.6 * s, cy - 5.4 * s, 2 * s, 1.6 * s, "hsl(34,50%,40%)");
  }

  private parkLounger(cx: number, cy: number, u: number, t: number, c: LoungerColors, ph: number): void {
    const s = u;
    const breathe = Math.sin(t * 1.1 + ph) * 0.4 * s;
    this.px(cx + 1 * s, cy - 2 * s, 9 * s, 3 * s, c.legs || "hsl(220,28%,38%)");
    this.px(cx + 1 * s, cy - 2 * s, 9 * s, 0.9 * s, "hsla(0,0%,100%,0.18)");
    this.block(cx - 4 * s, cy - 9 * s + breathe, 7 * s, 8 * s, c.shirt, "hsla(0,0%,100%,0.2)", c.shirtSh);
    const headR = 2.3 * s, hcy = cy - 11.5 * s + breathe;
    this.block(cx - 1 * s - headR, hcy - headR, headR * 2, headR * 2, c.skin, null, "hsl(26,40%,50%)");
    this.px(cx - 1 * s - headR, hcy - headR - 1 * s, headR * 2, 1.8 * s, c.hair);
    this.limb(cx - 3.5 * s, cy - 7 * s + breathe, cx - 5 * s, cy - 1 * s, 1.8 * s, c.shirt);
  }

  private parkDancer(cx: number, feetY: number, u: number, beat: number, kick: number, c: DancerColors, phOff: number): void {
    const s = u;
    const ph = beat * Math.PI * 2 + phOff;
    const sway = Math.sin(ph) * 2.2 * s;
    const bob = Math.abs(Math.sin(ph)) * (1 + kick) * 1.4 * s;
    const hipY = feetY - bob;
    const shoulderY = hipY - 11 * s;
    const headR = 2.4 * s;
    const headCY = shoulderY - headR - 0.8 * s;
    const step = Math.sin(ph) * 2.2 * s;
    this.limb(cx - 0.5 * s, hipY - 1 * s, cx - 2.4 * s - step, feetY, 2 * s, c.legs);
    this.limb(cx + 0.5 * s, hipY - 1 * s, cx + 2.4 * s + step, feetY, 2 * s, c.legs);
    this.block(cx - 3.4 * s + sway * 0.3, shoulderY, 6.8 * s, 9 * s, c.shirt, "hsla(0,0%,100%,0.22)", c.shirtSh);
    this.block(cx - headR + sway * 0.5, headCY - headR, headR * 2, headR * 2, c.skin, null, "hsl(26,40%,50%)");
    this.px(cx - headR + sway * 0.5, headCY - headR - 1 * s, headR * 2, 1.8 * s, c.hair);
    const lift = (4 + kick * 1.5) * s;
    this.limb(cx - 3 * s, shoulderY + 1 * s, cx - 4 * s + sway, shoulderY - lift, 1.7 * s, c.shirt);
    this.limb(cx + 3 * s, shoulderY + 1 * s, cx + 4 * s + sway, shoulderY - lift + 1 * s, 1.7 * s, c.shirt);
    this.px(cx - 4.6 * s + sway, shoulderY - lift - 0.6 * s, 1.8 * s, 1.6 * s, c.skin);
    this.px(cx + 3.2 * s + sway, shoulderY - lift + 0.4 * s, 1.8 * s, 1.6 * s, c.skin);
  }

  private parkNotes(cx: number, baseY: number, u: number, t: number): void {
    const s = u;
    for (let i = 0; i < 5; i++) {
      const period = 3.4;
      const local = (t * 0.7 + i * (period / 5)) % period;
      const prog = local / period;
      const ny = baseY - prog * 24 * s;
      const nx = cx + Math.sin(prog * 6 + i) * 6 * s + (i - 2) * 1.5 * s;
      const a = Math.sin(prog * Math.PI) * 0.85;
      const col = `hsla(${(i * 60) % 360},75%,62%,${a})`;
      this.px(nx, ny, 1.6 * s, 1.6 * s, col);
      this.px(nx + 1.4 * s, ny - 3 * s, 0.8 * s, 3.4 * s, col);
      this.px(nx + 1.4 * s, ny - 3 * s, 2 * s, 1 * s, col);
    }
  }

  // shared: a DJ behind a booth with two spinning decks + mixer
  private deck(px: number, topY: number, s: number, t: number, glow: string): void {
    const cy = topY - 1.3 * s, rx = 3.8 * s, ry = 1.7 * s;
    this.disc(px, cy, rx + 0.6 * s, ry + 0.5 * s, glow);
    this.disc(px, cy, rx, ry, "#15121f");
    this.disc(px, cy, rx * 0.88, ry * 0.88, "#0b0912");
    this.disc(px, cy, rx * 0.36, ry * 0.36, glow);
    const a = t * 3;
    this.px(px + Math.cos(a) * rx * 0.6 - 0.5 * s, cy + Math.sin(a) * ry * 0.6 - 0.5 * s, s, s, "#d8cdf0");
    this.px(px + rx * 0.4, cy - ry * 1.1, 2.6 * s, 0.8 * s, "#b7adcc");
  }

  private djBooth(cx: number, groundY: number, u: number, t: number, beat: number, kick: number, o: BoothOpts): void {
    const s = u;
    const boothW = 26 * s, boothH = 9 * s;
    const boothTop = groundY - boothH;
    const bob = Math.abs(Math.sin(beat * Math.PI * 2)) * (0.6 + kick) * 1.2 * s;
    const shoulderY = boothTop - 8 * s - bob;
    const headR = 2.6 * s;
    const headCY = shoulderY - headR - 1 * s;
    const skinSh = o.skinSh || "hsl(26,40%,48%)";
    this.block(cx - 4 * s, shoulderY, 8 * s, boothTop - shoulderY + 4 * s, o.jacket, o.jacketHi, o.jacketSh);
    const scratch = Math.sin(t * 11) * kick * 1.6 * s;
    this.limb(cx - 3 * s, shoulderY + 2.5 * s, cx - 6.6 * s + scratch, boothTop - 2 * s, 2 * s, o.jacket);
    this.limb(cx + 3 * s, shoulderY + 2.5 * s, cx + 6.6 * s, boothTop - 2 * s - kick * 1.2 * s, 2 * s, o.jacket);
    this.px(cx - 7.6 * s + scratch, boothTop - 2.8 * s, 2.4 * s, 1.8 * s, o.skin);
    this.px(cx + 5.2 * s, boothTop - 2.8 * s - kick * 1.2 * s, 2.4 * s, 1.8 * s, o.skin);
    this.block(cx - headR, headCY - headR, headR * 2, headR * 2, o.skin, null, skinSh);
    if (o.hat) {
      this.px(cx - headR - 0.6 * s, headCY - headR - 1 * s, headR * 2 + 1.2 * s, 2.2 * s, o.hat);
      if (o.cap) this.px(cx + headR - 0.4 * s, headCY - headR + 0.2 * s, 2.4 * s, 1.2 * s, o.hat);
    } else {
      this.px(cx - headR, headCY - headR - 1 * s, headR * 2, 1.8 * s, o.hair || "hsl(24,30%,18%)");
    }
    this.px(cx - headR + 0.5 * s, headCY + 0.6 * s, headR * 2 - 1 * s, 1 * s, skinSh);
    this.px(cx - headR - 1.3 * s, headCY - 0.6 * s, 1.6 * s, 3 * s, "#2a2730");
    this.px(cx + headR - 0.3 * s, headCY - 0.6 * s, 1.6 * s, 3 * s, "#2a2730");
    this.px(cx - headR - 1 * s, headCY - headR - 0.8 * s, headR * 2 + 2 * s, 1 * s, "#3a3744");
    this.px(cx - headR - 1.3 * s, headCY - 0.2 * s, 0.7 * s, 1.2 * s, o.glow);
    this.px(cx - boothW / 2 - 1 * s, boothTop - 1 * s, boothW + 2 * s, boothH + 1 * s, o.boothSh || "#15121c");
    this.px(cx - boothW / 2, boothTop, boothW, boothH, o.booth || "#221d2a");
    this.px(cx - boothW / 2, boothTop, boothW, 1.4 * s, o.boothHi || "#332c3e");
    for (let i = 1; i < 5; i++) this.px(cx - boothW / 2 + (i * boothW) / 5, boothTop + 2 * s, 1, boothH - 3 * s, "#0e0b14");
    this.px(cx - boothW / 2, boothTop + boothH - 1.4 * s, boothW, 1.4 * s, o.glow);
    this.px(cx - boothW / 2, boothTop + boothH - 1.4 * s, boothW, 1.4 * s, o.glow, this.glow);
    this.deck(cx - 7.5 * s, boothTop, s, t, o.glow);
    this.deck(cx + 7.5 * s, boothTop, s, t + 1.5, o.glow);
    this.px(cx - 2.6 * s, boothTop - 3 * s, 5.2 * s, 3 * s, "#151019");
    for (let i = 0; i < 3; i++) {
      const lit = kick > i * 0.3;
      const c = lit ? ["#34d399", "#f59e0b", "#ef4444"][i] : "#2a2536";
      this.px(cx - 1.8 * s + i * 1.4 * s, boothTop - 2.4 * s, 1 * s, 1.6 * s, c);
      if (lit) this.px(cx - 1.8 * s + i * 1.4 * s, boothTop - 2.4 * s, 1 * s, 1.6 * s, c, this.glow);
    }
  }

  // ── sky per venue ──────────────────────────────────────────────────────────
  private sky(skyId: string, hue: number, t: number): void {
    const g = this.g, grd = g.createLinearGradient(0, 0, 0, this.h);
    if (skyId === "night-warm") {
      grd.addColorStop(0, "#191033");
      grd.addColorStop(0.6, "#241433");
      grd.addColorStop(1, "#0a0710");
      g.fillStyle = grd; g.fillRect(0, 0, this.w, this.h);
      for (let i = 0; i < 40; i++) {
        const sx = (Math.sin(i * 91.7) * 0.5 + 0.5) * this.w;
        const sy = (Math.sin(i * 47.3) * 0.5 + 0.5) * this.h * 0.45;
        const tw = 0.5 + 0.5 * Math.sin(t * 2 + i);
        this.px(sx, sy, 1, 1, `rgba(255,250,230,${0.3 + tw * 0.5})`);
      }
    } else if (skyId === "indoor-dim") {
      grd.addColorStop(0, `hsl(${hue},25%,9%)`);
      grd.addColorStop(1, "#08060e");
      g.fillStyle = grd; g.fillRect(0, 0, this.w, this.h);
    } else {
      grd.addColorStop(0, `hsl(${hue},45%,${5 + this.energy * 6}%)`);
      grd.addColorStop(0.6, "#070510");
      grd.addColorStop(1, "#04030a");
      g.fillStyle = grd; g.fillRect(0, 0, this.w, this.h);
    }
  }

  // ── lighting rig per venue ──────────────────────────────────────────────────
  private rig(V: ClubLook, hue: number, stageY: number, u: number): void {
    const W = this.w, k = this.kick;
    if (V.rig === "string") {
      // sagging warm string lights (catenary) + wooden fence
      const y0 = 8 * u;
      for (let x = 0; x <= W; x += 6 * u) {
        const sag = Math.sin((x / W) * Math.PI) * 6 * u;
        this.px(x, y0 + sag, 1, 1, "#5a4a2a");
        const lit = 0.6 + 0.4 * Math.sin(x * 0.3 + this.beam * 2);
        const c = `hsl(40,90%,${50 + lit * 25}%)`;
        this.px(x - u, y0 + sag + u, 2 * u, 2 * u, c);
        this.px(x - u, y0 + sag + u, 2 * u, 2 * u, c, this.glow);
      }
      this.px(0, stageY - 4 * u, W, 4 * u, "#3a2a1a"); // fence
      for (let x = 0; x < W; x += 5 * u) this.px(x, stageY - 4 * u, 0.6 * u, 4 * u, "#241a10");
    } else if (V.rig === "bars") {
      // two simple light bars with downlights
      for (const by of [6 * u, 11 * u]) {
        this.px(W * 0.2, by, W * 0.6, 1.4 * u, "#1a1422");
        for (let i = 0; i < 6; i++) {
          const lx = W * 0.2 + (i + 0.5) * (W * 0.6 / 6);
          const c = `hsl(${(hue + i * 20) % 360},85%,${45 + k * 35}%)`;
          this.px(lx - u, by + 1.4 * u, 2 * u, 1.4 * u, c);
          this.px(lx - u, by + 1.4 * u, 2 * u, 1.4 * u, c, this.glow);
        }
      }
      this.beams(W * 0.25, W * 0.75, 13 * u, stageY, hue, V.beams);
    } else {
      // truss + beams
      const x0 = W * 0.12, x1 = W * 0.88, ty = 5 * u;
      this.px(x0 - 3 * u, ty, x1 - x0 + 6 * u, 2 * u, "#16121f");
      for (let i = 0; i < 5; i++) {
        const fx = x0 + ((i + 0.5) / 5) * (x1 - x0);
        const c = `hsl(${(hue + i * 30) % 360},92%,${46 + k * 40}%)`;
        this.px(fx - 1.4 * u, ty + 2 * u, 2.8 * u, 2.6 * u, c);
        this.px(fx - 1.4 * u, ty + 2 * u, 2.8 * u, 2.6 * u, c, this.glow);
      }
      this.beams(x0, x1, ty, stageY, hue, V.beams);
    }
  }

  private beams(x0: number, x1: number, topY: number, stageY: number, hue: number, n: number): void {
    if (n <= 0) return;
    const alpha = 0.06 + this.liveness * (0.12 + this.energy * 0.14 + this.kick * 0.16);
    for (let i = 0; i < n; i++) {
      const ox = x0 + ((i + 0.5) / n) * (x1 - x0);
      const tx = ox + Math.sin(this.beam + i * 1.3) * (x1 - x0) * 0.26;
      const spread = this.w * 0.045 * (0.6 + this.kick);
      const grd = this.glow.createLinearGradient(ox, topY, tx, stageY);
      grd.addColorStop(0, `hsla(${(hue + i * 35) % 360},95%,65%,${alpha})`);
      grd.addColorStop(1, `hsla(${(hue + i * 35) % 360},95%,65%,0)`);
      this.glow.fillStyle = grd;
      this.glow.beginPath();
      this.glow.moveTo(ox, topY + 4);
      this.glow.lineTo(tx - spread, stageY);
      this.glow.lineTo(tx + spread, stageY);
      this.glow.closePath();
      this.glow.fill();
    }
  }

  private speakers(stageY: number, u: number, hue: number): void {
    for (const sx of [6 * u, this.w - 14 * u]) {
      this.px(sx, stageY - 30 * u, 8 * u, 30 * u, "#0e0b16");
      for (const cy of [24, 14, 7]) {
        this.px(sx + 1.5 * u, stageY - cy * u, 5 * u, 5 * u, "#1a1526");
        this.px(sx + 2.5 * u, stageY - (cy - 1) * u, 3 * u, 3 * u, `hsl(${hue},40%,20%)`);
      }
    }
  }

  // ── LED-wall EQ visualizer ──────────────────────────────────────────────────
  private eqWall(stageY: number, u: number, hue: number): void {
    const x0 = this.w * 0.3, x1 = this.w * 0.7, wallH = 22 * u, top = stageY - wallH - 2 * u;
    this.px(x0 - u, top - u, x1 - x0 + 2 * u, wallH + 2 * u, "#070510");
    const n = this.spectrum.length || 24;
    const bw = (x1 - x0) / n;
    for (let i = 0; i < n; i++) {
      const v = (this.spectrum[i] ?? 0) * this.liveness;
      const bh = Math.max(1, v * wallH);
      const c = `hsl(${(hue + i * 6) % 360},90%,${40 + v * 40}%)`;
      this.px(x0 + i * bw + 0.5, top + wallH - bh, bw - 1, bh, c);
      if (v > 0.4) this.px(x0 + i * bw + 0.5, top + wallH - bh, bw - 1, bh, c, this.glow);
    }
  }

  private stageDeck(topY: number, u: number, hue: number): void {
    const W = this.w;
    this.px(0, topY, W, 10 * u, "#0b0913");
    this.px(0, topY, W, 1.5 * u, `hsl(${hue},40%,16%)`);
    const edge = `hsl(${hue},90%,${52 + this.kick * 18}%)`;
    this.px(0, topY - u, W, u, edge);
    this.px(0, topY - u, W, u, edge, this.glow);
    // chasing LED lip
    for (let x = 0; x < W; x += 3.4 * u) {
      const chase = (Math.sin(x * 0.05 + this.beam * 3) * 0.5 + 0.5) * (0.4 + this.liveness * 0.6);
      const c = `hsl(${(hue + x * 0.3) % 360},90%,${45 + chase * 35}%)`;
      this.px(x, topY + 8 * u, 2 * u, 1.6 * u, c);
      if (chase > 0.6) this.px(x, topY + 8 * u, 2 * u, 1.6 * u, c, this.glow);
    }
  }

  // A filled pixel ellipse. Backward-compatible overload:
  //   disc(cx, cy, r, color, g?)        → a circle (existing club callers)
  //   disc(cx, cy, rx, ry, color, g?)   → an ellipse (ported cozy scenes)
  private disc(cx: number, cy: number, rx: number, a: number | string, b?: string | CanvasRenderingContext2D, c?: CanvasRenderingContext2D): void {
    let ry: number, color: string, g: CanvasRenderingContext2D;
    if (typeof a === "number") { ry = a; color = b as string; g = c ?? this.g; }
    else { ry = rx; color = a; g = (b as CanvasRenderingContext2D) ?? this.g; }
    if (rx <= 0 || ry <= 0) return;
    const ri = Math.round(ry);
    for (let yy = -ri; yy <= ri; yy++) {
      const w = rx * Math.sqrt(Math.max(0, 1 - (yy / ry) * (yy / ry)));
      if (w >= 0.4) this.px(cx - w, cy + yy, w * 2, 1, color, g);
    }
  }

  // ── the DJ: booth + 2 turntables + mixer + avatar + vibe animation ──────────
  private dj(cx: number, stageY: number, u: number, t: number, intensity: number, moment = false): void {
    const live = this.liveness;
    // always-on idle dance: the DJ is never frozen, even with nobody around
    const idle = (1 + 0.7 * Math.sin(t * 1.6)) * u;
    const beatBob = (0.6 + this.kick * 4 * intensity) * Math.abs(Math.sin(t * (4 + intensity * 4)));
    const bob = idle + beatBob * live;
    const sway = Math.sin(t * 1.1) * 1.6 * u + Math.sin(t * 5) * this.kick * 1.3 * u * live; // side-to-side groove
    const jacket = `hsl(${this.s.jacketHue},55%,${52 + this.kick * 18}%)`;
    const jacketHi = `hsl(${this.s.jacketHue},60%,70%)`;
    const jacketSh = `hsl(${this.s.jacketHue},58%,28%)`;
    const skin = "#caa07a";
    const y = stageY - bob;
    const dcx = cx + sway; // the DJ's body grooves; the booth/decks stay put

    // body behind booth (sways)
    this.block(dcx - 3 * u, y - 16 * u, 6 * u, 8 * u, jacket, jacketHi, jacketSh); // torso
    const headY = y - 22 * u;
    this.px(dcx - 2.4 * u, headY, 4.8 * u, 4.4 * u, skin); // head
    // headphones (always)
    this.px(dcx - 3.4 * u, headY + u, 1.2 * u, 2.6 * u, "#eae6f6");
    this.px(dcx + 2.2 * u, headY + u, 1.2 * u, 2.6 * u, "#eae6f6");
    this.px(dcx - 3.4 * u, headY - 0.6 * u, 6.8 * u, 1 * u, "#cfc8e0");
    this.avatarHat(dcx, headY, u);

    // ── booth: dark slab, two turntables, a mixer ──
    const bw = 30 * u;
    const boothTop = stageY - 11 * u;
    this.px(cx - bw / 2 - u, boothTop - u, bw + 2 * u, 11 * u + u, jacketSh); // outline
    this.px(cx - bw / 2, boothTop, bw, 11 * u, "#0c0a16"); // body
    this.px(cx - bw / 2, boothTop, bw, 0.8 * u, `hsl(${this.s.hue},55%,32%)`); // subtle lit top edge

    const labelHue = (this.s.hue + 30) % 360;
    const pcy = boothTop + 5 * u;
    for (const dx of [-bw / 4 - 0.5 * u, bw / 4 + 0.5 * u]) {
      const pcx = cx + dx;
      this.disc(pcx, pcy, 4 * u, "#070510"); // platter rim
      this.disc(pcx, pcy, 3.4 * u, "#1b1726"); // vinyl
      this.disc(pcx, pcy, 1.5 * u, `hsl(${labelHue},85%,${52 + this.kick * 26}%)`); // label
      this.disc(pcx, pcy, 1.5 * u, `hsla(${labelHue},85%,62%,0.5)`, this.glow); // label glow
      this.px(pcx - 0.4 * u, pcy - 0.4 * u, 0.9 * u, 0.9 * u, "#070510"); // spindle
      const a = this.beam * (3 + (this.s.vibe === "rave" ? 4 : 0)) + (dx > 0 ? 1.7 : 0);
      this.px(pcx + Math.cos(a) * 2.6 * u - 0.4 * u, pcy + Math.sin(a) * 2.6 * u - 0.4 * u, 0.9 * u, 0.9 * u, `hsl(${labelHue},90%,75%)`); // spin mark
      this.px(pcx + 2.6 * u, pcy - 4 * u, 0.7 * u, 4.6 * u, "#b9b1cc"); // tonearm post
      this.px(pcx + 0.6 * u, pcy - 3.8 * u, 2.2 * u, 0.7 * u, "#b9b1cc"); // tonearm
    }

    // centre mixer: channel faders + crossfader, knobs react to the kick
    const mx = cx, my = boothTop + 2 * u;
    this.px(mx - 2.6 * u, my, 5.2 * u, 8 * u, "#15111f");
    this.px(mx - 1.7 * u, my + 1 * u, 0.7 * u, 4.5 * u, "#2a2440"); // fader tracks
    this.px(mx + 1 * u, my + 1 * u, 0.7 * u, 4.5 * u, "#2a2440");
    this.px(mx - 1.9 * u, my + 1.5 * u + this.kick * 2.2 * u, 1.1 * u, 0.8 * u, `hsl(${this.s.hue},90%,62%)`);
    this.px(mx + 0.8 * u, my + 3 * u - this.kick * 2.2 * u, 1.1 * u, 0.8 * u, `hsl(${this.s.hue},90%,62%)`);
    this.px(mx - 2.2 * u, my + 6.4 * u, 4.4 * u, 0.7 * u, "#2a2440"); // crossfader track
    // rests centred; nudges on the beat (a cut), instead of sliding back and forth
    this.px(mx - 0.5 * u + this.kick * 1.7 * u, my + 6 * u, 1 * u, 1.5 * u, `hsl(${labelHue},90%,66%)`);

    // arms: on a "moment" (the drop) the DJ throws BOTH hands up to the crowd;
    // otherwise works the decks (rave throws one fist up on the kick)
    if (moment) {
      const raise = headY - 4 * u - Math.abs(Math.sin(t * 12)) * 2 * u;
      this.limb(dcx - 2.5 * u, y - 14 * u, dcx - 5 * u, raise, 1.6 * u, skin);
      this.limb(dcx + 2.5 * u, y - 14 * u, dcx + 5 * u, raise, 1.6 * u, skin);
    } else {
      // shoulders sway with the body, hands stay on the decks → grooving while mixing
      const fistUp = this.s.vibe === "rave" && this.kick > 0.5;
      const scratch = Math.sin(t * (10 + intensity * 10)) * this.kick * 3 * u * intensity;
      this.limb(dcx - 2.5 * u, y - 14 * u, cx - bw / 4 + scratch, pcy, 1.6 * u, skin);
      if (fistUp) this.limb(dcx + 2.5 * u, y - 14 * u, dcx + 5 * u, headY - 4 * u, 1.6 * u, skin);
      else this.limb(dcx + 2.5 * u, y - 14 * u, cx + bw / 4, pcy - this.kick * 2 * u, 1.6 * u, skin);
    }
  }

  private avatarHat(cx: number, headY: number, u: number): void {
    const a: AvatarId = this.s.avatar;
    if (a === "beanie") {
      this.px(cx - 2.6 * u, headY - 1.6 * u, 5.2 * u, 2.4 * u, `hsl(${this.s.hue},70%,55%)`);
      this.px(cx - 2.6 * u, headY + 0.4 * u, 5.2 * u, 0.8 * u, `hsl(${this.s.hue},60%,40%)`);
    } else if (a === "snapback") {
      this.px(cx - 2.6 * u, headY - 1.4 * u, 5.2 * u, 2 * u, "#2a2440");
      this.px(cx - 5 * u, headY + 0.4 * u, 3 * u, 1 * u, "#1a1530"); // brim
    } else if (a === "visor") {
      this.px(cx - 2.8 * u, headY - 1 * u, 5.6 * u, 1.6 * u, "#101018");
      const c = `hsl(${(this.s.hue + 20) % 360},95%,65%)`;
      this.px(cx - 2.6 * u, headY + 1.2 * u, 5.2 * u, 0.9 * u, c); // glowing LED bar
      this.px(cx - 2.6 * u, headY + 1.2 * u, 5.2 * u, 0.9 * u, c, this.glow);
    } else {
      // afro
      this.px(cx - 3.4 * u, headY - 3 * u, 6.8 * u, 4 * u, "#23150f");
      this.px(cx - 4 * u, headY - 1 * u, 1.4 * u, 3 * u, "#23150f");
      this.px(cx + 2.6 * u, headY - 1 * u, 1.4 * u, 3 * u, "#23150f");
    }
  }

  private floorGlow(y: number, hue: number): void {
    const glow = this.kick * 0.6 + this.energy * 0.5;
    const grd = this.g.createLinearGradient(0, y, 0, this.h);
    grd.addColorStop(0, `hsla(${hue},80%,${14 + glow * 32}%,${0.6 + this.liveness * 0.35})`);
    grd.addColorStop(1, "#04030a");
    this.g.fillStyle = grd;
    this.g.fillRect(0, y, this.w, this.h - y);
  }

  // ── crowd with vibe-based dance moves ───────────────────────────────────────
  private crowd(floorY: number, u: number, t: number, vibe: VibeProfile, venueScale: number): void {
    const want = Math.round((6 + this.energy * 34) * vibe.crowd * venueScale * this.liveness * (this.w / 360))
      + Math.round(this.presenceCount * 3 * venueScale) // each real person → a few dancers
      + (this.s.live ? 0 : 2);
    while (this.dancers.length < want)
      this.dancers.push({ x: Math.random(), ph: Math.random() * 6, scale: 0.7 + Math.random() * 0.4, row: Math.random() < 0.5 ? 0 : 1, hair: Math.random() * 30 - 15 });
    while (this.dancers.length > want) this.dancers.pop();

    const moves = vibe.moves;
    const rimC = `hsla(${(this.s.hue + 18) % 360},70%,62%,0.5)`;
    const sorted = [...this.dancers].sort((a, b) => a.row - b.row);
    for (const d of sorted) {
      const depth = d.row === 0 ? 0.78 : 1;
      const s = u * d.scale * depth;
      const baseX = d.x * this.w;
      const fy = floorY - (d.row === 0 ? 3 * u : 0);
      const move = moves[(d.x * moves.length) | 0] ?? "nod";
      const ph = t * (vibe.bpm / 60) * Math.PI + d.ph;
      let dx = 0, bob = 0, armUp = 0, clap = 0;
      const amp = vibe.motion;
      const hit = this.kick;
      switch (move) {
        case "sway": dx = Math.sin(ph * 0.5) * 2 * s * amp; bob = Math.abs(Math.sin(ph * 0.5)) * 1 * s; break;
        case "nod": bob = Math.abs(Math.sin(ph)) * 1.6 * s * amp; break;
        case "twostep": dx = Math.sign(Math.sin(ph)) * 1.5 * s * amp; bob = Math.abs(Math.sin(ph * 2)) * 1.2 * s; break;
        case "clap": bob = Math.abs(Math.sin(ph)) * 1.2 * s; clap = (Math.sin(ph) * 0.5 + 0.5); break;
        case "pump": bob = hit * 2 * s; armUp = hit * 4 * s; break;
        case "wave": armUp = (Math.sin(ph) * 0.5 + 0.5) * 4 * s; bob = Math.abs(Math.sin(ph * 0.5)) * 1 * s; break;
        case "jump": bob = Math.abs(Math.sin(ph)) * 4 * s * amp + hit * 3 * s; break;
      }
      const x = baseX + dx;
      const bodyTop = fy - 8 * s - bob;
      const headTop = bodyTop - 3.2 * s;
      const lit = 12 + this.kick * 11;
      const bodyC = `hsl(${(this.s.hue + d.hair + 360) % 360},30%,${lit}%)`;
      const hairC = `hsl(${(this.s.hue + d.hair + 360) % 360},34%,${Math.max(7, lit - 5)}%)`;
      // tapered silhouette: wide shoulders → narrower neck → head
      this.px(x - 2.4 * s, bodyTop + 2.5 * s, 4.8 * s, 5.5 * s, bodyC); // shoulders/torso
      this.px(x - 1.7 * s, bodyTop, 3.4 * s, 3 * s, bodyC); // upper torso/neck
      this.px(x - 1.5 * s, headTop, 3 * s, 3 * s, bodyC); // head
      this.px(x - 1.7 * s, headTop - 0.5 * s, 3.4 * s, 1.3 * s, hairC); // hair tuft on top
      // soft neon backlight down the left edge (a rim-lit silhouette, not a face)
      this.px(x - 1.7 * s, headTop, 0.7 * s, 3.6 * s, rimC);
      this.px(x - 2.4 * s, bodyTop + 2.5 * s, 0.7 * s, 3 * s, rimC);
      // arms
      if (armUp > 0) {
        this.px(x - 2.8 * s, headTop - armUp, 1.1 * s, 4.6 * s + armUp, bodyC);
        this.px(x + 1.7 * s, headTop - armUp, 1.1 * s, 4.6 * s + armUp, bodyC);
      } else if (clap > 0) {
        const hands = (1 - clap) * 1.6 * s;
        const handC = `hsla(${(this.s.hue + 18) % 360},45%,52%,0.6)`;
        this.px(x - 2.1 * s + hands, bodyTop + 2.6 * s, 0.9 * s, 0.9 * s, handC);
        this.px(x + 1.2 * s - hands, bodyTop + 2.6 * s, 0.9 * s, 0.9 * s, handC);
      }
    }
  }

  // ── "the crowd goes wild" banner over the stage during a drop ───────────────
  private drawMoment(stageY: number, u: number): void {
    const g = this.g;
    const text = "THE CROWD GOES WILD!";
    const size = Math.max(5, Math.round(4.5 * u));
    g.font = `${size}px "Press Start 2P", monospace`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    const y = stageY - 38 * u;
    const w = g.measureText(text).width;
    const flash = 0.5 + 0.5 * Math.sin(performance.now() / 70);
    g.fillStyle = `rgba(255,70,40,${0.8 + flash * 0.2})`;
    g.fillRect(this.w / 2 - w / 2 - 6, y - size, w + 12, size * 2);
    g.fillStyle = `hsl(${45 + flash * 15},100%,${68 + flash * 20}%)`;
    g.fillText(text, this.w / 2, y);
  }

  // ── marquee ("● LIVE TONIGHT ●" idle / DJ name live) ────────────────────────
  private marquee(stageY: number, u: number): void {
    const text = this.liveness > 0.5 ? this.s.djName : VENUES[this.s.venue].label;
    const g = this.g;
    const size = Math.max(5, Math.round(5 * u));
    g.font = `${size}px "Press Start 2P", monospace`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    const y = stageY - 30 * u;
    g.fillStyle = `hsla(${this.s.hue},90%,12%,0.85)`;
    g.fillRect(this.w / 2 - g.measureText(text).width / 2 - 4, y - size, g.measureText(text).width + 8, size * 2);
    g.fillStyle = `hsl(${(this.s.hue + 10) % 360},95%,${60 + this.kick * 20}%)`;
    g.fillText(text, this.w / 2, y);
  }

  // ── desk clock + date (pixel font, top-right) ───────────────────────────────
  private clock(now: Date, u: number): void {
    const g = this.g;
    let h = now.getHours();
    const m = now.getMinutes(), sec = now.getSeconds();
    let suffix = "";
    if (!this.s.clock24) { suffix = h >= 12 ? " PM" : " AM"; h = h % 12 || 12; }
    const pad = (n: number) => String(n).padStart(2, "0");
    const time = `${this.s.clock24 ? pad(h) : h}:${pad(m)}:${pad(sec)}${suffix}`;
    const size = Math.max(4, Math.round(3.4 * u));
    g.font = `${size}px "Press Start 2P", monospace`;
    g.textAlign = "right";
    g.textBaseline = "top";
    g.fillStyle = `hsl(${this.s.hue},90%,72%)`;
    g.fillText(time, this.w - 4 * u, 4 * u);
    if (this.s.showDate) {
      const wd = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][now.getDay()];
      const mo = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"][now.getMonth()];
      g.font = `${Math.max(3, Math.round(2.6 * u))}px "Press Start 2P", monospace`;
      g.fillStyle = `hsl(${this.s.hue},60%,55%)`;
      g.fillText(`${wd} · ${mo} ${now.getDate()}`, this.w - 4 * u, 4 * u + size + 2 * u);
    }
  }
}
