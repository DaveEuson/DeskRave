import type { Levels } from "./AudioStream";
import { VENUES, VIBES, clockAmbient, type AvatarId, type VenueConfig, type VenueId, type VibeName, type VibeProfile } from "./config";

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

// The Pixel DJ desk scene. Low-res backbuffer + additive bloom. Driven by the live
// AnalyserNode while a track plays; falls back to a real-clock idle "closing time"
// wash when nothing is playing.
export class Visualizer {
  private g: CanvasRenderingContext2D;
  private glowCanvas: HTMLCanvasElement;
  private glow: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dancers: Dancer[] = [];
  private energy = 0;
  private kick = 0;
  private beam = 0;
  private liveness = 0; // eased 0..1 for smooth idle↔live wind-down
  private spectrum: number[] = [];

  private s: SceneState = {
    hue: 288, jacketHue: 288, venue: "club", vibe: "groove", avatar: "beanie",
    live: false, djName: "DJ NOVA", showClock: true, showDate: true, clock24: false,
  };

  constructor(private canvas: HTMLCanvasElement) {
    this.g = canvas.getContext("2d")!;
    this.glowCanvas = document.createElement("canvas");
    this.glow = this.glowCanvas.getContext("2d")!;
    this.resize();
    addEventListener("resize", () => this.resize());
  }

  resize(): void {
    const cssW = this.canvas.clientWidth || 640;
    const cssH = this.canvas.clientHeight || 360;
    this.h = PIXEL_H;
    this.w = Math.max(200, Math.round(PIXEL_H * (cssW / cssH)));
    this.canvas.width = this.w;
    this.canvas.height = this.h;
    this.glowCanvas.width = this.w;
    this.glowCanvas.height = this.h;
    this.g.imageSmoothingEnabled = false;
    this.glow.imageSmoothingEnabled = false;
  }

