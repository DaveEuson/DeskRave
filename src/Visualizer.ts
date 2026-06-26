import type { Levels } from "./AudioStream";
import { SETTING_LABEL, VENUES, VIBES, clockAmbient, type AvatarId, type Setting, type VenueConfig, type VenueId, type VibeName, type VibeProfile } from "./config";

export interface SceneState {
  hue: number; // club palette base
  jacketHue: number;
  venue: VenueId;
  vibe: VibeName;
  avatar: AvatarId;
  live: boolean;
  djName: string;
  setting: Setting; // cafe (morning) / park (afternoon) / club (night) — from the clock
  showClock: boolean;
  showDate: boolean;
  clock24: boolean;
}

const PIXEL_H = 200; // internal render height; CSS upscales nearest-neighbor

interface Dancer { x: number; ph: number; scale: number; row: number; hair: number; }

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
  private energy = 0;
  private kick = 0;
  private beam = 0;
  private liveness = 0; // eased 0..1 for smooth idle↔live wind-down
  private spectrum: number[] = [];
  private presenceCount = 0; // real people the camera sees → guarantees some crowd

  private s: SceneState = {
    hue: 288, jacketHue: 288, venue: "club", vibe: "groove", avatar: "beanie",
    live: false, djName: "DJ NOVA", setting: "club", showClock: true, showDate: true, clock24: false,
  };

  constructor(private canvas: HTMLCanvasElement) {
    this.g = canvas.getContext("2d")!;
    this.glowCanvas = document.createElement("canvas");
    this.glow = this.glowCanvas.getContext("2d")!;
    this.bloomCanvas = document.createElement("canvas");
    this.bloom = this.bloomCanvas.getContext("2d")!;
    this.resize();
    addEventListener("resize", () => this.resize());
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
  private block(x: number, y: number, w: number, h: number, base: string, hi: string, outline: string): void {
    this.px(x - 1, y - 1, w + 2, h + 2, outline);
    this.px(x, y, w, h, base);
    this.px(x, y, w, Math.max(1, h * 0.34), hi);
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
    const V = VENUES[this.s.venue];
    const vibe = VIBES[this.s.vibe];
    const hue = this.s.hue;
    const stageTopY = Math.round(H * 0.6);

    // "the crowd goes wild" on a drop (club only): high energy + a strong kick, cooldown'd
    if (this.s.setting === "club" && this.s.live && this.energy > 0.7 && this.kick > 0.6 && t - this.lastMomentT > 8) {
      this.momentT = t + 2.2;
      this.lastMomentT = t;
    }
    const moment = this.s.setting === "club" && t < this.momentT;

    this.glow.clearRect(0, 0, W, H);
    if (this.s.setting === "cafe") this.renderCafe(u, t);
    else if (this.s.setting === "park") this.renderPark(u, t);
    else this.renderClub(u, t, V, vibe, hue, stageTopY, moment);
    this.marquee(stageTopY, u);
    if (moment) this.drawMoment(stageTopY, u);

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

  // ── CLUB (evening/night) — the original reactive nightclub ──────────────────
  private renderClub(u: number, t: number, V: VenueConfig, vibe: VibeProfile, hue: number, stageTopY: number, moment: boolean): void {
    const W = this.w, H = this.h;
    this.sky(V.sky, hue, t);
    this.rig(V, hue, stageTopY, u);
    if (V.speakers) this.speakers(stageTopY, u, hue);
    this.eqWall(stageTopY, u, hue);
    this.stageDeck(stageTopY, u, hue);
    this.dj((W * 0.5) | 0, stageTopY, u, t, vibe.djIntensity, moment);
    this.floorGlow(stageTopY + 10 * u, hue);
    this.crowd(Math.round(H * 0.95), u, t, vibe, V.crowdScale);
  }

  // ── CAFÉ (morning) — cozy coffee shop, a producer chilling with a laptop ────
  private renderCafe(u: number, t: number): void {
    const g = this.g, W = this.w, H = this.h, k = this.kick;
    const wall = g.createLinearGradient(0, 0, 0, H);
    wall.addColorStop(0, "#3a2a20"); wall.addColorStop(0.7, "#2a1d16"); wall.addColorStop(1, "#19110c");
    g.fillStyle = wall; g.fillRect(0, 0, W, H);

    // window with a soft morning sky + sun
    const wx = W * 0.56, wy = 7 * u, ww = W * 0.36, wh = 32 * u;
    this.px(wx - 1.5 * u, wy - 1.5 * u, ww + 3 * u, wh + 3 * u, "#5a4030");
    const sky = g.createLinearGradient(0, wy, 0, wy + wh);
    sky.addColorStop(0, "#bfe2f5"); sky.addColorStop(0.55, "#f6dcb4"); sky.addColorStop(1, "#f6c889");
    g.fillStyle = sky; g.fillRect(wx, wy, ww, wh);
    this.disc(wx + ww * 0.72, wy + wh * 0.3, 4 * u, "#fff4c4");
    this.disc(wx + ww * 0.72, wy + wh * 0.3, 7 * u, "rgba(255,240,180,0.45)", this.glow);
    this.px(wx + ww / 2, wy, 0.8 * u, wh, "#5a4030");
    this.px(wx, wy + wh / 2, ww, 0.8 * u, "#5a4030");

    // wood floor
    const floorY = Math.round(H * 0.74);
    this.px(0, floorY, W, H - floorY, "#4a3324");
    for (let x = 0; x < W; x += 8 * u) this.px(x, floorY, 0.6 * u, H - floorY, "#3a271a");

    // counter + espresso machine
    const cx = W * 0.15, cy = floorY - 13 * u;
    this.px(cx - 8 * u, cy, 16 * u, 13 * u, "#3a261a");
    this.px(cx - 8 * u, cy, 16 * u, 1.4 * u, "#5a4030");
    this.px(cx - 3 * u, cy - 6 * u, 6 * u, 6 * u, "#c4c8cc");
    this.px(cx - 2 * u, cy - 4 * u, 1.4 * u, 1.4 * u, `hsl(0,80%,${48 + k * 34}%)`);

    // chalkboard with a tiny EQ
    const bx = W * 0.33, by = 12 * u;
    this.px(bx, by, 12 * u, 9 * u, "#171410");
    this.px(bx - 0.6 * u, by - 0.6 * u, 13.2 * u, 0.6 * u, "#5a4030");
    for (let i = 0; i < 8; i++) { const v = (this.spectrum[i * 2] ?? 0) * 6 * u; this.px(bx + 1.6 * u + i * 1.2 * u, by + 7.5 * u - v, 0.9 * u, Math.max(1, v), "#d8c8a0"); }

    // the producer at a table with a glowing laptop
    const p = W * 0.64, feet = floorY;
    this.px(p - 6 * u, feet - 6 * u, 12 * u, 6 * u, "#3a271a"); // table
    const jacket = `hsl(${this.s.jacketHue},35%,54%)`;
    this.block(p - 3 * u, feet - 18 * u, 6 * u, 8 * u, jacket, `hsl(${this.s.jacketHue},40%,68%)`, `hsl(${this.s.jacketHue},38%,30%)`);
    const headY = feet - 24 * u;
    this.px(p - 2.4 * u, headY, 4.8 * u, 4.4 * u, "#caa07a");
    this.px(p - 3.4 * u, headY + u, 1.2 * u, 2.4 * u, "#2a2440");
    this.px(p + 2.2 * u, headY + u, 1.2 * u, 2.4 * u, "#2a2440");
    this.avatarHat(p, headY, u);
    this.px(p - 2.5 * u, feet - 9 * u, 5 * u, 3.4 * u, "#15111a");
    const screen = `hsl(${this.s.hue},70%,${40 + k * 34}%)`;
    this.px(p - 2 * u, feet - 8.6 * u, 4 * u, 2.4 * u, screen);
    this.px(p - 2 * u, feet - 8.6 * u, 4 * u, 2.4 * u, `hsla(${this.s.hue},70%,58%,0.5)`, this.glow);
    // coffee + steam
    this.px(p + 4 * u, feet - 7.5 * u, 2 * u, 2 * u, "#e8e2d8");
    for (let i = 0; i < 2; i++) this.px(p + 4.6 * u, feet - 9 * u - ((t * 4 + i * 3) % 5) * u, 0.6 * u, 0.6 * u, "rgba(225,225,225,0.4)");

    // relaxed patrons + dim string lights
    this.seatedPerson(W * 0.87, floorY, u, t, "#8a6a9a");
    this.seatedPerson(W * 0.42, floorY, u, t, "#6a8a7a");
    for (let x = 4 * u; x < W; x += 7 * u) { const sag = Math.sin((x / W) * Math.PI) * 3 * u; this.px(x, 4 * u + sag, 1.4 * u, 1.4 * u, "hsl(40,75%,60%)"); }
  }

  // ── PARK (afternoon) — outdoors, blue sky, a busker + a boombox ─────────────
  private renderPark(u: number, t: number): void {
    const g = this.g, W = this.w, H = this.h, k = this.kick;
    const sky = g.createLinearGradient(0, 0, 0, H * 0.7);
    sky.addColorStop(0, "#5db8e8"); sky.addColorStop(1, "#bfe6f2");
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    // sun
    this.disc(W * 0.82, 12 * u, 6 * u, "#fff3b0");
    this.disc(W * 0.82, 12 * u, 10 * u, "rgba(255,245,180,0.4)", this.glow);
    // drifting clouds
    for (let i = 0; i < 3; i++) { const cxp = ((t * (4 + i) + i * 140) % (W + 60)) - 30; const cyp = (8 + i * 7) * u; this.cloud(cxp, cyp, u); }
    // distant treeline
    const hillY = Math.round(H * 0.6);
    g.fillStyle = "#3f7a3a"; g.fillRect(0, hillY, W, 6 * u);
    // grass
    const grassY = Math.round(H * 0.66);
    const grass = g.createLinearGradient(0, grassY, 0, H);
    grass.addColorStop(0, "#5aa84a"); grass.addColorStop(1, "#3c7a34");
    g.fillStyle = grass; g.fillRect(0, grassY, W, H - grassY);
    // trees
    this.tree(W * 0.12, grassY, u);
    this.tree(W * 0.9, grassY, u);
    // busker with a boombox (pulses with the kick)
    const p = W * 0.5, feet = grassY + 10 * u;
    this.px(p - 9 * u, feet - 1 * u, 6 * u, 2 * u, "#7a5a3a"); // picnic blanket edge
    const boom = p + 7 * u;
    this.px(boom - 4 * u, feet - 6 * u, 8 * u, 6 * u, "#2a2630"); // boombox
    for (const dx of [-2, 2]) { this.disc(boom + dx * u, feet - 3 * u, 1.8 * u + k * 0.8 * u, `hsl(${this.s.hue},80%,${55 + k * 25}%)`); this.disc(boom + dx * u, feet - 3 * u, 2 * u, `hsla(${this.s.hue},80%,60%,0.4)`, this.glow); }
    // busker sitting
    const bob = this.kick * 2 * u * Math.abs(Math.sin(t * 5));
    this.px(p - 2.4 * u, feet - 9 * u - bob, 4.8 * u, 4 * u, "#caa07a"); // head
    this.block(p - 3 * u, feet - 5 * u - bob, 6 * u, 5 * u, `hsl(${this.s.jacketHue},45%,55%)`, `hsl(${this.s.jacketHue},50%,68%)`, `hsl(${this.s.jacketHue},48%,32%)`);
    this.avatarHat(p, feet - 9 * u - bob, u);
    // loungers + a couple of casual dancers on the grass
    this.seatedPerson(W * 0.3, grassY + 14 * u, u, t, "#c06a6a", true);
    this.seatedPerson(W * 0.7, grassY + 16 * u, u, t, "#6a6ac0", true);
    this.parkDancer(W * 0.2, grassY + 22 * u, u, t);
    this.parkDancer(W * 0.78, grassY + 24 * u, u, t);
  }

  // small day-scene figures/props
  private seatedPerson(x: number, baseY: number, u: number, t: number, color: string, grass = false): void {
    const sway = Math.sin(t * 1.4 + x) * 0.8 * u;
    const y = baseY - (grass ? 2 * u : 8 * u);
    if (!grass) this.px(x - 2 * u, y, 4 * u, 6 * u, "#2a1d16"); // chair back
    this.px(x - 1.8 * u + sway, y - 5 * u, 3.6 * u, 5 * u, color); // torso
    this.px(x - 1.4 * u + sway, y - 8 * u, 2.8 * u, 3 * u, "#caa07a"); // head
    this.px(x + 2.5 * u, y - 1.5 * u, 1.6 * u, 1.6 * u, "#e8e2d8"); // cup
  }
  private parkDancer(x: number, baseY: number, u: number, t: number): void {
    const ph = t * 4 + x;
    const bob = Math.abs(Math.sin(ph)) * (1.5 * u + this.kick * 4 * u);
    const top = baseY - 8 * u - bob;
    this.px(x - 1.8 * u, top, 3.6 * u, 8 * u, "#2f5a3a");
    this.px(x - 1.4 * u, top - 3 * u, 2.8 * u, 3 * u, "#2f5a3a");
    const armUp = (Math.sin(ph) * 0.5 + 0.5) * 3 * u;
    this.px(x - 2.6 * u, top - armUp, 1 * u, 3 * u + armUp, "#2f5a3a");
    this.px(x + 1.6 * u, top - armUp, 1 * u, 3 * u + armUp, "#2f5a3a");
  }
  private cloud(x: number, y: number, u: number): void {
    this.px(x, y, 10 * u, 3 * u, "rgba(255,255,255,0.85)");
    this.px(x + 2 * u, y - 2 * u, 6 * u, 3 * u, "rgba(255,255,255,0.85)");
  }
  private tree(x: number, groundY: number, u: number): void {
    this.px(x - 1.2 * u, groundY - 10 * u, 2.4 * u, 12 * u, "#5a3a22"); // trunk
    this.disc(x, groundY - 14 * u, 7 * u, "#2f6a2f");
    this.disc(x - 4 * u, groundY - 11 * u, 5 * u, "#357435");
    this.disc(x + 4 * u, groundY - 11 * u, 5 * u, "#357435");
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
  private rig(V: VenueConfig, hue: number, stageY: number, u: number): void {
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

  // a filled pixel disc (round platter), rows clipped to a circle
  private disc(cx: number, cy: number, r: number, color: string, g = this.g): void {
    const ri = Math.ceil(r);
    for (let dy = -ri; dy <= ri; dy++) {
      const w = Math.sqrt(Math.max(0, r * r - dy * dy));
      if (w >= 0.5) this.px(cx - w, cy + dy, w * 2, 1, color, g);
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
    this.px(mx - 0.5 * u + Math.sin(this.beam * 2) * 1.4 * u, my + 6 * u, 1 * u, 1.5 * u, `hsl(${labelHue},90%,66%)`);

    // arms: on a "moment" (the drop) the DJ throws BOTH hands up to the crowd;
    // otherwise works the decks (rave throws one fist up on the kick)
    if (moment) {
      const raise = headY - 4 * u - Math.abs(Math.sin(t * 12)) * 2 * u;
      this.limb(dcx - 2.5 * u, y - 14 * u, dcx - 5 * u, raise, u, skin);
      this.limb(dcx + 2.5 * u, y - 14 * u, dcx + 5 * u, raise, u, skin);
    } else {
      // shoulders sway with the body, hands stay on the decks → grooving while mixing
      const fistUp = this.s.vibe === "rave" && this.kick > 0.5;
      const scratch = Math.sin(t * (10 + intensity * 10)) * this.kick * 3 * u * intensity;
      this.limb(dcx - 2.5 * u, y - 14 * u, cx - bw / 4 + scratch, pcy, u, skin);
      if (fistUp) this.limb(dcx + 2.5 * u, y - 14 * u, dcx + 5 * u, headY - 4 * u, u, skin);
      else this.limb(dcx + 2.5 * u, y - 14 * u, cx + bw / 4, pcy - this.kick * 2 * u, u, skin);
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

  private limb(x0: number, y0: number, x1: number, y1: number, u: number, color: string): void {
    const steps = 4;
    for (let i = 0; i <= steps; i++) {
      const x = x0 + ((x1 - x0) * i) / steps, y = y0 + ((y1 - y0) * i) / steps;
      this.px(x - 0.8 * u, y - 0.8 * u, 1.6 * u, 1.6 * u, color);
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
    const text = this.liveness > 0.5 ? this.s.djName : SETTING_LABEL[this.s.setting];
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