  setState(p: Partial<SceneState>): void {
    Object.assign(this.s, p);
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

    this.glow.clearRect(0, 0, W, H);
    this.sky(V.sky, hue, t);
    this.rig(V, hue, stageTopY, u);
    if (V.speakers) this.speakers(stageTopY, u, hue);
    this.eqWall(stageTopY, u, hue);
    this.stageDeck(stageTopY, u, hue);
    this.dj((W * 0.5) | 0, stageTopY, u, t, vibe.djIntensity);
    this.floorGlow(stageTopY + 10 * u, hue);
    this.crowd(Math.round(H * 0.95), u, t, vibe, V.crowdScale);
    this.marquee(stageTopY, u);

    // bloom
    this.g.save();
    this.g.globalCompositeOperation = "lighter";
    this.g.globalAlpha = 0.9;
    this.g.filter = "blur(2px)";
    this.g.drawImage(this.glowCanvas, 0, 0);
    this.g.filter = "none";
    this.g.restore();

    if (this.s.showClock) this.clock(now, u);
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

  // ── the DJ: booth + 2 turntables + mixer + avatar + vibe animation ──────────
  private dj(cx: number, stageY: number, u: number, t: number, intensity: number): void {
    const live = this.liveness;
    const beatBob = (0.6 + this.kick * 4 * intensity) * Math.abs(Math.sin(t * (4 + intensity * 4)));
    const bob = beatBob * live + 0.3 * u;
    const jacket = `hsl(${this.s.jacketHue},55%,${52 + this.kick * 18}%)`;
    const jacketHi = `hsl(${this.s.jacketHue},60%,70%)`;
    const jacketSh = `hsl(${this.s.jacketHue},58%,28%)`;
    const skin = "#caa07a";
    const y = stageY - bob;

    // body behind booth
    this.block(cx - 3 * u, y - 16 * u, 6 * u, 8 * u, jacket, jacketHi, jacketSh); // torso
    const headY = y - 22 * u;
    this.px(cx - 2.4 * u, headY, 4.8 * u, 4.4 * u, skin); // head
    // headphones (always)
    this.px(cx - 3.4 * u, headY + u, 1.2 * u, 2.6 * u, "#eae6f6");
    this.px(cx + 2.2 * u, headY + u, 1.2 * u, 2.6 * u, "#eae6f6");
    this.px(cx - 3.4 * u, headY - 0.6 * u, 6.8 * u, 1 * u, "#cfc8e0");
    this.avatarHat(cx, headY, u);

    // arms working the decks; rave throws a fist up on the kick
    const fistUp = this.s.vibe === "rave" && this.kick > 0.5;
    const scratch = Math.sin(t * (10 + intensity * 10)) * this.kick * 3 * u * intensity;
    this.limb(cx - 2.5 * u, y - 14 * u, cx - 6 * u + scratch, stageY - 7 * u, u, skin);
    if (fistUp) this.limb(cx + 2.5 * u, y - 14 * u, cx + 5 * u, headY - 4 * u, u, skin);
    else this.limb(cx + 2.5 * u, y - 14 * u, cx + 6 * u, stageY - 7 * u - this.kick * 2 * u, u, skin);

    // booth + mixer + two turntables
    const bw = 26 * u;
    this.px(cx - bw / 2 - u, stageY - 9 * u - u, bw + 2 * u, 9 * u + u, jacketSh);
    this.px(cx - bw / 2, stageY - 9 * u, bw, 9 * u, "#0c0a16");
    this.px(cx - bw / 2, stageY - 9 * u, bw, 1.4 * u, `hsl(${this.s.hue},90%,55%)`);
    this.px(cx - 2 * u, stageY - 8 * u, 4 * u, 6 * u, "#15111f"); // mixer
    for (let i = 0; i < 3; i++) this.px(cx - 1.2 * u + i * 1.2 * u, stageY - 6 * u + (i % 2) * u, 0.8 * u, 0.8 * u, `hsl(${this.s.hue},90%,60%)`);
    for (const dx of [-bw / 4 - u, bw / 4 + u]) {
      const pcx = cx + dx, pcy = stageY - 5 * u;
      this.px(pcx - 3 * u, pcy - 3 * u, 6 * u, 6 * u, `hsl(${(this.s.hue + 30) % 360},85%,${55 + this.kick * 25}%)`);
      this.px(pcx - 3 * u, pcy - 3 * u, 6 * u, 6 * u, `hsla(${(this.s.hue + 30) % 360},85%,60%,0.6)`, this.glow);
      const a = this.beam * 3 + (dx > 0 ? 1.6 : 0);
      this.px(pcx + Math.cos(a) * 2 * u - 0.5 * u, pcy + Math.sin(a) * 2 * u - 0.5 * u, u, u, "#0c0a16");
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
    const want = Math.round((6 + this.energy * 34) * vibe.crowd * venueScale * this.liveness * (this.w / 360)) + (this.s.live ? 0 : 2);
    while (this.dancers.length < want)
      this.dancers.push({ x: Math.random(), ph: Math.random() * 6, scale: 0.7 + Math.random() * 0.4, row: Math.random() < 0.5 ? 0 : 1, hair: Math.random() * 30 - 15 });
    while (this.dancers.length > want) this.dancers.pop();

    const moves = vibe.moves;
    const rimC = `hsl(${(this.s.hue + 18) % 360},75%,60%)`;
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
      const headTop = bodyTop - 3 * s;
      const bodyC = `hsl(${(this.s.hue + d.hair + 360) % 360},30%,${11 + this.kick * 12}%)`;
      // tapered torso
      this.px(x - 2 * s, bodyTop, 4 * s, 8 * s, bodyC);
      this.px(x - 2.6 * s, bodyTop + 3 * s, 5.2 * s, 3 * s, bodyC);
      this.px(x - 1.8 * s, headTop, 3.6 * s, 3 * s, bodyC); // head
      this.px(x - 1.8 * s, headTop, 3.6 * s, Math.max(1, 0.8 * s), rimC); // rim light
      // arms
      if (armUp > 0) {
        this.px(x - 3 * s, headTop - armUp, 1.2 * s, 4 * s + armUp, bodyC);
        this.px(x + 1.8 * s, headTop - armUp, 1.2 * s, 4 * s + armUp, bodyC);
      } else if (clap > 0) {
        const hands = (1 - clap) * 2 * s;
        this.px(x - 2.6 * s + hands, bodyTop + s, 1 * s, 1 * s, rimC);
        this.px(x + 1.6 * s - hands, bodyTop + s, 1 * s, 1 * s, rimC);
      }
    }
  }

  // ── marquee ("● LIVE TONIGHT ●" idle / DJ name live) ────────────────────────
  private marquee(stageY: number, u: number): void {
    const text = this.liveness > 0.5 ? this.s.djName : "● LIVE TONIGHT ●";
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
